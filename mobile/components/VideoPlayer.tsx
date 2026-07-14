import React, { useEffect, useRef } from 'react';

type Props = {
  videoId: string;
  onEnded?: () => void;
  onProgress?: (seconds: number) => void;
};

/**
 * Simple YouTube IFrame wrapper using global YT API.
 * Calls onEnded when playback ends and polls progress every 2s.
 */
export default function VideoPlayer({ videoId, onEnded, onProgress }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window['YT']) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const create = () => {
      if (!containerRef.current) return;
      playerRef.current = new window['YT'].Player(containerRef.current, {
        width: '100%',
        height: '360',
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e: any) => {
            // 0 ended, 1 playing
            if (e.data === 0 && typeof onEnded === 'function') onEnded();
            if (e.data === 1) startPolling();
            if (e.data !== 1) stopPolling();
          },
        },
      });
    };

    if (window['YT'] && window['YT'].Player) create();
    else window['onYouTubeIframeAPIReady'] = create;

    function startPolling() {
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          if (playerRef.current && playerRef.current.getCurrentTime) {
            const t = await playerRef.current.getCurrentTime();
            if (typeof onProgress === 'function') onProgress(Math.floor(t));
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      stopPolling();
      if (playerRef.current && playerRef.current.destroy) playerRef.current.destroy();
    };
  }, [videoId, onEnded, onProgress]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div ref={containerRef} />
    </div>
  );
}