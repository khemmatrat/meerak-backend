import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "components", "Layout.tsx");

let s = fs.readFileSync(p, "utf8");

s = s.replace(
  `import React, { useEffect, useState } from "react";`,
  `import React, { useEffect, useMemo, useRef, useState } from "react";`,
);

s = s.replace(
  `import { UserRole, UserNotification } from "../types";`,
  `import { UserRole, UserNotification } from "../types";
import { playNotificationChime } from "../utils/notificationChime";
import {
  getJobIdFromNotificationPayload,
  shouldOpenJobChatForNotification,
} from "../utils/notificationDeepLink";`,
);

s = s.replace(
  `  const [adminNotifications, setAdminNotifications] = useState<
    { id: string; title: string; message: string; sentAt: string }[]
  >([]);`,
  `  const [adminNotifications, setAdminNotifications] = useState<
    {
      id: string;
      title: string;
      message: string;
      sentAt: string;
      source?: string;
      notificationType?: string;
      jobId?: string | null;
      data?: Record<string, unknown> | null;
    }[]
  >([]);`,
);

const OLD_MERGED = `  const mergedNotifications: UserNotification[] = [
    ...adminNotifications.map((a) => ({
      id: a.id,
      user_id: undefined,
      title: a.title,
      message: a.message,
      type: "admin_broadcast" as const,
      is_read: true,
      created_at: a.sentAt,
    })),
    ...notifications,
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const handleLogout = () => {`;

const NEW_MERGED = `  const mergedNotifications: UserNotification[] = useMemo(() => {
    const fromLatestApi = adminNotifications.map((a): UserNotification => {
      const resolvedJobId =
        a.source === "postgres"
          ? getJobIdFromNotificationPayload({
              jobId: a.jobId ?? null,
              notificationType: a.notificationType,
              data: a.data ?? null,
            })
          : null;
      if (resolvedJobId) {
        const openChat = shouldOpenJobChatForNotification({
          notificationType: a.notificationType,
          data: a.data ?? null,
          source: a.source,
        });
        return {
          id: a.id,
          title: a.title,
          message: a.message,
          type: "system" as const,
          is_read: false,
          created_at: a.sentAt,
          related_id: resolvedJobId,
          data: {
            fromPostgres: true,
            openJobChat: openChat,
            notificationType: a.notificationType,
          },
        };
      }
      return {
        id: a.id,
        title: a.title,
        message: a.message,
        type: "admin_broadcast" as const,
        is_read: true,
        created_at: a.sentAt,
      };
    });
    return [...fromLatestApi, ...notifications].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [adminNotifications, notifications]);

  const latestBellIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) {
      latestBellIdRef.current = null;
      return;
    }
    const topId = mergedNotifications[0]?.id;
    if (!topId) return;
    if (latestBellIdRef.current === null) {
      latestBellIdRef.current = topId;
      return;
    }
    if (topId === latestBellIdRef.current) return;
    latestBellIdRef.current = topId;

    const wantSound =
      user.notifications_enabled !== false && !isPeaceMode;
    const vis =
      typeof document !== "undefined" ? document.visibilityState : "hidden";
    // #region agent log
    fetch(
      "http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "1d8d58",
        },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "notif-verify",
          hypothesisId: "H-chime-topid",
          location: "Layout.tsx:merged-chime-effect",
          message: "Bell latest id changed; chime eligibility",
          data: {
            topId,
            wantSound,
            peaceMode: !!isPeaceMode,
            visibility: vis,
            willPlay: wantSound && vis === "visible",
          },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion
    if (wantSound && vis === "visible") playNotificationChime();
  }, [mergedNotifications, user?.id, user?.notifications_enabled, isPeaceMode]);

  const handleLogout = () => {`;

if (!s.includes(OLD_MERGED)) {
  console.error("patch-layout: OLD_MERGED block not found");
  process.exit(1);
}
s = s.replace(OLD_MERGED, NEW_MERGED);

const OLD_CLICK = `  const handleNotifClick = async (n: UserNotification) => {
    if (n.type === "admin_broadcast") {
      setShowNotifDropdown(false);
      return;
    }
    await MockApi.markNotificationRead(n.id);
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === n.id ? { ...item, is_read: true } : item,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    setShowNotifDropdown(false);
    if (n.related_id) navigate(\`/jobs/\${n.related_id}\`);
  };`;

const NEW_CLICK = `  const handleNotifClick = async (n: UserNotification) => {
    if (n.type === "admin_broadcast") {
      setShowNotifDropdown(false);
      return;
    }
    // #region agent log
    fetch(
      "http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "1d8d58",
        },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "notif-verify",
          hypothesisId: "H-click-nav",
          location: "Layout.tsx:handleNotifClick",
          message: "Notification row clicked",
          data: {
            type: n.type,
            related_id: n.related_id,
            job_id: n.job_id,
            openJobChat: !!n.data?.openJobChat,
            fromPostgres: !!n.data?.fromPostgres,
          },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion
    if (!n.data?.fromPostgres) {
      await MockApi.markNotificationRead(n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, is_read: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setShowNotifDropdown(false);

    const jobId = String(n.related_id || n.job_id || "").trim() || "";
    const openChat = n.data?.openJobChat === true;
    // #region agent log
    fetch(
      "http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "1d8d58",
        },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "notif-verify",
          hypothesisId: "H-click-nav-result",
          location: "Layout.tsx:handleNotifClick:after-parse",
          message: "Navigate target derived",
          data: { jobId: jobId ? "[set]" : "", openChat },
          timestamp: Date.now(),
        }),
      },
    ).catch(() => {});
    // #endregion
    if (!jobId) return;
    navigate(openChat ? \`/jobs/\${jobId}#chat\` : \`/jobs/\${jobId}\`);
  };`;

if (!s.includes(OLD_CLICK)) {
  console.error("patch-layout: OLD_CLICK block not found");
  process.exit(1);
}
s = s.replace(OLD_CLICK, NEW_CLICK);

const outNext = `${p}.next`;
try {
  fs.writeFileSync(p, s);
  console.log("Layout.tsx patched OK");
} catch (e) {
  if (e && e.code === "EPERM") {
    fs.writeFileSync(outNext, s);
    console.warn(
      "Could not overwrite Layout.tsx (file locked). Wrote:",
      outNext,
      "- close Layout.tsx in the IDE and replace manually.",
    );
  } else throw e;
}
