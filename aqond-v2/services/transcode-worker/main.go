package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	topicMediaUploaded = "media.uploaded"
	topicMediaReady    = "media.ready"
	topicMediaDead     = "media.deadletter"
)

type mediaEvent struct {
	MediaID   string `json:"media_id"`
	AuthorID  string `json:"author_id"`
	Bucket    string `json:"bucket"`
	ObjectKey string `json:"object_key"`
}

type workerApp struct {
	writePool  *pgxpool.Pool
	minio      *minio.Client
	brokers    []string
	aiCoreURL  string
	aiCoreKey  string
	useStub    bool
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()

	mc := config.LoadMinIO()
	endpoint := strings.TrimPrefix(strings.TrimPrefix(mc.Endpoint, "https://"), "http://")
	secure := strings.HasPrefix(mc.Endpoint, "https://")
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(mc.AccessKey, mc.SecretKey, ""),
		Secure: secure,
	})
	if err != nil {
		log.Fatal(err)
	}

	brokers := config.LoadKafkaBrokers()
	_ = pkgkafka.EnsureTopic(ctx, brokers, topicMediaReady, 4)
	_ = pkgkafka.EnsureTopic(ctx, brokers, topicMediaDead, 1)

	app := &workerApp{
		writePool: pools.Write,
		minio:     client,
		brokers:   brokers,
		aiCoreURL: config.Get("AI_CORE_URL", "http://ai-core:8100"),
		aiCoreKey: config.Get("AI_CORE_API_KEY", ""),
		useStub:   config.Get("TRANSCODE_STUB", "0") == "1",
	}

	log.Printf("transcode-worker started stub=%v p37-p38", app.useStub)
	app.consume(ctx)
}

func (a *workerApp) consume(ctx context.Context) {
	reader := pkgkafka.NewReader(a.brokers, topicMediaUploaded, "transcode-worker")
	defer reader.Close()
	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			time.Sleep(time.Second)
			continue
		}
		var evt mediaEvent
		if err := json.Unmarshal(msg.Value, &evt); err != nil {
			_ = reader.CommitMessages(ctx, msg)
			continue
		}
		if err := a.processMedia(ctx, evt); err != nil {
			log.Printf("transcode %s failed: %v", evt.MediaID, err)
			a.deadLetter(ctx, evt.MediaID, err.Error())
			_ = reader.CommitMessages(ctx, msg)
			continue
		}
		_ = reader.CommitMessages(ctx, msg)
	}
}

func (a *workerApp) processMedia(ctx context.Context, evt mediaEvent) error {
	tmpDir, err := os.MkdirTemp("", "transcode-"+evt.MediaID)
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	rawPath := filepath.Join(tmpDir, "input.mp4")
	obj, err := a.minio.GetObject(ctx, evt.Bucket, evt.ObjectKey, minio.GetObjectOptions{})
	if err != nil {
		return err
	}
	f, err := os.Create(rawPath)
	if err != nil {
		obj.Close()
		return err
	}
	_, err = io.Copy(f, obj)
	obj.Close()
	f.Close()
	if err != nil {
		return err
	}

	hlsDir := filepath.Join(tmpDir, "hls")
	thumbPath := filepath.Join(tmpDir, "thumb.jpg")
	manifestKey := fmt.Sprintf("hls/%s/master.m3u8", evt.MediaID)
	thumbKey := fmt.Sprintf("thumbs/%s.jpg", evt.MediaID)

	if a.useStub {
		if err := a.stubTranscode(ctx, evt, rawPath, hlsDir, thumbPath, manifestKey, thumbKey); err != nil {
			return err
		}
	} else {
		if err := a.ffmpegTranscode(rawPath, hlsDir, thumbPath); err != nil {
			return err
		}
		if err := a.uploadHLS(ctx, evt.Bucket, hlsDir, evt.MediaID); err != nil {
			return err
		}
		_, _ = a.minio.FPutObject(ctx, evt.Bucket, thumbKey, thumbPath, minio.PutObjectOptions{ContentType: "image/jpeg"})
	}

	safe, score, labels, err := a.moderate(ctx, thumbPath, evt.MediaID)
	if err != nil {
		log.Printf("moderation warn %s: %v (allowing with review flag)", evt.MediaID, err)
		safe, score, labels = true, 0.5, []string{"moderation_skipped"}
	}
	status := "ready"
	if !safe {
		status = "rejected"
	}

	labelsJSON, _ := json.Marshal(labels)
	_, err = a.writePool.Exec(ctx, `
		UPDATE commerce.media SET status=$2, moderation_score=$3, moderation_labels=$4::jsonb,
			hls_manifest_key=$5, thumbnail_key=$6, updated_at=NOW()
		WHERE id=$1`,
		evt.MediaID, status, score, string(labelsJSON), manifestKey, thumbKey)
	if err != nil {
		return err
	}

	payload := map[string]any{
		"media_id": evt.MediaID, "author_id": evt.AuthorID, "status": status,
		"hls_manifest_key": manifestKey, "thumbnail_key": thumbKey,
	}
	_ = outbox.Insert(ctx, a.writePool, outbox.Event{
		AggregateType: "media", AggregateID: evt.MediaID, EventType: "media.ready",
		ShardKey: evt.AuthorID, Payload: payload,
	})
	wr := pkgkafka.NewWriter(a.brokers, topicMediaReady)
	defer wr.Close()
	msg, _ := json.Marshal(payload)
	return pkgkafka.PublishPartitioned(ctx, wr, []byte(evt.AuthorID), msg)
}

