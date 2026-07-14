import React, { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

export function ReferralLinkGate() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const raw =
      params.code ||
      searchParams.get("ref") ||
      searchParams.get("referral") ||
      "";
    const code = String(raw).trim().toUpperCase();
    if (code) {
      try {
        localStorage.setItem("referral_code", code);
      } catch {
        /* ignore */
      }
      navigate(`/register?ref=${encodeURIComponent(code)}`, { replace: true });
      return;
    }
    navigate("/register", { replace: true });
  }, [navigate, params.code, searchParams]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center text-slate-600">
      กำลังเปิดแอป…
    </div>
  );
}
