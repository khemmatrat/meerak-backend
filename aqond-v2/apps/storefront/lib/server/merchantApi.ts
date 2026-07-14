import { kongBase } from '@/lib/server-env';

export function orderApi(path: string): string {
  return `${kongBase()}/api/v1/orders${path}`;
}

export function shippingApi(path: string): string {
  return `${kongBase()}/api/v1/shipping${path}`;
}

export function reviewsApi(path: string): string {
  return `${kongBase()}/api/v1/reviews${path}`;
}
