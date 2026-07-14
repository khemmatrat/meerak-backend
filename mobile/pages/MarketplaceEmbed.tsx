import React, { useMemo, useCallback, useEffect } from "react";
import { ChevronLeft, Home } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildMarketplaceHandoffUrl, marketplacePath } from "../services/marketplaceHandoff";
import { LuxuryStoreIcon } from "../components/LuxuryStoreIcon";

const DEFAULT_PATH = "/m/home?ftx=1";

function titleForPath(safePath: string): string {
  if (safePath.startsWith("/m/food")) return "สั่งอาหาร";
  if (safePath.startsWith("/m/merchant")) return "หลังบ้านร้าน";
  if (safePath.startsWith("/m/rider")) return "ส่งของ";
  if (safePath.startsWith("/m/sell")) return "ลงขาย";
  if (safePath.startsWith("/m/cart")) return "รถเข็น";
  return "ช้อป Marketplace";
}

/**
 * Embeds aqond-v2 storefront — chrome matches mobile nav-glass (white + emerald).
 */
export const MarketplaceEmbed: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawPath = params.get("p") || params.get("path") || DEFAULT_PATH;
  const safePath = useMemo(() => marketplacePath(rawPath), [rawPath]);
  const src = useMemo(() => buildMarketplaceHandoffUrl(safePath), [safePath]);
  const title = titleForPath(safePath);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "aqond:go-home") navigate("/");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }, [navigate]);

  const goHome = useCallback(() => navigate("/"), [navigate]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#ecfdf5] font-sans">
      <header
        className="shrink-0 safe-area-top bg-white border-b border-emerald-100"
        style={{
          boxShadow: "0 2px 8px rgba(5, 150, 105, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-0.5 pl-1 pr-2 py-1.5 rounded-xl text-slate-600 hover:bg-emerald-50 active:scale-95 transition-transform"
            aria-label="กลับ"
          >
            <ChevronLeft size={22} strokeWidth={2.5} className="text-emerald-700" />
            <span className="text-sm font-medium text-slate-700">กลับ</span>
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center -ml-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(145deg, #fffefb 0%, #f5ecd8 100%)',
                boxShadow: '0 2px 8px rgba(139, 105, 20, 0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
              }}
            >
              <LuxuryStoreIcon size={28} />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-slate-900 truncate leading-tight tracking-tight">{title}</p>
              <p className="text-[10px] text-emerald-700/80 truncate font-medium">AQOND Marketplace</p>
            </div>
          </div>

          <button
            type="button"
            onClick={goHome}
            className="flex flex-col items-center justify-center min-w-[48px] py-1 px-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:scale-95 transition-all"
            aria-label="หน้าหลักแอป"
          >
            <Home size={18} strokeWidth={2.5} />
            <span className="text-[10px] font-semibold mt-0.5 leading-none">หน้าหลัก</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden bg-[#ecfdf5]">
        <iframe
          title={title}
          src={src}
          className="w-full h-full border-0 bg-[#ecfdf5]"
          allow="geolocation; clipboard-write; payment"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
};

export default MarketplaceEmbed;
