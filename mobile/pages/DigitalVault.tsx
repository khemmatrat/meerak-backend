import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Package,
  QrCode,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  fetchMyVault,
  loadCachedVault,
  cacheVaultItemsLocally,
  type VaultItemDto,
} from "../services/rescueNetApi";
import { TunzPoweredBy } from "../components/TunzPoweredBy";

function VaultCardSkeleton() {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 animate-pulse">
      <div className="h-4 w-40 rounded bg-white/10 mb-4" />
      <div className="mx-auto h-48 w-48 rounded-2xl bg-white/10 mb-4" />
      <div className="h-10 w-full rounded-2xl bg-white/10" />
    </div>
  );
}

/**
 * Digital Vault — eSIM QR ที่ซื้อแล้ว (สไตล์เดียวกับ AQOND Internet Store)
 */
export type DigitalVaultLocationState = {
  highlightAssetId?: string;
  flashQrDataUrl?: string;
  purchasedName?: string;
};

export const DigitalVault: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  /** true เมื่อ API คืน 404 — มักหมายถึง production ยังไม่ได้ deploy route `/api/v1/telecom/my-vault` */
  const [vaultApiNotDeployed, setVaultApiNotDeployed] = useState(false);
  const [highlightAssetId, setHighlightAssetId] = useState<string | null>(null);
  const [flashPurchase, setFlashPurchase] = useState<{ qr: string; name: string } | null>(null);

  const load = async () => {
    if (!user?.id) return;
    const cached = loadCachedVault(user.id);
    if (cached.length) {
      setItems(cached);
      setFromCache(true);
    }
    setLoading(true);
    setVaultApiNotDeployed(false);
    try {
      const list = await fetchMyVault();
      setItems(list);
      setFromCache(false);
      cacheVaultItemsLocally(user.id, list);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setVaultApiNotDeployed(true);
        notify(
          "เซิร์ฟเวอร์ยังไม่เปิด API Vault (404) — แสดงจากแคชถ้ามี · ต้อง deploy backend ล่าสุดที่ api.aqond.com",
          "info"
        );
      } else {
        notify("โหลด Vault ไม่สำเร็จ — แสดงข้อมูลที่แคชไว้ (ถ้ามี)", "error");
      }
      if (cached.length === 0) setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when user changes
  }, [user?.id]);

  useEffect(() => {
    const st = location.state as DigitalVaultLocationState | null | undefined;
    if (!st || typeof st !== "object") return;
    const hid = st.highlightAssetId;
    const fq = st.flashQrDataUrl;
    if (!hid && !fq) return;
    if (hid) setHighlightAssetId(hid);
    if (fq) {
      setFlashPurchase({ qr: fq, name: st.purchasedName || "eSIM" });
    }
    navigate(".", { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!highlightAssetId || loading) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`vault-card-${highlightAssetId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [highlightAssetId, loading, items.length]);

  return (
    <div className="min-h-screen bg-[#05080c] text-slate-100 pb-28">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[380px] w-[min(100%,480px)] -translate-x-1/2 rounded-full bg-cyan-500/[0.1] blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-indigo-600/[0.07] blur-[80px]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#05080c]/85 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="p-2.5 rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] transition-colors"
            aria-label="กลับ"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">
              <Sparkles size={11} className="text-cyan-300" />
              Vault
            </span>
            <h1 className="text-lg font-bold tracking-tight text-white mt-1 flex items-center gap-2">
              <QrCode className="text-cyan-400 shrink-0" size={22} strokeWidth={2.2} />
              <span className="truncate">Digital Vault</span>
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              QR เปิดใช้ eSIM · แคชไว้ดูได้แม้ออฟไลน์
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="p-2.5 rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] transition-colors shrink-0"
            title="รีเฟรช"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-cyan-400" : ""} />
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 pt-6 space-y-5">
        {flashPurchase && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-flash-title"
          >
            <div className="relative w-full max-w-sm rounded-3xl border border-cyan-500/25 bg-[#0c1220] p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setFlashPurchase(null)}
                className="absolute top-4 right-4 p-2 rounded-xl border border-white/10 text-slate-400 hover:bg-white/10"
                aria-label="ปิด"
              >
                <X size={20} />
              </button>
              <h2 id="vault-flash-title" className="text-lg font-bold text-white pr-10">
                ซื้อสำเร็จ — {flashPurchase.name}
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                สแกน QR เพื่อติดตั้ง eSIM (เก็บเป็นความลับ อย่าแชร์ต่อ)
              </p>
              <div className="flex justify-center rounded-2xl border border-cyan-500/20 bg-white p-4">
                <img
                  src={flashPurchase.qr}
                  alt="QR activation"
                  className="w-44 h-44 object-contain sm:w-48 sm:h-48"
                />
              </div>
              <button
                type="button"
                onClick={() => setFlashPurchase(null)}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 py-3 text-sm font-bold text-slate-950"
              >
                ไปดูใน Vault
              </button>
            </div>
          </div>
        )}

        {vaultApiNotDeployed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-100/95 leading-relaxed">
            <p className="font-semibold text-rose-200">API ไม่พบบนเซิร์ฟเวอร์ (404)</p>
            <p className="mt-1.5 text-rose-100/85">
              โฟลเดอร์โค้ดมี route{" "}
              <code className="rounded bg-black/40 px-1 py-0.5 text-[10px] text-cyan-300/90">
                GET /api/v1/telecom/my-vault
              </code>{" "}
              แล้ว แต่เครื่องที่{" "}
              <code className="text-[10px]">api.aqond.com</code> ยังไม่ได้รัน backend เวอร์ชันนี้ — ให้ SSH
              ไปที่เซิร์ฟเวอร์ แล้ว{" "}
              <span className="font-medium text-white">git pull + restart node</span> (pm2/systemd)
            </p>
          </div>
        )}

        {fromCache && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-950/25 px-4 py-3 text-xs text-amber-100/95 leading-relaxed">
            <span className="font-semibold text-amber-200">แสดงจากแคชล่าสุด</span>
            — เชื่อมต่อเน็ตแล้วกดรีเฟรชเพื่อซิงก์ล่าสุด
          </div>
        )}

        <Link
          to="/rescue-net"
          className="flex items-center justify-between gap-3 rounded-3xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-slate-900/40 px-4 py-4 hover:border-cyan-400/35 transition-colors group"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
              <Radio size={20} className="text-cyan-300" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white group-hover:text-cyan-50 transition-colors">
                ซื้อแพ็กเกจเพิ่ม
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                ไปหน้า AQOND Internet Store
              </span>
            </span>
          </span>
          <span className="text-cyan-400/80 text-sm font-medium shrink-0">เปิด</span>
        </Link>

        {loading && items.length === 0 && (
          <div className="space-y-4 pt-2">
            <VaultCardSkeleton />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Package className="text-slate-500" size={32} />
            </div>
            <p className="text-slate-300 font-medium">ยังไม่มี eSIM ใน Vault</p>
            <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
              ซื้อแพ็กเกจจาก Internet Store แล้ว QR จะปรากฏที่นี่ทันที
            </p>
            <Link
              to="/rescue-net"
              className="inline-flex items-center justify-center gap-2 mt-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-900/30"
            >
              <Zap size={18} />
              เลือกแพ็กเกจ
            </Link>
          </div>
        )}

        <div className="space-y-5 pb-8">
          {items.map((it) => (
            <article
              key={it.id}
              id={`vault-card-${it.id}`}
              className={`rounded-3xl border bg-gradient-to-b from-white/[0.05] to-transparent p-5 shadow-lg shadow-black/25 transition-[box-shadow] duration-500 ${
                highlightAssetId === it.id
                  ? "border-cyan-400/55 ring-2 ring-cyan-400/35 shadow-cyan-900/20"
                  : "border-white/[0.07]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-cyan-500/90 mb-1">
                    <Shield size={14} className="shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      eSIM
                    </span>
                  </div>
                  <h2 className="font-semibold text-white text-base leading-snug">
                    {it.name || it.sku}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-mono mt-1.5 break-all">{it.sku}</p>
                  {it.orderRef && (
                    <p className="text-xs text-slate-400 mt-2">
                      <span className="text-slate-500">Ref </span>
                      {it.orderRef}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">ชำระแล้ว</p>
                  <p className="text-lg font-bold text-cyan-100 tabular-nums">
                    ฿{Number(it.totalCharged || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {it.activationQrDataUrl && (
                <div className="mt-5 flex justify-center">
                  <div className="rounded-3xl border border-cyan-500/20 bg-white p-4 shadow-inner shadow-black/20 ring-1 ring-white/10">
                    <img
                      src={it.activationQrDataUrl}
                      alt="Activation QR"
                      className="w-44 h-44 object-contain sm:w-48 sm:h-48"
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                {it.activationQrDataUrl && (
                  <a
                    href={it.activationQrDataUrl}
                    download={`aqond-esim-${it.id}.svg`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-900/25 hover:brightness-105 active:scale-[0.99] transition-all"
                  >
                    <Download size={18} />
                    บันทึกรูป QR
                  </a>
                )}
              </div>

              <details className="mt-4 group/details rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-400 list-none flex items-center justify-between">
                  <span>Payload สำรอง (ขั้นสูง)</span>
                  <span className="text-slate-600 group-open/details:text-slate-400">▼</span>
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-all text-[10px] text-slate-500 leading-relaxed max-h-40 overflow-y-auto">
                  {it.activationPayload}
                </pre>
              </details>

              <p className="text-[10px] text-slate-600 mt-4 text-center">
                {it.createdAt ? new Date(it.createdAt).toLocaleString("th-TH") : ""}
              </p>
            </article>
          ))}
        </div>

        {(!loading || items.length > 0) && (
          <TunzPoweredBy className={items.length > 0 ? "pt-2" : "pt-4"} />
        )}

        <p className="text-[10px] text-center text-slate-600 leading-relaxed px-2 max-w-sm mx-auto pb-4">
          เก็บ QR เป็นความลับ · ใช้ติดตั้ง eSIM ตามคำแนะนำผู้ให้บริการ
        </p>
      </main>
    </div>
  );
};

export default DigitalVault;
