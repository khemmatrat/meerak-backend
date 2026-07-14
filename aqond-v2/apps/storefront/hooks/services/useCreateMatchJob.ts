'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { createMatchJob } from '@/lib/services/matchJobApi';
import { ALL_CATEGORIES } from '@/lib/services/jobCategoryHub';
import { EMPLOYMENT_TYPE_OPTIONS, getEmploymentTypeLabel } from '@/lib/services/workTaxonomy';

const CREATE_CATEGORIES = ALL_CATEGORIES.filter((c) => c !== 'All');

const JUST_CREATED_KEY = 'meerak_justCreatedJob';

function defaultDatetime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

const EMPLOYMENT_LABELS: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.id, o.label]),
);

export type CreateJobForm = {
  title: string;
  description: string;
  category: string;
  price: string;
  datetime: string;
  duration_hours: number;
  province: string;
  employment_type: string;
  address: string;
  lat: number;
  lng: number;
};

export function useCreateMatchJob() {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateJobForm>({
    title: '',
    description: '',
    category: 'Cleaning',
    price: '',
    datetime: defaultDatetime(),
    duration_hours: 2,
    province: 'กรุงเทพมหานคร',
    employment_type: 'one_time',
    address: '',
    lat: 13.736717,
    lng: 100.523186,
  });

  const patch = useCallback((partial: Partial<CreateJobForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const canStep1 =
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 10 &&
    Number(form.price) > 0 &&
    CREATE_CATEGORIES.includes(form.category);

  const submit = useCallback(async () => {
    if (!user?.id) {
      setMsg('กรุณาเข้าสู่ระบบก่อนโพสต์งาน');
      router.push('/m/login');
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      let jobDatetime = new Date(form.datetime);
      const now = new Date();
      const minFuture = new Date(now.getTime() + 30 * 60 * 1000);
      if (isNaN(jobDatetime.getTime()) || jobDatetime <= minFuture) {
        jobDatetime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        jobDatetime.setHours(9, 0, 0, 0);
      }

      const descriptionWithProfile = [
        form.description.trim(),
        '',
        'Hiring Profile',
        `- จังหวัดงาน: ${form.province || 'ไม่ระบุ'}`,
        `- ลักษณะการจ้างงาน: ${EMPLOYMENT_LABELS[form.employment_type] || form.employment_type}`,
        '- ช่องทางลงงาน: Match Job',
      ]
        .join('\n')
        .trim();

      const location = {
        lat: form.lat,
        lng: form.lng,
        fullAddress: form.address.trim() || undefined,
        province: form.province,
      };

      const out = await createMatchJob(
        {
          title: form.title.trim(),
          description: descriptionWithProfile,
          category: form.category,
          price: Number(form.price),
          datetime: jobDatetime.toISOString(),
          duration_hours: form.duration_hours,
          province: form.province,
          employment_type: form.employment_type,
          location,
          created_by: user.id,
        },
        auth,
      );

      if (out.source === 'localstorage') {
        setMsg('งานถูกสร้างสำเร็จ (บันทึกชั่วคราวในเบราว์เซอร์)');
      } else {
        setMsg('โพสต์งานสำเร็จ');
      }

      const id = String(out.job.id || '');
      setCreatedId(id);
      if (id && !id.startsWith('temp_')) {
        try {
          sessionStorage.setItem(JUST_CREATED_KEY, JSON.stringify(out.job));
        } catch {
          /* ignore */
        }
        setStep(3);
      } else {
        router.push('/m/services/match/mine?tab=posted');
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'โพสต์งานไม่สำเร็จ';
      setMsg(errMsg);
      if (errMsg.includes('เข้าสู่ระบบ')) router.push('/m/login');
    } finally {
      setSubmitting(false);
    }
  }, [auth, form, router, user?.id]);

  return {
    step,
    setStep,
    form,
    patch,
    canStep1,
    submitting,
    msg,
    createdId,
    submit,
    categories: CREATE_CATEGORIES,
    employmentTypes: EMPLOYMENT_TYPE_OPTIONS.map((o) => o.id),
    employmentLabel: (k: string) => getEmploymentTypeLabel(k) || EMPLOYMENT_LABELS[k] || k,
  };
}
