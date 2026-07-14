package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/kafka"
)

// callAICore asks ai-core to moderate content (P38/P105). Lenient response parsing;
// on any failure it returns a zero score so local rules still apply.
func (a *app) callAICore(ctx context.Context, text, mediaURL string) (float64, []string, string) {
	payload, _ := json.Marshal(map[string]any{"text": text, "media_url": mediaURL, "content": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.aiCoreURL+"/v1/moderate/media", bytes.NewReader(payload))
	if err != nil {
		return 0, nil, "rules-only"
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.http.Do(req)
	if err != nil {
		return 0, nil, "rules-only"
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return 0, nil, "rules-only"
	}
	data, _ := io.ReadAll(resp.Body)
	var out map[string]any
	if json.Unmarshal(data, &out) != nil {
		return 0, nil, "rules-only"
	}
	score := 0.0
	switch v := out["score"].(type) {
	case float64:
		score = v
	}
	if f, ok := out["risk"].(float64); ok && f > score {
		score = f
	}
	if flagged, ok := out["flagged"].(bool); ok && flagged && score < 0.7 {
		score = 0.7
	}
	if action, ok := out["action"].(string); ok && (action == "block" || action == "reject") {
		score = 0.95
	}
	var cats []string
	if arr, ok := out["categories"].([]any); ok {
		for _, c := range arr {
			if s, ok := c.(string); ok {
				cats = append(cats, s)
			}
		}
	}
	model := "ai-core"
	if mv, ok := out["model"].(string); ok && mv != "" {
		model = mv
	}
	return score, cats, model
}

// ruleScan is a transparent keyword/severity scanner that augments the model.
func ruleScan(text string) (float64, []string) {
	t := strings.ToLower(text)
	score := 0.0
	var cats []string
	rules := map[string][]string{
		"violence":   {"kill", "attack", "weapon"},
		"hate":       {"slur", "hate"},
		"scam":       {"free money", "guaranteed profit", "send your password", "wire transfer"},
		"adult":      {"xxx", "explicit"},
		"prohibited": {"counterfeit", "illegal drugs", "ivory"},
	}
	for cat, words := range rules {
		for _, w := range words {
			if strings.Contains(t, w) {
				cats = append(cats, cat)
				if cat == "scam" || cat == "prohibited" {
					if score < 0.9 {
						score = 0.9
					}
				} else if score < 0.6 {
					score = 0.6
				}
			}
		}
	}
	return score, cats
}

// runModerationConsumer auto-moderates content across surfaces from Kafka (P105).
func (a *app) runModerationConsumer(ctx context.Context) {
	topics := strings.Split(config.Get("MODERATION_TOPICS", "media.ready,posts.created,reviews.created"), ",")
	for _, raw := range topics {
		topic := strings.TrimSpace(raw)
		if topic == "" {
			continue
		}
		go a.consumeTopic(ctx, topic)
	}
}

func (a *app) consumeTopic(ctx context.Context, topic string) {
	brokers := config.LoadKafkaBrokers()
	if err := kafka.EnsureTopic(ctx, brokers, topic, 4); err != nil {
		log.Printf("trust consumer ensure %s: %v", topic, err)
	}
	reader := kafka.NewReader(brokers, topic, "trust-svc-moderation")
	defer reader.Close()
	log.Printf("trust moderation consuming %s", topic)
	surface := surfaceForTopic(topic)
	for {
		m, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			time.Sleep(time.Second)
			continue
		}
		var evt map[string]any
		if json.Unmarshal(m.Value, &evt) != nil {
			continue
		}
		// outbox relay may wrap payload under "payload"
		if p, ok := evt["payload"].(map[string]any); ok {
			evt = p
		}
		entityID := firstString(evt, "media_id", "post_id", "review_id", "id", "entity_id")
		if entityID == "" {
			continue
		}
		text := firstString(evt, "caption", "text", "title", "body", "description")
		mediaURL := firstString(evt, "media_url", "playback_url", "url")
		sk := firstString(evt, "shard_key")
		region := firstString(evt, "region")
		a.runModeration(ctx, surface, entityID, sk, region, text, mediaURL)
	}
}

func surfaceForTopic(topic string) string {
	switch {
	case strings.HasPrefix(topic, "media"):
		return "media"
	case strings.HasPrefix(topic, "posts"):
		return "post"
	case strings.HasPrefix(topic, "reviews"):
		return "review"
	default:
		return "product"
	}
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}
