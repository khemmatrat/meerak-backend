'use client';

import { useEffect, useRef } from 'react';

type Props = {
  src?: string;
  posterEmoji?: string;
  active: boolean;
  muted?: boolean;
};

function isHls(url: string) {
  return url.includes('.m3u8') || url.includes('kind=hls');
}

export function TtVideoPlayer({ src, posterEmoji = '🎬', active, muted = true }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    let cancelled = false;

    const playNative = () => {
      if (!active) {
        el.pause();
        el.currentTime = 0;
        return;
      }
      el.play().catch(() => {});
    };

    const setup = async () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (!isHls(src)) {
        el.src = src;
        playNative();
        return;
      }

      try {
        const mod = await import('hls.js');
        const Hls = mod.default;
        if (cancelled) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(el);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (active) el.play().catch(() => {});
          });
        } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = src;
          playNative();
        }
      } catch {
        el.src = src;
        playNative();
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    if (active) {
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [active, src]);

  if (!src) {
    return (
      <div className="tt-feed-poster" aria-hidden>
        <span className="tt-feed-poster-emoji">{posterEmoji}</span>
      </div>
    );
  }

  return (
    <video
      ref={ref}
      className="tt-feed-video"
      playsInline
      loop
      muted={muted}
      preload={active ? 'auto' : 'metadata'}
      poster=""
    />
  );
}
