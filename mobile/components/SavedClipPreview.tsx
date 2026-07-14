import React, { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import type { TalentVideo } from "../services/videoService";

const PREVIEW_SEC = 4.5;

type Props = {
  video: TalentVideo;
  className?: string;
};

export const SavedClipPreview: React.FC<Props> = ({ video, className = "" }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const hasThumb = !!video.thumbnail_url && !thumbFailed;
  const hasVideo = !!video.video_url;

  useEffect(() => {
    if (hasThumb || !hasVideo) return;
    const root = rootRef.current;
    const el = videoRef.current;
    if (!root || !el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        if (ratio >= 0.25) {
          el.muted = true;
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.25, 0.5] },
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, [hasThumb, hasVideo, video.video_url]);

  const onTimeUpdate = () => {
    const el = videoRef.current;
    if (el && el.currentTime >= PREVIEW_SEC) {
      el.currentTime = 0;
    }
  };

  if (hasThumb) {
    return (
      <img
        src={video.thumbnail_url}
        alt=""
        className={`h-full w-full object-cover ${className}`}
        loading="lazy"
        onError={() => setThumbFailed(true)}
      />
    );
  }

  if (hasVideo) {
    return (
      <div ref={rootRef} className={`h-full w-full ${className}`}>
        <video
          ref={videoRef}
          src={video.video_url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          poster={video.thumbnail_url || undefined}
          onTimeUpdate={onTimeUpdate}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-slate-800/10 ${className}`}
    >
      <Video size={40} className="text-slate-400" />
    </div>
  );
};
