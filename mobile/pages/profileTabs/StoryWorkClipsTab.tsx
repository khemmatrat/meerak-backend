import React, { type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, ChevronDown } from "lucide-react";
import { PostTypeChooser } from "../../components/PostTypeChooser";
import type { NotificationType } from "../../context/NotificationContext";
import VideoStoryGrid from "../../components/VideoStoryGrid";
import { VideoUploader } from "../../components/VideoUploader";
import { videoService } from "../../services/videoService";
import type { UserProfile } from "../../types";
import { buildStoryWorkClips } from "./buildStoryWorkClips";

export interface StoryWorkClipsTabProps {
  profile: UserProfile | null;
  notify: (msg: string, type?: NotificationType) => void;
  backendWorkClips: {
    id: string;
    url: string;
    title?: string;
    description?: string;
  }[];
  setBackendWorkClips: Dispatch<
    SetStateAction<
      {
        id: string;
        url: string;
        title?: string;
        description?: string;
      }[]
    >
  >;
  profileWorkClips: { id: string; url: string; type?: string }[];
}

export const StoryWorkClipsTab: React.FC<StoryWorkClipsTabProps> = ({
  profile,
  notify,
  backendWorkClips,
  setBackendWorkClips,
  profileWorkClips,
}) => {
  return (
    <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
      <PostTypeChooser variant="compact" className="pb-2" />

      <div className="pb-3 border-b border-slate-700/40 space-y-1">
        <h3 className="text-lg font-bold text-slate-100 tracking-tight">
          คลิปผลงาน / Video Feed
        </h3>
        <p className="text-sm text-slate-400 leading-snug">
          คลิปถาวรในฟีด (ไม่ใช่สตอรี่ 24 ชม. บนหน้าแรก) —
          โพสต์เพื่อให้ลูกค้าค้นเจอจากฟีด
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          กริดด้านล่างรวมคลิปจากอัปโหลดนี้, Greeting และ URL ใน Portfolio
        </p>
      </div>

      {/* ฟอร์มเผยแพร่ Video Feed แบบเดิม (หรือใช้การ์ดด้านบนเพื่อโฟลว์แบบ IG) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-5 sm:p-6 space-y-4">
        <div className="space-y-2">
          <p className="text-base font-bold text-slate-800 tracking-tight">
            เผยแพร่คลิปไป Video Feed
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            เลือกไฟล์เก็บไว้ก่อนได้ จากนั้นแก้หัวข้อและคำอธิบายให้พอใจ แล้วกด{" "}
            <strong className="font-semibold text-emerald-800">
              เผยแพร่ไปที่ Video Feed
            </strong>
            เมื่อประมวลผลและลายน้ำเสร็จ ถึงจะพาคุณเข้าฟีดพร้อมคลิป
          </p>
        </div>
        <VideoUploader
          publishFlow
          navigateToFeedOnSuccess={true}
          fromStoryUpload={true}
          onSuccess={async () => {
            try {
              const list = await videoService.getMyVideos();
              setBackendWorkClips(
                (list || []).map((v) => ({
                  id: v.id,
                  url: v.video_url,
                  title: v.title || undefined,
                  description: v.description || undefined,
                })),
              );
            } catch (_) {}
          }}
          onError={(msg) => notify(msg, "error")}
        />
        <Link
          to="/video-feed"
          className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm border border-emerald-700/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          เปิด Video Feed
        </Link>
      </div>

      <details className="group rounded-2xl border border-slate-600/55 bg-slate-800/20 overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer text-slate-300 hover:text-slate-100 hover:bg-slate-700/35 list-none [&::-webkit-details-marker]:hidden">
          <HelpCircle size={18} className="shrink-0" />
          <span className="font-medium">คู่มือ Story — ที่มาของคลิปในกริด</span>
          <ChevronDown
            size={18}
            className="shrink-0 ml-auto group-open:rotate-180 transition-transform"
          />
        </summary>
        <div className="px-4 pb-4 pt-1 text-sm text-slate-400 space-y-3 border-t border-slate-700">
          <p>
            <strong className="text-slate-300">แหล่งที่มาของคลิป:</strong> (1)
            เผยแพร่จากฟอร์มด้านบน (เลือกไฟล์แล้วกดเผยแพร่) (2) Greeting Video
            จาก Portfolio (3) วิดีโอ URL ใน Portfolio (.mp4, .webm, .mov)
          </p>
          <p>
            <strong className="text-slate-300">การแสดงผล:</strong> คลิปแสดงเป็น
            Grid — ลูกค้าคลิกดูแบบ Full-screen เลื่อนซ้าย/ขวาได้
          </p>
          <p>
            <strong className="text-slate-300">การเผยแพร่:</strong> เลือกคลิป
            เพื่อเก็บไว้ในเบราว์เซอร์อย่างเดียว —
            จากนั้นลงหัวข้อและคำอธิบายครบถ้วน แล้วกด &quot;เผยแพร่ไปที่ Video
            Feed&quot; ถึงตอนนั้นค่อยเริ่มอัปโหลด
          </p>
          <p>
            <strong className="text-slate-300">คลิปที่โพสต์แล้ว:</strong>{" "}
            จะไปแสดงใน Video Feed ด้วย — ระบบติดลายน้ำและฉากคลิปจบอัตโนมัติ (รอ
            30 วินาที–2 นาที)
          </p>
          <p>
            <strong className="text-slate-300">เคล็ดลับ:</strong> คลิปสั้นประมาณ
            15–60 วินาที โชว์เทคนิคหรือผลงานจริง
          </p>
        </div>
      </details>

      <VideoStoryGrid
        clips={buildStoryWorkClips(profile, backendWorkClips, profileWorkClips)}
        emptyMessage="ยังไม่มีคลิป — เผยแพร่จากด้านบน หรือเพิ่ม Greeting Video / Portfolio ในแท็บ Portfolio"
      />
    </div>
  );
};
