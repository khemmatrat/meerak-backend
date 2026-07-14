'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AqondButton as Button, AqondCard as Card, AqondInput as Input } from '@aqond/components';
import { useCreateBoardJob } from '@/hooks/services/useCreateBoardJob';
import { boardCategoryLabel } from '@/lib/services/boardJobTaxonomy';
import { suggestRoutingByKeywords } from '@/lib/services/workTaxonomy';
import { WorkRoutingSuggestion } from '@/components/services/create/WorkRoutingSuggestion';

export function CreateBoardJobView() {
  const {
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
    categories,
    provinces,
    employmentTypes,
  } = useCreateBoardJob();

  const routingSuggestion = useMemo(
    () =>
      suggestRoutingByKeywords(
        [form.title, form.description, form.scope, form.category].join(' '),
        { verticalWeightOverrides: null },
      ),
    [form.title, form.description, form.scope, form.category],
  );

  return (
    <div className="tt-services-create">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">โพสต์งาน Job Board</h2>
          <p className="tt-hint">ขั้นตอน {Math.min(step, 3)} / 3</p>
        </div>
        <Link href="/m/services/create" className="tt-services-back-link">
          ‹ เลือกช่องทาง
        </Link>
      </div>

      <div className="tt-services-create-steps">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`tt-services-create-step${step >= n ? ' active' : ''}`} />
        ))}
      </div>

      {msg && (
        <p className={msg.includes('สำเร็จ') ? 'tt-success-inline' : 'tt-error-inline'}>{msg}</p>
      )}

      {step === 1 && (
        <Card className="tt-services-create-card">
          <label className="tt-services-field">
            <span>หัวข้องาน *</span>
            <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <label className="tt-services-field">
            <span>หมวดหมู่ *</span>
            <select
              className="tt-services-select"
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {boardCategoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="tt-services-field">
            <span>รายละเอียดงาน *</span>
            <textarea
              className="tt-services-textarea"
              rows={5}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="เป้าหมาย ผลลัพธ์ที่ต้องการ ตัวอย่างอ้างอิง"
            />
          </label>
          <WorkRoutingSuggestion suggestion={routingSuggestion} currentSurface="jobboard" />
          <Button
            type="button"
            variant="primary"
            disabled={!canStep1}
            onClick={() => setStep(2)}
            style={{ width: '100%' }}
          >
            ถัดไป — ขอบเขตงาน
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="tt-services-create-card">
          <label className="tt-services-field">
            <span>ขอบเขตงาน (Scope) *</span>
            <textarea
              className="tt-services-textarea"
              rows={6}
              value={form.scope}
              onChange={(e) => patch({ scope: e.target.value })}
              placeholder="Deliverables, ขอบเขตที่รวม/ไม่รวม, milestone"
            />
          </label>
          <div className="tt-services-create-actions">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              ย้อนกลับ
            </Button>
            <Button type="button" variant="primary" disabled={!canStep2} onClick={() => setStep(3)}>
              ถัดไป — งบประมาณ
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="tt-services-create-card">
          <div className="tt-services-field-row">
            <label className="tt-services-field">
              <span>งบต่ำสุด (บาท) *</span>
              <Input
                type="number"
                min={1}
                value={form.budget_min}
                onChange={(e) => patch({ budget_min: e.target.value })}
              />
            </label>
            <label className="tt-services-field">
              <span>งบสูงสุด (บาท) *</span>
              <Input
                type="number"
                min={1}
                value={form.budget_max}
                onChange={(e) => patch({ budget_max: e.target.value })}
              />
            </label>
          </div>
          <label className="tt-services-field">
            <span>ระยะเวลา (วัน) *</span>
            <Input
              type="number"
              min={1}
              value={form.duration_days}
              onChange={(e) => patch({ duration_days: e.target.value })}
            />
          </label>
          <label className="tt-services-field">
            <span>จังหวัดเป้าหมาย</span>
            <select
              className="tt-services-select"
              value={form.province}
              onChange={(e) => patch({ province: e.target.value })}
            >
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="tt-services-field">
            <span>ลักษณะการจ้าง</span>
            <select
              className="tt-services-select"
              value={form.employment_type}
              onChange={(e) => patch({ employment_type: e.target.value })}
            >
              {employmentTypes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <div className="tt-services-create-actions">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              ย้อนกลับ
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canStep3 || submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'กำลังโพสต์...' : 'โพสต์งาน'}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="tt-services-create-card tt-services-create-success">
          <h3>โพสต์งานสำเร็จ</h3>
          <p>งานของคุณจะแสดงใน Job Board และพร้อมรับผู้สมัคร</p>
          <div className="tt-services-empty-actions">
            {createdId && (
              <>
                <Link href={`/m/services/board/${createdId}/manage`}>
                  <Button type="button" variant="primary">
                    จัดการงาน
                  </Button>
                </Link>
                <Link href={`/m/services/board/${createdId}`}>
                  <Button type="button" variant="secondary">
                    ดูรายละเอียด
                  </Button>
                </Link>
              </>
            )}
            <Link href="/m/services/board?tab=my-jobs">
              <Button type="button" variant="secondary">
                งานที่โพสต์
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
