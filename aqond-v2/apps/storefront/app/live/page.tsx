"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LiveRedirect() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get("room_id") || "demo-room";

  useEffect(() => {
    router.replace(`/m/live/${encodeURIComponent(roomId)}`);
  }, [roomId, router]);

  return <div style={{ padding: 24 }}>กำลังเปิดห้องไลฟ์…</div>;
}

export default function LivePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading live...</div>}>
      <LiveRedirect />
    </Suspense>
  );
}
