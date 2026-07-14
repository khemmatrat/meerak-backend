'use client';

import { useParams } from 'next/navigation';
import { BookingTalentDetailView } from '@/components/services/booking/BookingTalentDetailView';

export default function BookingTalentDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  if (!id) return null;
  return <BookingTalentDetailView talentId={id} />;
}
