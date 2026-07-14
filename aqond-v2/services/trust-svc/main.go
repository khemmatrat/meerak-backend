package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool      *pgxpool.Pool
	http      *http.Client
	aiCoreURL string
}

var (
	mModerated   atomic.Int64
	mAutoReject  atomic.Int64
	mNeedsHuman  atomic.Int64
	mReports     atomic.Int64
	mEnforcement atomic.Int64
	mCopyright   atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:      pool,
		http:      &http.Client{Timeout: 6 * time.Second},
		aiCoreURL: config.Get("AI_CORE_URL", "http://ai-core:8100"),
	}

	if config.Get("TRUST_CONSUMER", "1") == "1" {
		go a.runModerationConsumer(ctx)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/moderate", a.moderate)               // P105
	mux.HandleFunc("/v1/moderate/queue", a.queue)            // P105
	mux.HandleFunc("/v1/moderate/decision", a.humanDecision) // P105
	mux.HandleFunc("/v1/copyright/assets", a.registerAsset)  // P106
	mux.HandleFunc("/v1/copyright/check", a.copyrightCheck)  // P106
	mux.HandleFunc("/v1/integrity/signal", a.integritySignal) // P107
	mux.HandleFunc("/v1/integrity/account", a.integrityAccount) // P107
	mux.HandleFunc("/v1/reports", a.report)                  // P109
	mux.HandleFunc("/v1/enforce", a.enforce)                 // P109
	mux.HandleFunc("/v1/appeals", a.appeal)                  // P109

	port := config.Int("PORT", 8124)
	log.Printf("trust-svc :%d p105-p110", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "trust-svc", "p105": true, "p110": true})
}

// P110: trust & safety observability.
func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_ts_moderated_total %d\n", mModerated.Load())
	fmt.Fprintf(w, "aqond_ts_auto_rejected_total %d\n", mAutoReject.Load())
	fmt.Fprintf(w, "aqond_ts_needs_human_total %d\n", mNeedsHuman.Load())
	fmt.Fprintf(w, "aqond_ts_reports_total %d\n", mReports.Load())
	fmt.Fprintf(w, "aqond_ts_enforcement_total %d\n", mEnforcement.Load())
	fmt.Fprintf(w, "aqond_ts_copyright_matches_total %d\n", mCopyright.Load())
	var pending int64
	_ = a.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM commerce.moderation_cases WHERE decision IN ('pending','needs_human')`).Scan(&pending)
	fmt.Fprintf(w, "aqond_ts_moderation_queue_depth %d\n", pending)
}

// P105: moderate a piece of content across any surface.
func (a *app) moderate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Surface  string `json:"surface"`
		EntityID string `json:"entity_id"`
		ShardKey string `json:"shard_key"`
		Region   string `json:"region"`
		Text     string `json:"text"`
		MediaURL string `json:"media_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Surface == "" || body.EntityID == "" {
		http.Error(w, "surface and entity_id required", http.StatusBadRequest)
		return
	}
	res := a.runModeration(r.Context(), body.Surface, body.EntityID, body.ShardKey, body.Region, body.Text, body.MediaURL)
	jsonOK(w, res)
}

type modResult struct {
	CaseID     string   `json:"case_id"`
	Decision   string   `json:"decision"`
	Severity   string   `json:"severity"`
	Score      float64  `json:"score"`
	Categories []string `json:"categories"`
	Model      string   `json:"model_version"`
}