func (a *workerApp) stubTranscode(ctx context.Context, evt mediaEvent, rawPath, hlsDir, thumbPath, manifestKey, thumbKey string) error {
	_ = os.MkdirAll(hlsDir, 0o755)
	segKey := fmt.Sprintf("hls/%s/seg0.ts", evt.MediaID)
	_, err := a.minio.FPutObject(ctx, evt.Bucket, segKey, rawPath, minio.PutObjectOptions{ContentType: "video/mp2t"})
	if err != nil {
		return err
	}
	manifest := "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\n" + segKey + "\n#EXT-X-ENDLIST\n"
	_, err = a.minio.PutObject(ctx, evt.Bucket, manifestKey, strings.NewReader(manifest), int64(len(manifest)), minio.PutObjectOptions{ContentType: "application/vnd.apple.mpegurl"})
	if err != nil {
		return err
	}
	if err := os.WriteFile(thumbPath, []byte{0xFF, 0xD8, 0xFF, 0xD9}, 0o644); err != nil {
		return err
	}
	_, err = a.minio.FPutObject(ctx, evt.Bucket, thumbKey, thumbPath, minio.PutObjectOptions{ContentType: "image/jpeg"})
	return err
}

func (a *workerApp) ffmpegTranscode(rawPath, hlsDir, thumbPath string) error {
	_ = os.MkdirAll(hlsDir, 0o755)
	cmd := exec.Command("ffmpeg", "-y", "-i", rawPath,
		"-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
		"-c:a", "aac", "-b:a", "128k",
		"-hls_time", "6", "-hls_list_size", "0", "-hls_segment_filename", filepath.Join(hlsDir, "seg%d.ts"),
		filepath.Join(hlsDir, "master.m3u8"))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg: %v %s", err, string(out))
	}
	tcmd := exec.Command("ffmpeg", "-y", "-i", rawPath, "-ss", "00:00:01", "-vframes", "1", thumbPath)
	if out, err := tcmd.CombinedOutput(); err != nil {
		return fmt.Errorf("thumbnail: %v %s", err, string(out))
	}
	return nil
}

func (a *workerApp) uploadHLS(ctx context.Context, bucket, hlsDir, mediaID string) error {
	return filepath.Walk(hlsDir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(hlsDir, p)
		key := fmt.Sprintf("hls/%s/%s", mediaID, filepath.ToSlash(rel))
		ct := "application/octet-stream"
		if strings.HasSuffix(p, ".m3u8") {
			ct = "application/vnd.apple.mpegurl"
		} else if strings.HasSuffix(p, ".ts") {
			ct = "video/mp2t"
		}
		_, err = a.minio.FPutObject(ctx, bucket, key, p, minio.PutObjectOptions{ContentType: ct})
		return err
	})
}

func (a *workerApp) moderate(ctx context.Context, thumbPath, mediaID string) (bool, float64, []string, error) {
	body, _ := json.Marshal(map[string]any{"media_id": mediaID, "stub_safe": true})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.aiCoreURL+"/v1/moderate/media", bytes.NewReader(body))
	if err != nil {
		return true, 0.5, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if a.aiCoreKey != "" {
		req.Header.Set("X-AI-Core-Api-Key", a.aiCoreKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return true, 0.5, nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Safe   bool     `json:"safe"`
		Score  float64  `json:"score"`
		Labels []string `json:"labels"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return true, 0.5, nil, err
	}
	return out.Safe, out.Score, out.Labels, nil
}

func (a *workerApp) deadLetter(ctx context.Context, mediaID, reason string) {
	wr := pkgkafka.NewWriter(a.brokers, topicMediaDead)
	defer wr.Close()
	msg, _ := json.Marshal(map[string]any{"media_id": mediaID, "reason": reason, "at": time.Now().UTC()})
	_ = pkgkafka.Publish(ctx, wr, []byte(mediaID), msg)
	_, _ = a.writePool.Exec(ctx, `UPDATE commerce.media SET status='rejected', metadata=metadata||$2::jsonb, updated_at=NOW() WHERE id=$1`,
		mediaID, fmt.Sprintf(`{"deadletter":"%s"}`, reason))
}
