/** Metadata สำหรับหน้าโพสต์ใหม่ (สตอรี่ + Video Feed) */
export type PostDestination = "story" | "feed";

export interface PostPollDraft {
  question: string;
  optionA: string;
  optionB: string;
}

export interface PostMusicDraft {
  trackId: string;
  title: string;
  artist?: string;
}

export interface PostComposeExtras {
  caption: string;
  conversationTopic?: string;
  poll?: PostPollDraft | null;
  music?: PostMusicDraft | null;
  taggedPeople?: string[];
  location?: string;
  aiLabel?: boolean;
  /** จากการตั้งค่าแชร์ (ภาพ 4–5) */
  sharing?: PostSharingPrefs;
}

export interface PostSharingPrefs {
  allow_remix_reels: boolean;
  allow_remix_feed: boolean;
  allow_remix_photos: boolean;
  allow_download: boolean;
}

export const DEFAULT_POST_SHARING_PREFS: PostSharingPrefs = {
  allow_remix_reels: true,
  allow_remix_feed: true,
  allow_remix_photos: true,
  allow_download: false,
};

export const SUGGESTED_MUSIC: PostMusicDraft[] = [
  { trackId: "ok-today", title: "It's Okay Today", artist: "Jigooo" },
  { trackId: "sunflower", title: "SUNFLOWER (Beat)", artist: "Beat pack" },
];
