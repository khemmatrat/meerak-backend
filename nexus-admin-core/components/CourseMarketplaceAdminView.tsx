/**

 * Course Marketplace Admin — review queue, moderation, funnel, launch, revenue, audit

 */

import React, { useCallback, useEffect, useState } from "react";

import {

  BarChart3,

  Banknote,

  CheckCircle2,

  ClipboardList,

  EyeOff,

  GraduationCap,

  History,

  Loader2,

  MessageCircle,

  RefreshCw,

  Star,

  XCircle,

} from "lucide-react";

import { CourseRevenueAdminPanel } from "./CourseRevenueAdminPanel";

import {

  getAdminCourseAuditLog,

  getAdminCourseModeration,

  getCourseLaunchChecklist,

  getCourseMarketplaceFunnel,

  getCourseMarketplaceReviewQueue,

  moderateAdminCourseQa,

  moderateAdminCourseReview,

  reviewCourseMarketplace,

  type AdminModerationQa,

  type AdminModerationReview,

  type CourseLaunchChecklist,

  type CourseMarketplaceAuditRow,

  type CourseMarketplaceFunnelReport,

  type CourseMarketplaceReviewItem,

} from "../services/adminApi";

import { useToast } from "../context/ToastContext";



const STATUS_TABS = [

  { id: "in_review", label: "รอตรวจ" },

  { id: "published", label: "Published" },

  { id: "rejected", label: "Rejected" },

  { id: "unlisted", label: "Unlisted" },

  { id: "draft", label: "Draft" },

];



function money(n: number | null | undefined) {

  return `฿${Number(n || 0).toLocaleString()}`;

}



function formatAuditTime(value?: string) {

  if (!value) return "—";

  try {

    return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

  } catch {

    return value;

  }

}



type Props = {

  /** ใช้เมื่อฝังใน Content Manager — ซ่อนหัวข้อหลัก */

  embedded?: boolean;

};



