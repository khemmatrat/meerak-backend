import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ExternalLink, Power, Calendar, Grid, X, Tag, BarChart2 } from 'lucide-react';
import {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getAdminToken,
  ADMIN_API_BASE,
} from '../services/adminApi';
import type { AppBanner, BannerPlacementSlug } from '../types';
import { JOB_CATEGORIES_FOR_PROMO_BANNERS } from '../constants/jobCategoriesForBanners';
import {
  ALL_BANNER_PLACEMENTS,
  BANNER_PLACEMENT_LABELS,
  bannerPlacementsFromApi,
  bannerPlacementsToApiPayload,
} from '../constants/bannerPlacements';

/** แปลง ISO → ค่า input datetime-local ตามเวลาไทย */
function isoToDatetimeLocalBangkok(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
  return s.slice(0, 16).replace(' ', 'T');
}

/** datetime-local (เวลาไทย) → ISO ส่ง API */
function datetimeLocalBangkokToIso(local: string): string | undefined {
  if (!local?.trim()) return undefined;
  const s = local.length === 16 ? `${local}:00` : local;
  return `${s}+07:00`;
}

/** วันนี้แบบ YYYY-MM-DD เขต Asia/Bangkok — ให้ตรงกับ GET /api/banners ใน backend */
function todayYmdBangkok(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (y && m && d) return `${y}-${m}-${d}`;
  return new Date().toISOString().slice(0, 10);
}