// runModeration combines ai-core (P38) with local rules + tiered severity (P105).
func (a *app) runModeration(ctx context.Context, surface, entityID, sk, region, text, mediaURL string) modResult {
	score, cats, model := a.callAICore(ctx, text, mediaURL)
	// local keyword rules augment the model
	rScore, rCats := ruleScan(text)
	if rScore > score {
		score = rScore
	}
	cats = append(cats, rCats...)

	severity := "low"
	decision := "approved"
	humanReq := false
	switch {
	case score >= 0.9:
		severity, decision = "critical", "rejected"
		mAutoReject.Add(1)
	case score >= 0.7:
		severity, decision, humanReq = "high", "needs_human", true
		mNeedsHuman.Add(1)
	case score >= 0.4:
		severity, decision, humanReq = "medium", "needs_human", true
		mNeedsHuman.Add(1)
	default:
		severity, decision = "low", "approved"
	}
	if region == "" {
		region = "TH"
	}
	caseID := ulid.New()
	catJSON, _ := json.Marshal(dedup(cats))
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.moderation_cases (id, surface, entity_id, shard_key, region, severity, decision, categories, model_version, score, human_required)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
		ON CONFLICT (surface, entity_id) DO UPDATE SET severity=EXCLUDED.severity, decision=EXCLUDED.decision,
		  categories=EXCLUDED.categories, model_version=EXCLUDED.model_version, score=EXCLUDED.score,
		  human_required=EXCLUDED.human_required, updated_at=NOW()
		RETURNING id`, caseID, surface, entityID, sk, region, severity, decision, string(catJSON), model, score, humanReq)
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "moderation", AggregateID: entityID, EventType: "moderation.decided", ShardKey: sk,
		Payload: map[string]any{"surface": surface, "decision": decision, "severity": severity, "score": score},
	})
	mModerated.Add(1)
	return modResult{CaseID: caseID, Decision: decision, Severity: severity, Score: score, Categories: dedup(cats), Model: model}
}

func (a *app) queue(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, surface, entity_id, severity, score, categories, created_at
		FROM commerce.moderation_cases WHERE decision='needs_human'
		ORDER BY (severity='critical') DESC, (severity='high') DESC, created_at ASC LIMIT 100`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, surface, entity, sev string
		var score float64
		var cats []byte
		var created time.Time
		if rows.Scan(&id, &surface, &entity, &sev, &score, &cats, &created) == nil {
			out = append(out, map[string]any{"case_id": id, "surface": surface, "entity_id": entity, "severity": sev, "score": score, "categories": json.RawMessage(cats), "created_at": created})
		}
	}
	jsonOK(w, map[string]any{"queue": out})
}

func (a *app) humanDecision(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CaseID   string `json:"case_id"`
		Decision string `json:"decision"` // approved|rejected
		Reviewer string `json:"reviewer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Decision != "approved" && body.Decision != "rejected" {
		http.Error(w, "decision must be approved|rejected", http.StatusBadRequest)
		return
	}
	_, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.moderation_cases SET decision=$2, reviewed_by=$3, human_required=FALSE, updated_at=NOW() WHERE id=$1`,
		body.CaseID, body.Decision, body.Reviewer)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"updated": body.CaseID, "decision": body.Decision})
}

// ---- P106: copyright fingerprint registry + matching ----

func (a *app) registerAsset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind         string `json:"kind"`
		Content      string `json:"content"` // raw content to fingerprint (dev-lite)
		Fingerprint  string `json:"fingerprint"`
		RightsHolder string `json:"rights_holder"`
		Policy       string `json:"policy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Kind == "" {
		body.Kind = "audio"
	}
	if body.Policy == "" {
		body.Policy = "block"
	}
	fp := body.Fingerprint
	if fp == "" {
		fp = fingerprint(body.Content)
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.copyright_assets (id, kind, fingerprint, rights_holder, policy)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT (kind, fingerprint) DO UPDATE SET rights_holder=EXCLUDED.rights_holder, policy=EXCLUDED.policy`,
		id, body.Kind, fp, body.RightsHolder, body.Policy)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"asset_id": id, "fingerprint": fp})
}

func (a *app) copyrightCheck(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MediaID     string `json:"media_id"`
		Kind        string `json:"kind"`
		Content     string `json:"content"`
		Fingerprint string `json:"fingerprint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Kind == "" {
		body.Kind = "audio"
	}
	fp := body.Fingerprint
	if fp == "" {
		fp = fingerprint(body.Content)
	}
	var assetID, policy, holder string
	err := a.pool.QueryRow(r.Context(), `
		SELECT id, policy, rights_holder FROM commerce.copyright_assets WHERE kind=$1 AND fingerprint=$2 LIMIT 1`,
		body.Kind, fp).Scan(&assetID, &policy, &holder)
	if err != nil {
		jsonOK(w, map[string]any{"match": false, "fingerprint": fp})
		return
	}
	matchID := ulid.New()
	_, _ = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.copyright_matches (id, media_id, asset_id, similarity, action, status)
		VALUES ($1,$2,$3,$4,$5,'matched')`, matchID, body.MediaID, assetID, 1.0, policy)
	mCopyright.Add(1)
	jsonOK(w, map[string]any{"match": true, "asset_id": assetID, "policy": policy, "rights_holder": holder, "action": policy, "match_id": matchID})
}

// ---- P107: fraud / account integrity ----

