import { JobStatus } from "@/types";

export const ACTIVE_STATUSES: JobStatus[] = [
  JobStatus.OPEN,
  JobStatus.ACCEPTED,
  JobStatus.IN_PROGRESS,
  JobStatus.WAITING_FOR_APPROVAL,
  JobStatus.WAITING_FOR_PAYMENT,
  JobStatus.DISPUTE,
];

export const FINISHED_STATUSES: JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
];

export const isActiveStatus = (status: JobStatus) =>
  ACTIVE_STATUSES.includes(status);

export const isFinishedStatus = (status: JobStatus) =>
  FINISHED_STATUSES.includes(status);
