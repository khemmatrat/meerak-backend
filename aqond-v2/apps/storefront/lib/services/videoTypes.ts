/** Video feed types — mirrors mobile/services/videoService.ts */

export type TalentVideo = {
  id: string;
  talent_id: string;
  video_url: string;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  duration_seconds?: number;
  created_at: string | null;
  talent_name?: string | null;
  talent_avatar?: string | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  save_count?: number;
  saved_by_me?: boolean;
  mixKind?: 'organic' | 'sponsored';
  ad?: {
    destinationUrl?: string;
    creativeId?: string;
  };
};

export type VideoComment = {
  id: string;
  text: string;
  created_at: string | null;
  user_name?: string;
  user_avatar?: string;
};

export type VideoFeedResponse = {
  videos: TalentVideo[];
  nextCursor: string | null;
  hasMore: boolean;
};
