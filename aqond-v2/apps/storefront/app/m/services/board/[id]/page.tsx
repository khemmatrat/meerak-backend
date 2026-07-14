'use client';

import { useParams } from 'next/navigation';
import { BoardJobDetailView } from '@/components/services/board/BoardJobDetailView';

export default function BoardJobDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  if (!id) return null;
  return <BoardJobDetailView jobId={id} />;
}
