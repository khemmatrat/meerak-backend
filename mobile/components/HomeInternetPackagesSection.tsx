import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  Wifi,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import {
  fetchEsimPackages,
  purchaseEsim,
  type EsimPackageDto,
} from "../services/rescueNetApi";
import { TunzPoweredBy } from "./TunzPoweredBy";
import { EsimPackageSortBar } from "./EsimPackageSortBar";
import type { EsimSortKey } from "../utils/esimPackageSort";
import { sortEsimPackages } from "../utils/esimPackageSort";
import { EsimPurchaseConfirmModal } from "./EsimPurchaseConfirmModal";
import { parseEsimPurchaseError } from "../utils/esimPurchaseErrors";

function CardSkeleton() {
  return (
    <div className="min-w-[260px] max-w-[280px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 animate-pulse">
      <div className="mb-2 h-3 w-16 rounded bg-slate-200" />
      <div className="mb-4 h-4 w-full rounded bg-slate-200" />
      <div className="mb-3 h-8 w-24 rounded bg-slate-200" />
      <div className="h-10 w-full rounded-xl bg-slate-200" />
    </div>
  );
}

/**
 * แคตตาล็อก eSIM — ธีมพื้นขาว อ่านง่าย (หน้า /internet-packages)
 */
export const HomeInternetPackagesSection: React.FC = () => {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const [packages, setPackages] = useState<EsimPackageDto[]>([]);
  const [source, setSource] = useState<string | undefined>();
  const [pricingNote, setPricingNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogNonce, setCatalogNonce] = useState(0);
  const [buyingFlow, setBuyingFlow] = useState(false);
  const [sortKey, setSortKey] = useState<EsimSortKey>("gb_asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [confirmPkg, setConfirmPkg] = useState<EsimPackageDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
          notify("โหลดแพ็กเกจไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ api", "error");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogNonce triggers refresh
  }, [catalogNonce]);

  const liveFromPortal = source === "gigastore";

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

  const onBuyClick = (p: EsimPackageDto) => {
    if (!isAuthenticated || !user) {
      notify("เข้าสู่ระบบเพื่อชำระผ่าน Wallet", "info");
      navigate("/login", { state: { from: { pathname: location.pathname || "/internet-packages" } } });
      return;
    }
    setConfirmPkg(p);
    setConfirmOpen(true);
  };

  const executePurchase = async () => {
    if (!confirmPkg) return;
    const pkgName = confirmPkg.name;
    setBuyingFlow(true);
    try {
      const data = await purchaseEsim(confirmPkg.sku);
      await refreshUser();
      setConfirmOpen(false);
      setConfirmPkg(null);
      const vaultState = {
        highlightAssetId: data.assetId,
        flashQrDataUrl: data.activationQrDataUrl,
        purchasedName: pkgName,
      };
      notify(t("esim.toast_activated"), "success", {
        durationMs: 12000,
        action: {
          label: t("esim.toast_view_vault"),
          onClick: () => navigate("/digital-vault", { state: vaultState }),
        },
      });
    } catch (e: unknown) {
      const parsed = parseEsimPurchaseError(e);
      if (parsed.insufficient) {
        const need = parsed.required ?? confirmPkg.totalCustomerPrice;
        notify(
          `${parsed.message} — ต้องการประมาณ ฿${Number(need).toLocaleString()} · ไปเติม Wallet จากโปรไฟล์`,
          "error"
        );
      } else {
        notify(parsed.message, "error");
      }
    } finally {
      setBuyingFlow(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
      <EsimPurchaseConfirmModal
        open={confirmOpen}
        variant="home"
        pkg={confirmPkg}
        walletBalance={user?.wallet_balance ?? 0}
        loading={buyingFlow}
        onClose={() => {
          if (buyingFlow) return;
          setConfirmOpen(false);
          setConfirmPkg(null);
        }}
        onConfirm={executePurchase}
      />

      <div className="relative space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div
              className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-900/10"
              aria-hidden
            >
              <Zap size={26} className="relative z-[1] text-white" strokeWidth={2.35} />
              <Wifi size={14} className="absolute bottom-1 right-1 z-[1] text-emerald-100" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {t("esim.catalog_eyebrow")}
                </span>
                <TunzPoweredBy variant="compact" className="!py-1 !px-2.5" />
                {!loading && liveFromPortal && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                    GigaStore live
                  </span>
                )}
                {!loading && !liveFromPortal && packages.length > 0 && (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Demo catalog
                  </span>
                )}
              </div>
              <h3 className="font-sans text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl">
                {t("home.internet_packages_page_title")}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                {pricingNote
                  ? `${pricingNote} — เลือกแพ็กเกจ ชำระด้วย Wallet รับ QR ติดตั้งได้ทันที`
                  : "เลือกแพ็กเกจ ชำระด้วย Wallet รับ QR ติดตั้งได้ทันที"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
                  <Wifi size={12} className="text-emerald-600" />
                  เปิดใช้เร็ว
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
                  <Globe2 size={12} className="text-emerald-600" />
                  หลายโซน
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Link
                  to="/legal?type=refund"
                  className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                >
                  คืนเงิน
                </Link>
                <span className="text-slate-300">·</span>
                <Link
                  to="/legal?type=terms"
                  className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                >
                  ข้อกำหนด
                </Link>
                <span className="text-slate-300">·</span>
                <Link
                  to="/profile?tab=wallet"
                  className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                >
                  เติม Wallet
                </Link>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={() => setCatalogNonce((n) => n + 1)}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              title="รีเฟรชแคตตาล็อก"
            >
              <RefreshCw size={18} className={refreshing ? "animate-spin text-emerald-600" : ""} />
            </button>
            <Link
              to="/rescue-net"
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors sm:flex-col sm:items-end sm:justify-center sm:p-0"
            >
              <span className="text-xs font-semibold text-slate-600 transition-colors hover:text-emerald-700">
                ดูทั้งหมด
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50">
                <ArrowRight size={20} className="text-slate-600" />
              </div>
            </Link>
          </div>
        </div>

        {!loading && packages.length > 0 && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาแพ็กเกจ..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {regionOptions.length > 1 && (
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">ทุกโซน</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {!loading && filteredPackages.length > 1 && (
          <EsimPackageSortBar variant="home" value={sortKey} onChange={setSortKey} />
        )}

        {loading && (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {!loading && packages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm text-slate-600">ยังไม่มีแพ็กเกจให้เลือก</p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-slate-500">
              ตั้งค่า GigaStore live บน API หรือตรวจสอบ inventory ใน portal
            </p>
          </div>
        )}

        {!loading && packages.length > 0 && filteredPackages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
            ไม่พบแพ็กเกจที่ตรงกับการค้นหา
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRegionFilter("");
              }}
              className="mx-auto mt-2 block text-xs font-medium text-amber-800 underline hover:text-amber-900"
            >
              ล้างตัวกรอง
            </button>
          </div>
        )}

        {!loading && sortedPackages.length > 0 && (
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 pt-1 scroll-smooth">
            {sortedPackages.map((p) => (
              <article
                key={p.sku}
                className="min-w-[min(100%,280px)] max-w-[300px] shrink-0 snap-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  {p.region}
                </p>
                <h4 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-900">
                  {p.name}
                </h4>
                {p.notes ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{p.notes}</p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">ข้อมูล</span>
                    <span className="text-base font-bold tabular-nums text-slate-900">{p.dataGb} GB</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">ใช้ได้</span>
                    <span className="text-base font-bold tabular-nums text-slate-900">{p.validityDays} วัน</span>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">ราคารวม</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-700 number-wallet-gold">
                      ฿{p.totalCustomerPrice.toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={buyingFlow}
                  onClick={() => onBuyClick(p)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
                >
                  {buyingFlow && confirmPkg?.sku === p.sku ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      กำลังดำเนินการ
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      ซื้อเลย
                    </>
                  )}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeInternetPackagesSection;
