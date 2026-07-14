import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ExternalLink,
  MapPin,
  Star,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../services/api";
import {
  buildAdsDestinationPresets,
  parseAdsDestination,
  type AdsDestinationKind,
  type AdsDestinationPreviewModel,
} from "../lib/adsDestinationPreview";

type Props = {
  destinationUrl: string;
  headline?: string;
  userId?: string | null;
  userDisplayName?: string | null;
  userAvatarUrl?: string | null;
  onSelectPreset?: (path: string) => void;
  compact?: boolean;
};

function kindAccent(kind: AdsDestinationKind): string {
  const map: Record<AdsDestinationKind, string> = {
    profile: "from-blue-500 to-indigo-600",
    talent_profile: "from-orange-400 to-amber-500",
    talent_booking: "from-pink-500 to-rose-500",
    booking_transport: "from-emerald-500 to-teal-600",
    advance_job: "from-violet-500 to-purple-600",
    job_detail: "from-slate-600 to-slate-800",
    talents_list: "from-cyan-500 to-blue-600",
    job_board: "from-indigo-500 to-violet-600",
    external: "from-slate-500 to-slate-700",
    unknown: "from-slate-400 to-slate-500",
  };
  return map[kind] || map.unknown;
}

function MockScreen({
  model,
  headline,
  displayName,
  avatarUrl,
  compact,
}: {
  model: AdsDestinationPreviewModel;
  headline?: string;
  displayName: string;
  avatarUrl?: string | null;
  compact?: boolean;
}) {
  const h = compact ? "h-[220px]" : "h-[280px]";

  return (
    <div className={`relative overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-inner ${h}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/90 text-[10px] text-slate-500">
        <ArrowLeft size={12} />
        <span className="truncate">{model.routePath}</span>
      </div>

      {(model.kind === "profile" || model.kind === "talent_profile") && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover bg-slate-100" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                <User size={18} className="text-slate-500" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{displayName}</p>
              <p className="text-[10px] text-amber-600 flex items-center gap-0.5">
                <Star size={10} fill="currentColor" /> 4.0 · รีวิว
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {["About", "Video", "Reviews"].map((t, i) => (
              <span
                key={t}
                className={`text-[9px] px-2 py-0.5 rounded-full border ${
                  i === 0 ? "border-orange-300 text-orange-700 bg-orange-50" : "border-slate-200 text-slate-500"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-1">
            <p className="text-[9px] font-semibold text-slate-700">Certifications & Ratings</p>
            <p className="text-[9px] text-slate-500">Grade C · งานสำเร็จ · Success rate</p>
          </div>
          {model.kind === "talent_profile" && (
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-white/95 border-t border-slate-100 flex gap-1">
              <div className="flex-1 h-7 rounded-lg border border-orange-300 text-[9px] flex items-center justify-center text-orange-700 font-semibold">
                เลือกเวลา
              </div>
              <div className="flex-1 h-7 rounded-lg bg-orange-500 text-[9px] flex items-center justify-center text-white font-bold">
                Book Now
              </div>
            </div>
          )}
          {model.kind === "profile" && model.tab === "wallet" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 flex items-center gap-2">
              <Wallet size={14} className="text-emerald-600" />
              <p className="text-[9px] text-emerald-800 font-semibold">Wallet · ยอดคงเหลือ</p>
            </div>
          )}
        </div>
      )}

      {model.kind === "talent_booking" && (
        <div className="p-3 space-y-2">
          <p className="text-xs font-bold text-slate-800">{headline || "จองคิว Expert"}</p>
          <p className="text-[10px] text-slate-500">เลือกช่วงเวลาที่ต้องการจองคิว</p>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded text-[8px] flex items-center justify-center ${
                  i === 5 ? "bg-emerald-500 text-white font-bold" : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 10}
              </div>
            ))}
          </div>
          <div className="h-7 rounded-lg bg-orange-500 text-[10px] text-white font-bold flex items-center justify-center">
            ยืนยันการจอง
          </div>
        </div>
      )}

      {model.kind === "booking_transport" && (
        <div className="p-3 space-y-2">
          <div className="h-16 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center gap-1 text-emerald-700">
            <MapPin size={14} />
            <span className="text-[10px] font-semibold">แผนที่ · เลือกจุดรับ–ส่ง</span>
          </div>
          <div className="rounded-lg border border-slate-100 p-2 text-[10px] text-slate-600">
            ประมาณค่าโดยสาร · ยืนยันการจอง
          </div>
        </div>
      )}

      {(model.kind === "advance_job" || model.kind === "job_detail") && (
        <div className="p-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Briefcase size={14} className="text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 line-clamp-2">
                {headline || "รายละเอียดงาน Advance"}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">งบประมาณ · ระยะเวลา · ขอบเขตงาน</p>
            </div>
          </div>
          <div className="flex gap-1">
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">สมัครงาน</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">จ้าง Talent</span>
          </div>
          {model.jobId && (
            <p className="text-[9px] text-slate-400 font-mono truncate">ID: {model.jobId}</p>
          )}
        </div>
      )}

      {model.kind === "talents_list" && (
        <div className="p-3 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="rounded-lg border border-slate-100 p-2 flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-slate-200" />
              <p className="text-[9px] text-slate-600">Expert {n}</p>
            </div>
          ))}
        </div>
      )}

      {model.kind === "job_board" && (
        <div className="p-3 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="rounded-lg border border-slate-100 p-2">
              <p className="text-[10px] font-semibold text-slate-800">งาน #{n}</p>
              <p className="text-[9px] text-slate-500">Advance Job · เปิดรับสมัคร</p>
            </div>
          ))}
        </div>
      )}

      {model.kind === "external" && (
        <div className="p-3 flex flex-col items-center justify-center h-full gap-2 text-center">
          <ExternalLink size={22} className="text-slate-500" />
          <p className="text-[10px] text-slate-600 px-4 break-all">{model.routePath}</p>
          <p className="text-[9px] text-slate-400">เปิดลิงก์ภายนอก</p>
        </div>
      )}

      {model.kind === "unknown" && (
        <div className="p-3 flex flex-col items-center justify-center h-full gap-1 text-center">
          <Calendar size={18} className="text-slate-400" />
          <p className="text-[10px] text-slate-600 font-mono px-3 break-all">{model.routePath}</p>
        </div>
      )}
    </div>
  );
}

