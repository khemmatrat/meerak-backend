/**
 * Video Feed API — Talent Videos (TikTok-style)
 */
import { api } from "./api";
import { adsService } from "./adsService";

export interface TalentVideo {
  id: string;
  talent_id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  duration_seconds?: number;
  created_at: string;
  talent_name?: string;
  talent_avatar?: string;
  talent_grade?: string;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  /** จำนวนเหตุการณ์แชร์ที่บันทึก */
  share_count?: number;
  /** ยอดดูสะสม (dedup รายวันฝั่งเซิร์ฟเวอร์) */
  view_count?: number;
  /** จำนวนผู้บันทึกคลิป */
  save_count?: number;
  saved_by_me?: boolean;
  /** organic | sponsored (injected ad slot) */
  mixKind?: "organic" | "sponsored";
  /** Explicit sponsored media type from feed contract v2 */
  mediaType?: "video" | "image";
  ad?: {
    publicImpressionId: string;
    creativeId?: string;
    campaignId?: string;
    destinationUrl?: string;
    contentKind?: string;
    mediaType?: "video" | "image";
    playbackUrl?: string | null;
    posterUrl?: string | null;
    fallbackImageUrl?: string | null;
    billingMode?: "video_view" | "impression" | "click";
    isHouse?: boolean;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
  };
}

export interface VideoComment {
  id: string;
  text: string;
  created_at: string | null;
  user_name?: string;
  user_avatar?: string;
  parent_id?: string | null;
}

export interface VideoEngagementStats {
  like_count: number;
  comment_count: number;
  share_count: number;
  save_count: number;
  view_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
}

