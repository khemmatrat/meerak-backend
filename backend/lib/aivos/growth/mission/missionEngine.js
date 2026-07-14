import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';
import { DEFAULT_MISSION_TEMPLATES } from './missionTemplate.js';

function missionId() {
  return `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMissionEngine({ storage, metrics, audit, events, reward, applications, workflows } = {}) {
  const owner = 'growth.mission';
  const table = storage.tables.missions;

  function listKey(tenantId, userId) {
    return storage.key(tenantId, userId, 'missions');
  }

  function getMissions(tenantId, userId) {
    return storage.get(table, listKey(tenantId, userId)) || [];
  }

  function saveMissions(tenantId, userId, missions) {
    assertGrowthWriteOwner(owner, table);
    storage.put(table, listKey(tenantId, userId), missions);
  }

  return {
    list({ tenantId, userId }, { status } = {}) {
      const missions = getMissions(tenantId, userId);
      if (!missions.length) {
        const seeded = DEFAULT_MISSION_TEMPLATES.map((t) => ({
          missionId: missionId(),
          tenantId,
          userId,
          templateId: t.templateId,
          title: t.title,
          status: 'active',
          progress: 0,
          rewardPoints: t.rewardPoints,
          priority: t.priority,
          linkedAppId: null,
          linkedWorkflowId: null,
          createdAt: storage.now(),
        }));
        saveMissions(tenantId, userId, seeded);
        return status ? seeded.filter((m) => m.status === status) : seeded;
      }
      return status ? missions.filter((m) => m.status === status) : missions;
    },

    get({ tenantId, userId }, missionIdValue) {
      return this.list({ tenantId, userId }).find((m) => m.missionId === missionIdValue) || null;
    },

    assign({ tenantId, userId }, template = {}) {
      assertGrowthWriteOwner(owner, table);
      const missions = getMissions(tenantId, userId);
      const row = {
        missionId: missionId(),
        tenantId,
        userId,
        templateId: template.templateId || 'custom',
        title: template.title || 'New mission',
        status: 'active',
        progress: 0,
        rewardPoints: template.rewardPoints || 10,
        priority: template.priority || 50,
        linkedAppId: template.linkedAppId || null,
        linkedWorkflowId: template.linkedWorkflowId || null,
        createdAt: storage.now(),
      };
      saveMissions(tenantId, userId, [...missions, row]);
      void emitGrowthEvent(events, 'growth.mission.assigned', { missionId: row.missionId }, { tenantId, userId });
      return row;
    },

    complete({ tenantId, userId }, { missionId: mid, evidence } = {}) {
      assertGrowthWriteOwner(owner, table);
      const missions = getMissions(tenantId, userId);
      const idx = missions.findIndex((m) => m.missionId === mid);
      if (idx < 0) {
        const err = new Error('mission_not_found');
        err.code = 'MISSION_NOT_FOUND';
        throw err;
      }
      const current = missions[idx];
      if (current.status === 'completed') return { ok: true, mission: current, reward: null };

      const completed = {
        ...current,
        status: 'completed',
        progress: 100,
        completedAt: storage.now(),
        evidence: evidence || null,
      };
      missions[idx] = completed;
      saveMissions(tenantId, userId, missions);

      let rewardResult = null;
      if (reward && completed.rewardPoints > 0) {
        rewardResult = reward.issueReward
          ? reward.issueReward({ tenantId, userId }, completed)
          : reward.grant({ tenantId, userId }, {
            points: completed.rewardPoints,
            reason: 'mission.complete',
            missionId: completed.missionId,
          });
      }

      metrics?.record?.({ tenantId, action: 'mission.complete', success: true });
      audit?.record?.({ action: 'mission.complete', tenantId, diff: { missionId: mid, userId } });
      void emitGrowthEvent(events, 'growth.mission.completed', { missionId: mid }, { tenantId, userId });
      return { ok: true, mission: completed, reward: rewardResult };
    },

    start({ tenantId, userId }, missionIdValue) {
      assertGrowthWriteOwner(owner, table);
      const missions = getMissions(tenantId, userId);
      const idx = missions.findIndex((m) => m.missionId === missionIdValue);
      if (idx < 0) {
        const err = new Error('mission_not_found');
        err.code = 'MISSION_NOT_FOUND';
        throw err;
      }
      missions[idx] = { ...missions[idx], status: 'active', startedAt: storage.now() };
      saveMissions(tenantId, userId, missions);
      void emitGrowthEvent(events, 'growth.mission.assigned', { missionId: missionIdValue, started: true }, { tenantId, userId });
      return missions[idx];
    },

    abandon({ tenantId, userId }, { missionId: mid, reason } = {}) {
      assertGrowthWriteOwner(owner, table);
      const missions = getMissions(tenantId, userId);
      const idx = missions.findIndex((m) => m.missionId === mid);
      if (idx < 0) {
        const err = new Error('mission_not_found');
        err.code = 'MISSION_NOT_FOUND';
        throw err;
      }
      missions[idx] = {
        ...missions[idx],
        status: 'expired',
        abandonedAt: storage.now(),
        abandonReason: reason || 'user',
      };
      saveMissions(tenantId, userId, missions);
      void emitGrowthEvent(events, 'growth.mission.expired', { missionId: mid }, { tenantId, userId });
      return { ok: true, mission: missions[idx] };
    },

    async execute(ctx, { missionId: mid, input = {} } = {}) {
      const m = this.get(ctx, mid);
      if (!m) {
        const err = new Error('mission_not_found');
        err.code = 'MISSION_NOT_FOUND';
        throw err;
      }
      this.start(ctx, mid);
      if (m.linkedAppId && applications?.execute) {
        const result = await applications.execute(m.linkedAppId, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          input,
        });
        return { ok: true, delegated: 'application', appId: m.linkedAppId, result };
      }
      if (m.linkedWorkflowId && workflows?.execute) {
        const wfManifest = workflows.registry?.findWorkflow?.(m.linkedWorkflowId)?.manifest
          || workflows.getTemplate?.(m.linkedWorkflowId);
        if (wfManifest) {
          const result = await workflows.execute({ manifest: wfManifest, input, userId: ctx.userId });
          return { ok: true, delegated: 'workflow', workflowId: m.linkedWorkflowId, result };
        }
      }
      return { ok: true, delegated: 'none', mission: m };
    },
  };
}
