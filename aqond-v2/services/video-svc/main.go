package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	topicMediaUploaded = "media.uploaded"
	maxUploadBytes     = 500 * 1024 * 1024
)

type videoApp struct {
	writePool    *pgxpool.Pool
	minio        *minio.Client
	bucket       string
	brokers      []string
	router       *shard.Router
	cdnBase      string
	signSecret   string
	signTTL      time.Duration
	mreg         *metrics.Registry
	mediaUploads metrics.Counter
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

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
	_ = pkgkafka.EnsureTopic(ctx, brokers, topicMediaUploaded, 4)
	_ = client.MakeBucket(ctx, mc.VideoBucket, minio.MakeBucketOptions{})

	app := &videoApp{
		writePool:  pools.Write,
		minio:      client,
		bucket:     mc.VideoBucket,
		brokers:    brokers,
		router:     shard.NewRouter(1),
		cdnBase:    config.LoadCDNBaseURL(),
		signSecret: config.Get("CDN_SIGNING_SECRET", "dev-cdn-sign-secret"),
		signTTL:    time.Duration(config.Int("CDN_SIGN_TTL_SEC", 3600)) * time.Second,
		mreg:       &metrics.Registry{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.mreg.Handler(nil))
	mux.HandleFunc("/v1/media/upload", app.uploadMedia)
	mux.HandleFunc("/v1/media/", app.handleMediaSub)

	port := config.Int("PORT", 8116)
	log.Printf("video-svc :%d bucket=%s p36-p39", port, mc.VideoBucket)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *videoApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "video-svc", "p36": true, "p39": true})
}

func (a *videoApp) uploadMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	authorID := r.URL.Query().Get("author_id")
	if authorID == "" {
		authorID = r.Header.Get("X-Author-Id")
	}
	if authorID == "" {
		http.Error(w, "author_id required", http.StatusBadRequest)
		return
	}
	merchantID := r.URL.Query().Get("merchant_id")
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "video/mp4"
	}
	if !strings.HasPrefix(contentType, "video/") {
		http.Error(w, "video content type required", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "upload too large or invalid", http.StatusBadRequest)
		return
	}
	if len(data) == 0 {
		http.Error(w, "empty body", http.StatusBadRequest)
		return
	}

	mediaID := ulid.New()
	objectKey := path.Join("raw", authorID, mediaID+".mp4")
	sk := a.router.ShardKey(merchantID)
	if merchantID == "" {
		sk = a.router.ShardKey(authorID)
	}

	_, err = a.minio.PutObject(r.Context(), a.bucket, objectKey, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = a.writePool.Exec(r.Context(), `
		INSERT INTO commerce.media (id, author_id, merchant_id, shard_key, bucket, object_key, content_type, size_bytes, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing')`,
		mediaID, authorID, nullStr(merchantID), sk, a.bucket, objectKey, contentType, len(data))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	payload := map[string]any{
		"media_id": mediaID, "author_id": authorID, "bucket": a.bucket,
		"object_key": objectKey, "content_type": contentType, "size_bytes": len(data),
	}
	_ = outbox.Insert(r.Context(), a.writePool, outbox.Event{
		AggregateType: "media", AggregateID: mediaID, EventType: "media.uploaded",
		ShardKey: sk, Payload: payload,
	})
	wr := pkgkafka.NewWriter(a.brokers, topicMediaUploaded)
	defer wr.Close()
	msg, _ := json.Marshal(payload)
	_ = pkgkafka.PublishPartitioned(r.Context(), wr, []byte(sk), msg)

	a.mediaUploads.Inc()
	jsonOK(w, map[string]any{"media_id": mediaID, "status": "processing", "object_key": objectKey})
}

func (a *videoApp) handleMediaSub(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/v1/media/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	mediaID := parts[0]
	if len(parts) == 2 && parts[1] == "playback" {
		a.playback(w, r, mediaID)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a.getMedia(w, r, mediaID)
}

func (a *videoApp) getMedia(w http.ResponseWriter, r *http.Request, mediaID string) {
	var row struct {
		AuthorID, Status, HLSKey, ThumbKey, ContentType string
		SizeBytes                                       int64
	}
	err := a.writePool.QueryRow(r.Context(), `
		SELECT author_id, status, COALESCE(hls_manifest_key,''), COALESCE(thumbnail_key,''), content_type, size_bytes
		FROM commerce.media WHERE id=$1`, mediaID).Scan(
		&row.AuthorID, &row.Status, &row.HLSKey, &row.ThumbKey, &row.ContentType, &row.SizeBytes)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{
		"media_id": mediaID, "author_id": row.AuthorID, "status": row.Status,
		"hls_manifest_key": row.HLSKey, "thumbnail_key": row.ThumbKey,
		"content_type": row.ContentType, "size_bytes": row.SizeBytes,
	})
}

func (a *videoApp) playback(w http.ResponseWriter, r *http.Request, mediaID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var hlsKey, objectKey, status string
	err := a.writePool.QueryRow(r.Context(), `
		SELECT COALESCE(hls_manifest_key,''), COALESCE(object_key,''), status FROM commerce.media WHERE id=$1`, mediaID).Scan(&hlsKey, &objectKey, &status)
	if err != nil || hlsKey == "" {
		http.Error(w, "playback not ready", http.StatusNotFound)
		return
	}
	if status != "ready" && status != "published" {
		http.Error(w, "media not publishable: "+status, http.StatusConflict)
		return
	}
	exp := time.Now().Add(a.signTTL).Unix()
	sig := a.signURL(hlsKey, exp)
	manifestURL := fmt.Sprintf("%s/%s?exp=%d&sig=%s", strings.TrimSuffix(a.cdnBase, "/"), hlsKey, exp, url.QueryEscape(sig))
	out := map[string]any{
		"media_id": mediaID, "manifest_url": manifestURL, "expires_at": exp, "format": "hls",
	}
	// Dev stub transcode: HLS segments may be non-standard — expose signed raw MP4 for browser playback.
	if config.Get("TRANSCODE_STUB", "0") == "1" && objectKey != "" {
		expMP4 := time.Now().Add(a.signTTL).Unix()
		sigMP4 := a.signURL(objectKey, expMP4)
		streamURL := fmt.Sprintf("%s/%s?exp=%d&sig=%s", strings.TrimSuffix(a.cdnBase, "/"), objectKey, expMP4, url.QueryEscape(sigMP4))
		out["stream_url"] = streamURL
		out["format"] = "mp4"
	}
	jsonOK(w, out)
}

func (a *videoApp) signURL(objectKey string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(a.signSecret))
	mac.Write([]byte(fmt.Sprintf("%s:%d", objectKey, exp)))
	return hex.EncodeToString(mac.Sum(nil))
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
