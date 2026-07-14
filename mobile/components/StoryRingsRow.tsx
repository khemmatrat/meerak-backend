import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  STORIES_CHANGED_EVENT,
  consumeStoryJustPosted,
} from "../utils/storyEvents";
import { Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { storyService, type StoryTrayItem } from "../services/storyService";
import { resolveStoryViewerUserId } from "../utils/storyUserId";

function ringClass(hasUnseen: boolean, isOwn: boolean, ownHasStory: boolean) {
  if (isOwn) {
    return ownHasStory
      ? "bg-gradient-to-tr from-fuchsia-500 via-rose-500 to-amber-400 p-[2.5px]"
      : "bg-gradient-to-tr from-slate-400 via-slate-500 to-slate-600 p-[2.5px]";
  }
  if (hasUnseen) {
    return "bg-gradient-to-tr from-fuchsia-500 via-rose-500 to-amber-400 p-[2.5px]";
  }
  return "bg-slate-500/60 p-[2px]";
}

function AvatarCircle({
  src,
  name,
  size = 64,
}: {
  src?: string | null;
  name?: string;
  size?: number;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="rounded-full object-cover bg-slate-800"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

export const StoryRingsRow: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tray, setTray] = useState<StoryTrayItem[]>([]);
  const [hasOwnStory, setHasOwnStory] = useState(() =>
    consumeStoryJustPosted(),
  );
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trayError, setTrayError] = useState(false);
  const ownStoryUserId = resolveStoryViewerUserId(viewerId, user?.id);

  const openOwnStory = () => {
    if (!hasOwnStory) {
      navigate("/post/create?type=story");
      return;
    }
    const id = ownStoryUserId.trim();
    if (!id) {
      navigate("/post/create?type=story");
      return;
    }
    navigate(`/stories/view/${encodeURIComponent(id)}`, {
      state: { userName: user?.name || user?.email },
    });
  };

  const openUserStory = (item: StoryTrayItem) => {
    navigate(`/stories/view/${encodeURIComponent(item.user_id)}`, {
      state: {
        userName: item.user_name,
      },
    });
  };

  const load = useCallback(async () => {
    if (!user?.id) {
      setTray([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setTrayError(false);
    try {
      const data = await storyService.getTray();
      setTray(data.tray || []);
      setHasOwnStory(!!data.has_own_story);
      if (data.viewer_id) setViewerId(String(data.viewer_id));
    } catch {
      setTray([]);
      setTrayError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    const onStoriesChanged = () => {
      setHasOwnStory(true);
      void load();
    };
    window.addEventListener(STORIES_CHANGED_EVENT, onStoriesChanged);
    return () => {
      clearInterval(iv);
      window.removeEventListener(STORIES_CHANGED_EVENT, onStoriesChanged);
    };
  }, [load]);

  useEffect(() => {
    if (location.pathname === "/") void load();
  }, [location.pathname, load]);

  if (!user?.id) return null;

  const innerSize = 58;

  return (
    <section className="luxury-card rounded-2xl px-3 py-3 border border-white/5">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-sm font-semibold text-slate-200">สตอรี่</p>
        <Link
          to="/post/create?type=story"
          className="text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200"
        >
          โพสต์ใหม่
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
        <button
          type="button"
          onClick={openOwnStory}
          className="flex flex-col items-center gap-1 shrink-0 w-[72px]"
        >
          <div className={ringClass(false, true, hasOwnStory)}>
            <div className="relative rounded-full bg-slate-900 p-[2px]">
              <AvatarCircle
                src={user.avatar_url || user.avatarUrl}
                name={user.name || user.email}
                size={innerSize}
              />
              {!hasOwnStory ? (
                <span className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-1 border-2 border-slate-900">
                  <Plus size={14} className="text-white" strokeWidth={3} />
                </span>
              ) : null}
            </div>
          </div>
          <span className="text-[11px] text-slate-300 truncate w-full text-center">
            {hasOwnStory ? "สตอรี่ของคุณ" : "เพิ่มสตอรี่"}
          </span>
        </button>

        {loading && tray.length === 0 ? (
          <div className="flex items-center text-xs text-slate-500 px-2">
            กำลังโหลด...
          </div>
        ) : null}
        {trayError ? (
          <p className="text-xs text-amber-300/90 px-2 self-center">
            โหลดสตอรี่ไม่สำเร็จ — ดึงลงเพื่อรีเฟรช
          </p>
        ) : null}

        {tray
          .filter((t) => t.user_id !== ownStoryUserId)
          .map((item) => (
            <button
              key={item.user_id}
              type="button"
              onClick={() => openUserStory(item)}
              className="flex flex-col items-center gap-1 shrink-0 w-[72px]"
            >
              <div className={ringClass(item.has_unseen, false, false)}>
                <div className="rounded-full bg-slate-900 p-[2px]">
                  <AvatarCircle
                    src={item.user_avatar}
                    name={item.user_name}
                    size={innerSize}
                  />
                </div>
              </div>
              <span className="text-[11px] text-slate-300 truncate w-full text-center">
                {item.user_name}
              </span>
            </button>
          ))}
      </div>
    </section>
  );
};
