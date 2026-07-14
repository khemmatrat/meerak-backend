import React, { useEffect, useMemo, useState } from "react";

import { Link, useParams } from "react-router-dom";

import { BookOpen, Download, ReceiptText, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";

import {

  downloadCourseOrderReceiptPdf,
  downloadCourseOrderTaxDocumentPdf,
  getCourseOrderReceipt,

  getCourseRefundEligibility,

  requestCourseRefund,

  type CourseOrderReceipt as CourseOrderReceiptType,
  type CourseOrderTaxDocumentsPayload,
  type CourseRefundEligibility,
  type CourseTaxDocument,
} from "../services/courseMarketplaceService";

import { useNotification } from "../context/NotificationContext";

import { useAuth } from "../context/AuthContext";

import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";



function money(value?: number | null) {

  return `฿${Number(value || 0).toLocaleString()}`;

}



function formatDate(value?: string) {

  if (!value) return "-";

  try {

    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  } catch {

    return value;

  }

}



function payoutStatusCopy(receipt: CourseOrderReceiptType) {

  const status = receipt.payoutStatus || "held";

  if (receipt.status === "refunded" || receipt.refundStatus === "refunded") {

    return "คืนเงินแล้ว — ไม่มีรายได้ผู้สอนจาก order นี้";

  }

  if (status === "released") {

    return `ปล่อยรายได้ ${money(receipt.instructorNet)} เข้า Wallet ถอนได้แล้ว${receipt.payoutReleasedAt ? ` · ${formatDate(receipt.payoutReleasedAt)}` : ""}`;

  }

  if (status === "blocked") {

    return "รายได้ order นี้ถูก block — ติดต่อ support หากยอดไม่ตรง";

  }

  if (receipt.payoutReleaseAt) {

    return `รอครบกำหนด release · ${formatDate(receipt.payoutReleaseAt)} · ยอด ${money(receipt.instructorNet)}`;

  }

  return `รอ release payout · ยอด ${money(receipt.instructorNet)}`;

}



export default function CourseOrderReceipt() {

  const { orderId } = useParams<{ orderId: string }>();

  const { user } = useAuth();

  const { notify } = useNotification();

  const [receipt, setReceipt] = useState<CourseOrderReceiptType | null>(null);
  const [taxDocuments, setTaxDocuments] = useState<CourseOrderTaxDocumentsPayload | null>(null);

  const [refundInfo, setRefundInfo] = useState<CourseRefundEligibility | null>(null);

  const [loading, setLoading] = useState(true);

  const [refunding, setRefunding] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);



  const viewerRole = useMemo(() => {

    if (!receipt || !user?.id) return "guest";

    if (String(receipt.buyer.id) === String(user.id)) return "buyer";

    if (String(receipt.instructor.id) === String(user.id)) return "instructor";

    return "other";

  }, [receipt, user?.id]);



  useEffect(() => {

    let alive = true;

    (async () => {

      if (!orderId) return;

      setLoading(true);

      try {

        const payload = await getCourseOrderReceipt(orderId);
        if (!alive) return;
        setReceipt(payload.receipt);
        setTaxDocuments(payload.taxDocuments);

      } finally {

        if (alive) setLoading(false);

      }

    })();

    return () => {

      alive = false;

    };

  }, [orderId]);



  useEffect(() => {

    let alive = true;

    (async () => {

      if (!orderId || viewerRole !== "buyer") {

        setRefundInfo(null);

        return;

      }

      try {

        const eligibility = await getCourseRefundEligibility(orderId);

        if (alive) setRefundInfo(eligibility);

      } catch {

        if (alive) setRefundInfo(null);

      }

    })();

    return () => {

      alive = false;

    };

  }, [orderId, viewerRole]);



  const handleDownloadPdf = async (documentId?: string) => {
    if (!orderId) return;
    setDownloadingPdf(true);
    try {
      const blob = documentId
        ? await downloadCourseOrderTaxDocumentPdf(orderId, documentId)
        : await downloadCourseOrderReceiptPdf(orderId, { preferFiscal: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = documentId
        ? `fiscal-${documentId}.pdf`
        : `${viewerRole === "instructor" ? "seller-statement" : "course-receipt"}-${receipt?.receiptNo || orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      notify("ดาวน์โหลด PDF แล้ว", "success");
    } catch (e: any) {
      notify(e?.response?.data?.error || "ดาวน์โหลด PDF ไม่สำเร็จ", "error");
    } finally {
      setDownloadingPdf(false);
    }
  };


  const handleRefund = async () => {

    if (!orderId || !refundInfo?.eligibility?.eligible) return;

    setRefunding(true);

    try {

      const result = await requestCourseRefund(orderId, { reasonCode: "buyer_request" });

      notify(`คืนเงิน ${money(result.grossAmount)} เข้า Wallet แล้ว`, "success");

      const [payload, eligibility] = await Promise.all([
        getCourseOrderReceipt(orderId),
        getCourseRefundEligibility(orderId).catch(() => null),
      ]);
      setReceipt(payload.receipt);
      setTaxDocuments(payload.taxDocuments);

      setRefundInfo(eligibility);

    } catch (e: any) {

      notify(e?.response?.data?.error || "ขอคืนเงินไม่สำเร็จ", "error");

    } finally {

      setRefunding(false);

    }

  };



  if (loading) {

    return (

      <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24">

        <div className="luxury-card rounded-3xl h-96 animate-pulse" />

      </div>

    );

  }



  if (!receipt) {

    return (

      <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24">

        <div className="luxury-card rounded-3xl p-8 text-center">

          <ReceiptText className="mx-auto text-slate-400" size={34} />

          <h1 className="text-xl font-bold text-slate-100 mt-3">ไม่พบใบเสร็จคอร์ส</h1>

          <Link to="/courses" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">

            กลับไปตลาดคอร์ส

          </Link>

        </div>

      </div>

    );

  }



  const backTo = viewerRole === "instructor" ? "/course-studio/sales" : "/courses";

  const backLabel = viewerRole === "instructor" ? "Sales Dashboard" : "ตลาดคอร์ส";



  return (

    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 space-y-5">

      <CourseFlowHeader title="ใบเสร็จคอร์ส" backTo={backTo} backLabel={backLabel} />

      <section className="course-flow-hero rounded-[32px] p-6 bg-gradient-to-br from-emerald-600 via-teal-600 to-slate-950 text-white">

        <div className="flex items-start gap-4">

          <div className="p-3 rounded-2xl bg-white/15">

            <ReceiptText size={34} />

          </div>

          <div>

            <p className="text-sm opacity-80">Course Receipt</p>

            <h1 className="text-3xl font-black leading-tight">ใบเสร็จการซื้อคอร์ส</h1>

            <p className="text-sm opacity-90 mt-1">เลขที่ {receipt.receiptNo}</p>

          </div>

        </div>

      </section>



      <section className="luxury-card rounded-3xl p-5 space-y-4">

        <div className="flex items-start gap-3">

          <div className="p-3 rounded-2xl bg-emerald-500/15">

            <BookOpen className="text-emerald-300" size={24} />

          </div>

          <div className="flex-1">

            <h2 className="text-xl font-bold text-slate-100">{receipt.course.title}</h2>

            <p className="text-sm text-slate-400">{receipt.course.subtitle || "AQOND Course Marketplace"}</p>

          </div>

        </div>



        <div className="grid grid-cols-2 gap-3 text-sm">

          <div className="rounded-2xl bg-slate-900/70 p-3">

            <p className="text-slate-500">วันที่ซื้อ</p>

            <p className="text-slate-100 font-semibold">{formatDate(receipt.createdAt)}</p>

          </div>

          <div className="rounded-2xl bg-slate-900/70 p-3">

            <p className="text-slate-500">ช่องทางจ่าย</p>

            <p className="text-slate-100 font-semibold inline-flex items-center gap-1">

              <WalletCards size={15} /> {receipt.gateway || "wallet"}

            </p>

          </div>

          <div className="rounded-2xl bg-slate-900/70 p-3">

            <p className="text-slate-500">ผู้เรียน</p>

            <p className="text-slate-100 font-semibold">{receipt.buyer.name}</p>

          </div>

          <div className="rounded-2xl bg-slate-900/70 p-3">

            <p className="text-slate-500">ผู้สอน</p>

            <p className="text-slate-100 font-semibold">{receipt.instructor.name}</p>

          </div>

        </div>



        <div className="rounded-2xl border border-slate-700 overflow-hidden">

          <div className="flex justify-between px-4 py-3 text-sm">

            <span className="text-slate-400">ราคาคอร์ส</span>

            <span className="text-slate-100 font-bold">{money(receipt.grossAmount)}</span>

          </div>

          <div className="flex justify-between px-4 py-3 text-sm border-t border-slate-700">

            <span className="text-slate-400">ค่าธรรมเนียมแพลตฟอร์ม</span>

            <span className="text-slate-100">{money(receipt.platformFee)}</span>

          </div>

          <div className="flex justify-between px-4 py-3 text-sm border-t border-slate-700">

            <span className="text-slate-400">รายได้สุทธิผู้สอน</span>

            <span className="text-emerald-300 font-bold">{money(receipt.instructorNet)}</span>

          </div>

        </div>



        {viewerRole === "instructor" ? (

          <div className="rounded-2xl bg-indigo-500/10 border border-indigo-400/20 p-3 text-sm text-indigo-100">

            <p className="font-semibold mb-1">สถานะ payout ผู้สอน</p>

            <p>{payoutStatusCopy(receipt)}</p>
            {Number(receipt.whtWithheld || 0) > 0 ? (
              <p className="mt-2 text-xs opacity-90">
                หัก ณ ที่จ่าย {receipt.whtRatePercent || 0}% = {money(receipt.whtWithheld)} · รับสุทธิ {money(receipt.netReleasedAfterWht || 0)}
              </p>
            ) : null}
          </div>
        ) : (

          <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 p-3 text-sm text-blue-100 inline-flex items-start gap-2">

            <ShieldCheck size={18} className="shrink-0 mt-0.5" />

            <span>

              รายการนี้บันทึกผ่าน course ledger แยกจาก payment flow งาน/booking เดิม

              {receipt.status === "refunded" ? " · คืนเงินแล้ว" : " · มี draft เอกสารภาษีค่าธรรมเนียมแพลตฟอร์มและ seller statement"}

            </span>

          </div>

        )}



        {receipt.status === "refunded" ? (

          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-900">

            คืนเงินแล้วเมื่อ {formatDate(receipt.refundedAt)} — ยอด {money(receipt.grossAmount)} กลับเข้า Wallet

          </div>

        ) : viewerRole === "buyer" && refundInfo ? (

          <div className="rounded-2xl border border-slate-700 p-3 space-y-2 text-sm">

            <p className="font-semibold text-slate-100 inline-flex items-center gap-2">

              <RefreshCw size={16} /> การันตีคืนเงิน {refundInfo.policy.guaranteeDays} วัน (เรียนไม่เกิน {refundInfo.policy.maxProgressPct}%)

            </p>

            <p className="text-slate-400">{refundInfo.eligibility.reason}</p>

            {refundInfo.eligibility.eligible ? (

              <button

                type="button"

                onClick={handleRefund}

                disabled={refunding}

                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold disabled:opacity-60"

              >

                {refunding ? "กำลังคืนเงิน..." : `ขอคืนเงิน ${money(receipt.grossAmount)}`}

              </button>

            ) : null}

          </div>

        ) : null}

        {(taxDocuments?.documents?.length || taxDocuments?.taxProfileHint) ? (
          <div className="rounded-2xl border border-slate-700 p-4 space-y-3 text-sm">
            <p className="font-semibold text-slate-100">เอกสารชี้แจงรายได้ / ภาษี</p>
            <p className="text-xs text-slate-500">
              ดาวน์โหลด PDF ได้เมื่อฝ่ายบัญชีออกเลขเอกสารแล้ว (issued) — ใช้ยื่นภาษีกับกรมสรรพากร
            </p>
            {taxDocuments?.taxProfileHint ? (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-3 text-amber-100 text-xs">
                {taxDocuments.taxProfileHint.message}
                <Link to="/profile?tab=info" className="block mt-2 font-bold text-amber-200 underline">
                  ตั้งค่า Tax Profile
                </Link>
              </div>
            ) : null}
            <div className="space-y-2">
              {(taxDocuments?.documents || []).map((doc: CourseTaxDocument) => (
                <div key={doc.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-900/70 p-3">
                  <div>
                    <p className="font-semibold text-slate-100">{doc.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {doc.documentNo ? `เลขที่ ${doc.documentNo}` : "รอเลขที่เอกสาร"} · {doc.status}
                    </p>
                  </div>
                  {doc.downloadable ? (
                    <button
                      type="button"
                      disabled={downloadingPdf}
                      onClick={() => handleDownloadPdf(doc.id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
                    >
                      PDF
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 shrink-0">รอออกเลข</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">

          {viewerRole === "buyer" ? (

            <Link to={`/courses/${receipt.course.id}/learn`} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">

              ไปเรียนต่อ

            </Link>

          ) : null}

          {viewerRole === "instructor" ? (

            <>

              <Link to="/course-studio/sales" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">

                ดูยอดขายผู้สอน

              </Link>

              <Link to="/profile?tab=wallet" className="px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold">

                ถอนเงิน Wallet

              </Link>

            </>

          ) : (

            <Link to="/course-studio/sales" className="px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold">

              ดูยอดขายผู้สอน

            </Link>

          )}

          <button
            type="button"
            onClick={() => handleDownloadPdf()}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold disabled:opacity-60"
          >
            <Download size={16} /> {downloadingPdf ? "กำลังสร้าง PDF..." : viewerRole === "instructor" ? "PDF (fiscal หรือสำรอง)" : "PDF ใบเสร็จ"}
          </button>

        </div>

      </section>

    </div>

  );

}

