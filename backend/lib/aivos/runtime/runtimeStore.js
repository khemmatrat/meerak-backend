import { randomUUID } from 'crypto';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * In-memory persistence for tests and offline runtime bootstrap.
 */
export function createMemoryRuntimeStore(seed = {}) {
  const tables = {
    jobs: new Map(),
    plans: new Map(),
    contextSnapshots: new Map(),
    policyRules: new Map(),
    policyDecisions: new Map(),
    promptRegistry: new Map(),
    promptCompilations: new Map(),
    brandDna: new Map(),
    governanceAudit: [],
    pluginRegistry: new Map(),
    agentRegistry: new Map(),
    skillRegistry: new Map(),
    workflowJobs: new Map(),
    workflowCheckpoints: [],
    events: [],
    approvalRequests: new Map(),
    costLedger: [],
    timeline: [],
  };

  for (const rule of seed.policyRules || []) {
    const id = rule.id || randomUUID();
    tables.policyRules.set(id, { ...rule, id });
  }
  for (const row of seed.promptRegistry || []) {
    tables.promptRegistry.set(`${row.id}@${row.version}`, row);
  }
  for (const row of seed.brandDna || []) {
    tables.brandDna.set(`${row.brand_key}@${row.version}`, row);
  }
  for (const row of seed.pluginRegistry || []) {
    tables.pluginRegistry.set(row.plugin_id, row);
  }
  for (const row of seed.agentRegistry || []) {
    tables.agentRegistry.set(row.agent_id, row);
  }
  for (const row of seed.skillRegistry || []) {
    tables.skillRegistry.set(row.skill_id, row);
  }

  return {
    kind: 'memory',
    async insertJob(row) {
      const id = row.id || randomUUID();
      const job = { ...row, id, created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString() };
      tables.jobs.set(id, job);
      return clone(job);
    },
    async updateJob(id, patch) {
      const current = tables.jobs.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      tables.jobs.set(id, next);
      return clone(next);
    },
    async getJob(id) {
      const row = tables.jobs.get(id);
      return row ? clone(row) : null;
    },
    async insertPlan(row) {
      const id = row.id || randomUUID();
      const plan = { ...row, id, created_at: row.created_at || new Date().toISOString() };
      tables.plans.set(id, plan);
      return clone(plan);
    },
    async getPlan(id) {
      const row = tables.plans.get(id);
      return row ? clone(row) : null;
    },
    async getPlanByJobId(jobId) {
      for (const plan of tables.plans.values()) {
        if (plan.job_id === jobId) return clone(plan);
      }
      return null;
    },
    async insertContextSnapshot(row) {
      const id = row.id || randomUUID();
      const snap = { ...row, id, created_at: row.created_at || new Date().toISOString() };
      tables.contextSnapshots.set(id, snap);
      return clone(snap);
    },
    async getContextSnapshot(id) {
      const row = tables.contextSnapshots.get(id);
      return row ? clone(row) : null;
    },
    async listPolicyRules({ taskType, enabled = true } = {}) {
      return [...tables.policyRules.values()]
        .filter((r) => (enabled == null || r.enabled === enabled) && (!taskType || r.task_type === taskType))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(clone);
    },
    async insertPolicyDecision(row) {
      const id = row.id || randomUUID();
      const decision = { ...row, id, created_at: row.created_at || new Date().toISOString() };
      tables.policyDecisions.set(id, decision);
      return clone(decision);
    },
    async listPolicyDecisionsByJob(jobId) {
      return [...tables.policyDecisions.values()].filter((d) => d.job_id === jobId).map(clone);
    },
    async getPromptRegistry(id, version) {
      const row = tables.promptRegistry.get(`${id}@${version}`);
      return row ? clone(row) : null;
    },
    async insertPromptCompilation(row) {
      const id = row.id || randomUUID();
      const rec = { ...row, id, created_at: row.created_at || new Date().toISOString() };
      tables.promptCompilations.set(id, rec);
      return clone(rec);
    },
    async getBrandDna(brandKey, version = 1) {
      const row = tables.brandDna.get(`${brandKey}@${version}`);
      return row ? clone(row) : null;
    },
    async appendGovernanceAudit(row) {
      const rec = { ...row, id: row.id || randomUUID(), created_at: row.created_at || new Date().toISOString() };
      tables.governanceAudit.push(rec);
      return clone(rec);
    },
    async getPlugin(pluginId) {
      const row = tables.pluginRegistry.get(pluginId);
      return row ? clone(row) : null;
    },
    async listPlugins({ enabled = true } = {}) {
      return [...tables.pluginRegistry.values()].filter((p) => enabled == null || p.enabled === enabled).map(clone);
    },
    async listSkills({ enabled = true } = {}) {
      return [...tables.skillRegistry.values()]
        .filter((s) => enabled == null || s.enabled === enabled)
        .map(clone);
    },
    async getSkill(skillId) {
      const row = tables.skillRegistry.get(skillId);
      return row ? clone(row) : null;
    },
    async insertWorkflowJob(row) {
      const id = row.id || randomUUID();
      const wf = { ...row, id, created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString() };
      tables.workflowJobs.set(id, wf);
      return clone(wf);
    },
    async updateWorkflowJob(id, patch) {
      const current = tables.workflowJobs.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      tables.workflowJobs.set(id, next);
      return clone(next);
    },
    async appendWorkflowCheckpoint(row) {
      const rec = { ...row, id: row.id || randomUUID(), created_at: row.created_at || new Date().toISOString() };
      tables.workflowCheckpoints.push(rec);
      return clone(rec);
    },
    async listWorkflowCheckpoints(workflowJobId, nodeId) {
      return tables.workflowCheckpoints
        .filter((c) => c.workflow_job_id === workflowJobId && (!nodeId || c.node_id === nodeId))
        .map(clone);
    },
    async insertEvent(row) {
      const rec = { ...row, id: row.id || randomUUID(), created_at: row.created_at || new Date().toISOString() };
      tables.events.push(rec);
      return clone(rec);
    },
    async listEventsByCorrelation(correlationId) {
      return tables.events.filter((e) => e.correlation_id === correlationId).map(clone);
    },
    async insertApprovalRequest(row) {
      const id = row.id || randomUUID();
      const rec = { ...row, id, created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString() };
      tables.approvalRequests.set(id, rec);
      return clone(rec);
    },
    async getApprovalByJobId(jobId) {
      for (const row of tables.approvalRequests.values()) {
        if (row.job_id === jobId) return clone(row);
      }
      return null;
    },
    async updateApprovalRequest(id, patch) {
      const current = tables.approvalRequests.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      tables.approvalRequests.set(id, next);
      return clone(next);
    },
    async appendTimeline(row) {
      const rec = { ...row, id: row.id || randomUUID() };
      tables.timeline.push(rec);
      return clone(rec);
    },
    async appendCostLedger(row) {
      const rec = { ...row, id: row.id || randomUUID(), created_at: row.created_at || new Date().toISOString() };
      tables.costLedger.push(rec);
      return clone(rec);
    },
    _tables: tables,
  };
}

