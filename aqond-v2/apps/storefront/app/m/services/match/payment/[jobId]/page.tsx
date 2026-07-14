import { MatchJobPaymentView } from '@/components/services/match/MatchJobPaymentView';

type Props = { params: Promise<{ jobId: string }> };

export default async function MatchPaymentPage({ params }: Props) {
  const { jobId } = await params;
  return <MatchJobPaymentView jobId={jobId} />;
}
