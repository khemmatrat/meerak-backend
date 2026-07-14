/**
 * VideoStoryGrid — แสดงกริด Verified Work Clips แบบ 3 คอลัมน์
 * ใช้ได้ทั้งใน Profile (ของตัวเอง) และ ExpertView (ดูโปรไฟล์คนอื่น)
 */
import React, { useState, useCallback, useRef } from "react";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";

export const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

export interface WorkClip {
  id: string;
  url: string;
  type?: string;
  title?: string;
  description?: string;
}

interface VideoStoryGridProps {
  clips: WorkClip[];
  emptyMessage?: string;
}

export const VideoStoryGrid: React.FC<VideoStoryGridProps> = ({
  clips,
  emptyMessage = "ยังไม่มีคลิปผลงาน",
}) => {
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);

  const openStory = (index: number) => {
    setStoryIndex(index);
    setStoryOpen(true);
  };

  const closeStory = () => setStoryOpen(false);

  const goPrevStory = () => setStoryIndex((i) => Math.max(0, i - 1));
  const goNextStory = () =>
    setStoryIndex((i) => Math.min(clips.length - 1, i + 1));

  const handleStoryTouchStart = (e: React.TouchEvent) => {
    (e.currentTarget as any)._touchStartY = e.touches[0].clientY;
  };
  const handleStoryTouchEnd = (e: React.TouchEvent) => {
    const startY = (e.currentTarget as any)._touchStartY;
    if (startY == null) return;
    const dy = startY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) {
      if (dy > 0) goNextStory();
      else goPrevStory();
    }
  };

  if (clips.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50/80 px-4 py-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-2 ring-emerald-100">
          <Play size={26} className="text-emerald-600 ml-1" aria-hidden />
        </div>
        <p className="text-sm font-medium leading-relaxed text-slate-700 max-w-[20rem] mx-auto">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {clips.map((clip, idx) => (
          <button
            key={clip.id}
            onClick={() => openStory(idx)}
            className="aspect-[9/16] rounded-2xl overflow-hidden bg-black relative group ring-1 ring-white/10 hover:ring-2 hover:ring-amber-400/50 transition-all shadow-xl"
          >
            {VIDEO_EXT.test(clip.url) ? (
              <video
                src={clip.url}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
              />
            ) : (
              <img
                src={clip.url}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play size={28} className="text-white ml-1" fill="white" />
              </div>
            </div>
            {clip.title && (
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white text-xs font-medium truncate">
                {clip.title}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Full-screen Story Viewer */}
      {storyOpen && clips.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
            <button
              onClick={closeStory}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X size={24} />
            </button>
            <span className="text-white font-medium">
              {storyIndex + 1} / {clips.length}
            </span>
            <div className="w-10" />
          </div>
          <div
            className="flex-1 flex items-center justify-center overflow-hidden"
            onTouchStart={handleStoryTouchStart}
            onTouchEnd={handleStoryTouchEnd}
          >
            {storyIndex > 0 && (
              <button
                onClick={goPrevStory}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronLeft size={32} />
              </button>
            )}
            <div className="w-full max-w-[min(100vw,calc(100vh*9/16))] aspect-[9/16] mx-auto bg-black">
              {VIDEO_EXT.test(clips[storyIndex].url) ? (
                <video
                  src={clips[storyIndex].url}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  muted={false}
                  controls
                  onEnded={() => {
                    if (storyIndex < clips.length - 1) goNextStory();
                    else closeStory();
                  }}
                />
              ) : (
                <img
                  src={clips[storyIndex].url}
                  alt=""
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            {storyIndex < clips.length - 1 && (
              <button
                onClick={goNextStory}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight size={32} />
              </button>
            )}
          </div>
          {/* Title & Description overlay (TikTok-style) */}
          {(clips[storyIndex].title || clips[storyIndex].description) && (
            <div className="absolute bottom-16 left-0 right-0 px-4 text-left">
              {clips[storyIndex].title && (
                <p className="text-white font-semibold text-base drop-shadow-lg">
                  {clips[storyIndex].title}
                </p>
              )}
              {clips[storyIndex].description && (
                <p className="text-white/90 text-sm mt-0.5 line-clamp-2 drop-shadow-lg">
                  {clips[storyIndex].description}
                </p>
              )}
            </div>
          )}
          <div className="absolute bottom-8 left-0 right-0 text-center text-white/60 text-sm">
            เลื่อนซ้าย/ขวา หรือกดปุ่มเพื่อเปลี่ยนคลิป
          </div>
        </div>
      )}
    </>
  );
};

export default VideoStoryGrid;