/**
 * PostgreSQL-backed store. Falls back gracefully when tables are missing.
 */
export function createPgRuntimeStore(pool) {
  if (!pool) throw new Error('aivos_store_error: pool_required');

  async function safeQuery(sql, params) {
    try {
      const r = await pool.query(sql, params);
      return r.rows || [];
    } catch (e) {
      if (/relation .* does not exist/i.test(e.message || '')) {
        const err = new Error('aivos_store_error: migration_259_required');
        err.code = 'MIGRATION_REQUIRED';
        throw err;
      }
      throw e;
    }
  }

  return {
    kind: 'pg',
    insertJob: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_runtime_jobs
          (id, user_id, plugin_id, status, approval_state, intent, trace_id, metadata)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, COALESCE($7, gen_random_uuid()), $8::jsonb)
         RETURNING *`,
        [
          row.id || null,
          row.user_id || null,
          row.plugin_id,
          row.status || 'queued',
          row.approval_state || 'draft',
          JSON.stringify(row.intent || {}),
          row.trace_id || null,
          JSON.stringify(row.metadata || {}),
        ],
      );
      return rows[0];
    },
    updateJob: async (id, patch) => {
      const rows = await safeQuery(
        `UPDATE aivos_runtime_jobs SET
           status = COALESCE($2, status),
           approval_state = COALESCE($3, approval_state),
           context_snapshot_id = COALESCE($4, context_snapshot_id),
           plan_id = COALESCE($5, plan_id),
           policy_decision_id = COALESCE($6, policy_decision_id),
           prompt_compilation_id = COALESCE($7, prompt_compilation_id),
           error_message = COALESCE($8, error_message),
           metadata = COALESCE($9::jsonb, metadata),
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.status || null,
          patch.approval_state || null,
          patch.context_snapshot_id || null,
          patch.plan_id || null,
          patch.policy_decision_id || null,
          patch.prompt_compilation_id || null,
          patch.error_message || null,
          patch.metadata ? JSON.stringify(patch.metadata) : null,
        ],
      );
      return rows[0] || null;
    },
    getJob: async (id) => {
      const rows = await safeQuery(`SELECT * FROM aivos_runtime_jobs WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    insertPlan: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_runtime_plans (id, job_id, workflow_template_id, dag, skill_bindings, version)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4::jsonb, $5::jsonb, COALESCE($6, 1))
         RETURNING *`,
        [
          row.id || null,
          row.job_id,
          row.workflow_template_id || null,
          JSON.stringify(row.dag || {}),
          JSON.stringify(row.skill_bindings || {}),
          row.version || 1,
        ],
      );
      return rows[0];
    },
    getPlan: async (id) => {
      const rows = await safeQuery(`SELECT * FROM aivos_runtime_plans WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    getPlanByJobId: async (jobId) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_runtime_plans WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      return rows[0] || null;
    },
    insertContextSnapshot: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_context_snapshots (id, job_id, snapshot, checksum)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3::jsonb, $4)
         RETURNING *`,
        [row.id || null, row.job_id, JSON.stringify(row.snapshot || {}), row.checksum],
      );
      return rows[0];
    },
    getContextSnapshot: async (id) => {
      const rows = await safeQuery(`SELECT * FROM aivos_context_snapshots WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    listPolicyRules: async ({ taskType, enabled = true } = {}) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_policy_rules
         WHERE ($1::text IS NULL OR task_type = $1)
           AND ($2::boolean IS NULL OR enabled = $2)
         ORDER BY priority DESC`,
        [taskType || null, enabled],
      );
      return rows;
    },
    insertPolicyDecision: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_policy_decisions (id, job_id, rule_id, task_type, decision, trace_id, rejected_reason)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING *`,
        [
          row.id || null,
          row.job_id || null,
          row.rule_id || null,
          row.task_type,
          JSON.stringify(row.decision || {}),
          row.trace_id || null,
          row.rejected_reason || null,
        ],
      );
      return rows[0];
    },
    listPolicyDecisionsByJob: async (jobId) => {
      return safeQuery(
        `SELECT * FROM aivos_policy_decisions WHERE job_id = $1 ORDER BY created_at ASC`,
        [jobId],
      );
    },
    getPromptRegistry: async (id, version) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_prompt_registry WHERE id = $1 AND version = $2 AND enabled = TRUE`,
        [id, version],
      );
      return rows[0] || null;
    },
    insertPromptCompilation: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_prompt_compilations
          (id, job_id, prompt_id, prompt_version, brand_dna_version, context_snapshot_id,
           compiler_version, content_hash, inputs, output)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
         RETURNING *`,
        [
          row.id || null,
          row.job_id || null,
          row.prompt_id,
          row.prompt_version,
          row.brand_dna_version || null,
          row.context_snapshot_id || null,
          row.compiler_version,
          row.content_hash,
          JSON.stringify(row.inputs || {}),
          JSON.stringify(row.output || {}),
        ],
      );
      return rows[0];
    },
    getBrandDna: async (brandKey, version = 1) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_brand_dna WHERE brand_key = $1 AND version = $2`,
        [brandKey, version],
      );
      return rows[0] || null;
    },
    appendGovernanceAudit: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_governance_audit
          (entity_type, entity_id, entity_version, action, actor_id, diff, job_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         RETURNING *`,
        [
          row.entity_type,
          row.entity_id,
          row.entity_version || null,
          row.action,
          row.actor_id || null,
          JSON.stringify(row.diff || {}),
          row.job_id || null,
        ],
      );
      return rows[0];
    },
    getPlugin: async (pluginId) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_plugin_registry WHERE plugin_id = $1 AND enabled = TRUE`,
        [pluginId],
      );
      return rows[0] || null;
    },
    listPlugins: async ({ enabled = true } = {}) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_plugin_registry WHERE ($1::boolean IS NULL OR enabled = $1)`,
        [enabled],
      );
      return rows;
    },
    listSkills: async ({ enabled = true } = {}) => {
      return safeQuery(
        `SELECT * FROM aivos_skill_registry WHERE ($1::boolean IS NULL OR enabled = $1)`,
        [enabled],
      );
    },
    getSkill: async (skillId) => {
      const rows = await safeQuery(`SELECT * FROM aivos_skill_registry WHERE skill_id = $1`, [skillId]);
      return rows[0] || null;
    },
    insertWorkflowJob: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_workflow_jobs (id, runtime_job_id, status, current_node)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4)
         RETURNING *`,
        [row.id || null, row.runtime_job_id, row.status || 'pending', row.current_node || null],
      );
      return rows[0];
    },
    updateWorkflowJob: async (id, patch) => {
      const rows = await safeQuery(
        `UPDATE aivos_workflow_jobs SET
           status = COALESCE($2, status),
           current_node = COALESCE($3, current_node),
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, patch.status || null, patch.current_node || null],
      );
      return rows[0] || null;
    },
    appendWorkflowCheckpoint: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_workflow_checkpoints
          (workflow_job_id, node_id, checkpoint_key, payload, checksum, attempt)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         RETURNING *`,
        [
          row.workflow_job_id,
          row.node_id,
          row.checkpoint_key,
          JSON.stringify(row.payload || {}),
          row.checksum,
          row.attempt || 1,
        ],
      );
      return rows[0];
    },
    listWorkflowCheckpoints: async (workflowJobId, nodeId) => {
      return safeQuery(
        `SELECT * FROM aivos_workflow_checkpoints
         WHERE workflow_job_id = $1 AND ($2::text IS NULL OR node_id = $2)
         ORDER BY created_at ASC`,
        [workflowJobId, nodeId || null],
      );
    },
    insertEvent: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_events
          (schema_version, name, correlation_id, trace_id, context_id, source, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         RETURNING *`,
        [
          row.schema_version,
          row.name,
          row.correlation_id,
          row.trace_id || null,
          row.context_id || null,
          JSON.stringify(row.source || {}),
          JSON.stringify(row.payload || {}),
        ],
      );
      return rows[0];
    },
    listEventsByCorrelation: async (correlationId) => {
      return safeQuery(
        `SELECT * FROM aivos_events WHERE correlation_id = $1 ORDER BY created_at ASC`,
        [correlationId],
      );
    },
    insertApprovalRequest: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_approval_requests (id, job_id, state, preview_url, reprompt_intent)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [
          row.id || null,
          row.job_id,
          row.state || 'draft',
          row.preview_url || null,
          row.reprompt_intent ? JSON.stringify(row.reprompt_intent) : null,
        ],
      );
      return rows[0];
    },
    getApprovalByJobId: async (jobId) => {
      const rows = await safeQuery(
        `SELECT * FROM aivos_approval_requests WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      return rows[0] || null;
    },
    updateApprovalRequest: async (id, patch) => {
      const rows = await safeQuery(
        `UPDATE aivos_approval_requests SET
           state = COALESCE($2, state),
           preview_url = COALESCE($3, preview_url),
           reprompt_intent = COALESCE($4::jsonb, reprompt_intent),
           decided_by = COALESCE($5, decided_by),
           decided_at = COALESCE($6, decided_at),
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          patch.state || null,
          patch.preview_url || null,
          patch.reprompt_intent ? JSON.stringify(patch.reprompt_intent) : null,
          patch.decided_by || null,
          patch.decided_at || null,
        ],
      );
      return rows[0] || null;
    },
    appendTimeline: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_video_timeline (job_id, node_id, status, started_at, completed_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [
          row.job_id,
          row.node_id,
          row.status,
          row.started_at || null,
          row.completed_at || null,
          JSON.stringify(row.metadata || {}),
        ],
      );
      return rows[0];
    },
    appendCostLedger: async (row) => {
      const rows = await safeQuery(
        `INSERT INTO aivos_cost_ledger (job_id, user_id, task_type, model_slot, estimated_cost, actual_cost, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`,
        [
          row.job_id || null,
          row.user_id || null,
          row.task_type || null,
          row.model_slot || null,
          row.estimated_cost || 0,
          row.actual_cost || null,
          JSON.stringify(row.metadata || {}),
        ],
      );
      return rows[0];
    },
  };
}

export function createRuntimeStore({ pool, seed } = {}) {
  if (pool) return createPgRuntimeStore(pool);
  return createMemoryRuntimeStore(seed);
}
