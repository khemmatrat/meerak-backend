import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Shield,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  getAdminUserCompetency,
  getAdminUserLmsSummary,
  getAdminCompassUserStatus,
  patchAdminUserSkill,
  sendAdminUserNotification,
  type AdminUserCompetencySkill,
  type AdminUserExamResult,
  type AdminUserModuleSummary,
} from "../services/adminApi";

const PUBLIC_TRANSPORT_SKILL = "Public Transport";

const SKILL_ROLE_GUIDE = [
  {
    skill: "Driving",
    emoji: "🚗",
    title: "พนักงานขับรถ (Driving)",
    jobs: "รับ-ส่งผู้โดยสารส่วนบุคคล / ขับรถให้จ้าง / งานที่เน้นผู้โดยสารในรถยนต์",
    exam: "Module 2 → หมวด Driving",
    note: "ต้องมีใบขับขี่ + KYC รถ (ถ้าระบบขอ) — ไม่ใช่งานส่งของเล็กด้วยมอเตอร์ไซค์",
  },
  {
    skill: "Messenger",
    emoji: "🏍️",
    title: "Messenger (รับ-ส่งเร่งด่วน)",
    jobs: "ส่งของเล็ก เอกสาร อาหาร พัสดุด่วน — มักใช้มอเตอร์ไซค์/จักรยาน ไม่รับผู้โดยสาร",
    exam: "Module 2 → หมวด Messenger",
    note: "ต่างจาก Delivery (พัสดุทั่วไป/ขนส่ง) และต่างจาก Driving (ผู้โดยสาร)",
  },
  {
    skill: "Public Transport",
    emoji: "🚌",
    title: "ขนส่งผู้โดยสารสาธารณะ",
    jobs: "รถรับจ้างสาธารณะ ป้ายเหลือง รับผู้โดยสารหลายคนตามเส้นทาง/จุดรับ-ส่ง",
    exam: "Module 2 → หมวด Public Transport + KYC ป้ายเหลือง & ใบขับขี่สาธารณะ",
    note: "สอบผ่านแล้วยังต้องรอแอดมินเปิดสกิลหลังตรวจ KYC",
  },
  {
    skill: "Delivery",
    emoji: "📦",
    title: "Delivery (ขนส่งพัสดุ)",
    jobs: "จัดส่งพัสดุทั่วไป ไม่เน้นความเร็วระดับ Messenger",
    exam: "Module 2 → หมวด Delivery",
    note: "ใช้เมื่อรับงานขนส่ง/โลจิสติกส์ทั่วไป",
  },
];

const NOTIFY_TEMPLATES: Record<string, { title: string; message: string }> = {
  welcome_provider: {
    title: "ยินดีด้วย! ระบบเปิดรับงานแล้ว",
    message:
      "ยินดีด้วย ระบบได้เปิดรับให้คุณรับงานแล้ว โปรดไปที่ Training Dashboard เพื่อเพิ่มทักษะที่คุณต้องการจะเป็นผู้รับงาน",
  },
  skill_enabled: {
    title: "เปิดสกิลแล้ว",
    message: "แอดมินได้เปิดสกิลให้คุณแล้ว — ตรวจสอบใน Training Dashboard",
  },
  skill_suspended: {
    title: "สกิลถูกระงับชั่วคราว",
    message: "สกิลของคุณถูกระงับชั่วคราว กรุณาติดต่อแอดมินหากมีข้อสงสัย",
  },
};

type Props = {
  userId: string;
  canManage: boolean;
  onNotice?: (msg: string, type?: "success" | "error") => void;
};

