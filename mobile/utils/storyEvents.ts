/** แจ้ง Home / StoryRingsRow ให้โหลด tray ใหม่หลังโพสต์สตอรี่ */
export const STORIES_CHANGED_EVENT = "aqond:stories-changed";
const JUST_POSTED_KEY = "aqond_story_just_posted";

export function notifyStoriesChanged(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(JUST_POSTED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(STORIES_CHANGED_EVENT));
}

export function consumeStoryJustPosted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = sessionStorage.getItem(JUST_POSTED_KEY);
    if (!v) return false;
    sessionStorage.removeItem(JUST_POSTED_KEY);
    return true;
  } catch {
    return false;
  }
}
