import type { MatchJob } from './matchJobTypes';

export type MyMatchJobsTab = 'posted' | 'hire' | 'working' | 'recommended' | 'history';

const norm = (s: string) => (s || '').toLowerCase().trim();
const normStatus = (s: unknown) => norm(String(s || '')).replace(/\s+/g, '_');

function isExpired(job: MatchJob): boolean {
  const created = job.created_at ? new Date(job.created_at).getTime() : 0;
  const thirtySixHoursAgo = Date.now() - 36 * 60 * 60 * 1000;
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  if (created > thirtySixHoursAgo) return false;
  if (created <= twoDaysAgo) return true;
  if (!job.datetime) return false;
  try {
    return new Date(job.datetime) < new Date();
  } catch {
    return false;
  }
}

export function filterMyMatchJobs(
  allJobs: MatchJob[],
  tab: MyMatchJobsTab,
  userId: string,
  options?: { showExpired?: boolean },
): MatchJob[] {
  const showExpired = options?.showExpired ?? false;
  const uidStr = String(userId ?? '').trim();
  const uidNorm = norm(uidStr);
  let filtered: MatchJob[] = [];

  if (tab === 'recommended') {
    return [];
  }

  if (tab === 'posted') {
    const activeStatuses = [
      'open',
      'accepted',
      'in_progress',
      'waiting_for_approval',
      'waiting_for_payment',
      'dispute',
    ];
    filtered = allJobs.filter((j) => {
      const createdBy = String(j.created_by ?? '').trim();
      const clientId = String((j as Record<string, unknown>).client_id ?? '').trim();
      const statusNorm = normStatus(j.status);
      const isOpenNoProvider = statusNorm === 'open' && !j.accepted_by;
      const isMine =
        createdBy === uidStr ||
        norm(createdBy) === uidNorm ||
        (clientId && (clientId === uidStr || norm(clientId) === uidNorm)) ||
        isOpenNoProvider;
      const isActive = activeStatuses.some((s) => statusNorm === s);
      const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
      return isMine && isActive && (showExpired || isGoodJob);
    });
  } else if (tab === 'hire') {
    filtered = allJobs.filter((j) => {
      const createdBy = String(j.created_by ?? '');
      const isMine = createdBy === uidStr || norm(createdBy) === uidNorm;
      const hasProvider = !!j.accepted_by;
      const statusNorm = normStatus(j.status);
      const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
      return isMine && hasProvider && (showExpired || isGoodJob);
    });
  } else if (tab === 'working') {
    const workStatuses = [
      'accepted',
      'in_progress',
      'waiting_for_approval',
      'waiting_for_payment',
      'dispute',
    ];
    filtered = allJobs.filter((j) => {
      const statusNorm = normStatus(j.status);
      const isMyWork =
        j.accepted_by === userId || norm(j.accepted_by ?? '') === norm(userId ?? '');
      const isWorkingStatus = workStatuses.includes(statusNorm);
      const isGoodJob = statusNorm !== 'expired' && statusNorm !== 'deleted' && !isExpired(j);
      return isMyWork && isWorkingStatus && (showExpired || isGoodJob);
    });
  } else if (tab === 'history') {
    const doneStatuses = ['completed', 'cancelled', 'expired'];
    filtered = allJobs.filter((j) => {
      const uid = userId ?? '';
      const isMyJob =
        j.created_by === userId ||
        j.accepted_by === userId ||
        norm(j.created_by ?? '') === norm(uid) ||
        norm(j.accepted_by ?? '') === norm(uid);
      return isMyJob && doneStatuses.includes(normStatus(j.status));
    });
  }

  return filtered.sort(
    (a, b) =>
      new Date(b.datetime || b.created_at || 0).getTime() -
      new Date(a.datetime || a.created_at || 0).getTime(),
  );
}

export const MY_MATCH_JOBS_TAB_LABELS: Record<MyMatchJobsTab, string> = {
  posted: 'งานที่โพสต์',
  hire: 'งานที่จ้าง',
  working: 'งานที่รับทำ',
  recommended: 'แนะนำ',
  history: 'ประวัติ',
};
