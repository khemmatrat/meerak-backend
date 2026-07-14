'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { createBoardJob } from '@/lib/services/boardJobApi';
import { ALL_BOARD_CATEGORIES, BOARD_EMPLOYMENT_TYPES, BOARD_PROVINCES, boardEmploymentLabel } from '@/lib/services/boardJobTaxonomy';

export type CreateBoardJobForm = {
  title: string;
  category: string;
  description: string;
  scope: string;
  budget_min: string;
  budget_max: string;
  duration_days: string;
  province: string;
  employment_type: string;
};

export function useCreateBoardJob() {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateBoardJobForm>({
    title: '',
    category: ALL_BOARD_CATEGORIES[0] || 'Web Development',
    description: '',
    scope: '',
    budget_min: '',
    budget_max: '',
    duration_days: '7',
    province: 'กรุงเทพมหานคร',
    employment_type: 'project',
  });

  const patch = useCallback((partial: Partial<CreateBoardJobForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const minB = Number(form.budget_min) || 0;
  const maxB = Number(form.budget_max) || 0;
  const canStep1 = form.title.trim().length >= 3 && form.description.trim().length >= 20;
  const canStep2 = form.scope.trim().length >= 10;
  const canStep3 = minB > 0 && maxB >= minB && Number(form.duration_days) > 0;

  const submit = useCallback(async () => {
    if (!user?.id) {
      setMsg('กรุณาเข้าสู่ระบบก่อนโพสต์งาน');
      router.push('/m/login');
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const scopeWithProfile = [
        'Hiring Profile',
        `- จังหวัดเป้าหมาย: ${form.province || 'ไม่ระบุ'}`,
        `- ลักษณะการจ้างงาน: ${boardEmploymentLabel(form.employment_type)}`,
        '- ช่องทางลงงาน: Job Board',
        '',
        form.scope.trim(),
      ]
        .join('\n')
        .trim();

      const job = await createBoardJob(
        {
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim(),
          scope: scopeWithProfile,
          min_budget: minB,
          max_budget: maxB,
          duration_days: Number(form.duration_days),
          target_province: form.province,
          employment_type: form.employment_type,
          work_surface: 'jobboard',
          status: 'open',
        },
        auth,
      );
      setCreatedId(String(job.id));
      setMsg('โพสต์งานสำเร็จ');
      setStep(4);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'โพสต์งานไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }, [auth, form, maxB, minB, router, user?.id]);

  return {
    step,
    setStep,
    form,
    patch,
    canStep1,
    canStep2,
    canStep3,
    submitting,
    msg,
    createdId,
    submit,
    categories: ALL_BOARD_CATEGORIES,
    provinces: BOARD_PROVINCES,
    employmentTypes: BOARD_EMPLOYMENT_TYPES,
  };
}
