'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AqondButton as Button, AqondCard as Card, AqondInput as Input } from '@aqond/components';
import { useCreateMatchJob } from '@/hooks/services/useCreateMatchJob';
import { categoryLabel } from '@/lib/services/jobCategoryHub';
import { suggestRoutingByKeywords } from '@/lib/services/workTaxonomy';
import { CreateJobHiringGuide } from '@/components/services/create/CreateJobHiringGuide';
import { WorkRoutingSuggestion } from '@/components/services/create/WorkRoutingSuggestion';

export function CreateMatchJobView() {
  const {
    step,
    setStep,
    form,
    patch,
    canStep1,
    submitting,
    msg,
    createdId,
    submit,
    categories,
    employmentTypes,
    employmentLabel,
  } = useCreateMatchJob();

  const routingSuggestion = useMemo(
    () =>
      suggestRoutingByKeywords(
        [form.title, form.description, form.category].join(' '),
        { verticalWeightOverrides: null },
      ),
    [form.title, form.description, form.category],
  );

  return (
    <div className="tt-services-create">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">โพสต์งาน Match Job</h2>
          <p className="tt-hint">ขั้นตอน {step} / 3</p>
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
            <Input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="เช่น ทำความสะอาดคอนโด 1 ห้องนอน"
            />
          </label>
          <label className="tt-services-field">
            <span>หมวดหมู่ *</span>
            <select
              className="tt-services-select"
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </label>
          <label className="tt-services-field">
            <span>รายละเอียด *</span>
            <textarea
              className="tt-services-textarea"
              rows={4}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="อธิบายงาน สถานที่ ความต้องการพิเศษ"
            />
          </label>
          <div className="tt-services-field-row">
            <label className="tt-services-field">
              <span>ค่าจ้าง (บาท) *</span>
              <Input
                type="number"
                min={1}
                value={form.price}
                onChange={(e) => patch({ price: e.target.value })}
              />
            </label>
            <label className="tt-services-field">
              <span>ระยะเวลา (ชม.)</span>
              <Input
                type="number"
                min={1}
                value={String(form.duration_hours)}
                onChange={(e) => patch({ duration_hours: Number(e.target.value) || 2 })}
              />
            </label>
          </div>
          <label className="tt-services-field">
            <span>วันเวลาเริ่มงาน</span>
            <Input
              type="datetime-local"
              value={form.datetime}
              onChange={(e) => patch({ datetime: e.target.value })}
            />
          </label>
          <label className="tt-services-field">
            <span>จังหวัด</span>
            <Input
              value={form.province}
              onChange={(e) => patch({ province: e.target.value })}
            />
          </label>
          <label className="tt-services-field">
            <span>ลักษณะการจ้าง</span>
            <select
              className="tt-services-select"
              value={form.employment_type}
              onChange={(e) => patch({ employment_type: e.target.value })}
            >
              {employmentTypes.map((t) => (
                <option key={t} value={t}>
                  {employmentLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <WorkRoutingSuggestion suggestion={routingSuggestion} currentSurface="match_job" />
          <CreateJobHiringGuide surface="match_job" category={form.category} />
          <Button
            type="button"
            variant="primary"
            disabled={!canStep1}
            onClick={() => setStep(2)}
            style={{ width: '100%', marginTop: 8 }}
          >
            ถัดไป — ระบุสถานที่
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="tt-services-create-card">
          <label className="tt-services-field">
            <span>ที่อยู่ / จุดนัดพบ</span>
            <textarea
              className="tt-services-textarea"
              rows={3}
              value={form.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="บ้านเลขที่ ซอย แขวง เขต"
            />
          </label>
          <div className="tt-services-field-row">
            <label className="tt-services-field">
              <span>ละติจูด</span>
              <Input
                type="number"
                step="any"
                value={String(form.lat)}
                onChange={(e) => patch({ lat: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="tt-services-field">
              <span>ลองจิจูด</span>
              <Input
                type="number"
                step="any"
                value={String(form.lng)}
                onChange={(e) => patch({ lng: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <p className="tt-hint">ค่าเริ่มต้น: กรุงเทพ — ปรับพิกัดได้ถ้าทราบตำแหน่งแน่นอน</p>
          <div className="tt-services-create-actions">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              ย้อนกลับ
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'กำลังโพสต์...' : 'โพสต์งาน'}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="tt-services-create-card tt-services-create-success">
          <h3>โพสต์งานสำเร็จ</h3>
          <p>งานของคุณถูกบันทึกแล้ว สามารถดูใน «งานของฉัน» หรือรายละเอียดงานได้ทันที</p>
          <div className="tt-services-empty-actions">
            {createdId && (
              <Link href={`/m/services/match/${createdId}`}>
                <Button type="button" variant="primary">
                  ดูรายละเอียดงาน
                </Button>
              </Link>
            )}
            <Link href="/m/services/match/mine?tab=posted">
              <Button type="button" variant="secondary">
                งานของฉัน
              </Button>
            </Link>
            <Link href="/m/services/match">
              <Button type="button" variant="secondary">
                กลับรายการงาน
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
