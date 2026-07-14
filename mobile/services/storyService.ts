/**
 * User Stories API — 24h ephemeral
 */
import { api } from "./api";
import { prepareStoryUploadFile } from "../utils/storyMediaPrep";
import { cacheUserStories } from "../utils/storyCache";
import { adsService } from "./adsService";

export interface StoryTrayItem {
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  story_count: number;
  has_unseen: boolean;
  latest_at: string | null;
}

export interface UserStory {
  id: string;
  user_id: string;
  media_type: "text" | "image" | "video";
  media_url: string | null;
  text_overlay: string | null;
  background_style: Record<string, unknown>;
  expires_at: string | null;
  created_at: string | null;
  user_name?: string | null;
  user_avatar?: string | null;
  viewed_by_me?: boolean;
  mixKind?: "organic" | "sponsored";
  ad?: {
    publicImpressionId: string;
    creativeId?: string;
    campaignId?: string;
    destinationUrl?: string;
    contentKind?: string;
    isHouse?: boolean;
  };
}

export interface StoryTrayResponse {
  tray: StoryTrayItem[];
  has_own_story: boolean;
  viewer_id: string;
}

export interface UserStoriesResponse {
  user: {
    user_id: string;
    user_name?: string | null;
    user_avatar?: string | null;
  } | null;
  stories: UserStory[];
}

export const storyService = {
  async getTray(): Promise<StoryTrayResponse> {
    const res = await api.get<StoryTrayResponse>("/stories/tray", {
      timeout: 10000,
    });
    return res.data;
  },

  async getUserStories(userId: string): Promise<UserStoriesResponse> {
    const sessionId = adsService.getSessionId();
    const res = await api.get<UserStoriesResponse>(
      `/stories/user/${encodeURIComponent(userId)}`,
      {
        timeout: 10000,
        // ใช้ query แทน X-Session-Id header — หลีกเลี่ยง CORS preflight ที่ api.aqond.com ยังไม่อนุญาต header นี้
        params: sessionId ? { sessionId } : undefined,
      },
    );
    if (res.data?.stories?.length) {
      cacheUserStories(userId, res.data.stories);
    }
    return res.data;
  },

  async createStory(params: {
    file?: File | Blob;
    mediaType?: "text" | "image" | "video";
    textOverlay?: string;
    backgroundStyle?: Record<string, unknown>;
    filename?: string;
  }): Promise<{ story: UserStory }> {
    const fd = new FormData();
    if (params.file) {
      const prepared = await prepareStoryUploadFile(
        params.file,
        params.mediaType,
      );
      fd.append("media", prepared.blob, prepared.filename);
    }
    if (params.mediaType) fd.append("media_type", params.mediaType);
    if (params.textOverlay) fd.append("text_overlay", params.textOverlay);
    if (params.backgroundStyle) {
      fd.append("background_style", JSON.stringify(params.backgroundStyle));
    }
    const res = await api.post<{ story: UserStory }>("/stories", fd, {
      timeout: 300000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return res.data;
  },

  async recordView(storyId: string): Promise<void> {
    await api.post(
      `/stories/${encodeURIComponent(storyId)}/view`,
      {},
      {
        timeout: 8000,
      },
    );
  },

  async deleteStory(storyId: string): Promise<void> {
    await api.delete(`/stories/${encodeURIComponent(storyId)}`, {
      timeout: 8000,
    });
  },
};