func (a *app) integritySignal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccountID         string         `json:"account_id"`
		Signal            string         `json:"signal"`
		Score             int            `json:"score"`
		DeviceFingerprint string         `json:"device_fingerprint"`
		IP                string         `json:"ip"`
		Details           map[string]any `json:"details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.AccountID == "" || body.Signal == "" {
		http.Error(w, "account_id and signal required", http.StatusBadRequest)
		return
	}
	decision := "monitor"
	switch {
	case body.Score >= 85:
		decision = "ban"
	case body.Score >= 65:
		decision = "restrict"
	case body.Score >= 40:
		decision = "challenge"
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.account_integrity (id, account_id, signal, score, device_fingerprint, ip, decision, details)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
		id, body.AccountID, body.Signal, body.Score, nullable(body.DeviceFingerprint), nullable(body.IP), decision, mustJSON(body.Details))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"signal_id": id, "decision": decision})
}

func (a *app) integrityAccount(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("id")
	if accountID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	var total int
	var worst string
	_ = a.pool.QueryRow(r.Context(), `SELECT COALESCE(SUM(score),0) FROM commerce.account_integrity WHERE account_id=$1`, accountID).Scan(&total)
	_ = a.pool.QueryRow(r.Context(), `
		SELECT decision FROM commerce.account_integrity WHERE account_id=$1
		ORDER BY CASE decision WHEN 'ban' THEN 4 WHEN 'restrict' THEN 3 WHEN 'challenge' THEN 2 ELSE 1 END DESC LIMIT 1`, accountID).Scan(&worst)
	jsonOK(w, map[string]any{"account_id": accountID, "cumulative_score": total, "standing": def(worst, "clear")})
}

// ---- P109: reports + enforcement + appeals ----

func (a *app) report(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ReporterID string `json:"reporter_id"`
		Surface    string `json:"surface"`
		EntityID   string `json:"entity_id"`
		Region     string `json:"region"`
		Reason     string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.ReporterID == "" || body.EntityID == "" {
		http.Error(w, "reporter_id and entity_id required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = "TH"
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.reports (id, reporter_id, surface, entity_id, region, reason, status)
		VALUES ($1,$2,$3,$4,$5,$6,'open')`, id, body.ReporterID, body.Surface, body.EntityID, body.Region, body.Reason)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mReports.Add(1)
	jsonOK(w, map[string]any{"report_id": id, "status": "open"})
}

func (a *app) enforce(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TargetType    string `json:"target_type"`
		TargetID      string `json:"target_id"`
		Action        string `json:"action"`
		Reason        string `json:"reason"`
		PolicyVersion string `json:"policy_version"`
		CaseID        string `json:"case_id"`
		Actor         string `json:"actor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.TargetType == "" || body.TargetID == "" || body.Action == "" {
		http.Error(w, "target_type, target_id, action required", http.StatusBadRequest)
		return
	}
	if body.PolicyVersion == "" {
		body.PolicyVersion = "v1"
	}
	if body.Actor == "" {
		body.Actor = "system"
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.enforcement_actions (id, target_type, target_id, action, reason, policy_version, case_id, actor)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		id, body.TargetType, body.TargetID, body.Action, body.Reason, body.PolicyVersion, nullable(body.CaseID), body.Actor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = outbox.Insert(r.Context(), a.pool, outbox.Event{
		AggregateType: "enforcement", AggregateID: id, EventType: "enforcement.applied", ShardKey: body.TargetID,
		Payload: map[string]any{"target_type": body.TargetType, "target_id": body.TargetID, "action": body.Action},
	})
	mEnforcement.Add(1)
	jsonOK(w, map[string]any{"action_id": id, "action": body.Action})
}

func (a *app) appeal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ActionID string `json:"action_id"`
		Outcome  string `json:"outcome"` // requested|upheld|overturned
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Outcome == "" {
		body.Outcome = "requested"
	}
	_, err := a.pool.Exec(r.Context(), `UPDATE commerce.enforcement_actions SET appeal_status=$2 WHERE id=$1`, body.ActionID, body.Outcome)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if body.Outcome == "overturned" {
		var tt, tid string
		_ = a.pool.QueryRow(r.Context(), `SELECT target_type, target_id FROM commerce.enforcement_actions WHERE id=$1`, body.ActionID).Scan(&tt, &tid)
		rid := ulid.New()
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.enforcement_actions (id, target_type, target_id, action, reason, case_id, actor)
			VALUES ($1,$2,$3,'reinstate','appeal_overturned',NULL,'appeals')`, rid, tt, tid)
	}
	jsonOK(w, map[string]any{"action_id": body.ActionID, "appeal_status": body.Outcome})
}

// ---- helpers ----

func fingerprint(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "fp_" + hex.EncodeToString(sum[:12])
}

func mustJSON(v any) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func dedup(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func def(v, d string) string {
	if v == "" {
		return d
	}
	return v
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
