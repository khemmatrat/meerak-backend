'use client';

import { useParams } from 'next/navigation';
import { MatchJobDetailView } from '@/components/services/match/MatchJobDetailView';

export default function MatchJobDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  if (!id) return null;
  return <MatchJobDetailView jobId={id} />;
}
