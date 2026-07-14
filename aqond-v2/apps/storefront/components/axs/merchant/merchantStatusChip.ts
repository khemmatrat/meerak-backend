import type { StatusChipTone } from '@aqond/ui';

export function merchantFulfillmentTone(status: string): StatusChipTone {
  switch (status) {
    case 'pending_accept':
    case 'pending_ship':
      return 'pending';
    case 'accepted':
    case 'preparing':
      return 'active';
    case 'ready':
    case 'shipped':
      return 'delivering';
    case 'delivered':
      return 'completed';
    case 'rejected':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'default';
  }
}
