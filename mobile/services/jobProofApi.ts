import { api } from "./api";

export type JobProofPhase = "before" | "after";

export async function verifyJobProofImage(
  jobId: string,
  params: {
    userId: string;
    imageUrl: string;
    phase: JobProofPhase;
    compareUrl?: string;
    captureLat?: number;
    captureLng?: number;
    capturedAt?: string;
  }
): Promise<{ success: boolean; skipped?: boolean; geo_warning?: string | null }> {
  const res = await api.post(`/jobs/${jobId}/verify-proof-image`, params, { timeout: 55000 });
  return res.data;
}
