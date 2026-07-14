/**
 * Realtime support ticket messages — subscribes to backend Socket.IO room support-ticket:{id}
 */
import { io, type Socket } from "socket.io-client";
import { getBackendBase } from "./api";

export function subscribeSupportTicketRoom(
  ticketId: string,
  jwtToken: string | null | undefined,
  onRefresh: () => void
): () => void {
  if (!ticketId || typeof window === "undefined") {
    return () => {};
  }
  const base = getBackendBase().replace(/\/$/, "");
  const socket: Socket = io(base, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  const onConnect = () => {
    socket.emit("joinSupportTicket", {
      ticketId,
      token: jwtToken || undefined,
    });
  };
  socket.on("connect", onConnect);
  if (socket.connected) onConnect();
  const handler = (p: { ticketId?: string }) => {
    if (p?.ticketId === ticketId) onRefresh();
  };
  socket.on("support_messages_refresh", handler);
  return () => {
    socket.off("connect", onConnect);
    socket.off("support_messages_refresh", handler);
    socket.disconnect();
  };
}