/** แสดงเป็นวันที่ไทย — ค่า YYYY-MM-DD จาก input type=date (เที่ยงวัน +07 กันหลุดวัน) */
function formatBannerYmdAsThaiLine(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const d = new Date(`${ymd}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** สอดคล้อง backend filterBannersByPlacement สำหรับ placement=home (รวมแบนโปรที่เลือกแค่ welcome/job_detail) */
function bannerPassesHomePlacementGate(banner: AppBanner): boolean {
  const p = banner.placements;
  if (p == null || p.length === 0) return true;
  if (p.includes("home")) return true;
  const hasPromo =
    !!(banner.promoCode?.trim()) ||
    (banner.discountMaxBaht != null && Number(banner.discountMaxBaht) > 0);
  if (hasPromo && (p.includes("welcome") || p.includes("job_detail"))) return true;
  return false;
}

/** ตรงกับ filter ของ GET /api/banners?placement=home (public) — ไม่เหมือน GET /api/admin/banners ที่ไม่กรองวันที่ */
function isBannerShownOnMobileHome(banner: AppBanner): boolean {
  if (!banner.isActive) return false;
  if (!bannerPassesHomePlacementGate(banner)) return false;
  const now = todayYmdBangkok();
  const start = banner.startDate?.trim();
  const end = banner.endDate?.trim();
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}

function placementBadges(banner: AppBanner): string {
  const p = banner.placements;
  if (!p || p.length === 0) return 'ทุกหน้า';
  return p.map((x) => BANNER_PLACEMENT_LABELS[x as BannerPlacementSlug] || x).join(' · ');
}

function slideHeightLabel(v: AppBanner['slideHeight']): string {
  if (v == null) return 'ค่าเริ่มตามแอป / หน้า';
  if (v === 'hero') return 'Hero 16:9';
  if (v === 'strip') return 'แถบเตี้ย (job detail)';
  if (v === 'portrait') return 'Portrait 9:16';
  return String(v);
}

const initialFormState = {
  title: '',
  imageUrl: '',
  actionUrl: '',
  order: 1,
  startDate: '',
  endDate: '',
  isActive: true,
  promoCode: '',
  discountMode: 'fixed_baht' as 'fixed_baht' | 'percent',
  discountPercent: '' as number | '',
  discountMaxBaht: '' as number | '',
  minCumulativeTopupThb: '' as number | '',
  firstPaidJobOnly: false,
  discountDescription: '',
  promoValidFromLocal: '',
  promoValidUntilLocal: '',
  allowedJobCategories: [] as string[],
  /** ปิด = โฆษณาแบนเนอร์ได้ แต่ไม่ให้รับ/ใช้โค้ด */
  promoClaimsEnabled: true,
  placements: [...ALL_BANNER_PLACEMENTS] as BannerPlacementSlug[],
  /** ว่าง = null ใน API — ใช้ค่า default จากแอป */
  slideHeight: '' as '' | 'hero' | 'strip' | 'portrait',
};

type DbHealth = {
  canonical_production_database?: string;
  current_database: string | null;
  aligned_with_canonical?: boolean;
  pool_config_source?: string;
  env_db_host?: string | null;
  env_db_database?: string | null;
  database_name_parsed_from_database_url?: string | null;
  use_database_url_for_pool?: boolean;
  warning?: string;
  home_banners_count: number | null;
  home_banners_max_updated_at: string | null;
};

export const ContentManagerView: React.FC = () => {
  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AppBanner | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [dbHealthErr, setDbHealthErr] = useState<string | null>(null);

  /** ยืนยันว่าแอดมินชี้ backend เดียวกับที่เปิดเทียบ api.aqond.com — ไม่ต้องล็อกอิน */
  useEffect(() => {
    let cancelled = false;
    fetch(`${ADMIN_API_BASE}/api/health/database`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DbHealth>;
      })
      .then((d) => {
        if (!cancelled) {
          setDbHealth(d);
          setDbHealthErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDbHealth(null);
          setDbHealthErr(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!getAdminToken()) {
      setError('กรุณา Login เพื่อโหลด/บันทึกแบนเนอร์');
      setLoading(false);
      return;
    }
    getBanners()
      .then((res) => { setBanners(res.banners || []); setError(null); })
      .catch((e: any) => { setError(e?.message || 'โหลดแบนเนอร์ไม่สำเร็จ'); setBanners([]); })
      .finally(() => setLoading(false));
  }, []);

  const handleAddNew = () => {
    setEditingBanner(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEdit = (banner: AppBanner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      imageUrl: banner.imageUrl,
      actionUrl: banner.actionUrl || '',
      order: banner.order,
      startDate: banner.startDate || '',
      endDate: banner.endDate || '',
      isActive: banner.isActive,
      promoCode: banner.promoCode || '',
      discountMode: banner.discountMode === 'percent' ? 'percent' : 'fixed_baht',
      discountPercent: banner.discountPercent ?? '',
      discountMaxBaht: banner.discountMaxBaht ?? '',
      minCumulativeTopupThb: banner.minCumulativeTopupThb ?? '',
      firstPaidJobOnly: banner.firstPaidJobOnly ?? false,
      discountDescription: banner.discountDescription || '',
      promoValidFromLocal: banner.promoValidFrom ? isoToDatetimeLocalBangkok(banner.promoValidFrom) : '',
      promoValidUntilLocal: banner.promoValidUntil ? isoToDatetimeLocalBangkok(banner.promoValidUntil) : '',
      allowedJobCategories: banner.allowedJobCategories ?? [],
      promoClaimsEnabled: banner.promoClaimsEnabled !== false,
      placements: bannerPlacementsFromApi(banner.placements),
      slideHeight:
        banner.slideHeight === 'hero' || banner.slideHeight === 'strip' || banner.slideHeight === 'portrait'
          ? banner.slideHeight
          : '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบแบนเนอร์นี้? (ไม่สามารถกู้คืนได้)')) return;
    if (!getAdminToken()) return;
    try {
      await deleteBanner(id);
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } catch (e: any) {
      setError(e?.message || 'ลบไม่สำเร็จ');
    }
  };

  const toggleStatus = async (banner: AppBanner) => {
    if (!getAdminToken()) return;
    try {
      await updateBanner(banner.id, { isActive: !banner.isActive });
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)));
    } catch (e: any) {
      setError(e?.message || 'อัปเดตไม่สำเร็จ');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!getAdminToken()) return;
    setSaving(true);
    try {
      if (formData.placements.length === 0) {
        setError('เลือกอย่างน้อย 1 หน้าที่จะแสดงแบนเนอร์');
        return;
      }
      const payload = {
        title: formData.title,
        imageUrl: formData.imageUrl,
        actionUrl: formData.actionUrl || undefined,
        order: formData.order,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        isActive: formData.isActive,
        promoCode: formData.promoCode.trim() || undefined,
        discountMode: formData.promoCode.trim() ? formData.discountMode : undefined,
        discountPercent:
          formData.promoCode.trim() && formData.discountMode === 'percent' && formData.discountPercent !== ''
            ? Number(formData.discountPercent)
            : undefined,
        discountMaxBaht: formData.discountMaxBaht === '' ? undefined : Number(formData.discountMaxBaht),
        minCumulativeTopupThb:
          formData.promoCode.trim() && formData.minCumulativeTopupThb !== ''
            ? Number(formData.minCumulativeTopupThb)
            : formData.promoCode.trim()
              ? 0
              : undefined,
        firstPaidJobOnly: formData.promoCode.trim() ? formData.firstPaidJobOnly : undefined,
        discountDescription: formData.discountDescription.trim() || undefined,
        promoValidFrom: formData.promoCode.trim()
          ? formData.promoValidFromLocal.trim()
            ? datetimeLocalBangkokToIso(formData.promoValidFromLocal)
            : null
          : undefined,
        promoValidUntil: formData.promoCode.trim()
          ? formData.promoValidUntilLocal.trim()
            ? datetimeLocalBangkokToIso(formData.promoValidUntilLocal)
            : null
          : undefined,
        allowedJobCategories: formData.promoCode.trim()
          ? formData.allowedJobCategories.length > 0
            ? formData.allowedJobCategories
            : null
          : undefined,
        promoClaimsEnabled: formData.promoCode.trim() ? formData.promoClaimsEnabled : undefined,
        placements: bannerPlacementsToApiPayload(formData.placements),
        slideHeight: formData.slideHeight === '' ? null : formData.slideHeight,
      };
      if (editingBanner) {
        const res = await updateBanner(editingBanner.id, payload);
        setBanners((prev) => prev.map((b) => (b.id === editingBanner.id ? { ...b, ...res.banner } : b)));
      } else {
        const res = await createBanner(payload);
        setBanners((prev) => [res.banner as AppBanner, ...prev]);
      }
      setIsModalOpen(false);
      setFormData(initialFormState);
      setEditingBanner(null);
    } catch (err: any) {
      setError(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Grid size={20} className="text-indigo-600" />
            จัดการแบนเนอร์ (Banner Management)
          </h2>
          <p className="text-slate-500 text-sm">
            เลือกหน้าที่แสดง (Home / Welcome / รายละเอียดงาน) โค้ดส่วนลด และ Action / Deep Link — คู่มืออยู่ที่ไฟล์{' '}
            <code className="text-[11px] bg-slate-100 px-1 rounded">nexus-admin-core/BANNER_GUIDE_TH.md</code>
          </p>
          {error && <p className="text-rose-600 text-sm mt-1">{error}</p>}
        </div>
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-indigo-200"
        >
          <Plus size={18} /> เพิ่มแบนเนอร์ใหม่
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
        <p className="font-semibold text-slate-800">ตรวจว่าแอดมินกับ public API ใช้ DB เดียวกัน</p>
        <p>
          <span className="text-slate-500">ค่า build </span>
          <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
            ADMIN_API_BASE = {ADMIN_API_BASE}
          </code>
        </p>
        {dbHealthErr && (
          <p className="text-rose-600">
            โหลด <code className="text-[11px]">/api/health/database</code> ไม่ได้: {dbHealthErr} — ตรวจ CORS / URL
          </p>
        )}
        {dbHealth && (
          <>
            {dbHealth.canonical_production_database && (
              <p>
                <span className="text-slate-500">canonical (ที่ระบบออกแบบ):</span>{' '}
                <strong>{dbHealth.canonical_production_database}</strong>
                {typeof dbHealth.aligned_with_canonical === 'boolean' && (
                  <span
                    className={
                      dbHealth.aligned_with_canonical ? ' text-emerald-700 ml-2' : ' text-rose-700 ml-2'
                    }
                  >
                    {dbHealth.aligned_with_canonical ? '✓ ตรง' : '✗ ไม่ตรง — แก้ DATABASE_URL หรือ DB_DATABASE บน backend'}
                  </span>
                )}
              </p>
            )}
            <p>
              <span className="text-slate-500">current_database:</span>{' '}
              <strong>{dbHealth.current_database ?? '—'}</strong>
            </p>
            {dbHealth.pool_config_source && (
              <p className="text-slate-500">
                pool: <code className="text-[11px] bg-white px-1 rounded">{dbHealth.pool_config_source}</code>
                {dbHealth.use_database_url_for_pool && dbHealth.database_name_parsed_from_database_url
                  ? ` → URL ชี้ db: ${dbHealth.database_name_parsed_from_database_url}`
                  : dbHealth.env_db_host
                    ? ` → DB_HOST=${dbHealth.env_db_host} DB_DATABASE=${dbHealth.env_db_database ?? '—'}`
                    : ''}
              </p>
            )}
            {dbHealth.warning && (
              <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">{dbHealth.warning}</p>
            )}
            <p>
              <span className="text-slate-500">จำนวนแถว home_banners:</span>{' '}
              <strong>{dbHealth.home_banners_count ?? '—'}</strong>
            </p>
            {dbHealth.home_banners_max_updated_at && (
              <p className="text-slate-500">
                MAX(updated_at): {dbHealth.home_banners_max_updated_at}
              </p>
            )}
            <p className="text-slate-500 pt-1 border-t border-slate-200">
              เปิดแท็บ{' '}
              <a
                className="text-indigo-600 underline font-medium"
                href={`${ADMIN_API_BASE}/api/health/database`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {ADMIN_API_BASE}/api/health/database
              </a>{' '}
              แล้วเทียบค่ากับกล่องนี้ — ต้องตรงกัน ถ้าคุณเปิด{' '}
              <code className="text-[11px]">https://api.aqond.com/api/health/database</code> แล้วได้คนละค่า แปลว่าแอดมิน build ชี้ API คนละตัว (แก้{' '}
              <code className="text-[11px]">VITE_ADMIN_API_URL</code> แล้ว rebuild)
            </p>
          </>
        )}
      </div>

      {loading && banners.length === 0 && (
        <div className="text-slate-500 py-8 text-center">กำลังโหลดแบนเนอร์...</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banners.map((banner) => (
          <div key={banner.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all group hover:shadow-lg ${banner.isActive ? 'border-slate-200' : 'border-slate-200 opacity-75'}`}>
            <div className="relative h-48 bg-slate-100">
              <img 
                src={banner.imageUrl} 
                alt={banner.title} 
                className={`w-full h-full object-cover transition-all ${!banner.isActive && 'grayscale'}`}
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Invalid+Image'; }}
              />
              <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                ORDER: {banner.order}
              </div>
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                 <button 
                    onClick={() => handleEdit(banner)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg text-slate-800 text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                 >
                    <Edit2 size={14} /> แก้ไข
                 </button>
                 <button 
                    onClick={() => handleDelete(banner.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors"
                 >
                    <Trash2 size={14} /> ลบ
                 </button>
              </div>
            </div>
            
            <div className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                   <h3 className="font-bold text-slate-800 text-sm leading-tight truncate pr-2">{banner.title}</h3>
                   <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      banner.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                   }`}>
                      {banner.isActive ? 'ACTIVE' : 'INACTIVE'}
                   </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleStatus(banner)}
                  className={`p-1.5 rounded-full transition-colors ${banner.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                >
                  <Power size={16} />
                </button>
              </div>
              
              <div className="space-y-2">
                 <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                    <Calendar size={12} className="shrink-0 mt-0.5" />
                    <span className="leading-snug">
                      <span className="font-mono text-[11px]">{banner.startDate || "ไม่ระบุเริ่ม"} — {banner.endDate || "ไม่ระบุสิ้นสุด"}</span>
                      {(banner.startDate || banner.endDate) && (
                        <>
                          {" "}
                          (
                          {[banner.startDate ? formatBannerYmdAsThaiLine(banner.startDate) : "เริ่ม ?", banner.endDate ? formatBannerYmdAsThaiLine(banner.endDate) : "สิ้นสุด ?"].join(" → ")})
                          )
                        </>
                      )}
                    </span>
                 </div>
                 <div
                   className={`text-[10px] font-semibold px-2 py-1.5 rounded border ${
                     isBannerShownOnMobileHome(banner)
                       ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                       : "bg-amber-50 text-amber-900 border-amber-200"
                   }`}
                 >
                   {isBannerShownOnMobileHome(banner)
                     ? `✓ จะเห็นบนหน้าหลักแอปวันนี้ (เขตไทย วันนี้=${todayYmdBangkok()} ค.ศ.; GET /api/banners?placement=home)`
                     : `⚠ ไม่เข้าหน้าหลักแอปวันนี้ — เปิด ACTIVE, ช่วงวันเริ่ม–จบให้ครอบคลุมวันนี้ (${formatBannerYmdAsThaiLine(todayYmdBangkok())}), หรือเลือกตำแหน่ง “หน้า Home (หลังล็อกอิน)”`}
                 </div>
                 <div className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-1.5">
                   <span className="font-semibold text-slate-700">ตำแหน่งแสดง: </span>
                   {placementBadges(banner)}
                 </div>
                 <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-600 bg-indigo-50/80 border border-indigo-100 rounded px-2 py-1.5">
                   <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-900" title="เปิด bottom sheet ในแอป">
                     <BarChart2 size={11} aria-hidden />
                     Sheet {banner.sheetOpens ?? 0}
                   </span>
                   <span title="บันทึก event การรับโค้ด">Claim {banner.claims ?? 0}</span>
                   <span className="text-slate-400" title="คลิกรวม (legacy DB)">Click {banner.clicks ?? 0}</span>
                 </div>
                 <div className="text-[10px] text-slate-600 px-0.5">
                   <span className="font-semibold text-slate-700">สัดส่วนสไลด์: </span>
                   {slideHeightLabel(banner.slideHeight)}
                 </div>
                 {banner.actionUrl && (
                   <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      <ExternalLink size={12} />
                      <span className="truncate">{banner.actionUrl}</span>
                   </div>
                 )}
                 {banner.promoCode && banner.promoClaimsEnabled === false && (
                   <div className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded">
                     รับ/ใช้โค้ดถูกระงับ — แบนเนอร์ยังแสดงเป็นโฆษณาได้
                   </div>
                 )}
                 {banner.promoCode && (
                   <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-2 rounded">
                      <Tag size={12} />
                      <span className="break-words">
                        โค้ด {banner.promoCode}
                        {banner.discountMode === 'percent'
                          ? ` • ${banner.discountPercent ?? 0}% (เพดาน ฿${banner.discountMaxBaht ?? 0})`
                          : ` • สูงสุด ฿${banner.discountMaxBaht ?? 0}`}
                        {(banner.minCumulativeTopupThb ?? 0) > 0
                          ? ` • เติมสะสม ≥${banner.minCumulativeTopupThb} บ.`
                          : ''}
                        {banner.firstPaidJobOnly ? ' • งานจ้างแรก' : ''}
                      </span>
                   </div>
                 )}
                 {banner.promoCode && (banner.promoValidFrom || banner.promoValidUntil) && (
                   <div className="text-[10px] text-slate-600 bg-violet-50 p-2 rounded border border-violet-100">
                     <span className="font-semibold text-violet-800">ช่วงรับ/ใช้โค้ด (ไม่ใช่ช่วงโชว์แบนเนอร์ในแอป): </span>
                     {banner.promoValidFrom
                       ? new Date(banner.promoValidFrom).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                       : 'เริ่มตามวันแสดงแบนเนอร์'}
                     {' — '}
                     {banner.promoValidUntil
                       ? new Date(banner.promoValidUntil).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                       : 'สิ้นสุดตามวันแสดงแบนเนอร์'}
                   </div>
                 )}
                 {banner.promoCode && banner.allowedJobCategories && banner.allowedJobCategories.length > 0 && (
                   <div className="text-[10px] text-slate-600 bg-amber-50/80 p-2 rounded border border-amber-100">
                     <span className="font-semibold">หมวด: </span>
                     {banner.allowedJobCategories.join(', ')}
                   </div>
                 )}
              </div>
            </div>
          </div>
        ))}

        <button 
          onClick={handleAddNew}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all min-h-[300px]"
        >
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Plus size={24} />
          </div>
          <span className="font-bold">เพิ่มแบนเนอร์ใหม่</span>
        </button>
      </div>

      {/* MODAL — เนื้อหาฟอร์มเลื่อนได้ ปุ่มบันทึกติดด้านล่าง */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[min(92vh,56rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 sm:my-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="banner-modal-title"
          >
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 id="banner-modal-title" className="font-bold text-slate-800">
                {editingBanner ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์ใหม่'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="ปิด">
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <form lang="th" onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ชื่อแบนเนอร์</label>
                <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Image URL</label>
                <input type="url" required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"/>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">ตำแหน่งแสดงในแอป</label>
                <p className="text-[11px] text-slate-500 leading-snug">
                  เลือกได้หลายหน้า แอปเรียก <code className="text-[10px] bg-white px-1 rounded border">GET /api/banners?placement=home|welcome|job_detail</code> — เลือกครบทั้ง 3 ช่อง = บันทึกเป็นแสดงทุกหน้า (ค่า NULL ใน DB)
                </p>
                <div className="flex flex-col gap-2">
                  {ALL_BANNER_PLACEMENTS.map((slug) => (
                    <label key={slug} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600 shrink-0"
                        checked={formData.placements.includes(slug)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setFormData((prev) => ({
                            ...prev,
                            placements: on
                              ? Array.from(new Set([...prev.placements, slug]))
                              : prev.placements.filter((p) => p !== slug),
                          }));
                        }}
                      />
                      {BANNER_PLACEMENT_LABELS[slug]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <label className="block text-xs font-semibold text-slate-700 mb-0">วันเริ่มแสดงแบนเนอร์</label>
                   <p className="text-[10px] text-slate-500 leading-snug">เลือกจากปฏิทินของเบราว์เซอร์ • เก็บในระบบเป็น ค.ศ.</p>
                   <input type="date" required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"/>
                   {formData.startDate ? (
                     <p className="text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 leading-snug">
                       ระบบอ่านเป็นวัน <strong>{formatBannerYmdAsThaiLine(formData.startDate)}</strong>
                       <span className="text-slate-600 font-normal"> ({formData.startDate} ค.ศ.)</span>
                     </p>
                   ) : null}
                </div>
                <div className="space-y-1.5">
                   <label className="block text-xs font-semibold text-slate-700 mb-0">วันสิ้นสุดแสดงแบนเนอร์</label>
                   <p className="text-[10px] text-slate-500 leading-snug">รวมถึงวันนี้เป็นวันสุดท้ายที่แสดง</p>
                   <input type="date" required value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"/>
                   {formData.endDate ? (
                     <p className="text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 leading-snug">
                       สิ้นสุดเมื่อ <strong>{formatBannerYmdAsThaiLine(formData.endDate)}</strong>
                       <span className="text-slate-600 font-normal"> ({formData.endDate} ค.ศ.)</span>
                     </p>
                   ) : null}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950 leading-snug">
                <strong>วันนี้ (เทียบเขตไทย Bangkok):</strong>{" "}
                {formatBannerYmdAsThaiLine(todayYmdBangkok())}{" "}
                <span className="font-mono text-slate-700">({todayYmdBangkok()} ค.ศ.)</span>
                {" — "}ต้องอยู่ระหว่างวันเริ่ม–วันสิ้นสุดรวมปลายทั้งสองข้าง
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">
                สองช่องด้านบน = ช่วงที่แอปจะโหลดแบนเนอร์ (ใช้กรองใน{" "}
                <code className="text-[10px] bg-slate-100 px-1 rounded">GET /api/banners</code> เทียบวันนี้แบบ Bangkok) — แยกจากช่วงโค้ดด้านล่างโดยสิ้นเชิง
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Action / Deep Link</label>
                <input type="text" value={formData.actionUrl} onChange={e => setFormData({...formData, actionUrl: e.target.value})} placeholder="app://promotion/1 หรือ /jobs" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">สัดส่วนสไลด์ในแอป</label>
                <select
                  value={formData.slideHeight}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      slideHeight: e.target.value as typeof formData.slideHeight,
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                >
                  <option value="">ค่าเริ่มตามแอป / หน้า (NULL ใน DB)</option>
                  <option value="hero">Hero 16:9</option>
                  <option value="strip">แถบเตี้ย (รายละเอียดงาน)</option>
                  <option value="portrait">Portrait 9:16</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  ทับค่า default จาก remote / placement — ใช้เมื่อแคมเปญต้องการสัดส่วนพิเศษ (สอดคล้องคอลัมน์ <code className="text-[10px] bg-slate-100 px-1 rounded">slide_height</code>)
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase">โค้ดส่วนลด (ถ้ามี)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">รหัสโค้ด</label>
                    <input type="text" value={formData.promoCode} onChange={e => setFormData({...formData, promoCode: e.target.value.toUpperCase()})} placeholder="SUMMER50" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">โหมดส่วนลด</label>
                    <select
                      value={formData.discountMode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discountMode: e.target.value === 'percent' ? 'percent' : 'fixed_baht',
                        })
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                    >
                      <option value="fixed_baht">ลดเป็นบาท (วงเงินรวม)</option>
                      <option value="percent">ลดเป็น % ของราคางาน</option>
                    </select>
                  </div>
                </div>
                {formData.discountMode === 'percent' && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">เปอร์เซ็นต์ส่วนลด (1–100)</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={0.5}
                      value={formData.discountPercent}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discountPercent: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      placeholder="50"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {formData.discountMode === 'percent'
                      ? 'เพดานส่วนลดสูงสุด (บาท) — จำกัดยอดหักจากกองทุน'
                      : 'วงเงินส่วนลดสูงสุด (บาท)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.discountMaxBaht}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountMaxBaht: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                    placeholder="100"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    ยอดเติมเงินสะสมขั้นต่ำ (บาท) ก่อนกดรับโค้ด — 0 = ไม่บังคับ
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.minCumulativeTopupThb}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minCumulativeTopupThb: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                    placeholder="100"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.firstPaidJobOnly}
                    onChange={(e) => setFormData({ ...formData, firstPaidJobOnly: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  ใช้ได้เฉพาะการชำระงานจ้างครั้งแรกของลูกค้า (หลังรับโค้ดแล้วใช้ครั้งเดียว)
                </label>
                {formData.promoCode.trim() !== '' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">เริ่มใช้โค้ดได้ (เวลาไทย)</label>
                        <input
                          type="datetime-local"
                          value={formData.promoValidFromLocal}
                          onChange={(e) => setFormData({ ...formData, promoValidFromLocal: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">หมดอายุโค้ด (เวลาไทย)</label>
                        <input
                          type="datetime-local"
                          value={formData.promoValidUntilLocal}
                          onChange={(e) => setFormData({ ...formData, promoValidUntilLocal: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">เว้นว่าง = ใช้ช่วงวันที่แบนเนอร์ (ตั้งแต่ 00:00 ถึง 23:59:59 ตามวันที่แบนเนอร์)</p>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">หมวดงานที่ใช้โค้ดได้ (Ctrl/Cmd เลือกหลายรายการ)</label>
                      <select
                        multiple
                        size={8}
                        value={formData.allowedJobCategories}
                        onChange={(e) => {
                          const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                          setFormData({ ...formData, allowedJobCategories: opts });
                        }}
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white min-h-[140px]"
                      >
                        {JOB_CATEGORIES_FOR_PROMO_BANNERS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">ไม่เลือก = ใช้ได้ทุกหมวดงาน</p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.promoClaimsEnabled}
                        onChange={(e) => setFormData({ ...formData, promoClaimsEnabled: e.target.checked })}
                        className="w-4 h-4 mt-0.5 accent-indigo-600 shrink-0"
                      />
                      <span>
                        <span className="font-semibold">อนุญาตรับและใช้โค้ด</span>
                        <span className="block text-[11px] text-slate-500">
                          ปิดตัวนี้ = โชว์แบนเนอร์โปรได้ (โฆษณาล่วงหน้า) แต่ผู้ใช้รับหรือใช้โค้ดไม่ได้จนกว่าจะเปิดอีกครั้ง
                        </span>
                      </span>
                    </label>
                  </>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">คำอธิบายโค้ด (แสดงที่หน้า Home)</label>
                  <input type="text" value={formData.discountDescription} onChange={e => setFormData({...formData, discountDescription: e.target.value})} placeholder="ส่วนลดเมื่อจ้างงาน สูงสุด 100 บาท" className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ลำดับ (Order)</label>
                    <input type="number" value={formData.order} onChange={e => setFormData({...formData, order: parseInt(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                 </div>
                 <div className="flex items-center gap-2 mt-5">
                    <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 accent-indigo-600"/>
                    <label htmlFor="isActive" className="text-sm font-bold text-slate-700">เปิดใช้งานทันที</label>
                 </div>
              </div>
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 pb-4">
                <button type="submit" disabled={saving} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
