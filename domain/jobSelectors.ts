import { Job, JobStatus } from "@/types";
import { JobView } from "./jobView";
import { isActiveStatus, isFinishedStatus } from "./jobStatus";


export function selectJobsByView(
  jobs: Job[],
  view: JobView,
  userId: string
): Job[] {
  switch (view) {
    /** =====================
     *  MY JOBS (Client)
     ====================== */

    case "POSTED":
      return jobs.filter(
        (j) =>
          j.created_by === userId &&
          isActiveStatus(j.status)
      );

    case "WORKING":
      return jobs.filter(
        (j) =>
          j.accepted_by === userId &&
          isActiveStatus(j.status)
      );

    case "HISTORY":
      return jobs.filter(
        (j) =>
          isFinishedStatus(j.status) &&
          (j.created_by === userId || j.accepted_by === userId)
      );

    case "RECOMMENDED":
      return jobs.filter((j) => j.status === JobStatus.OPEN);

    /** =====================
     *  PROVIDER DASHBOARD
     ====================== */

    case "PROVIDER_ACTIVE":
      return jobs.filter(
        (j) =>
          j.accepted_by === userId &&
          isActiveStatus(j.status)
      );

    case "PROVIDER_HISTORY":
      return jobs.filter(
        (j) =>
          j.accepted_by === userId &&
          isFinishedStatus(j.status)
      );

    default:
      return [];
  }
}
