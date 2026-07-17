import {
  EVENT_LABELS_TH,
  isDispatchTimelineEvent,
  listOrderEvents,
  type AqondLifecycleEvent,
  type AqondEventType,
} from '@/lib/server/aqondEventBus';

export type TimelineStep = {
  id: string;
  key: string;
  label: string;
  at?: string;
  time_label?: string;
  done: boolean;
  active: boolean;
  source?: string;
  rider_id?: string;
  dispatch?: boolean;
};

const DISPLAY_ORDER: AqondEventType[] = [
  'order.created',
  'merchant.accepted',
  'merchant.cooking_started',
  'merchant.packing_proof',
  'merchant.ready',
  'rider.assigned',
  'rider.picked_up',
  'rider.en_route',
  'rider.arrived',
  'order.delivered',
];

function formatBangkokTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    return new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    });
  } catch {
    return undefined;
  }
}

export function eventsToTimelineSteps(events: AqondLifecycleEvent[]): TimelineStep[] {
  const lifecycle = events.filter((e) => !isDispatchTimelineEvent(e.event_type));
  const byType = new Map<AqondEventType, AqondLifecycleEvent>();
  for (const e of lifecycle) {
    if (!byType.has(e.event_type)) byType.set(e.event_type, e);
  }

  if (lifecycle.some((e) => e.event_type === 'order.cancelled')) {
    const cancel = lifecycle.find((e) => e.event_type === 'order.cancelled');
    return [{
      id: 'cancelled',
      key: 'cancelled',
      label: EVENT_LABELS_TH['order.cancelled'],
      at: cancel?.at,
      time_label: formatBangkokTime(cancel?.at),
      done: true,
      active: false,
      source: cancel?.source,
    }];
  }

  const lastType = lifecycle.length ? lifecycle[lifecycle.length - 1].event_type : null;
  const lastIdx = lastType ? DISPLAY_ORDER.indexOf(lastType) : -1;

  return DISPLAY_ORDER.map((type) => {
    const hit = byType.get(type);
    const idx = DISPLAY_ORDER.indexOf(type);
    const done = !!hit || (lastIdx >= 0 && idx < lastIdx);
    const active = lastType === type;
    return {
      id: type,
      key: type,
      label: EVENT_LABELS_TH[type],
      at: hit?.at,
      time_label: formatBangkokTime(hit?.at),
      done,
      active,
      source: hit?.source,
      rider_id: hit?.rider_id,
    };
  });
}

export type FoodTimelineEntry = {
  id: string;
  event_type: string;
  label: string;
  at: string;
  time_label: string;
  source: string;
  rider_id?: string;
  job_id?: string;
  payload?: Record<string, unknown>;
  kind: 'lifecycle' | 'dispatch';
};

export function buildFoodTimelineEntries(events: AqondLifecycleEvent[]): FoodTimelineEntry[] {
  return events.map((e) => ({
    id: e.id,
    event_type: e.event_type,
    label: EVENT_LABELS_TH[e.event_type] || e.event_type,
    at: e.at,
    time_label: formatBangkokTime(e.at) || '—',
    source: e.source,
    rider_id: e.rider_id,
    job_id: e.job_id,
    payload: e.payload,
    kind: isDispatchTimelineEvent(e.event_type) ? 'dispatch' : 'lifecycle',
  }));
}

export function buildDispatchTimelineEntries(events: AqondLifecycleEvent[]): FoodTimelineEntry[] {
  return buildFoodTimelineEntries(events.filter((e) => isDispatchTimelineEvent(e.event_type)));
}

export async function getUnifiedOrderTimeline(orderId: string) {
  const events = await listOrderEvents(orderId);
  return {
    order_id: orderId,
    events,
    steps: eventsToTimelineSteps(events),
    food_timeline: buildFoodTimelineEntries(events),
    dispatch_timeline: buildDispatchTimelineEntries(events),
  };
}
