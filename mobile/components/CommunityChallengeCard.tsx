import React, { useEffect, useState } from "react";
import { Users, Briefcase, CheckCircle2, Trophy, Sparkles } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  useMobileAppConfig,
  type CommunityChallengeStats,
} from "../context/MobileAppConfigContext";

function Bar({
  label,
  current,
  target,
  pct,
}: {
  label: string;
  current: number;
  target: number;
  pct: number;
}) {
  const cap = target > 0 ? Math.min(100, pct) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-amber-200/90">
          {current.toLocaleString()}
          {target > 0 ? ` / ${target.toLocaleString()}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-[width] duration-500"
          style={{ width: `${cap}%` }}
        />
      </div>
    </div>
  );
}

/**
 * เป้าหมายร่วม — ออนไลน์ / โพสต์งาน / จ้างสำเร็จ / ส่งมอบสำเร็จ (ควบคุมจากแอดมิน)
 */
export const CommunityChallengeCard: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { bootstrap } = useMobileAppConfig();
  const cc = bootstrap.communityChallenge;
  const [stats, setStats] = useState<CommunityChallengeStats | null>(cc?.stats ?? null);

  useEffect(() => {
    if (cc?.enabled && cc.stats) setStats(cc.stats);
  }, [cc?.enabled, cc?.stats]);

  useEffect(() => {
    if (!cc?.enabled) return;
    const t = window.setInterval(() => {
      api
        .get<{ enabled?: boolean; stats?: CommunityChallengeStats }>("/app/community-challenge")
        .then((r) => {
          if (r.data?.enabled && r.data.stats) setStats(r.data.stats);
        })
        .catch(() => {});
    }, 60_000);
    return () => window.clearInterval(t);
  }, [cc?.enabled]);

  useEffect(() => {
    if (!user || !cc?.enabled) return;
    const ping = () => {
      api.post("/users/me/activity-ping", {}).catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 120_000);
    return () => window.clearInterval(id);
  }, [user?.id, cc?.enabled]);

  if (!cc?.enabled || !cc.config || !stats) return null;

  const cfg = cc.config as Record<string, string | number | boolean | null | undefined>;
  const th = language === "en" ? false : true;
  const title = String(th ? cfg.titleTh ?? "" : cfg.titleEn ?? cfg.titleTh ?? "Community Challenge");
  const subtitle = String(th ? cfg.subtitleTh ?? "" : cfg.subtitleEn ?? "");
  const rewardTitle = String(th ? cfg.rewardTitleTh ?? "" : cfg.rewardTitleEn ?? "");
  const rewardDesc = String(th ? cfg.rewardDescriptionTh ?? "" : cfg.rewardDescriptionEn ?? "");
  const empNote = String(th ? cfg.employerNoteTh ?? "" : cfg.employerNoteEn ?? "");
  const provNote = String(th ? cfg.providerNoteTh ?? "" : cfg.providerNoteEn ?? "");

  const { progress, targets } = stats;

  return (
    <div className="luxury-card border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-slate-950/80 p-4 sm:p-5 rounded-2xl shadow-lg">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 shrink-0">
          <Trophy className="w-7 h-7 text-amber-400" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-amber-100 leading-tight flex items-center gap-2 flex-wrap">
            {title}
            {stats.allTargetsMet ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-200 border border-emerald-500/40">
                <Sparkles size={14} /> {th ? "ครบเป้าหมาย!" : "Goals met!"}
              </span>
            ) : null}
          </h2>
          {subtitle ? <p className="text-sm text-slate-400 mt-1">{subtitle}</p> : null}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4 text-xs text-slate-400">
        <div className="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3">
          <p className="font-semibold text-sky-300/90 mb-1 flex items-center gap-1">
            <Briefcase size={14} /> {th ? "ฝั่งผู้จ้าง" : "Employers"}
          </p>
          <p className="leading-relaxed">{empNote || (th ? "โพสต์งาน · จ้างงานสำเร็จ" : "Post jobs · successful hires")}</p>
        </div>
        <div className="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3">
          <p className="font-semibold text-violet-300/90 mb-1 flex items-center gap-1">
            <Users size={14} /> {th ? "ฝั่งผู้ให้บริการ" : "Providers"}
          </p>
          <p className="leading-relaxed">{provNote || (th ? "รับงาน · ส่งมอบสำเร็จ" : "Accept jobs · complete work")}</p>
        </div>
      </div>

      <div className="space-y-4 mb-4">
        <Bar
          label={th ? `ผู้ออนไลน์ (~${stats.onlineWindowMinutes} นาที)` : `Online now (~${stats.onlineWindowMinutes} min)`}
          current={stats.onlineUsers}
          target={targets.onlineUsers}
          pct={progress.onlinePct}
        />
        <Bar
          label={th ? "งานที่โพสต์ (Match + Advance)" : "Jobs posted (Match + Advance)"}
          current={stats.jobsPosted}
          target={targets.jobsPosted}
          pct={progress.postedPct}
        />
        <Bar
          label={th ? "งานที่มีผู้รับแล้ว" : "Jobs with hire"}
          current={stats.hiresTotal}
          target={targets.hires}
          pct={progress.hiresPct}
        />
        <Bar
          label={th ? "งานส่งมอบสำเร็จ" : "Jobs completed"}
          current={stats.completedTotal}
          target={targets.completed}
          pct={progress.completedPct}
        />
      </div>

      {(rewardTitle || rewardDesc) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-3 py-3 flex gap-2">
          <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            {rewardTitle ? <p className="text-sm font-semibold text-amber-100">{rewardTitle}</p> : null}
            {rewardDesc ? <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">{rewardDesc}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
};