export const UserCompetencyPanel: React.FC<Props> = ({
  userId,
  canManage,
  onNotice,
}) => {
  const [loading, setLoading] = useState(true);
  const [lmsSummary, setLmsSummary] = useState<{
    avg_grade: number | null;
    training_status: string;
  } | null>(null);
  const [skills, setSkills] = useState<AdminUserCompetencySkill[]>([]);
  const [exams, setExams] = useState<AdminUserExamResult[]>([]);
  const [moduleSummary, setModuleSummary] =
    useState<AdminUserModuleSummary | null>(null);
  const [kycPt, setKycPt] = useState<Record<string, unknown> | null>(null);
  const [skillReason, setSkillReason] = useState<Record<string, string>>({});
  const [actingSkill, setActingSkill] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [notifyTitle, setNotifyTitle] = useState(
    NOTIFY_TEMPLATES.welcome_provider.title,
  );
  const [notifyMessage, setNotifyMessage] = useState(
    NOTIFY_TEMPLATES.welcome_provider.message,
  );
  const [notifyTemplate, setNotifyTemplate] = useState("welcome_provider");
  const [notifySending, setNotifySending] = useState(false);
  const [compassInfo, setCompassInfo] = useState<{
    compassMode?: boolean;
    primaryIntent?: string;
    progress?: { completed: number; total: number };
    nextAction?: { label: string };
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [comp, lms, compass] = await Promise.all([
        getAdminUserCompetency(userId),
        getAdminUserLmsSummary(userId).catch(() => null),
        getAdminCompassUserStatus(userId).catch(() => null),
      ]);
      setSkills(comp.skills || []);
      setExams(comp.exam_results || []);
      setModuleSummary(comp.module_summary || null);
      setKycPt(comp.kyc_public_transport || null);
      setLmsSummary(lms);
      setCompassInfo(compass);
    } catch (e: unknown) {
      onNotice?.((e as Error)?.message || "โหลด competency ไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const examByCategory = useMemo(() => {
    const m = new Map<string, AdminUserExamResult>();
    for (const ex of exams.filter((e) => e.module === 2)) {
      const cat = (ex.category || "").trim();
      if (cat && !m.has(cat)) m.set(cat, ex);
    }
    return m;
  }, [exams]);

  const skillRows = useMemo(() => {
    const names = new Set(skills.map((s) => s.skill_name));
    const rows = [...skills];
    if (kycPt?.wants_public_transport && !names.has(PUBLIC_TRANSPORT_SKILL)) {
      rows.push({
        skill_name: PUBLIC_TRANSPORT_SKILL,
        skill_category: "Transport",
        is_certified: false,
        admin_enabled: false,
        admin_disabled_reason: "รอแอดมินอนุมัติ (มี KYC รถสาธารณะแล้ว)",
        admin_disabled_at: null,
        certified_at: null,
        certification_id: null,
      });
    }
    for (const ex of exams.filter((e) => e.module === 2 && e.category)) {
      const cat = (ex.category || "").trim();
      if (!cat || names.has(cat)) continue;
      rows.push({
        skill_name: cat,
        skill_category: "Module2",
        is_certified: !!ex.passed,
        admin_enabled: !!ex.passed,
        admin_disabled_reason: ex.passed ? null : "ยังสอบไม่ผ่าน",
        admin_disabled_at: null,
        certified_at: ex.passed ? ex.submitted_at : null,
        certification_id: null,
      });
    }
    return rows.sort((a, b) => a.skill_name.localeCompare(b.skill_name));
  }, [skills, exams, kycPt]);

  const m2 = moduleSummary?.module2;
  const m1 = moduleSummary?.module1;
  const m3 = moduleSummary?.module3;

  const toggleSkill = async (skillName: string, enable: boolean) => {
    if (!canManage) return;
    if (!enable) {
      const reason = skillReason[skillName]?.trim();
      if (!reason) {
        onNotice?.("กรุณาระบุเหตุผลก่อนระงับสกิล", "error");
        return;
      }
    }
    setActingSkill(skillName);
    try {
      const reason = skillReason[skillName]?.trim();
      await patchAdminUserSkill(userId, skillName, {
        admin_enabled: enable,
        reason: reason || undefined,
        notify: true,
        notify_title: enable
          ? NOTIFY_TEMPLATES.skill_enabled.title
          : NOTIFY_TEMPLATES.skill_suspended.title,
        notify_message: enable
          ? `สกิล "${skillName}" เปิดใช้งานแล้ว${reason ? ` — ${reason}` : ""}`
          : `สกิล "${skillName}" ถูกระงับชั่วคราว — ${reason}`,
        template: enable ? "skill_enabled" : "skill_suspended",
      });
      onNotice?.(
        enable ? `เปิดสกิล ${skillName} แล้ว` : `ปิดสกิล ${skillName} แล้ว`,
        "success",
      );
      await load();
    } catch (e: unknown) {
      onNotice?.((e as Error)?.message || "อัปเดตสกิลไม่สำเร็จ", "error");
    } finally {
      setActingSkill(null);
    }
  };

  const sendNotify = async () => {
    if (!canManage || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setNotifySending(true);
    try {
      await sendAdminUserNotification({
        user_id: userId,
        title: notifyTitle.trim(),
        message: notifyMessage.trim(),
        template: notifyTemplate,
      });
      onNotice?.("ส่งแจ้งเตือนถึง user แล้ว", "success");
    } catch (e: unknown) {
      onNotice?.((e as Error)?.message || "ส่งแจ้งเตือนไม่สำเร็จ", "error");
    } finally {
      setNotifySending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6 text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-4">
      <h4 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
        <BookOpen size={16} /> LMS & สกิล / Competency
      </h4>

      {compassInfo?.compassMode && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-900 flex items-center gap-2">
            <Shield size={16} /> Compass track
          </p>
          <p className="text-emerald-800 mt-1">
            อาชีพ: {compassInfo.primaryIntent || "—"} · ขั้น{" "}
            {compassInfo.progress?.completed ?? 0}/{compassInfo.progress?.total ?? "?"}
          </p>
          {compassInfo.nextAction?.label && (
            <p className="text-xs text-emerald-700 mt-1">
              ขั้นถัดไป: {compassInfo.nextAction.label}
            </p>
          )}
        </div>
      )}

      {/* คำอธิบายสกิลขนส่ง — ให้ admin และ user เข้าใจตรงกัน */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-sky-900"
        >
          <span className="flex items-center gap-2">
            <Info size={16} /> ความหมายสกิลขนส่ง (Driving / Messenger / Public
            Transport)
          </span>
          {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showGuide && (
          <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">
            {SKILL_ROLE_GUIDE.map((g) => (
              <div
                key={g.skill}
                className="rounded-lg bg-white border border-sky-100 p-3 text-xs text-slate-700"
              >
                <p className="font-bold text-slate-900 mb-1">
                  {g.emoji} {g.title}
                </p>
                <p>
                  <span className="text-slate-500">งานที่เห็น:</span> {g.jobs}
                </p>
                <p className="mt-1">
                  <span className="text-slate-500">สอบ:</span> {g.exam}
                </p>
                <p className="mt-1 text-amber-800">{g.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* สรุป Module 1 / 2 / 3 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3">
          <p className="text-xs font-bold text-violet-800 uppercase">
            Module 1
          </p>
          <p className="text-lg font-bold text-violet-950 mt-1">
            {m1?.score != null ? `${Number(m1.score).toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-violet-700">
            {m1?.passed ? "✓ ผ่าน" : m1 ? "ยังไม่ผ่าน" : "ยังไม่สอบ"}
            {m1?.submitted_at
              ? ` · ${new Date(m1.submitted_at).toLocaleDateString("th-TH")}`
              : ""}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-xs font-bold text-emerald-800 uppercase">
            Module 2
          </p>
          <p className="text-lg font-bold text-emerald-950 mt-1">
            {m2 ? `${m2.passed_count} / ${m2.attempted_count} ทักษะผ่าน` : "—"}
          </p>
          <p className="text-xs text-emerald-700">
            สอบแล้ว {m2?.attempted_count ?? 0} หมวด
            {m2 && m2.passed_categories.length > 0
              ? ` · ${m2.passed_categories.join(", ")}`
              : ""}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
          <p className="text-xs font-bold text-amber-800 uppercase">Module 3</p>
          <p className="text-lg font-bold text-amber-950 mt-1">
            {m3?.passed ? "✓ ผ่าน" : m3 ? "ทำแล้ว" : "—"}
          </p>
          <p className="text-xs text-amber-700">
            {m3?.submitted_at
              ? new Date(m3.submitted_at).toLocaleDateString("th-TH")
              : "ยังไม่ทำ"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="bg-blue-50 px-4 py-2 rounded-lg">
          <p className="text-xs text-blue-700">Avg Grade (ทุก module)</p>
          <p className="font-bold text-blue-900">
            {lmsSummary?.avg_grade != null
              ? lmsSummary.avg_grade.toFixed(1)
              : "—"}
          </p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-lg">
          <p className="text-xs text-emerald-700">Training Status</p>
          <p className="font-bold text-emerald-900">
            {lmsSummary?.training_status || "—"}
          </p>
        </div>
        {kycPt?.wants_public_transport ? (
          <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-800 flex items-center gap-1">
              <Shield size={12} /> KYC รถสาธารณะ
            </p>
            <p className="font-medium text-amber-900 text-xs">
              ป้ายเหลือง {kycPt.yellow_plate_photo_url ? "✓" : "—"} ·
              ใบขับขี่สาธารณะ{" "}
              {kycPt.public_transport_license_front_url ? "✓" : "—"}
            </p>
          </div>
        ) : null}
      </div>

      {/* ประวัติสอบ Module 2 รายหมวด */}
      {m2 && m2.attempts.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <p className="text-xs font-bold text-slate-600 uppercase mb-2">
            ประวัติสอบ Module 2 รายหมวด
          </p>
          <ul className="text-xs text-slate-700 space-y-1 max-h-32 overflow-y-auto">
            {m2.attempts.map((a, i) => (
              <li key={`${a.category}-${i}`} className="flex flex-wrap gap-2">
                <span className="font-medium">{a.category}</span>
                <span className="font-mono">
                  {a.score != null ? `${a.score}%` : "—"}
                </span>
                <span
                  className={a.passed ? "text-emerald-700" : "text-rose-600"}
                >
                  {a.passed ? "ผ่าน" : "ไม่ผ่าน"}
                </span>
                {a.submitted_at && (
                  <span className="text-slate-400">
                    {new Date(a.submitted_at).toLocaleString("th-TH")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">สกิล</th>
              <th className="px-3 py-2">สอบ M2</th>
              <th className="px-3 py-2">คะแนน</th>
              <th className="px-3 py-2">เปิดรับงาน</th>
              <th className="px-3 py-2">เหตุผล / แจ้ง user</th>
              {canManage && <th className="px-3 py-2">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {skillRows.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-3 py-4 text-slate-400 text-center"
                >
                  ยังไม่มีสกิล / ผลสอบ — user ต้องทำ Module 1 แล้วเลือกหมวด
                  Module 2 ใน Training Dashboard
                </td>
              </tr>
            ) : (
              skillRows.map((s) => {
                const ex = examByCategory.get(s.skill_name);
                const enabled = s.admin_enabled !== false;
                const canEnable =
                  s.is_certified ||
                  ex?.passed ||
                  (s.skill_name === PUBLIC_TRANSPORT_SKILL &&
                    !!kycPt?.wants_public_transport);
                return (
                  <tr key={s.skill_name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{s.skill_name}</td>
                    <td className="px-3 py-2">
                      {ex
                        ? ex.passed
                          ? "ผ่าน"
                          : "ไม่ผ่าน"
                        : s.is_certified
                          ? "ผ่าน"
                          : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {ex?.score != null ? Number(ex.score).toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          enabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {enabled ? "เปิด" : "ปิด"}
                      </span>
                      {!enabled && s.admin_disabled_reason && (
                        <p
                          className="text-[10px] text-slate-500 mt-0.5 max-w-[140px] truncate"
                          title={s.admin_disabled_reason}
                        >
                          {s.admin_disabled_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <input
                          type="text"
                          placeholder={
                            enabled
                              ? "เหตุผล (บังคับเมื่อปิด)"
                              : "เหตุผล (ถ้ามี)"
                          }
                          className="w-full max-w-[200px] px-2 py-1 border border-slate-200 rounded text-xs"
                          value={skillReason[s.skill_name] ?? ""}
                          onChange={(e) =>
                            setSkillReason((prev) => ({
                              ...prev,
                              [s.skill_name]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className="text-xs text-slate-500">
                          {s.admin_disabled_reason || "—"}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={
                            actingSkill === s.skill_name ||
                            (!enabled && !canEnable)
                          }
                          title={
                            !enabled && !canEnable
                              ? "ต้องสอบผ่านหรือมี KYC ก่อนเปิด"
                              : undefined
                          }
                          onClick={() =>
                            void toggleSkill(s.skill_name, !enabled)
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
                        >
                          {actingSkill === s.skill_name ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : enabled ? (
                            <ToggleRight size={16} />
                          ) : (
                            <ToggleLeft size={16} />
                          )}
                          {enabled ? "ระงับสกิล" : "เปิดอนุมัติ"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
          <h5 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
            <Bell size={16} /> แจ้งเตือนตรงถึง user
          </h5>
          <div className="flex flex-wrap gap-2">
            <select
              value={notifyTemplate}
              onChange={(e) => {
                const t = e.target.value;
                setNotifyTemplate(t);
                const tpl = NOTIFY_TEMPLATES[t];
                if (tpl) {
                  setNotifyTitle(tpl.title);
                  setNotifyMessage(tpl.message);
                }
              }}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {Object.keys(NOTIFY_TEMPLATES).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={notifyTitle}
            onChange={(e) => setNotifyTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            placeholder="หัวข้อ"
          />
          <textarea
            value={notifyMessage}
            onChange={(e) => setNotifyMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            placeholder="ข้อความ"
          />
          <button
            type="button"
            disabled={notifySending}
            onClick={() => void sendNotify()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {notifySending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Bell size={16} />
            )}
            ส่งแจ้งเตือน
          </button>
        </div>
      )}
    </section>
  );
};
