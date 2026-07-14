import React from "react";

import { Link } from "react-router-dom";

import { Award, Download, Share2, Star, X } from "lucide-react";



type Props = {

  open: boolean;

  courseId: string;

  courseTitle: string;

  verifyCode?: string | null;

  learnerName?: string;

  onDownloadPdf?: () => void;

  pdfLoading?: boolean;

  onClose: () => void;

};



export default function CourseCompletionModal({

  open,

  courseId,

  courseTitle,

  verifyCode,

  onDownloadPdf,

  pdfLoading,

  onClose,

}: Props) {

  if (!open) return null;



  const shareText = verifyCode

    ? `จบคอร์ส "${courseTitle}" บน AQOND แล้ว · รหัสใบรับรอง ${verifyCode}`

    : `จบคอร์ส "${courseTitle}" บน AQOND แล้ว`;



  const handleShare = async () => {

    try {

      if (navigator.share) {

        await navigator.share({ title: courseTitle, text: shareText });

      } else {

        await navigator.clipboard.writeText(shareText);

      }

    } catch {

      /* ignore */

    }

  };



  return (

    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">

      <div className="course-flow-dark w-full max-w-md rounded-[28px] bg-slate-900 border border-emerald-500/40 p-6 shadow-2xl text-white">

        <div className="flex items-start justify-between gap-3">

          <div className="flex items-start gap-3">

            <div className="p-3 rounded-2xl bg-emerald-500/20">

              <Award className="text-emerald-300" size={32} />

            </div>

            <div>

              <p className="text-sm text-emerald-300">ยินดีด้วย!</p>

              <h2 className="text-2xl font-black leading-tight">เรียนจบคอร์สแล้ว</h2>

              <p className="text-sm text-slate-300 mt-1 line-clamp-2">{courseTitle}</p>

            </div>

          </div>

          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-200">

            <X size={18} />

          </button>

        </div>



        {verifyCode ? (

          <div className="mt-4 rounded-2xl bg-slate-800/80 border border-slate-600 px-4 py-3">

            <p className="text-xs text-slate-400">รหัสใบรับรอง</p>

            <p className="font-mono text-lg font-bold text-emerald-300">{verifyCode}</p>

            <Link

              to={`/courses/certificates/verify/${verifyCode}`}

              className="text-xs text-emerald-400 underline mt-2 inline-block"

            >

              เปิดหน้าตรวจสอบสาธารณะ

            </Link>

          </div>

        ) : null}



        <div className="mt-5 flex flex-col gap-2">

          {onDownloadPdf ? (

            <button

              type="button"

              disabled={pdfLoading}

              onClick={onDownloadPdf}

              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"

            >

              <Download size={18} /> {pdfLoading ? "กำลังสร้าง PDF..." : "ดาวน์โหลดใบรับรอง PDF"}

            </button>

          ) : null}

          <Link

            to={`/courses/${courseId}`}

            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold"

          >

            <Star size={18} /> ให้คะแนนและรีวิวคอร์ส

          </Link>

          <button

            type="button"

            onClick={handleShare}

            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-white font-bold border border-slate-600"

          >

            <Share2 size={18} /> แชร์ความสำเร็จ

          </button>

          <Link

            to="/courses"

            className="inline-flex items-center justify-center px-4 py-3 rounded-xl text-slate-300 text-sm font-semibold"

          >

            กลับตลาดคอร์ส

          </Link>

        </div>

      </div>

    </div>

  );

}


