import React, { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        config: {
          videoId?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayerTarget }) => void;
            onStateChange?: (e: { data: number; target: YtPlayerTarget }) => void;
          };
        },
      ) => YtPlayerTarget;
      PlayerState?: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtPlayerTarget = {
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

type Props = {
  embedUrl: string;
  provider: "youtube" | "direct" | "none";
  videoId?: string | null;
  title: string;
  playbackSpeed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  initialWatchedSeconds?: number;
  onWatchProgress: (seconds: number) => void;
  onEnded: () => void;
};

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function extractYouTubeIdFromEmbed(embedUrl: string) {
  const m = embedUrl.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

export default function CourseLessonPlayer({
  embedUrl,
  provider,
  videoId,
  title,
  playbackSpeed,
  onSpeedChange,
  initialWatchedSeconds = 0,
  onWatchProgress,
  onEnded,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `yt-player-${reactId}`;
  const playerRef = useRef<YtPlayerTarget | null>(null);
  const lastReportedRef = useRef(0);
  const endedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    endedRef.current = false;
    lastReportedRef.current = Math.max(0, initialWatchedSeconds);
    setReady(false);
    playerRef.current?.destroy?.();
    playerRef.current = null;

    if (provider !== "youtube" || !embedUrl) return undefined;

    let alive = true;
    const vid = videoId || extractYouTubeIdFromEmbed(embedUrl);

    (async () => {
      await loadYouTubeIframeApi();
      if (!alive || !vid || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(containerId, {
        videoId: vid,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (e) => {
            if (!alive) return;
            setReady(true);
            if (initialWatchedSeconds > 5) {
              e.target.seekTo(initialWatchedSeconds, true);
            }
            e.target.setPlaybackRate(playbackSpeed);
          },
          onStateChange: (e) => {
            if (!alive) return;
            const ended = window.YT?.PlayerState?.ENDED ?? 0;
            if (e.data === ended && !endedRef.current) {
              endedRef.current = true;
              onEnded();
            }
          },
        },
      });
    })();

    return () => {
      alive = false;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [embedUrl, provider, videoId, containerId]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    try {
      playerRef.current.setPlaybackRate(playbackSpeed);
    } catch {
      /* ignore */
    }
  }, [playbackSpeed, ready]);

  useEffect(() => {
    const tick = () => {
      if (provider === "youtube" && playerRef.current && ready) {
        try {
          const t = Math.floor(playerRef.current.getCurrentTime() || 0);
          if (t > lastReportedRef.current) {
            lastReportedRef.current = t;
            onWatchProgress(t);
          }
        } catch {
          /* ignore */
        }
      }
    };
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [provider, ready, onWatchProgress]);

  const handleDirectTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t = Math.floor(e.currentTarget.currentTime || 0);
    if (t > lastReportedRef.current) {
      lastReportedRef.current = t;
      onWatchProgress(t);
    }
  };

  const handleDirectEnded = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnded();
  };

  return (
    <div className="relative w-full h-full bg-black">
      {provider === "youtube" ? (
        <div id={containerId} className="w-full h-full" title={title} />
      ) : provider === "direct" ? (
        <video
          key={embedUrl}
          className="w-full h-full object-contain"
          src={embedUrl}
          controls
          playsInline
          title={title}
          onTimeUpdate={handleDirectTimeUpdate}
          onEnded={handleDirectEnded}
        />
      ) : null}

      <div className="absolute bottom-2 right-2 flex gap-1 rounded-xl bg-slate-950/80 border border-slate-700 p-1">
        {PLAYBACK_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => onSpeedChange(speed)}
            className={`px-2 py-1 rounded-lg text-xs font-bold ${
              playbackSpeed === speed ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}