export const AdsDestinationPreview: React.FC<Props> = ({
  destinationUrl,
  headline,
  userId,
  userDisplayName,
  userAvatarUrl,
  onSelectPreset,
  compact,
}) => {
  const model = useMemo(() => parseAdsDestination(destinationUrl), [destinationUrl]);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  useEffect(() => {
    if (!model.talentId) {
      setResolvedName(null);
      return;
    }
    if (model.talentId === userId && userDisplayName) {
      setResolvedName(userDisplayName);
      return;
    }
    let cancelled = false;
    api
      .get(`/users/profile/${model.talentId}`)
      .then((r) => {
        if (!cancelled) {
          setResolvedName(
            r.data?.display_name || r.data?.name || r.data?.full_name || "Expert / Talent",
          );
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedName("Expert / Talent");
      });
    return () => {
      cancelled = true;
    };
  }, [model.talentId, userId, userDisplayName]);

  const displayName =
    model.kind === "profile"
      ? userDisplayName || "โปรไฟล์ของฉัน"
      : resolvedName || userDisplayName || "Demo Expert";

  const presets = buildAdsDestinationPresets(userId);

  return (
    <div className="space-y-3">
      {onSelectPreset && presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => onSelectPreset(p.path)}
              className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                model.routePath === p.path || destinationUrl === p.path
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
              }`}
            >
              <span className="font-semibold block">{p.label}</span>
              <span className="text-[10px] text-slate-500">{p.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ตัวอย่างหน้าจอ</p>
            <p className="text-sm font-bold text-slate-900">{model.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{model.subtitle}</p>
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold text-white px-2 py-1 rounded-lg bg-gradient-to-r ${kindAccent(model.kind)}`}
          >
            {model.kind === "talent_profile" ? "Expert" : model.kind === "profile" ? "Profile" : "Landing"}
          </span>
        </div>

        <MockScreen
          model={model}
          headline={headline}
          displayName={displayName}
          avatarUrl={userAvatarUrl}
          compact={compact}
        />

        <div className="mt-2 flex items-start gap-2 text-[11px] text-slate-600">
          <Users size={13} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-slate-800 break-all">{model.routePath}</p>
            {model.hint && <p className="text-slate-500 mt-0.5 leading-snug">{model.hint}</p>}
            {!model.isValid && (
              <p className="text-red-600 mt-1">เส้นทางอาจไม่ถูกต้อง — ตรวจ path อีกครั้ง</p>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        ตัวอย่าง: <span className="font-mono">/profile</span> ·{" "}
        <span className="font-mono">/talents/{"{uuid}"}</span> ·{" "}
        <span className="font-mono">/talents/{"{uuid}"}/beauty-booking</span> ·{" "}
        <span className="font-mono">/job-board/{"{jobId}"}</span> (หรือ{" "}
        <span className="font-mono">/advancejob/{"{jobId}"}</span>)
      </p>
    </div>
  );
};

export default AdsDestinationPreview;
