// services/jobService.ts
import { MockApi } from '@/services/mockApi';
import { Job, JobStatus } from '@/types';

export const getProviderJobs = async (providerId: string): Promise<Job[]> => {
  const allJobs = await MockApi.getYourJobs();

  return allJobs.filter(j =>
    j.accepted_by === providerId &&
    [
      JobStatus.ACCEPTED,
      JobStatus.IN_PROGRESS,
      JobStatus.WAITING_FOR_APPROVAL,
      JobStatus.WAITING_FOR_PAYMENT,
      JobStatus.DISPUTE,
      JobStatus.COMPLETED,
    ].includes(j.status)
  );
};
