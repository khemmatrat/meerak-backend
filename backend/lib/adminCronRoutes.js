/**
 * Admin cron-style triggers (Tier 4.3 / 4.4).
 */
import { runSupportCaseSlaNudge } from './supportCaseSlaNudge.js';
import { sendOpsWeeklyDigest } from './opsWeeklyDigest.js';
import {
  getExecutiveDailyReportSchedule,
  getExecutiveDailyReportScheduleStatus,
  sendExecutiveDailyCsvReport,
  updateExecutiveDailyReportSchedule,
} from './executiveDailyCsvReport.js';

export function registerAdminCronRoutes(app, pool, adminAuthMiddleware) {
  app.post('/api/admin/cron/support-case-sla-nudge/run', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await runSupportCaseSlaNudge(pool, { force: !!req.body?.force });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[sla-nudge]', e?.message);
      res.status(500).json({ error: e?.message });
    }
  });

  app.post('/api/admin/cron/ops-weekly-digest/run', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await sendOpsWeeklyDigest(pool, { force: !!req.body?.force });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[ops-digest]', e?.message);
      res.status(500).json({ error: e?.message });
    }
  });

  app.get('/api/admin/reports/executive-daily/schedule', adminAuthMiddleware, async (_req, res) => {
    try {
      const schedule = await getExecutiveDailyReportScheduleStatus(pool);
      res.json(schedule);
    } catch (e) {
      console.error('[executive-daily-report:schedule:get]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load schedule' });
    }
  });

  app.patch('/api/admin/reports/executive-daily/schedule', adminAuthMiddleware, async (req, res) => {
    try {
      const role = req.adminUser?.role;
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only ADMIN/SUPER_ADMIN can update schedule' });
      }
      await updateExecutiveDailyReportSchedule(pool, req.body || {});
      const schedule = await getExecutiveDailyReportScheduleStatus(pool);
      return res.json(schedule);
    } catch (e) {
      console.error('[executive-daily-report:schedule:patch]', e?.message);
      return res.status(400).json({ error: e?.message || 'Failed to update schedule' });
    }
  });

  app.post('/api/admin/cron/executive-daily-report/run', adminAuthMiddleware, async (req, res) => {
    try {
      const schedule = await getExecutiveDailyReportSchedule(pool);
      const result = await sendExecutiveDailyCsvReport(pool, {
        force: !!req.body?.force,
        reportDate: req.body?.report_date,
        windowDays: req.body?.window_days ?? schedule.window_days,
        recipients: schedule.recipients,
      });
      if (!result.sent && result.reason !== 'deduped') {
        return res.status(400).json({ ok: false, ...result });
      }
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[executive-daily-report]', e?.message);
      return res.status(500).json({ error: e?.message });
    }
  });
}
