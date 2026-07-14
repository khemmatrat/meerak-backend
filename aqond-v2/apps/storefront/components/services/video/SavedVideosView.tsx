'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import { AqondButton as Button, AqondCard as Card } from '@aqond/components';
import { useSavedVideos } from '@/hooks/services/useSavedVideos';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function SavedVideosView() {
  const { videos, loading, err, userId, reload } = useSavedVideos();

  if (!userId) {
    return (
      <div className="tt-services-video-saved">
        <EmptyState title="เข้าสู่ระบบก่อน" description="บันทึกและดูคลิปที่ชอบได้หลังล็อกอิน" />
        <div className="tt-services-empty-actions">
          <Link href="/m/login">
            <Button type="button" variant="primary">
              เข้าสู่ระบบ
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-services-video-saved">
      <div className="tt-services-detail-head">
        <Link href="/m/services/video" className="tt-services-back-link">
          ‹ Video Feed
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <h2 className="tt-services-match-title">คลิปที่บันทึก</h2>
      {err && <p className="tt-error-inline">{err}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลด..." />
      ) : videos.length === 0 ? (
        <EmptyState title="ยังไม่มีคลิปที่บันทึก" description="กดบุ๊กมาร์กในฟีดเพื่อเก็บไว้ดูภายหลัง" />
      ) : (
        <ul className="tt-services-video-saved-grid">
          {videos.map((v) => (
            <li key={v.id}>
              <Card className="tt-services-video-saved-card">
                {v.thumbnail_url || v.video_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnail_url || v.video_url}
                    alt=""
                    className="tt-services-video-saved-thumb"
                  />
                ) : (
                  <div className="tt-services-video-saved-thumb tt-services-video-saved-placeholder">
                    🎬
                  </div>
                )}
                <p className="tt-services-video-title">{v.title || v.talent_name || 'คลิป'}</p>
                {v.talent_id && (
                  <Link href={`/m/services/booking/talents/${v.talent_id}`} className="tt-link-accent">
                    จ้าง Talent →
                  </Link>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