function ensureVisitorIdForViews(): string {
  if (typeof window === "undefined") return "";
  try {
    const k = "aqond_video_visitor_id";
    let v = localStorage.getItem(k);
    if (!v || v.length < 8) {
      v =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
  }
}

export interface FeedResponse {
  videos: TalentVideo[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UploadStatusResponse {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url?: string;
  video?: TalentVideo;
  error_message?: string;
}

async function pollUploadStatus(
  jobId: string,
  maxWaitMs = 12 * 60 * 1000,
): Promise<TalentVideo> {
  const start = Date.now();
  const pollInterval = 2000;
  while (Date.now() - start < maxWaitMs) {
    const status = await videoService.getUploadStatus(jobId);
    if (status.status === "completed" && status.video) {
      return status.video;
    }
    if (status.status === "failed") {
      throw new Error(status.error_message || "การประมวลผลวิดีโอล้มเหลว");
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error("หมดเวลารอการประมวลผล กรุณาลองใหม่");
}

export const videoService = {
  upload: async (
    file: File,
    title?: string,
    description?: string,
    opts?: { onUploadProgress?: (pct: number) => void },
  ) => {
    const formData = new FormData();
    formData.append("video", file);
    if (title) formData.append("title", title);
    if (description) formData.append("description", description);

    const { data } = await api.post<{
      success: boolean;
      job_id?: string;
      video?: TalentVideo;
      status?: string;
      message?: string;
    }>("/videos/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (e) => {
        if (e.total) {
          const pct = Math.round((e.loaded / e.total) * 100);
          (window as any).__videoUploadProgress = pct;
          opts?.onUploadProgress?.(pct);
        }
      },
    });

    // Backend ใหม่: คืน job_id → poll จน completed
    if (data.job_id && data.status === "processing") {
      const video = await pollUploadStatus(data.job_id);
      return { success: true, video, message: data.message };
    }

    // Backward: ถ้าได้ video ตรงๆ (legacy)
    if (data.video) {
      return { success: true, video: data.video, message: data.message };
    }

    return data;
  },

  getUploadStatus: async (jobId: string): Promise<UploadStatusResponse> => {
    const { data } = await api.get<UploadStatusResponse>(
      `/videos/upload-status/${jobId}`,
    );
    return data;
  },

  getFeed: async (
    limit = 20,
    cursor?: string | null,
  ): Promise<FeedResponse> => {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const sid = adsService.getSessionId();
    if (sid) params.sessionId = sid;
    try {
      const { data } = await api.get<FeedResponse>("/videos/feed", {
        params,
      });
      return data;
    } catch (e: any) {
      if (e?.response?.status === 404) {
        console.warn(
          "Video feed API not found (404) — backend อาจยังไม่มี route /api/videos/feed",
        );
        return { videos: [], nextCursor: null, hasMore: false };
      }
      throw e;
    }
  },

  getMyVideos: async () => {
    try {
      const { data } = await api.get<{ videos: TalentVideo[] }>("/videos/my");
      return data.videos ?? [];
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.response?.status === 401) {
        return [];
      }
      throw e;
    }
  },

  /** คลิปของ Talent (public — สำหรับดูโปรไฟล์ย่อย/ExpertView) */
  getVideosByTalent: async (talentId: string): Promise<TalentVideo[]> => {
    try {
      const { data } = await api.get<{ videos: TalentVideo[] }>(
        `/videos/by-talent/${talentId}`,
      );
      return data.videos ?? [];
    } catch (e: any) {
      if (e?.response?.status === 404) return [];
      console.warn("getVideosByTalent failed:", e?.message);
      return [];
    }
  },

  reportVideo: async (videoId: string, reason?: string) => {
    const { data } = await api.post<{ success: boolean; message: string }>(
      `/videos/${videoId}/report`,
      { reason: reason || "" },
    );
    return data;
  },

  blockVideoCreator: async (
    videoId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post<{ success: boolean; message: string }>(
      `/videos/${videoId}/block`,
    );
    return data;
  },

  toggleLike: async (
    videoId: string,
  ): Promise<{ liked: boolean; like_count: number }> => {
    const { data } = await api.post<{ liked: boolean; like_count: number }>(
      `/videos/${videoId}/like`,
    );
    return data;
  },

  getComments: async (videoId: string, limit = 20, cursor?: string | null) => {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const { data } = await api.get<{
      comments: VideoComment[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/videos/${videoId}/comments`, { params });
    return data;
  },

  addComment: async (
    videoId: string,
    text: string,
    parentId?: string | null,
  ): Promise<{ comment: VideoComment; comment_count: number }> => {
    const body: Record<string, string> = { text };
    if (parentId) body.parent_id = parentId;
    const { data } = await api.post<{
      comment: VideoComment;
      comment_count: number;
    }>(`/videos/${videoId}/comments`, body);
    return data;
  },

  /** นับยอดดู — ส่ง visitor_id เมื่อยังไม่ล็อกอิน (dedup รายวัน) */
  recordView: async (
    videoId: string,
    opts?: { visitorId?: string },
  ): Promise<{ success: boolean; counted: boolean; view_count: number }> => {
    const visitor_id = opts?.visitorId ?? ensureVisitorIdForViews();
    const { data } = await api.post<{
      success: boolean;
      counted: boolean;
      view_count: number;
    }>(`/videos/${videoId}/view`, { visitor_id });
    return data;
  },

  /** บันทึกการแชร์ (หลังผู้ใช้แชร์จริง) */
  recordShare: async (
    videoId: string,
    channel: string = "native",
  ): Promise<{ success: boolean; recorded: boolean; share_count: number }> => {
    const { data } = await api.post<{
      success: boolean;
      recorded: boolean;
      share_count: number;
    }>(`/videos/${videoId}/share`, { channel: channel.slice(0, 32) });
    return data;
  },

  /** รายการคลิปที่ผู้ใช้บันทึกไว้ (organic + โปรโมต) */
  listSavedVideos: async (): Promise<TalentVideo[]> => {
    const { data } = await api.get<{ videos: TalentVideo[] }>("/videos/saved");
    return data.videos ?? [];
  },

  /** creative_id ที่บันทึกไว้ — ใช้ mark สถานะในฟีดโปรโมต */
  getSavedPromotedCreativeIds: async (): Promise<string[]> => {
    const { data } = await api.get<{ creativeIds: string[] }>(
      "/videos/saved/promoted-creative-ids",
    );
    return data.creativeIds ?? [];
  },

  /** สลับบันทึกคลิปโปรโมต (snapshot ตาม creative_id) */
  togglePromotedSave: async (
    video: TalentVideo,
  ): Promise<{ saved: boolean; save_count: number; creative_id?: string }> => {
    const { data } = await api.post<{
      saved: boolean;
      save_count: number;
      creative_id?: string;
    }>("/videos/saved/promoted", {
      creative_id: video.ad?.creativeId,
      campaign_id: video.ad?.campaignId,
      title: video.title,
      description: video.description,
      video_url: video.video_url,
      thumbnail_url: video.thumbnail_url,
      destination_url: video.ad?.destinationUrl,
      media_type: video.mediaType || video.ad?.mediaType,
      content_kind: video.ad?.contentKind,
      snapshot: { ad: video.ad },
    });
    return data;
  },

  /** สลับบันทึกคลิป organic (ต้องล็อกอิน) */
  toggleSave: async (
    videoId: string,
  ): Promise<{ saved: boolean; save_count: number }> => {
    const { data } = await api.post<{ saved: boolean; save_count: number }>(
      `/videos/${videoId}/save`,
      {},
    );
    return data;
  },

  /** สถิติรวม + สถานะของฉัน */
  getStats: async (videoId: string): Promise<VideoEngagementStats> => {
    const { data } = await api.get<VideoEngagementStats>(
      `/videos/${videoId}/stats`,
    );
    return data;
  },

  /** โปรโมตคลิปใน Video Feed (หัก wallet) */
  boostVideo: async (
    videoId: string,
    pack: "starter" | "growth" | "pro" = "starter",
  ): Promise<{
    success: boolean;
    campaignId?: string;
    charged?: number;
    message?: string;
    error?: string;
  }> => {
    const { data } = await api.post<{
      success: boolean;
      campaignId?: string;
      charged?: number;
      message?: string;
      error?: string;
    }>(`/videos/${videoId}/boost`, { package: pack });
    return data;
  },
};
