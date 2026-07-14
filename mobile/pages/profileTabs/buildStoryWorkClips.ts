import type { UserProfile } from "../../types";

export const STORY_CLIP_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

export interface StoryClipItem {
  id: string;
  url: string;
  title?: string;
  description?: string;
}

/**
 * Matches clip merge semantics previously inlined in Profile Story tab:
 * greeting → backend uploads → legacy profile clips → portfolio video URLs
 */
export function buildStoryWorkClips(
  profile: UserProfile | null,
  backendWorkClips: {
    id: string;
    url: string;
    title?: string;
    description?: string;
  }[],
  profileWorkClips: { id: string; url: string; type?: string }[],
): StoryClipItem[] {
  const clips: StoryClipItem[] = [];
  const seen = new Set<string>();
  if (!profile) return clips;

  const greeting = profile.greeting_video_url;
  if (greeting && !seen.has(greeting)) {
    clips.push({ id: "greeting", url: greeting, title: "Greeting" });
    seen.add(greeting);
  }

  backendWorkClips.forEach((c) => {
    if (c.url && !seen.has(c.url)) {
      clips.push({
        id: c.id,
        url: c.url,
        title: c.title,
        description: c.description,
      });
      seen.add(c.url);
    }
  });

  profileWorkClips.forEach((c) => {
    if (c.url && !seen.has(c.url)) {
      clips.push({ id: c.id, url: c.url });
      seen.add(c.url);
    }
  });

  (profile.portfolio_urls || []).forEach((url: string, i: number) => {
    if (
      typeof url === "string" &&
      STORY_CLIP_VIDEO_EXT.test(url) &&
      !seen.has(url)
    ) {
      clips.push({ id: `portfolio-${i}`, url });
      seen.add(url);
    }
  });

  return clips;
}
