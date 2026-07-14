/**
 * VideoCard — ตัวเล่นวิดีโอแนวตั้ง พร้อมปุ่ม "จ้างงานเลย" และ "รายงาน"
 */
import React, { useRef, useEffect, useState } from 'react';
import { Briefcase, Flag } from 'lucide-react';
import type { TalentVideo } from '../../../services/videoService';
import { WorkerGradeBadge } from '../../WorkerGradeBadge';

interface VideoCardProps {
  video: TalentVideo;
  isActive?: boolean;
  onHireClick?: (video: TalentVideo) => void;
  onReportClick?: (video: TalentVideo) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  isActive = false,
  onHireClick,
  onReportClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.play().catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    }
  }, [isActive]);

  return (
    <div className="relative w-full h-full min-h-[100dvh] flex flex-col items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={video.video_url}
        className="absolute inset-0 w-full h-full object-contain"
        loop
        muted={false}
        playsInline
        onClick={() => {
          if (videoRef.current) {
            if (playing) videoRef.current.pause();
            else videoRef.current.play();
            setPlaying(!playing);
          }
        }}
      />

      {/* Report button - top right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReportClick?.(video);
        }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white/80 hover:bg-red-500/80 hover:text-white transition-colors"
        title="รายงาน"
        aria-label="รายงานวิดีโอ"
      >
        <Flag size={20} />
      </button>

      {/* Overlay ด้านล่าง */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <img
            src={video.talent_avatar || 'https://i.pravatar.cc/80'}
            alt=""
            className="w-10 h-10 rounded-full border-2 border-white"
          />
          <span className="text-white font-medium">{video.talent_name || 'Talent'}</span>
          {video.talent_grade && (
            <WorkerGradeBadge grade={video.talent_grade as 'A' | 'B' | 'C'} size="sm" />
          )}
        </div>
        {video.title && (
          <p className="text-white/90 text-sm mb-2 line-clamp-2">{video.title}</p>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHireClick?.(video);
          }}
          className="flex items-center gap-2 w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
        >
          <Briefcase size={20} />
          จ้างงานเลย
        </button>
      </div>
    </div>
  );
};
