import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  FileText,
  Globe2,
  Lock,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  fetchEsimPackages,
  purchaseEsim,
  type EsimPackageDto,
} from "../services/rescueNetApi";
import { getEsimSupportHint } from "../utils/esimCompatibility";
import { TunzPoweredBy } from "../components/TunzPoweredBy";
import { EsimPackageSortBar } from "../components/EsimPackageSortBar";
import type { EsimSortKey } from "../utils/esimPackageSort";
import { sortEsimPackages } from "../utils/esimPackageSort";
import { EsimPurchaseConfirmModal } from "../components/EsimPurchaseConfirmModal";
import { parseEsimPurchaseError } from "../utils/esimPurchaseErrors";

function PackageSkeleton() {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 animate-pulse">
      <div className="h-4 w-24 rounded bg-white/10 mb-4" />
      <div className="h-12 w-20 rounded-lg bg-white/10 mb-3" />
      <div className="h-3 w-full rounded bg-white/5 mb-2" />
      <div className="h-10 w-full rounded-2xl bg-white/10 mt-4" />
    </div>
  );
}

/**
 * AQOND Internet — eSIM packages (GigaStore / Tunz). Browse without login; purchase via Wallet.
 */
export const RescueNetLanding: React.FC = () => {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [packages, setPackages] = useState<EsimPackageDto[]>([]);
  const [source, setSource] = useState<string | undefined>();
  const [pricingNote, setPricingNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openDetailSku, setOpenDetailSku] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<EsimSortKey>("gb_asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [catalogNonce, setCatalogNonce] = useState(0);
  const [confirmPkg, setConfirmPkg] = useState<EsimPackageDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const hint = getEsimSupportHint();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (catalogNonce === 0) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetchEsimPackages();
        if (!cancelled) {
          setPackages(res.packages);
          setSource(res.source);
          setPricingNote(res.pricingNote);
        }
      } catch {
        if (!cancelled) {
          setPackages([]);
          setSource(undefined);
          setPricingNote(undefined);
          notify("โหลดแพ็กเกจไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ backend", "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + manual refresh via catalogNonce
  }, [catalogNonce]);

  const regionOptions = useMemo(() => {
    const u = new Set<string>();
    packages.forEach((p) => {
      if (p.region) u.add(p.region);
    });
    return [...u].sort((a, b) => a.localeCompare(b, "th"));
  }, [packages]);

  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return packages.filter((p) => {
      if (regionFilter && p.region !== regionFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    });
  }, [packages, searchQuery, regionFilter]);

  const sortedPackages = useMemo(
    () => sortEsimPackages(filteredPackages, sortKey),
    [filteredPackages, sortKey]
  );

  const liveFromPortal = source === "gigastore";

  const onBuyClick = (p: EsimPackageDto) => {
    if (!isAuthenticated || !user) {
      notify("เข้าสู่ระบบเพื่อชำระผ่าน Wallet", "info");
      navigate("/login", { state: { from: { pathname: "/rescue-net" } } });
      return;
    }
    setConfirmPkg(p);
    setConfirmOpen(true);
  };

  const executePurchase = async () => {
    if (!confirmPkg) return;
    const pkgName = confirmPkg.name;
    setConfirmLoading(true);
    try {
      const data = await purchaseEsim(confirmPkg.sku);
      await refreshUser();
      setConfirmOpen(false);
      setConfirmPkg(null);
      notify("ซื้อสำเร็จ — เปิด QR ใน Vault แล้ว", "success");
      navigate("/digital-vault", {
        state: {
          highlightAssetId: data.assetId,
          flashQrDataUrl: data.activationQrDataUrl,
          purchasedName: pkgName,
        },
      });
    } catch (e: unknown) {
      const parsed = parseEsimPurchaseError(e);
      if (parsed.insufficient) {
        const need = parsed.required ?? confirmPkg.totalCustomerPrice;
        notify(
          `${parsed.message} — ต้องการประมาณ ฿${Number(need).toLocaleString()} · ไปเติม Wallet จากโปรไฟล์ (เมนู Wallet)`,
          "error"
        );
      } else {
        notify(parsed.message, "error");
      }
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05080c] text-slate-100">
      <EsimPurchaseConfirmModal
        open={confirmOpen}
        variant="store"
        pkg={confirmPkg}
        walletBalance={user?.wallet_balance ?? 0}
        loading={confirmLoading}
        onClose={() => {
          if (confirmLoading) return;
          setConfirmOpen(false);
          setConfirmPkg(null);
        }}
        onConfirm={executePurchase}
      />

      {/* ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[min(100%,520px)] -translate-x-1/2 rounded-full bg-cyan-500/[0.12] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-indigo-600/[0.08] blur-[80px]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#05080c]/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="p-2.5 rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] transition-colors"
            aria-label="กลับ"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">
                <Sparkles size={11} className="text-cyan-300" />
                Internet
              </span>
              {!loading && liveFromPortal && (
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-300/95">
                  GigaStore live
                </span>
              )}
              {!loading && !liveFromPortal && packages.length > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-slate-400">
                  Demo catalog
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white mt-1 truncate">
              AQOND Internet Store
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              แพ็กเกจข้อมูล · eSIM · ชำระผ่าน Wallet
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 pt-6 pb-32 space-y-8">
        {/* Hero */}
        <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-[#0c1220] to-slate-950/90 p-6 shadow-2xl shadow-black/40 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="relative">
            <h2 className="text-2xl sm:text-[1.65rem] font-bold text-white leading-tight tracking-tight">
              เน็ตสำรอง
              <br />
              <span className="bg-gradient-to-r from-cyan-200 to-sky-400 bg-clip-text text-transparent">
                พร้อมใช้ทันที
              </span>
            </h2>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-[32ch]">
              เลือกแพ็กเกจ ชำระด้วย Wallet รับ QR ติดตั้ง eSIM — เหมาะเมื่อต้องการข้อมูลสำรองหรือสายหลักมีปัญหา
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                <Wifi size={14} className="text-cyan-400" />
                เปิดใช้เร็ว
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                <Globe2 size={14} className="text-cyan-400" />
                ครอบคลุมหลายโซน
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                <Lock size={14} className="text-cyan-400" />
                ชำระในแอป
              </span>
            </div>
          </div>
        </section>

        {/* Emergency notice — refined */}
        <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-4 py-3.5 flex gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={22} strokeWidth={2} />
          <div>
            <p className="font-semibold text-amber-100 text-sm">หมายเหตุ</p>
            <p className="text-xs text-amber-200/75 mt-1 leading-relaxed">
              บริการนี้เป็นแพ็กเกจข้อมูลสำรอง ไม่ใช่การรับประกันการเชื่อมต่อในทุกพื้นที่ — ตรวจสอบความเข้ากันได้ของเครื่องด้านล่าง
            </p>
          </div>
        </section>

        {/* Policies & support */}
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 text-slate-200 font-medium mb-3">
            <FileText size={18} className="text-cyan-400" />
            ข้อกำหนด · การคืนเงิน · ความช่วยเหลือ
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            การซื้อ eSIM เป็นไปตามนโยบายแพลตฟอร์ม — อ่านก่อนตัดสินใจเพื่อลดความเสี่ยงด้านความคาดหวังและการคืนเงิน
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/legal?type=refund"
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            >
              นโยบายคืนเงิน
            </Link>
            <Link
              to="/legal?type=terms"
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            >
              ข้อกำหนดการใช้บริการ
            </Link>
            <Link
              to="/legal?type=liability_limitation"
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            >
              ข้อจำกัดความรับผิด
            </Link>
            <Link
              to="/settings"
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            >
              ติดต่อ / ตั้งค่า
            </Link>
            <Link
              to="/tutorial-hub"
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            >
              ศูนย์ช่วยเหลือ
            </Link>
          </div>
        </section>

        {/* Compatibility */}
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 text-slate-200 font-medium mb-2">
            <Radio size={18} className="text-cyan-400" />
            ความพร้อมของเครื่อง
          </div>
          <p className="text-sm text-slate-300/95 leading-relaxed">{hint.detail}</p>
          <p className="text-[11px] text-slate-500 mt-3">
            ระดับประมาณการ: <span className="text-slate-400">{hint.level}</span>
          </p>
        </section>

        {isAuthenticated && (
          <Link
            to="/digital-vault"
            className="flex items-center justify-between rounded-3xl border border-emerald-500/25 bg-emerald-950/25 px-5 py-4 text-emerald-50 hover:bg-emerald-950/40 transition-colors"
          >
            <span className="flex items-center gap-2 font-semibold text-sm">
              <Shield size={18} /> Digital Vault
            </span>
            <span className="text-xs text-emerald-300/80">QR ที่ซื้อแล้ว</span>
          </Link>
        )}

        {isAuthenticated && user && (
          <div className="flex items-center justify-between rounded-3xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
            <span className="flex items-center gap-2 text-slate-300 text-sm font-medium">
              <Wallet size={18} className="text-cyan-400" /> Wallet
            </span>
            <span className="text-xl font-bold text-white tabular-nums tracking-tight">
              ฿{(user.wallet_balance ?? 0).toLocaleString()}
            </span>
          </div>
        )}

        {/* Catalog */}
        <section>
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white tracking-tight">แพ็กเกจ</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {pricingNote ||
                    "ราคาขาย = ฐาน + มาร์จิ้น + ค่าบริการแพลตฟอร์ม · จัดเรียงตามวัน / GB / ราคาได้"}
                </p>
              </div>
              <button
                type="button"
                disabled={loading || refreshing}
                onClick={() => setCatalogNonce((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08] disabled:opacity-50 shrink-0"
                title="โหลดแคตตาล็อกใหม่"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin text-cyan-400" : ""} />
                รีเฟรช
              </button>
            </div>

            {!loading && packages.length > 0 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    size={16}
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหา ชื่อ / โซน / SKU..."
                    className="w-full rounded-2xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                  />
                </div>
                {regionOptions.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-slate-500 shrink-0">โซน</label>
                    <select
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                      className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                    >
                      <option value="">ทุกโซน</option>
                      {regionOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {!loading && filteredPackages.length > 1 && (
              <EsimPackageSortBar variant="store" value={sortKey} onChange={setSortKey} />
            )}
          </div>

          {loading && (
            <div className="space-y-4">
              <PackageSkeleton />
              <PackageSkeleton />
            </div>
          )}

          {!loading && packages.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
              <Zap className="mx-auto text-slate-600 mb-3" size={32} />
              <p className="text-slate-400 text-sm">ยังไม่มีแพ็กเกจให้เลือก</p>
              <p className="text-slate-600 text-xs mt-2">ลองรีเฟรชภายหลัง หรือตรวจสอบการตั้งค่า GigaStore บนเซิร์ฟเวอร์</p>
            </div>
          )}

          {!loading && packages.length > 0 && filteredPackages.length === 0 && (
            <div className="rounded-3xl border border-dashed border-amber-500/25 bg-amber-950/15 px-6 py-10 text-center">
              <p className="text-amber-100/90 text-sm">ไม่พบแพ็กเกจที่ตรงกับการค้นหา</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setRegionFilter("");
                }}
                className="mt-3 text-xs font-medium text-cyan-400 hover:underline"
              >
                ล้างตัวกรอง
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {sortedPackages.map((p) => {
              const open = openDetailSku === p.sku;
              return (
                <article
                  key={p.sku}
                  className="group rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-transparent p-5 shadow-lg shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/90">
                        {p.region}
                      </p>
                      <h3 className="text-base font-semibold text-white mt-1 leading-snug">
                        {p.name}
                      </h3>
                      {p.notes ? (
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-3">{p.notes}</p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">ข้อมูล</p>
                      <p className="text-2xl font-bold text-white tabular-nums leading-none mt-0.5">
                        {p.dataGb}
                        <span className="text-sm font-semibold text-slate-400 ml-0.5">GB</span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">{p.validityDays} วัน</p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">ราคารวม</p>
                      <p className="text-2xl font-bold text-amber-100/95 tabular-nums">
                        ฿{p.totalCustomerPrice.toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={confirmLoading}
                      onClick={() => onBuyClick(p)}
                      className="inline-flex items-center justify-center gap-2 min-w-[140px] rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500 to-amber-700 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/25 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Zap size={18} />
                      ซื้อเลย
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenDetailSku(open ? null : p.sku)}
                    className="mt-4 flex w-full items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    รายละเอียดราคา
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-slate-400 space-y-1.5 font-mono tabular-nums">
                      <div className="flex justify-between">
                        <span>ฐาน</span>
                        <span>฿{p.basePrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>มาร์จิ้น ({p.markupPercent}%)</span>
                        <span>฿{p.markupAmount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ค่าบริการ</span>
                        <span>฿{p.convenienceFee}</span>
                      </div>
                      <div className="flex justify-between text-slate-300 pt-2 border-t border-white/10 font-sans font-semibold">
                        <span>รวม</span>
                        <span>฿{p.totalCustomerPrice.toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 font-sans pt-1 break-all">SKU {p.sku}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <TunzPoweredBy />

        <p className="text-[10px] text-center text-slate-600 leading-relaxed px-2 max-w-sm mx-auto">
          ชำระผ่าน AQOND Wallet · ข้อกำหนดและค่าธรรมเนียมเป็นไปตามแพลตฟอร์ม
        </p>
      </main>
    </div>
  );
};

export default RescueNetLanding;
