import React, { useEffect, useRef } from "react";
import { Star, Loader2 } from "lucide-react";
import { trackAdvanceEvent, advanceJobEventMeta } from "../../utils/analytics";
import type { JobAdvanceAPI } from "../../types/api";
import type { JobBoardRemoteCopy } from "../../utils/jobBoardCopy";

type ReviewRow = {
  id?: string;
  rating: number;
  comment?: string;
  created_at?: string;
  reviewee_id?: string;
};

export function ReviewPane({
  isEmployer,
  myReview,
  reviews,
  currentUserId,
  reviewRating,
  setReviewRating,
  reviewComment,
  setReviewComment,
  reviewSubmitting,
  onSubmitReview,
  jobId,
  job,
  jobBoardCopy,
}: {
  isEmployer: boolean;
  myReview: ReviewRow | null;
  reviews: ReviewRow[];
  currentUserId: string | undefined;
  reviewRating: number;
  setReviewRating: (n: number) => void;
  reviewComment: string;
  setReviewComment: (s: string) => void;
  reviewSubmitting: boolean;
  onSubmitReview: () => void;
  jobId?: string;
  job?: JobAdvanceAPI | null;
  jobBoardCopy?: JobBoardRemoteCopy;
}) {
  const reviewImpressionSent = useRef(false);
  useEffect(() => {
    if (reviewImpressionSent.current || myReview || !jobId || !job) return;
    reviewImpressionSent.current = true;
    trackAdvanceEvent(
      "advance_review_cta_impression",
      advanceJobEventMeta(job, {
        job_id: jobId,
        role: isEmployer ? "employer" : "talent",
      }),
      jobBoardCopy,
    );
  }, [myReview, jobId, job, isEmployer, jobBoardCopy]);

  const received = reviews.filter(
    (r) => currentUserId && String(r.reviewee_id) === String(currentUserId),
  );

  return (
    <div className="luxury-card rounded-2xl p-6 space-y-6">
      <h3 className="text-lg font-bold text-slate-900">ให้คะแนนการร่วมงาน</h3>
      {isEmployer ? (
        <>
          {myReview ? (
            <div className="p-6 rounded-2xl bg-white border border-slate-200">
              <p className="text-emerald-700 font-medium mb-2">คุณให้คะแนนผู้รับงานแล้ว</p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    size={24}
                    className={
                      i <= myReview.rating ? "text-blue-500 fill-blue-500" : "text-slate-300"
                    }
                  />
                ))}
              </div>
              {myReview.comment && (
                <p className="text-slate-700 text-sm mt-2">{myReview.comment}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-900 font-medium">ให้คะแนนผู้รับจ้าง</p>
              <p className="text-slate-600 text-sm">ประเมินคุณภาพงานและพฤติกรรมของผู้รับจ้าง</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReviewRating(i)}
                    className="p-2 rounded-xl transition hover:scale-110 focus:ring-2 focus:ring-amber-500/50"
                  >
                    <Star
                      size={32}
                      className={
                        i <= reviewRating ? "text-blue-500 fill-blue-500" : "text-slate-400"
                      }
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="เขียนรีวิว (ถ้าต้องการ)..."
                rows={4}
                className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-300 text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-blue-500/30 outline-none"
              />
              <button
                type="button"
                onClick={onSubmitReview}
                disabled={reviewSubmitting || reviewRating < 1}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {reviewSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Star size={18} />
                )}
                ส่งคะแนน
              </button>
            </div>
          )}
          {received.length > 0 && (
            <div className="p-4 rounded-xl bg-white border border-slate-200 mt-4">
              <p className="text-slate-900 font-medium mb-2">ผู้รับงานให้คะแนนคุณแล้ว</p>
              {received.map((r) => (
                <div key={r.id || r.created_at} className="flex gap-2 mb-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={18}
                        className={
                          i <= r.rating ? "text-blue-500 fill-blue-500" : "text-slate-300"
                        }
                      />
                    ))}
                  </div>
                  {r.comment && <p className="text-slate-700 text-sm">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : received.length > 0 ? (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 mb-6">
          <p className="text-emerald-700 font-medium mb-2">
            นายจ้างประเมินผู้รับจ้าง — คะแนนที่คุณได้รับ
          </p>
          {received.map((r) => (
            <div key={r.id || r.created_at} className="flex gap-2 mb-2">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    size={24}
                    className={
                      i <= r.rating ? "text-blue-500 fill-blue-500" : "text-slate-300"
                    }
                  />
                ))}
              </div>
              {r.comment && <p className="text-slate-700 text-sm">{r.comment}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-blue-50 border border-blue-200 mb-6">
          <p className="text-blue-700 font-medium">รอให้นายจ้างให้คะแนนคุณก่อน</p>
          <p className="text-slate-600 text-sm mt-1">
            นายจ้างจะประเมินคุณภาพงานและพฤติกรรมของคุณ — เมื่อให้คะแนนแล้วจะแสดงตรงนี้
          </p>
        </div>
      )}
    </div>
  );
}
