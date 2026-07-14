'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { EmptyState } from '@aqond/ui';
import { AqondButton as Button, AqondInput as Input } from '@aqond/components';
import { useVideoComments, useVideoFeed } from '@/hooks/services/useVideoFeed';
import { canVideoEngage } from '@/lib/services/videoApi';
import { displayVideoDescription } from '@/lib/services/videoDisplay';
import type { TalentVideo } from '@/lib/services/videoTypes';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

function VideoFeedCard({
  video,
  acting,
  onLike,
  onSave,
  onOpenComments,
  formatCount,
}: {
  video: TalentVideo;
  acting: boolean;
  onLike: () => void;
  onSave: () => void;
  onOpenComments: () => void;
  formatCount: (n: number | undefined) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const engage = canVideoEngage(video);
  const isAd = video.mixKind === 'sponsored' || !!video.ad?.destinationUrl;
  const hireHref = video.talent_id
    ? `/m/services/booking/talents/${video.talent_id}`
    : null;
  const description = displayVideoDescription(video.description);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <article className="tt-services-video-card">
      <div className="tt-services-video-player-wrap">
        <video
          ref={videoRef}
          className="tt-services-video-player"
          src={video.video_url}
          poster={video.thumbnail_url || undefined}
          playsInline
          loop
          muted
          onClick={togglePlay}
        />
        <button type="button" className="tt-services-video-play-hint" onClick={togglePlay}>
          {playing ? '⏸' : '▶'}
        </button>
        {isAd && <span className="tt-services-video-ad-badge">โปรโมต</span>}
      </div>

      <div className="tt-services-video-meta">
        <div>
          <p className="tt-services-video-talent">{video.talent_name || 'Talent'}</p>
          {video.title && <h3 className="tt-services-video-title">{video.title}</h3>}
          {description && <p className="tt-hint tt-services-video-desc">{description}</p>}
        </div>

        <div className="tt-services-video-actions">
          <button
            type="button"
            className={`tt-services-video-action${video.liked_by_me ? ' active' : ''}`}
            disabled={!engage || acting}
            onClick={onLike}
          >
            ♥ {formatCount(video.like_count)}
          </button>
          <button
            type="button"
            className="tt-services-video-action"
            disabled={!engage}
            onClick={onOpenComments}
          >
            💬 {formatCount(video.comment_count)}
          </button>
          <button
            type="button"
            className={`tt-services-video-action${video.saved_by_me ? ' active' : ''}`}
            disabled={!engage || acting}
            onClick={onSave}
          >
            🔖 {formatCount(video.save_count)}
          </button>
        </div>

        {hireHref && (
          <Link href={hireHref}>
            <Button type="button" variant="primary" style={{ width: '100%', marginTop: 8 }}>
              จ้างจากคลิปนี้
            </Button>
          </Link>
        )}
        {isAd && video.ad?.destinationUrl && (
          <a
            href={video.ad.destinationUrl}
            className="tt-link-accent"
            style={{ display: 'block', marginTop: 8, textAlign: 'center' }}
          >
            ดูเพิ่มเติม
          </a>
        )}
        {!engage && (
          <p className="tt-hint" style={{ marginTop: 8 }}>
            คลิปตัวอย่าง — ไลค์/บันทึกได้เมื่อเป็นคลิปจาก Talent ในระบบ
          </p>
        )}
      </div>
    </article>
  );
}

function CommentsPanel({
  video,
  onClose,
}: {
  video: TalentVideo;
  onClose: () => void;
}) {
  const { comments, loading, text, setText, submitting, err, submit } = useVideoComments(video.id);

  return (
    <div className="tt-services-video-comments-panel">
      <div className="tt-services-video-comments-head">
        <strong>คอมเมนต์</strong>
        <button type="button" className="tt-merchant-refresh" onClick={onClose}>
          ปิด
        </button>
      </div>
      {loading ? (
        <p className="tt-hint">กำลังโหลด...</p>
      ) : comments.length === 0 ? (
        <p className="tt-hint">ยังไม่มีคอมเมนต์</p>
      ) : (
        <ul className="tt-services-video-comments-list">
          {comments.map((c) => (
            <li key={c.id}>
              <strong>{c.user_name || 'ผู้ใช้'}</strong>
              <p>{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="tt-services-video-comment-form">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="เขียนคอมเมนต์..." />
        <Button type="button" variant="primary" disabled={submitting} onClick={() => void submit()}>
          ส่ง
        </Button>
      </div>
      {err && <p className="tt-error-inline">{err}</p>}
    </div>
  );
}

export function VideoFeedView() {
  const {
    videos,
    loading,
    loadingMore,
    hasMore,
    err,
    actingId,
    loadMore,
    like,
    save,
    reload,
    formatCount,
  } = useVideoFeed();
  const [commentVideo, setCommentVideo] = useState<TalentVideo | null>(null);

  return (
    <div className="tt-services-video-feed">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">Video Feed</h2>
          <p className="tt-hint">ดูคลิปผลงานก่อนตัดสินใจจ้าง</p>
        </div>
        <div className="tt-services-mine-head-actions">
          <Link href="/m/services/video/saved">
            <Button type="button" variant="secondary" style={{ fontSize: '0.85rem' }}>
              คลิปที่บันทึก
            </Button>
          </Link>
          <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
            รีเฟรช
          </button>
        </div>
      </div>

      {err && <p className="tt-error-inline">{err}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลดฟีดวิดีโอ..." />
      ) : videos.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคลิปในฟีด"
          description="Talent สามารถอัปโหลดคลิปผ่านแอปมือถือ"
        />
      ) : (
        <div className="tt-services-video-feed-list">
          {videos.map((v) => (
            <VideoFeedCard
              key={v.id}
              video={v}
              acting={actingId === v.id}
              onLike={() => void like(v)}
              onSave={() => void save(v)}
              onOpenComments={() => setCommentVideo(v)}
              formatCount={formatCount}
            />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <Button
          type="button"
          variant="secondary"
          disabled={loadingMore}
          onClick={loadMore}
          style={{ width: '100%', marginTop: 12 }}
        >
          {loadingMore ? 'กำลังโหลด...' : 'โหลดคลิปเพิ่ม'}
        </Button>
      )}

      {commentVideo && canVideoEngage(commentVideo) && (
        <CommentsPanel video={commentVideo} onClose={() => setCommentVideo(null)} />
      )}

      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        อัปโหลด / โปรโมตคลิป — ใช้แอปมือถือ (Sprint 29+)
      </p>
    </div>
  );
}
