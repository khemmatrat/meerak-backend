import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "../services/api";

function buildProviderReroutePath(data?: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("focus", "reroute_invites");
  const ticketId = data?.ticketId || data?.ticket_id;
  const invitationId = data?.invitationId || data?.invitation_id;
  const jobId = data?.jobId || data?.job_id;
  if (ticketId) params.set("ticketId", String(ticketId));
  if (invitationId) params.set("invitationId", String(invitationId));
  if (jobId) params.set("jobId", String(jobId));
  return `/provider/dashboard?${params.toString()}`;
}

function dataFromUrl(url: string): Record<string, string> | null {
  try {
    const normalized = url.replace(/^aqond:\/\//i, "https://app.aqond.local/");
    const u = new URL(normalized);
    const lower = `${u.hostname}${u.pathname}`.toLowerCase();
    if (!lower.includes("provider") && !lower.includes("reroute")) return null;
    return {
      ticketId:
        u.searchParams.get("ticketId") || u.searchParams.get("ticket_id") || "",
      invitationId:
        u.searchParams.get("invitationId") ||
        u.searchParams.get("invitation_id") ||
        "",
      jobId: u.searchParams.get("jobId") || u.searchParams.get("job_id") || "",
    };
  } catch {
    return null;
  }
}

export function ProviderRerouteDeepLinkBridge() {
  const navigate = useNavigate();

  const reportOpened = (
    data?: Record<string, string>,
    source = "push_open",
  ) => {
    const ticketId = data?.ticketId || data?.ticket_id;
    const invitationId = data?.invitationId || data?.invitation_id;
    if (!ticketId || !invitationId) return;
    void api
      .post("/support/provider/reroute-invitations/opened", {
        ticketId,
        invitationId,
        jobId: data?.jobId || data?.job_id || null,
        source,
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    const handlers: Array<{ remove: () => Promise<void> }> = [];
    let cancelled = false;

    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        const h1 = await CapApp.addListener("appUrlOpen", ({ url }) => {
          if (cancelled || !url) return;
          const data = dataFromUrl(url);
          if (!data) return;
          reportOpened(data, "app_url_open");
          navigate(buildProviderReroutePath(data));
        });
        handlers.push(h1);

        const { PushNotifications } =
          await import("@capacitor/push-notifications");
        const h2 = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            if (cancelled) return;
            const data = action.notification?.data as
              | Record<string, string>
              | undefined;
            if (
              !data ||
              data.notification_type !== "provider_reroute_invitation"
            ) {
              return;
            }
            reportOpened(data, "push_tap");
            navigate(buildProviderReroutePath(data));
          },
        );
        handlers.push(h2);
      } catch (e) {
        console.warn("[ProviderRerouteDeepLinkBridge]", e);
      }
    })();

    return () => {
      cancelled = true;
      handlers.forEach((h) => h.remove().catch(() => {}));
    };
  }, [navigate]);

  return null;
}
