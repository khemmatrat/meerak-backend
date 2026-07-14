import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  MessageCircle,
  RefreshCw,
  Shield,
  Star,
  XCircle,
} from "lucide-react";
import {
  getAdminCourseModeration,
  getAdminCourseReviewQueue,
  moderateAdminCourseQa,
  moderateAdminCourseReview,
  runAdminCourseReviewAction,
  type AdminModerationQa,
  type AdminModerationReview,
  type AdminReviewQueueItem,
} from "../services/courseMarketplaceService";
import { useNotification } from "../context/NotificationContext";

type QueueStatus = "in_review" | "published" | "rejected" | "unlisted" | "draft";

export default function AdminCourseReview() {
  const { notify } = useNotification();
  const [status, setStatus] = useState<QueueStatus>("in_review");
  const [items, setItems] = useState<AdminReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [moderationCourseId, setModerationCourseId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<AdminModerationReview[]>([]);
  const [qa, setQa] = useState<AdminModerationQa[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminCourseReviewQueue(status);
      setItems(data.courses || []);
    } catch (e: any) {
      notify(e?.response?.data?.error || "โหลดคิวตรวจไม่สำเร็จ (ต้องเป็น admin)", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [notify, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openModeration = async (courseId: string) => {
    setModerationCourseId(courseId);
    try {
      const data = await getAdminCourseModeration(courseId);
      setReviews(data.reviews || []);
      setQa(data.qa || []);
    } catch {
      notify("โหลด moderation ไม่สำเร็จ", "error");
    }
  };

  const handleReviewAction = async (
    courseId: string,
    action: "approve" | "reject" | "unlist" | "takedown" | "feature" | "unfeature",
  ) => {
    setActing(`${courseId}:${action}`);
    try {
      const rateStr = rateDraft[courseId];
      const body: Parameters<typeof runAdminCourseReviewAction>[1] = { action };
      if (rateStr?.trim()) body.platformRateOverride = Number(rateStr);
      await runAdminCourseReviewAction(courseId, body);
      notify(`ดำเนินการ ${action} สำเร็จ`, "success");
      await load();
    } catch (e: any) {
      notify(e?.response?.data?.error || "ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setActing(null);
    }
  };

  const handleModerateReview = async (reviewId: string, action: "hide" | "delete") => {
    if (!moderationCourseId) return;
    try {
      await moderateAdminCourseReview(moderationCourseId, reviewId, action);
      notify(`รีวิว ${action} แล้ว`, "success");
      await openModeration(moderationCourseId);
    } catch (e: any) {
      notify(e?.response?.data?.error || "moderate รีวิวไม่สำเร็จ", "error");
    }
  };

  const handleModerateQa = async (messageId: string, action: "hide" | "close" | "delete") => {
    if (!moderationCourseId) return;
    try {
      await moderateAdminCourseQa(moderationCourseId, messageId, action);
      notify(`Q&A ${action} แล้ว`, "success");
      await openModeration(moderationCourseId);
    } catch (e: any) {
      notify(e?.response?.data?.error || "moderate Q&A ไม่สำเร็จ", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/reconciliation" className="p-2 rounded-lg bg-white border border-gray-200">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
              <Shield size={24} className="text-emerald-600" /> Course Review Queue
            </h1>
            <p className="text-sm text-gray-500">อนุมัติ / ปฏิเสธ / takedown + moderate รีวิว & Q&A</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["in_review", "published", "rejected", "unlisted", "draft"] as QueueStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                status === s ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
          <button type="button" onClick={load} className="ml-auto px-3 py-1.5 rounded-lg border bg-white text-sm inline-flex items-center gap-1">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> รีเฟรช
          </button>
        </div>

        {loading ? <p className="text-gray-500">กำลังโหลด...</p> : null}

        {!loading && !items.length ? (
          <div className="rounded-2xl bg-white border p-8 text-center text-gray-500">ไม่มีคอร์สในสถานะ {status}</div>
        ) : null}

        {items.map(({ course, checklist, instructorEmail }) => (
          <article key={course.id} className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{course.title}</h2>
                <p className="text-sm text-gray-500">{course.id} · {instructorEmail || course.instructorName}</p>
                <p className="text-sm text-emerald-700 mt-1">฿{Number(course.priceThb || 0).toLocaleString()} · checklist {checklist?.score ?? 0}%</p>
              </div>
              <Link to={`/courses/${course.id}`} className="text-sm font-semibold text-blue-600">ดูหน้าคอร์ส</Link>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {(checklist?.items || []).slice(0, 6).map((item) => (
                <span
                  key={item.id}
                  className={`px-2 py-1 rounded-full ${item.pass ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {item.label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-500">
                Platform rate override (0–0.9)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.9"
                  value={rateDraft[course.id] ?? ""}
                  onChange={(e) => setRateDraft((d) => ({ ...d, [course.id]: e.target.value }))}
                  placeholder="0.35"
                  className="block mt-1 w-28 border rounded-lg px-2 py-1 text-sm"
                />
              </label>
              {status === "in_review" ? (
                <>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => handleReviewAction(course.id, "approve")}
                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1"
                  >
                    <CheckCircle2 size={15} /> อนุมัติ
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => handleReviewAction(course.id, "reject")}
                    className="px-3 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold inline-flex items-center gap-1"
                  >
                    <XCircle size={15} /> ปฏิเสธ
                  </button>
                </>
              ) : null}
              {status === "published" ? (
                <>
                  <button type="button" disabled={!!acting} onClick={() => handleReviewAction(course.id, "feature")} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                    Feature
                  </button>
                  <button type="button" disabled={!!acting} onClick={() => handleReviewAction(course.id, "takedown")} className="px-3 py-2 rounded-xl bg-gray-800 text-white text-sm font-bold">
                    Takedown
                  </button>
                  <button type="button" onClick={() => openModeration(course.id)} className="px-3 py-2 rounded-xl border text-sm font-bold inline-flex items-center gap-1">
                    <MessageCircle size={15} /> Moderate
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}

        {moderationCourseId ? (
          <section className="rounded-2xl bg-white border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Moderation — {moderationCourseId}</h3>
              <button type="button" onClick={() => setModerationCourseId(null)} className="text-sm text-gray-500">ปิด</button>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2 inline-flex items-center gap-1"><Star size={14} /> รีวิว</h4>
              {!reviews.length ? <p className="text-xs text-gray-400">ไม่มีรีวิว</p> : null}
              {reviews.map((r) => (
                <div key={r.id} className="border rounded-xl p-3 mb-2 text-sm">
                  <p className="font-semibold">{r.userName} · {r.rating}★ {r.isHidden ? "· ซ่อนแล้ว" : ""}</p>
                  <p className="text-gray-600 mt-1">{r.comment}</p>
                  <div className="flex gap-2 mt-2">
                    {!r.isHidden ? (
                      <button type="button" onClick={() => handleModerateReview(r.id, "hide")} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                        <EyeOff size={12} /> ซ่อน
                      </button>
                    ) : null}
                    <button type="button" onClick={() => handleModerateReview(r.id, "delete")} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-800">ลบ</button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2 inline-flex items-center gap-1"><MessageCircle size={14} /> Q&A</h4>
              {!qa.length ? <p className="text-xs text-gray-400">ไม่มี Q&A</p> : null}
              {qa.map((q) => (
                <div key={q.id} className="border rounded-xl p-3 mb-2 text-sm">
                  <p className="font-semibold">{q.userName} {q.isClosed ? "· ปิดแล้ว" : ""} {q.isHidden ? "· ซ่อน" : ""}</p>
                  <p className="text-gray-600 mt-1">{q.body}</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => handleModerateQa(q.id, "close")} className="text-xs px-2 py-1 rounded bg-slate-100">ปิดกระทู้</button>
                    <button type="button" onClick={() => handleModerateQa(q.id, "hide")} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800">ซ่อน</button>
                    <button type="button" onClick={() => handleModerateQa(q.id, "delete")} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-800">ลบ</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
