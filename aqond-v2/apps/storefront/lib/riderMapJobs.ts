import type { RiderJob } from '@/lib/rider';
import {
  enableRiderDevPreview as enableDevPreview,
  isRiderDevPreview as checkDevPreview,
} from '@/lib/riderDevPreview';

export type RiderMapJob = {
  id: string;
  title: string;
  description?: string;
  price: number;
  category?: string;
  location: { lat: number; lng: number; fullAddress?: string };
};

const BKK = { lat: 13.736717, lng: 100.523186 };

export function riderJobCoords(job: RiderJob): { lat: number; lng: number } {
  const lat =
    job.dropoff_lat ??
    job.pickup_lat ??
    BKK.lat;
  const lng =
    job.dropoff_lng ??
    job.pickup_lng ??
    BKK.lng;
  return { lat, lng };
}

export function riderJobsToMapJobs(jobs: RiderJob[]): RiderMapJob[] {
  return jobs
    .map((job) => {
      const { lat, lng } = riderJobCoords(job);
      if (!lat || !lng) return null;
      return {
        id: job.id,
        title: job.merchant_name || 'งานส่งของ',
        description: job.items_summary || job.address || '',
        price: Math.round((job.amount_micro || 0) / 1_000_000),
        category: job.job_type || 'delivery',
        location: {
          lat,
          lng,
          fullAddress: job.address || '',
        },
      } satisfies RiderMapJob;
    })
    .filter(Boolean) as RiderMapJob[];
}

export function getDevPreviewOpenJobs(): RiderJob[] {
  return [
    {
      id: 'dev-job-open-1',
      order_id: 'dev-order-1',
      merchant_id: 'dev-merchant-1',
      status: 'open',
      phase: 'pickup',
      merchant_name: 'ร้าน Dev Cafe สุขุมวิท',
      items_summary: 'ข้าวผัด x2, น้ำเปล่า x2',
      address: 'ถ. สุขุมวิท 21 กรุงเทพฯ',
      amount_micro: 85_000_000,
      pickup_lat: 13.736717,
      pickup_lng: 100.523186,
      dropoff_lat: 13.7392,
      dropoff_lng: 100.5268,
      job_type: 'food',
    },
    {
      id: 'dev-job-open-2',
      order_id: 'dev-order-2',
      merchant_id: 'dev-merchant-2',
      status: 'open',
      phase: 'delivery',
      merchant_name: 'Pharmacy Dev Express',
      items_summary: 'ยาพาราเซตามอล, เกลือแร่',
      address: 'อโศก มนตรี, กรุงเทพฯ',
      amount_micro: 62_000_000,
      pickup_lat: 13.7345,
      pickup_lng: 100.521,
      dropoff_lat: 13.742,
      dropoff_lng: 100.529,
      job_type: 'parcel',
    },
  ];
}

export function getDevPreviewMyJobs(): RiderJob[] {
  return [
    {
      id: 'dev-job-mine-1',
      order_id: 'dev-order-mine-1',
      merchant_id: 'dev-merchant-3',
      status: 'assigned',
      phase: 'pickup',
      merchant_name: 'Sushi Dev Box',
      items_summary: 'เซ็ตซูชิ A',
      address: 'เอ็มควอเทียร์, กรุงเทพฯ',
      amount_micro: 120_000_000,
      pickup_lat: 13.731,
      pickup_lng: 100.518,
      dropoff_lat: 13.728,
      dropoff_lng: 100.515,
      job_type: 'food',
    },
  ];
}

export type RepeatCustomer = {
  buyer_id: string;
  recipient_name?: string;
  address?: string;
  merchant_name?: string;
  trips?: number;
  last_job_id?: string;
};

export function getDevPreviewRepeatCustomers(): RepeatCustomer[] {
  return [
    {
      buyer_id: 'dev-buyer-1',
      recipient_name: 'คุณวิชัย (ลูกค้าประจำ)',
      address: 'เอ็มควอเทียร์, กรุงเทพฯ',
      merchant_name: 'Sushi Dev Box',
      trips: 4,
      last_job_id: 'dev-job-mine-1',
    },
  ];
}

export function isRiderDevPreview(): boolean {
  return checkDevPreview();
}

export function enableRiderDevPreview(): void {
  enableDevPreview();
}
