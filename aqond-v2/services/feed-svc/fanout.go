package main

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/gocql/gocql"
)

func (a *feedApp) consumePostsCreated(ctx context.Context) {
	reader := pkgkafka.NewReader(a.brokers, topicPostsCreated, "feed-fanout")
	defer reader.Close()
	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("fanout fetch: %v", err)
			time.Sleep(time.Second)
			continue
		}
		var evt struct {
			PostID   string `json:"post_id"`
			AuthorID string `json:"author_id"`
			MediaID  string `json:"media_id"`
			PostType string `json:"post_type"`
			Caption  string `json:"caption"`
			PostTS   string `json:"post_ts"`
		}
		if err := json.Unmarshal(msg.Value, &evt); err != nil {
			_ = reader.CommitMessages(ctx, msg)
			continue
		}
		if err := a.fanOutPost(ctx, evt); err != nil {
			log.Printf("fanout post %s: %v", evt.PostID, err)
			time.Sleep(500 * time.Millisecond)
			continue
		}
		a.fanoutPosts.Inc()
		_ = reader.CommitMessages(ctx, msg)
	}
}

func (a *feedApp) fanOutPost(ctx context.Context, evt struct {
	PostID   string `json:"post_id"`
	AuthorID string `json:"author_id"`
	MediaID  string `json:"media_id"`
	PostType string `json:"post_type"`
	Caption  string `json:"caption"`
	PostTS   string `json:"post_ts"`
}) error {
	var exists time.Time
	if err := a.scylla.Query(`SELECT processed_at FROM fanout_processed WHERE post_id = ?`, evt.PostID).Scan(&exists); err == nil {
		return nil
	}

	postTS, err := gocql.ParseUUID(evt.PostTS)
	if err != nil {
		postTS = gocql.TimeUUID()
	}
	payload, _ := json.Marshal(map[string]any{"caption": evt.Caption})

	// Always write to author's own timeline.
	if err := a.writeTimelineEntry(evt.AuthorID, postTS, evt.PostID, evt.AuthorID, evt.MediaID, evt.PostType, evt.Caption, string(payload)); err != nil {
		return err
	}

	tier := a.authorTier(evt.AuthorID)
	if tier == "hot" {
		_ = a.scylla.Query(`INSERT INTO fanout_processed (post_id, processed_at) VALUES (?, ?)`, evt.PostID, time.Now()).Exec()
		return nil
	}

	iter := a.scylla.Query(`SELECT follower_id FROM followers_by_user WHERE followee_id = ?`, evt.AuthorID).Iter()
	var followerID string
	var ids []string
	for iter.Scan(&followerID) {
		ids = append(ids, followerID)
	}
	if err := iter.Close(); err != nil {
		return err
	}

	sem := make(chan struct{}, a.fanoutWorkers)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	for _, fid := range ids {
		wg.Add(1)
		sem <- struct{}{}
		go func(follower string) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := a.writeTimelineEntry(follower, postTS, evt.PostID, evt.AuthorID, evt.MediaID, evt.PostType, evt.Caption, string(payload)); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
			}
		}(fid)
	}
	wg.Wait()
	if firstErr != nil {
		return firstErr
	}
	return a.scylla.Query(`INSERT INTO fanout_processed (post_id, processed_at) VALUES (?, ?)`, evt.PostID, time.Now()).Exec()
}

