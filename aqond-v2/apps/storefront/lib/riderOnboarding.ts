import type { RiderProfile } from '@/lib/rider';

/** 50000 micro = ฿500 default credit line */
export const RIDER_STARTING_CREDIT_THB = 500;

export const RIDER_ONBOARDING_STEP_DEFS = [
  { id: 'register', label: 'สมัคร Rider OS', short: 'สมัคร' },
  { id: 'kyc', label: 'ยืนยันตัวตน (KYC)', short: 'KYC' },
  { id: 'credit', label: 'เปิดวงเงินเครดิต', short: 'เครดิต' },
  { id: 'first_job', label: 'รับงานแรก', short: 'รับงาน' },
] as const;

export type RiderOnboardingStepId = (typeof RIDER_ONBOARDING_STEP_DEFS)[number]['id'];

export type RiderOnboardingStep = {
  id: RiderOnboardingStepId;
  label: string;
  short: string;
  done: boolean;
  current: boolean;
};

export type RiderOnboardingState = {
  steps: RiderOnboardingStep[];
  progressPct: number;
  currentStepId: RiderOnboardingStepId;
  completed: boolean;
  creditPitch: string;
  nextAction?: { label: string; href: string; hint?: string };
};

export function computeRiderOnboarding(input: {
  hasAuth: boolean;
  profile: RiderProfile | null | undefined;
  creditLimitMicro?: number | null;
  completedJobs?: number | null;
}): RiderOnboardingState {
  const registered = !!input.profile?.rider_id;
  const kycOk =
    registered &&
    input.profile?.active === true &&
    input.profile?.suspended !== true &&
    String(input.profile?.kyc_status || '').toLowerCase() === 'approved';
  const creditLimit = Number(input.creditLimitMicro ?? 0);
  const creditOk = registered && creditLimit > 0;
  const firstJobOk = Number(input.completedJobs ?? 0) >= 1;

  const doneMap: Record<RiderOnboardingStepId, boolean> = {
    register: registered,
    kyc: kycOk,
    credit: creditOk,
    first_job: firstJobOk,
  };

  const currentStepId =
    (RIDER_ONBOARDING_STEP_DEFS.find((s) => !doneMap[s.id])?.id as RiderOnboardingStepId) ||
    'first_job';

  const steps: RiderOnboardingStep[] = RIDER_ONBOARDING_STEP_DEFS.map((s) => ({
    ...s,
    done: doneMap[s.id],
    current: s.id === currentStepId && !firstJobOk,
  }));

  const doneCount = steps.filter((s) => s.done).length;
  const progressPct = Math.round((doneCount / steps.length) * 100);
  const completed = doneCount === steps.length;

  const creditPitch = `วงเงิน ฿${RIDER_STARTING_CREDIT_THB} ให้ยืมก่อน — ไม่ต้องเติมเงินก่อนรับงาน`;

  let nextAction: RiderOnboardingState['nextAction'];
  if (!input.hasAuth) {
    nextAction = { label: 'เข้าสู่ระบบ', href: '/m/login', hint: 'ใช้บัญชี AQOND เดิม' };
  } else if (!registered) {
    nextAction = { label: 'สมัคร Rider OS', href: '/m/rider/signup', hint: creditPitch };
  } else if (!kycOk) {
    nextAction = {
      label: 'อัปโหลดเอกสารยืนยันตัวตน',
      href: '/m/rider/kyc',
      hint: 'บัตร ปชช. ใบขับขี่ รูปรถ 4 ด้าน — รอแอดมินอนุมัติ',
    };
  } else if (!creditOk) {
    nextAction = {
      label: 'ดูเครดิต',
      href: '/m/rider/wallet',
      hint: 'วงเงินจะเปิดหลังสมัครสำเร็จ',
    };
  } else if (!firstJobOk) {
    nextAction = {
      label: 'ลองรับงานแรก',
      href: '/m/rider/jobs',
      hint: 'เลือกงานใกล้คุณ — ใช้เครดิตให้ยืมรับงานได้เลย',
    };
  }

  return {
    steps,
    progressPct,
    currentStepId,
    completed,
    creditPitch,
    nextAction,
  };
}
