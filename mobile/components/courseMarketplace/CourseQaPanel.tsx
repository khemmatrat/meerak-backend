import React, { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, Pencil, Send, ShieldCheck, Trash2 } from "lucide-react";
import {
  deleteCourseQa,
  listCourseQa,
  postCourseQa,
  updateCourseQa,
  type CourseQaMessage,
  type CourseQaThread,
} from "../../services/courseMarketplaceService";

type Props = {
  courseId: string;
  lessonId?: string | null;
  lessonTitle?: string;
  canPost?: boolean;
  instructorUserId?: string | null;
  currentUserId?: string | null;
  compact?: boolean;
};

function QaMessageActions({
  message,
  currentUserId,
  onEdit,
  onDelete,
}: {
  message: CourseQaMessage;
  currentUserId?: string | null;
  onEdit: (message: CourseQaMessage) => void;
  onDelete: (messageId: string) => void;
}) {
  if (!currentUserId || String(message.userId) !== String(currentUserId)) return null;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => onEdit(message)}
        className="text-xs text-slate-400 hover:text-emerald-300 inline-flex items-center gap-1"
      >
        <Pencil size={12} /> แก้ไข
      </button>
      <button
        type="button"
        onClick={() => onDelete(message.id)}
        className="text-xs text-slate-400 hover:text-rose-300 inline-flex items-center gap-1"
      >
        <Trash2 size={12} /> ลบ
      </button>
    </div>
  );
}

function QaBubble({
  thread,
  onReply,
  canPost,
  currentUserId,
  onEdit,
  onDelete,
}: {
  thread: CourseQaThread;
  onReply: (parentId: string) => void;
  canPost: boolean;
  currentUserId?: string | null;
  onEdit: (message: CourseQaMessage) => void;
  onDelete: (messageId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
            {thread.userName}
            {thread.isInstructor ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1">
                <ShieldCheck size={10} /> ผู้สอน
              </span>
            ) : null}
          </p>
          <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{thread.body}</p>
        </div>
        <QaMessageActions
          message={thread}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      {thread.replies?.length ? (
        <div className="ml-3 pl-3 border-l border-slate-700 space-y-2">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="rounded-xl bg-slate-800/60 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-200 inline-flex items-center gap-1">
                    {reply.userName}
                    {reply.isInstructor ? (
                      <span className="text-[10px] text-emerald-300">· ผู้สอน</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-300 mt-0.5 whitespace-pre-wrap">{reply.body}</p>
                </div>
                <QaMessageActions
                  message={reply}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {canPost ? (
        <button
          type="button"
          onClick={() => onReply(thread.id)}
          className="text-xs text-emerald-400 font-semibold"
        >
          ตอบกลับ
        </button>
      ) : null}
    </div>
  );
}

export default function CourseQaPanel({
  courseId,
  lessonId,
  lessonTitle,
  canPost = false,
  currentUserId = null,
  compact = false,
}: Props) {
  const [threads, setThreads] = useState<CourseQaThread[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCourseQa(courseId, {
        lessonId: lessonId || undefined,
        limit: compact ? 3 : 30,
      });
      setThreads(data.threads || []);
      setTotal(data.total || 0);
    } catch {
      setThreads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId, compact]);

  useEffect(() => {
    load();
  }, [load]);

  const resetComposer = () => {
    setBody("");
    setReplyToId(null);
    setEditMessageId(null);
    setError("");
  };

  const handleEdit = (message: CourseQaMessage) => {
    setEditMessageId(message.id);
    setReplyToId(message.parentId || null);
    setBody(message.body);
  };

  const handleDelete = async (messageId: string) => {
    if (!window.confirm("ลบข้อความนี้?")) return;
    setSubmitting(true);
    setError("");
    try {
      await deleteCourseQa(courseId, messageId);
      if (editMessageId === messageId) resetComposer();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || "ลบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const text = body.trim();
    if (text.length < 3 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (editMessageId) {
        await updateCourseQa(courseId, editMessageId, text);
      } else {
        await postCourseQa(courseId, {
          body: text,
          lessonId: replyToId ? undefined : lessonId || undefined,
          parentId: replyToId || undefined,
        });
      }
      resetComposer();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || "ส่งคำถามไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const composerLabel = editMessageId
    ? "แก้ไขข้อความ"
    : replyToId
      ? "ส่งคำตอบ"
      : "ส่งคำถาม";

  return (
    <section className={compact ? "space-y-3" : "luxury-card rounded-3xl p-4 space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={`font-bold text-slate-100 inline-flex items-center gap-2 ${compact ? "text-base" : "text-xl"}`}>
          <MessageCircle size={18} className="text-emerald-300" />
          ถาม-ตอบ{lessonTitle ? ` · ${lessonTitle}` : ""}
        </h2>
        {total > 0 ? <span className="text-xs text-slate-500">{total} คำถาม</span> : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-sm text-slate-400">ยังไม่มีคำถาม — เป็นคนแรกที่ถามได้หลังลงทะเบียน</p>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <QaBubble
              key={thread.id}
              thread={thread}
              canPost={canPost}
              currentUserId={currentUserId}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReply={(id) => {
                setReplyToId(id);
                setEditMessageId(null);
                setBody("");
              }}
            />
          ))}
        </div>
      )}

      {canPost ? (
        <div className="rounded-2xl border border-slate-700 p-3 space-y-2">
          {editMessageId ? (
            <p className="text-xs text-amber-300">
              กำลังแก้ไข ·{" "}
              <button type="button" className="underline" onClick={resetComposer}>
                ยกเลิก
              </button>
            </p>
          ) : replyToId ? (
            <p className="text-xs text-emerald-300">
              กำลังตอบกลับ ·{" "}
              <button type="button" className="underline" onClick={resetComposer}>
                ยกเลิก
              </button>
            </p>
          ) : null}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={compact ? 2 : 3}
            placeholder={
              editMessageId ? "แก้ไขข้อความ..." : replyToId ? "พิมพ์คำตอบ..." : "ถามเกี่ยวกับบทเรียนนี้..."
            }
            className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <button
            type="button"
            disabled={submitting || body.trim().length < 3}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {composerLabel}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">ลงทะเบียนคอร์สเพื่อถามคำถามหรือตอบใน Q&A</p>
      )}
    </section>
  );
}