func (a *feedApp) writeTimelineEntry(userID string, postTS gocql.UUID, postID, authorID, mediaID, postType, caption, payload string) error {
	return a.scylla.Query(`
		INSERT INTO timeline_by_user (user_id, post_ts, post_id, author_id, media_id, post_type, caption, payload)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, postTS, postID, authorID, mediaID, postType, caption, payload,
	).Exec()
}

func (a *feedApp) authorTier(authorID string) string {
	var tier string
	var count int
	if err := a.scylla.Query(`SELECT tier, follower_count FROM author_tier WHERE author_id = ?`, authorID).Scan(&tier, &count); err != nil {
		return "normal"
	}
	if count >= a.hotThreshold {
		return "hot"
	}
	return tier
}

func (a *feedApp) backfillTimeline(followerID, followeeID string) {
	ctx := context.Background()
	tier := a.authorTier(followeeID)
	iter := a.scylla.Query(`
		SELECT post_ts, post_id, media_id, post_type, caption, payload
		FROM posts_by_author WHERE author_id = ? LIMIT 50`, followeeID).Iter()
	var postTS gocql.UUID
	var postID, mediaID, postType, caption, payload string
	for iter.Scan(&postTS, &postID, &mediaID, &postType, &caption, &payload) {
		if tier == "hot" {
			continue
		}
		_ = a.writeTimelineEntry(followerID, postTS, postID, followeeID, mediaID, postType, caption, payload)
	}
	_ = iter.Close()
	a.invalidateFeedCache(ctx, followerID)
}

func (a *feedApp) readTimeline(ctx context.Context, userID, cursor string, limit int, followingOnly bool) ([]map[string]any, string, error) {
	cacheKey := "feed:" + userID + ":" + cursor + ":" + boolStr(followingOnly)
	if cached, err := a.redis.Get(ctx, cacheKey).Bytes(); err == nil {
		var out struct {
			Items      []map[string]any `json:"items"`
			NextCursor string           `json:"next_cursor"`
		}
		if json.Unmarshal(cached, &out) == nil {
			return out.Items, out.NextCursor, nil
		}
	}

	items := make([]map[string]any, 0, limit)
	var nextCursor string

	var postTS gocql.UUID
	var postID, authorID, mediaID, postType, caption, payload string

	query := `SELECT post_ts, post_id, author_id, media_id, post_type, caption, payload FROM timeline_by_user WHERE user_id = ?`
	args := []any{userID}
	if cursor != "" {
		if cu, err := gocql.ParseUUID(cursor); err == nil {
			query += ` AND post_ts < ?`
			args = append(args, cu)
		}
	}
	query += ` LIMIT ?`
	args = append(args, limit+1)

	iter := a.scylla.Query(query, args...).Iter()
	for iter.Scan(&postTS, &postID, &authorID, &mediaID, &postType, &caption, &payload) {
		if len(items) >= limit {
			nextCursor = postTS.String()
			break
		}
		items = append(items, map[string]any{
			"post_id": postID, "post_ts": postTS.String(), "author_id": authorID,
			"media_id": mediaID, "post_type": postType, "caption": caption,
		})
	}
	_ = iter.Close()

	// Hybrid: merge recent posts from hot authors the user follows.
	if !followingOnly {
		hotItems, _ := a.mergeHotAuthorPosts(userID, limit)
		items = dedupeMerge(items, hotItems, limit)
	}

	if b, err := json.Marshal(map[string]any{"items": items, "next_cursor": nextCursor}); err == nil {
		_ = a.redis.Set(ctx, cacheKey, b, a.cacheTTL).Err()
	}
	return items, nextCursor, nil
}

func (a *feedApp) mergeHotAuthorPosts(userID string, limit int) ([]map[string]any, error) {
	var out []map[string]any
	iter := a.scylla.Query(`SELECT followee_id FROM follow_graph WHERE follower_id = ?`, userID).Iter()
	var followeeID string
	for iter.Scan(&followeeID) {
		if a.authorTier(followeeID) != "hot" {
			continue
		}
		piter := a.scylla.Query(`
			SELECT post_ts, post_id, media_id, post_type, caption
			FROM posts_by_author WHERE author_id = ? LIMIT 5`, followeeID).Iter()
		var postTS gocql.UUID
		var postID, mediaID, postType, caption string
		for piter.Scan(&postTS, &postID, &mediaID, &postType, &caption) {
			out = append(out, map[string]any{
				"post_id": postID, "post_ts": postTS.String(), "author_id": followeeID,
				"media_id": mediaID, "post_type": postType, "caption": caption, "source": "hot_hybrid",
			})
		}
		_ = piter.Close()
	}
	_ = iter.Close()
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func dedupeMerge(base, extra []map[string]any, limit int) []map[string]any {
	seen := map[string]bool{}
	var out []map[string]any
	add := func(it map[string]any) {
		id, _ := it["post_id"].(string)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		out = append(out, it)
	}
	for _, it := range base {
		add(it)
	}
	for _, it := range extra {
		add(it)
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (a *feedApp) invalidateFeedCache(ctx context.Context, userID string) {
	iter := a.redis.Scan(ctx, 0, "feed:"+userID+":*", 100).Iterator()
	for iter.Next(ctx) {
		_ = a.redis.Del(ctx, iter.Val()).Err()
	}
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}
