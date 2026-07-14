import {
  DEFAULT_POST_SHARING_PREFS,
  type PostComposeExtras,
  type PostSharingPrefs,
} from "../types/postCompose";

const PREFS_KEY = "aqond_post_sharing_prefs_v1";
const INFO_SEEN_KEY = "aqond_post_sharing_info_seen_v1";

export function loadPostSharingPrefs(): PostSharingPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_POST_SHARING_PREFS };
    return { ...DEFAULT_POST_SHARING_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_POST_SHARING_PREFS };
  }
}

export function savePostSharingPrefs(prefs: PostSharingPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function hasSeenSharingInfoModal(): boolean {
  return localStorage.getItem(INFO_SEEN_KEY) === "1";
}

export function markSharingInfoModalSeen(): void {
  localStorage.setItem(INFO_SEEN_KEY, "1");
}

export function buildStoryBackgroundStyle(extras: {
  poll?: PostComposeExtras["poll"];
  music?: PostComposeExtras["music"];
  conversationTopic?: string;
  taggedPeople?: string[];
  location?: string;
  aiLabel?: boolean;
  sharing?: PostSharingPrefs;
  bg?: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (extras.bg) out.bg = extras.bg;
  if (extras.poll?.question) out.poll = extras.poll;
  if (extras.music) out.music = extras.music;
  if (extras.conversationTopic)
    out.conversation_topic = extras.conversationTopic;
  if (extras.taggedPeople?.length) out.tagged_people = extras.taggedPeople;
  if (extras.location) out.location = extras.location;
  if (extras.aiLabel) out.ai_label = true;
  if (extras.sharing) out.sharing = extras.sharing;
  return out;
}
