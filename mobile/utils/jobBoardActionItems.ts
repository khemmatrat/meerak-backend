import type { MyJobAdvanceAPI, MyJobAdvanceApplicationAPI } from "../types/api";

export type JobBoardActionItem = {
  jobId: string;
  title: string;
  actionLabel: string;
  href: string;
  priority: number;
};

function pushAction(
  list: JobBoardActionItem[],
  item: Omit<JobBoardActionItem, "priority"> & { priority: number },
) {
  list.push(item);
}

/** รายการงานที่ต้องดำเนินการ — เรียง priority สูงสุดก่อน */
export function buildEmployerActionItems(
  jobs: MyJobAdvanceAPI[],
  unreadMap: Record<string, number>,
): JobBoardActionItem[] {
  const items: JobBoardActionItem[] = [];
  for (const job of jobs) {
    const unread = unreadMap[String(job.id)] || 0;
    if (unread > 0) {
      pushAction(items, {
        jobId: job.id,
        title: job.title,
        actionLabel: `มีแชทใหม่ (${unread > 9 ? "9+" : unread})`,
        href: `/job-board/${job.id}/manage?tab=chat`,
        priority: 30 + Math.min(unread, 9),
      });
    }
    if (
      job.hired_user_id &&
      job.escrow_status !== "held" &&
      job.escrow_status !== "released" &&
      job.status !== "completed"
    ) {
      pushAction(items, {
        jobId: job.id,
        title: job.title,
        actionLabel: "รอโอนเงินค้ำ",
        href: `/job-board/${job.id}/manage?tab=escrow`,
        priority: 20,
      });
    }
    if (job.status === "completed") {
      pushAction(items, {
        jobId: job.id,
        title: job.title,
        actionLabel: "รอให้คะแนน",
        href: `/job-board/${job.id}/manage?tab=review`,
        priority: 10,
      });
    }
  }
  return items.sort((a, b) => b.priority - a.priority);
}

export function buildTalentActionItems(
  applications: MyJobAdvanceApplicationAPI[],
  myUserId: string | undefined,
  unreadMap: Record<string, number>,
): JobBoardActionItem[] {
  const items: JobBoardActionItem[] = [];
  for (const app of applications) {
    const unread = unreadMap[String(app.job_id)] || 0;
    if (unread > 0 && myUserId) {
      pushAction(items, {
        jobId: app.job_id,
        title: app.title,
        actionLabel: `มีแชทใหม่ (${unread > 9 ? "9+" : unread})`,
        href: `/job-board/${app.job_id}/chat/${myUserId}`,
        priority: 30 + Math.min(unread, 9),
      });
    }
    const escrowStatus = app.escrow_status || "none";
    if (
      app.status === "hired" &&
      escrowStatus !== "held" &&
      escrowStatus !== "released"
    ) {
      pushAction(items, {
        jobId: app.job_id,
        title: app.title,
        actionLabel: "รอโอนเงินค้ำ",
        href: `/job-board/${app.job_id}/manage?tab=escrow`,
        priority: 20,
      });
    }
    if (app.job_status === "completed") {
      pushAction(items, {
        jobId: app.job_id,
        title: app.title,
        actionLabel: "รอให้คะแนน",
        href: `/job-board/${app.job_id}/manage?tab=review`,
        priority: 10,
      });
    }
  }
  return items.sort((a, b) => b.priority - a.priority);
}