export const CourseMarketplaceAdminView: React.FC<Props> = ({ embedded = false }) => {

  const toast = useToast();

  const [tab, setTab] = useState("in_review");

  const [panel, setPanel] = useState<"queue" | "funnel" | "launch" | "revenue" | "audit">("queue");

  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<CourseMarketplaceReviewItem[]>([]);

  const [funnel, setFunnel] = useState<CourseMarketplaceFunnelReport | null>(null);

  const [launch, setLaunch] = useState<CourseLaunchChecklist | null>(null);

  const [auditRows, setAuditRows] = useState<CourseMarketplaceAuditRow[]>([]);

  const [auditLoading, setAuditLoading] = useState(false);

  const [acting, setActing] = useState<string | null>(null);

  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  const [moderationCourseId, setModerationCourseId] = useState<string | null>(null);

  const [reviews, setReviews] = useState<AdminModerationReview[]>([]);

  const [qa, setQa] = useState<AdminModerationQa[]>([]);



  const loadQueue = useCallback(async () => {

    setLoading(true);

    try {

      const data = await getCourseMarketplaceReviewQueue(tab);

      setItems(data.courses || []);

    } catch (e: any) {

      toast.error(e?.message || "โหลด review queue ไม่สำเร็จ");

      setItems([]);

    } finally {

      setLoading(false);

    }

  }, [tab, toast]);



  const loadFunnel = useCallback(async () => {

    try {

      setFunnel(await getCourseMarketplaceFunnel());

    } catch (e: any) {

      toast.error(e?.message || "โหลด funnel ไม่สำเร็จ");

    }

  }, [toast]);



  const loadLaunch = useCallback(async () => {

    try {

      setLaunch(await getCourseLaunchChecklist());

    } catch (e: any) {

      toast.error(e?.message || "โหลด launch checklist ไม่สำเร็จ");

    }

  }, [toast]);



  const loadAudit = useCallback(async () => {

    setAuditLoading(true);

    try {

      const data = await getAdminCourseAuditLog({ limit: 50 });

      setAuditRows(data.rows || []);

    } catch (e: any) {

      toast.error(e?.message || "โหลด audit log ไม่สำเร็จ");

      setAuditRows([]);

    } finally {

      setAuditLoading(false);

    }

  }, [toast]);



  useEffect(() => {

    if (panel === "queue") loadQueue();

    if (panel === "funnel") loadFunnel();

    if (panel === "launch") loadLaunch();

    if (panel === "audit") loadAudit();

  }, [panel, loadQueue, loadFunnel, loadLaunch, loadAudit]);



  const openModeration = async (courseId: string) => {

    setModerationCourseId(courseId);

    try {

      const data = await getAdminCourseModeration(courseId);

      setReviews(data.reviews || []);

      setQa(data.qa || []);

    } catch (e: any) {

      toast.error(e?.message || "โหลด moderation ไม่สำเร็จ");

    }

  };



  const act = async (

    courseId: string,

    action: "approve" | "reject" | "unlist" | "feature" | "unfeature" | "takedown",

    reason?: string,

  ) => {

    setActing(courseId);

    try {

      const rateStr = rateDraft[courseId];

      const body: Parameters<typeof reviewCourseMarketplace>[1] = {

        action,

        reason,

        createBanner: action === "approve",

      };

      if (rateStr?.trim()) body.platformRateOverride = Number(rateStr);

      const result = await reviewCourseMarketplace(courseId, body);

      toast.success(`${action} · ${result.course?.title || courseId}`);

      if (result.banner?.created) {

        toast.toast("สร้าง home banner draft แล้ว — เปิดแท็บแบนเนอร์ใน Content Manager", "info");

      }

      await loadQueue();

    } catch (e: any) {

      toast.error(e?.message || "ดำเนินการไม่สำเร็จ");

    } finally {

      setActing(null);

    }

  };



  const handleModerateReview = async (reviewId: string, action: "hide" | "delete") => {

    if (!moderationCourseId) return;

    try {

      await moderateAdminCourseReview(moderationCourseId, reviewId, action);

      toast.success(`รีวิว ${action} แล้ว`);

      await openModeration(moderationCourseId);

    } catch (e: any) {

      toast.error(e?.message || "moderate รีวิวไม่สำเร็จ");

    }

  };



  const handleModerateQa = async (messageId: string, action: "hide" | "close" | "delete") => {

    if (!moderationCourseId) return;

    try {

      await moderateAdminCourseQa(moderationCourseId, messageId, action);

      toast.success(`Q&A ${action} แล้ว`);

      await openModeration(moderationCourseId);

    } catch (e: any) {

      toast.error(e?.message || "moderate Q&A ไม่สำเร็จ");

    }

  };



  const panelButtons = (["queue", "revenue", "funnel", "launch", "audit"] as const).map((p) => (

    <button

      key={p}

      type="button"

      onClick={() => setPanel(p)}

      className={`px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1 ${

        panel === p ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"

      }`}

    >

      {p === "queue" ? "Review" : null}

      {p === "revenue" ? (

        <>

          <Banknote size={14} /> Revenue

        </>

      ) : null}

      {p === "funnel" ? "Funnel" : null}

      {p === "launch" ? "Launch" : null}

      {p === "audit" ? (

        <>

          <History size={14} /> Audit

        </>

      ) : null}

    </button>

  ));



  return (

    <div className={`space-y-6 ${embedded ? "" : "p-4 md:p-6 max-w-6xl mx-auto"}`}>

      {!embedded ? (

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>

            <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">

              <GraduationCap size={28} className="text-emerald-600" /> Course Marketplace Ops

            </h1>

            <p className="text-sm text-slate-500 mt-1">

              Review queue · Moderation · Funnel · Launch · Revenue · Audit

            </p>

          </div>

          <div className="flex flex-wrap gap-2">{panelButtons}</div>

        </div>

      ) : (

        <div className="flex flex-wrap gap-2">{panelButtons}</div>

      )}



      {panel === "queue" ? (

        <>

          <div className="flex flex-wrap gap-2">

            {STATUS_TABS.map((s) => (

              <button

                key={s.id}

                type="button"

                onClick={() => setTab(s.id)}

                className={`px-3 py-1.5 rounded-full text-sm ${

                  tab === s.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"

                }`}

              >

                {s.label}

              </button>

            ))}

            <button type="button" onClick={loadQueue} className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500">

              <RefreshCw size={14} /> รีเฟรช

            </button>

          </div>



          {loading ? (

            <div className="flex justify-center py-16">

              <Loader2 className="animate-spin text-emerald-600" size={32} />

            </div>

          ) : items.length === 0 ? (

            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">

              ไม่มีคอร์สในสถานะ {tab}

            </div>

          ) : (

            <div className="space-y-4">

              {items.map(({ course, checklist, instructorEmail }) => (

                <div key={course.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

                  <div className="flex flex-wrap gap-4 justify-between">

                    <div className="min-w-0 flex-1">

                      <h2 className="font-bold text-slate-900">{course.title}</h2>

                      <p className="text-sm text-slate-500 mt-1">{course.subtitle || course.description}</p>

                      <p className="text-xs text-slate-400 mt-2">

                        {course.id} · {course.instructorName || "Instructor"}{" "}

                        {instructorEmail ? `· ${instructorEmail}` : ""} · {money(course.priceThb)} · Quality{" "}

                        {checklist.score}%

                      </p>

                      <div className="flex flex-wrap gap-2 mt-3">

                        {checklist.items.map((item) => (

                          <span

                            key={item.id}

                            className={`text-xs px-2 py-1 rounded-full ${

                              item.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"

                            }`}

                          >

                            {item.ok ? "✓" : "✗"} {item.label}

                          </span>

                        ))}

                      </div>

                      <label className="block mt-3 text-xs text-slate-500">

                        Platform rate override (0–0.9)

                        <input

                          type="number"

                          step="0.01"

                          min="0"

                          max="0.9"

                          value={rateDraft[course.id] ?? ""}

                          onChange={(e) => setRateDraft((d) => ({ ...d, [course.id]: e.target.value }))}

                          placeholder="0.35"

                          className="block mt-1 w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm"

                        />

                      </label>

                    </div>

                    <div className="flex flex-col gap-2 shrink-0">

                      {tab === "in_review" ? (

                        <>

                          <button

                            type="button"

                            disabled={acting === course.id}

                            onClick={() => act(course.id, "approve")}

                            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"

                          >

                            Approve + Banner draft

                          </button>

                          <button

                            type="button"

                            disabled={acting === course.id}

                            onClick={() => act(course.id, "reject", "quality_incomplete")}

                            className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50"

                          >

                            Reject

                          </button>

                        </>

                      ) : null}

                      {tab === "published" ? (

                        <>

                          <button

                            type="button"

                            disabled={acting === course.id}

                            onClick={() => act(course.id, "feature")}

                            className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50"

                          >

                            <Star size={14} /> Feature

                          </button>

                          <button

                            type="button"

                            disabled={acting === course.id}

                            onClick={() => act(course.id, "unfeature")}

                            className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800 text-sm font-bold disabled:opacity-50"

                          >

                            Unfeature

                          </button>

                          <button

                            type="button"

                            disabled={acting === course.id}

                            onClick={() => act(course.id, "takedown", "admin_takedown")}

                            className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"

                          >

                            Takedown

                          </button>

                          <button

                            type="button"

                            onClick={() => openModeration(course.id)}

                            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold inline-flex items-center gap-1"

                          >

                            <MessageCircle size={14} /> Moderate

                          </button>

                        </>

                      ) : null}

                    </div>

                  </div>

                </div>

              ))}

            </div>

          )}



          {moderationCourseId ? (

            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">

              <div className="flex items-center justify-between">

                <h3 className="font-bold text-slate-900">Moderation — {moderationCourseId}</h3>

                <button type="button" onClick={() => setModerationCourseId(null)} className="text-sm text-slate-500">

                  ปิด

                </button>

              </div>

              <div>

                <h4 className="text-sm font-bold text-slate-700 mb-2 inline-flex items-center gap-1">

                  <Star size={14} /> รีวิว

                </h4>

                {!reviews.length ? <p className="text-xs text-slate-400">ไม่มีรีวิว</p> : null}

                {reviews.map((r) => (

                  <div key={r.id} className="border border-slate-100 rounded-xl p-3 mb-2 text-sm">

                    <p className="font-semibold">

                      {r.userName} · {r.rating}★ {r.isHidden ? "· ซ่อนแล้ว" : ""}

                    </p>

                    <p className="text-slate-600 mt-1">{r.comment}</p>

                    <div className="flex gap-2 mt-2">

                      {!r.isHidden ? (

                        <button

                          type="button"

                          onClick={() => handleModerateReview(r.id, "hide")}

                          className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1"

                        >

                          <EyeOff size={12} /> ซ่อน

                        </button>

                      ) : null}

                      <button

                        type="button"

                        onClick={() => handleModerateReview(r.id, "delete")}

                        className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-800"

                      >

                        ลบ

                      </button>

                    </div>

                  </div>

                ))}

              </div>

              <div>

                <h4 className="text-sm font-bold text-slate-700 mb-2 inline-flex items-center gap-1">

                  <MessageCircle size={14} /> Q&A

                </h4>

                {!qa.length ? <p className="text-xs text-slate-400">ไม่มี Q&A</p> : null}

                {qa.map((q) => (

                  <div key={q.id} className="border border-slate-100 rounded-xl p-3 mb-2 text-sm">

                    <p className="font-semibold">

                      {q.userName} {q.isClosed ? "· ปิดแล้ว" : ""} {q.isHidden ? "· ซ่อน" : ""}

                    </p>

                    <p className="text-slate-600 mt-1">{q.body}</p>

                    <div className="flex gap-2 mt-2">

                      <button

                        type="button"

                        onClick={() => handleModerateQa(q.id, "close")}

                        className="text-xs px-2 py-1 rounded bg-slate-100"

                      >

                        ปิดกระทู้

                      </button>

                      <button

                        type="button"

                        onClick={() => handleModerateQa(q.id, "hide")}

                        className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800"

                      >

                        ซ่อน

                      </button>

                      <button

                        type="button"

                        onClick={() => handleModerateQa(q.id, "delete")}

                        className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-800"

                      >

                        ลบ

                      </button>

                    </div>

                  </div>

                ))}

              </div>

            </section>

          ) : null}

        </>

      ) : null}



      {panel === "revenue" ? <CourseRevenueAdminPanel /> : null}



      {panel === "funnel" && funnel ? (

        <div className="grid gap-4 md:grid-cols-2">

          <div className="rounded-xl border bg-white p-4">

            <h2 className="font-bold inline-flex items-center gap-2 mb-3">

              <BarChart3 size={18} /> Funnel counts

            </h2>

            <ul className="space-y-2 text-sm">

              {Object.entries(funnel.funnel).map(([k, v]) => (

                <li key={k} className="flex justify-between">

                  <span className="text-slate-600">{k}</span>

                  <span className="font-semibold">{v}</span>

                </li>

              ))}

            </ul>

          </div>

          <div className="rounded-xl border bg-white p-4">

            <h2 className="font-bold mb-3">Conversion rates</h2>

            <ul className="space-y-2 text-sm">

              {Object.entries(funnel.conversion).map(([k, v]) => (

                <li key={k} className="flex justify-between">

                  <span className="text-slate-600">{k}</span>

                  <span className="font-semibold">{v != null ? `${v}%` : "—"}</span>

                </li>

              ))}

            </ul>

          </div>

        </div>

      ) : null}



      {panel === "launch" && launch ? (

        <div className="space-y-4">

          <div

            className={`rounded-xl p-4 border ${

              launch.ready ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"

            }`}

          >

            <p className="font-bold inline-flex items-center gap-2">

              {launch.ready ? <CheckCircle2 className="text-emerald-600" /> : <XCircle className="text-amber-600" />}

              Automated checks: {launch.automated.pass}/{launch.automated.total}

            </p>

          </div>

          <div className="rounded-xl border bg-white p-4">

            <h2 className="font-bold inline-flex items-center gap-2 mb-3">

              <ClipboardList size={18} /> Automated

            </h2>

            <ul className="space-y-2 text-sm">

              {launch.automated.checks.map((c) => (

                <li key={c.id} className="flex items-start gap-2">

                  {c.pass ? (

                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />

                  ) : (

                    <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />

                  )}

                  <span>{c.label}</span>

                </li>

              ))}

            </ul>

          </div>

          <div className="rounded-xl border bg-white p-4">

            <h2 className="font-bold mb-3">Manual QA (sign-off)</h2>

            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">

              {launch.manualQa.map((step) => (

                <li key={step.id}>{step.label}</li>

              ))}

            </ol>

          </div>

        </div>

      ) : null}



      {panel === "audit" ? (

        <div className="space-y-4">

          <div className="flex items-center justify-between">

            <h2 className="font-bold inline-flex items-center gap-2">

              <History size={18} /> Marketplace audit log

            </h2>

            <button

              type="button"

              onClick={loadAudit}

              className="text-sm text-slate-500 inline-flex items-center gap-1"

            >

              <RefreshCw size={14} className={auditLoading ? "animate-spin" : ""} /> รีเฟรช

            </button>

          </div>

          {auditLoading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin text-emerald-600" size={28} />

            </div>

          ) : auditRows.length === 0 ? (

            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">

              ยังไม่มี audit log

            </div>

          ) : (

            <div className="rounded-xl border bg-white overflow-hidden">

              <table className="w-full text-sm">

                <thead className="bg-slate-50 text-slate-600 text-left">

                  <tr>

                    <th className="px-3 py-2 font-semibold">เวลา</th>

                    <th className="px-3 py-2 font-semibold">Action</th>

                    <th className="px-3 py-2 font-semibold">Course</th>

                    <th className="px-3 py-2 font-semibold">Admin</th>

                    <th className="px-3 py-2 font-semibold">Reason</th>

                  </tr>

                </thead>

                <tbody>

                  {auditRows.map((row) => (

                    <tr key={row.id} className="border-t border-slate-100">

                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatAuditTime(row.createdAt)}</td>

                      <td className="px-3 py-2 font-medium">{row.action}</td>

                      <td className="px-3 py-2 font-mono text-xs">{row.courseId || "—"}</td>

                      <td className="px-3 py-2">{row.adminName || row.adminUserId || "—"}</td>

                      <td className="px-3 py-2 text-slate-600">{row.reason || "—"}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      ) : null}

    </div>

  );

};


