'use client';

import { useParams } from 'next/navigation';
import { ManageBoardJobView } from '@/components/services/board/ManageBoardJobView';

export default function BoardManagePage() {
  const params = useParams();
  const id = String(params?.id || '');
  if (!id) return null;
  return <ManageBoardJobView jobId={id} />;
}
