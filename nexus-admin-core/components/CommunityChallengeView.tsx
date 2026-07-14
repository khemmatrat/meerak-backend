
import React, { useState, useEffect, useCallback } from "react";
import { Trophy, Save, RefreshCw, CheckCircle, Users, Target } from "lucide-react";
import {
  getCommunityChallenge,
  patchCommunityChallenge,
  type CommunityChallengeConfig,
} from "../services/adminApi";

const DEFAULT_FORM: CommunityChallengeConfig = {
  enabled: false,
  titleTh: "Community Challenge",
  titleEn: "Community Challenge",
  subtitleTh: "ร่วมกันทำเป้าหมาย — ปลดล็อกรางวัลและโค้ด",
  subtitleEn: "Reach targets together — unlock rewards & codes",
  onlineWindowMinutes: 15,
  periodStart: null,
  periodEnd: null,
  targetOnlineUsers: 1000,
  targetJobsPosted: 500,
  targetHires: 400,
  targetCompleted: 300,
  rewardTitleTh: "รางวัลเมื่อครบเป้าหมาย",
  rewardTitleEn: "Rewards when targets are met",
  rewardDescriptionTh: "โค้ดส่วนลด รถยนต์ ทองคำ มอเตอร์ไซค์ — ตามที่ประกาศ",
  rewardDescriptionEn: "Promo codes, car, gold, motorcycle — as announced",
  employerNoteTh: "ฝั่งผู้จ้าง: โพสต์งาน · จ้างงานสำเร็จ",
  employerNoteEn: "Employers: post jobs · successful hires",
  providerNoteTh: "ฝั่งผู้ให้บริการ: รับงาน · ส่งมอบสำเร็จ",
  providerNoteEn: "Providers: accept jobs · complete deliveries",
};

export const CommunityChallengeView: React.FC = () => {
  const [form, setForm] = useState<CommunityChallengeConfig>({ ...DEFAULT_FORM });
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCommunityChallenge();
      const c = res.config as Partial<CommunityChallengeConfig> | undefined;
      setForm({ ...DEFAULT_FORM, ...c });
      setStats((res.stats as Record<string, unknown>) || null);
      setLastUpdated(res.updatedAt ? new Date(res.updatedAt).toLocaleString() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await patchCommunityChallenge(form);
      setForm({ ...DEFAULT_FORM, ...(res.config as CommunityChallengeConfig) });
      setStats((res.stats as Record<string, unknown>) || null);
      setLastUpdated(new Date(res.updatedAt).toLocaleString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const s = stats as {
    onlineUsers?: number;
    jobsPosted?: number;
    hiresTotal?: number;
    completedTotal?: number;
    allTargetsMet?: boolean;
  } | null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="text-amber-500" size={22} />
            Community Challenge (หน้า Home แอป)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            เป้าหมายร่วม: ผู้ออนไลน์ · งานที่โพสต์ · งานที่มีคนรับ · งานสำเร็จ — แสดงแถบความคืบหน้าและรางวัลที่ประกาศ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg border border-slate-200"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          {lastUpdated && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle size={12} /> {lastUpdated}
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-60"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            บันทึก
          </button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4 border-slate-100">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Users size={14} /> ออนไลน์ (ประมาณ)
            </p>
            <p className="text-2xl font-bold text-slate-800">{s.onlineUsers ?? "—"}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 border-slate-100">
            <p className="text-xs text-slate-500">งานโพสต์</p>
            <p className="text-2xl font-bold text-slate-800">{s.jobsPosted ?? "—"}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 border-slate-100">
            <p className="text-xs text-slate-500">มีผู้รับงาน</p>
            <p className="text-2xl font-bold text-slate-800">{s.hiresTotal ?? "—"}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 border-slate-100">
            <p className="text-xs text-slate-500">ส่งมอบสำเร็จ</p>
            <p className="text-2xl font-bold text-slate-800">{s.completedTotal ?? "—"}</p>
            {s.allTargetsMet ? (
              <p className="text-xs text-emerald-600 font-semibold mt-1">ครบทุกเป้า</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-100">
          <span className="font-bold text-slate-800">เปิดใช้งานบนแอป</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="w-5 h-5"
          />
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">หัวข้อ (TH)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.titleTh}
              onChange={(e) => setForm({ ...form, titleTh: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">หัวข้อ (EN)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">คำอธิบายย่อย (TH)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.subtitleTh}
              onChange={(e) => setForm({ ...form, subtitleTh: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">คำอธิบายย่อย (EN)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.subtitleEn}
              onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <Target size={14} /> นาทีนับ “ออนไลน์”
            </label>
            <input
              type="number"
              min={1}
              max={120}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.onlineWindowMinutes}
              onChange={(e) => setForm({ ...form, onlineWindowMinutes: parseInt(e.target.value, 10) || 15 })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">เริ่มนับช่วง (ISO หรือว่าง)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-sm"
              placeholder="2026-05-01T00:00:00+07:00"
              value={form.periodStart || ""}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value.trim() || null })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">สิ้นสุดช่วง (ISO หรือว่าง)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-sm"
              value={form.periodEnd || ""}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value.trim() || null })}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">เป้า ผู้ออนไลน์</label>
            <input
              type="number"
              min={0}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.targetOnlineUsers}
              onChange={(e) => setForm({ ...form, targetOnlineUsers: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">เป้า งานโพสต์</label>
            <input
              type="number"
              min={0}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.targetJobsPosted}
              onChange={(e) => setForm({ ...form, targetJobsPosted: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">เป้า งานที่มีผู้รับ</label>
            <input
              type="number"
              min={0}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.targetHires}
              onChange={(e) => setForm({ ...form, targetHires: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">เป้า งานสำเร็จ</label>
            <input
              type="number"
              min={0}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.targetCompleted}
              onChange={(e) => setForm({ ...form, targetCompleted: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-semibold text-slate-600">หมายเหตุฝั่งผู้จ้าง (TH)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.employerNoteTh}
              onChange={(e) => setForm({ ...form, employerNoteTh: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">หมายเหตุฝั่งผู้จ้าง (EN)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.employerNoteEn}
              onChange={(e) => setForm({ ...form, employerNoteEn: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">หมายเหตุฝั่งผู้ให้บริการ (TH)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.providerNoteTh}
              onChange={(e) => setForm({ ...form, providerNoteTh: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">หมายเหตุฝั่งผู้ให้บริการ (EN)</label>
            <textarea
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.providerNoteEn}
              onChange={(e) => setForm({ ...form, providerNoteEn: e.target.value })}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-semibold text-slate-600">หัวข้อรางวัล (TH)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.rewardTitleTh}
              onChange={(e) => setForm({ ...form, rewardTitleTh: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">หัวข้อรางวัล (EN)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.rewardTitleEn}
              onChange={(e) => setForm({ ...form, rewardTitleEn: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">รายละเอียดรางวัล (TH) — โค้ด รถ ทอง มอเตอร์ไซค์ ฯลฯ</label>
            <textarea
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.rewardDescriptionTh}
              onChange={(e) => setForm({ ...form, rewardDescriptionTh: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">รายละเอียดรางวัล (EN)</label>
            <textarea
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              value={form.rewardDescriptionEn}
              onChange={(e) => setForm({ ...form, rewardDescriptionEn: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
