import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  ExternalLink,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Save,
  Snowflake,
  Trophy,
  User,
} from "lucide-react";
import {
  getAdminGoldLottoConfig,
  getAdminGoldLottoDrawRuns,
  getAdminGoldLottoWinners,
  patchAdminGoldLottoConfig,
  patchAdminGoldLottoWinner,
  postAdminGoldLottoFreeze,
  postAdminGoldLottoPublish,
  postAdminGoldLottoRunDraw,
  postAdminGoldLottoSyncTickets,
  type GoldLottoCampaignRow,
  type GoldLottoConfig,
  type GoldLottoWinnerRow,
} from "../services/adminApi";

const DELIVERY_LABELS: Record<string, string> = {
  pending_delivery: "รอ Publish",
  awaiting_address: "รอที่อยู่จากผู้ชนะ",
  address_submitted: "ได้รับที่อยู่แล้ว",
  delivered: "ส่งมอบแล้ว",
  confirmed: "ยืนยันรับแล้ว",
  declined: "ปฏิเสธรางวัล",
};

type GoldLottoViewProps = {
  onOpenKycReview?: (userId: string) => void;
  onOpenUser?: (userId: string) => void;
};

function formatDeliveryAddress(addr?: Record<string, unknown> | null) {
  if (!addr) return "—";
  const parts = [
    addr.recipient_name,
    addr.phone,
    addr.address_line,
    addr.subdistrict,
    addr.district,
    addr.province,
    addr.postal_code,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(" · ") || "—";
}

function WinnerDetailCard({
  w,
  busy,
  onAct,
  onOpenKycReview,
  onOpenUser,
}: {
  w: GoldLottoWinnerRow;
  busy: boolean;
  onAct: (label: string, fn: () => Promise<unknown>) => void;
  onOpenKycReview?: (userId: string) => void;
  onOpenUser?: (userId: string) => void;
}) {
  const dossier = (w.dossier_json || {}) as Record<string, unknown>;
  const user = (dossier.user || {}) as Record<string, unknown>;
  const job = (dossier.winning_job || {}) as Record<string, unknown>;
  const skills = (dossier.skills || []) as Record<string, unknown>[];
  const kycStatus = String(user.kyc_status || "—");
  const addr = (w.delivery_address_json || null) as Record<
    string,
    unknown
  > | null;

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-amber-900">
            {w.pool_side === "employer" ? "ฝั่งจ้าง" : "ฝั่งรับ"} #
            {w.prize_rank} — {w.prize_name}
          </p>
          <p className="font-mono text-sm">รหัสงาน: {w.winning_display_code}</p>
          <p className="text-sm">
            {String(w.full_name || user.full_name || "—")} ·{" "}
            {String(w.phone || user.phone || "—")}
          </p>
          <p className="text-xs text-slate-600">
            KYC:{" "}
            <span
              className={
                kycStatus === "verified" || kycStatus === "approved"
                  ? "font-semibold text-emerald-700"
                  : "font-semibold text-red-600"
              }
            >
              {kycStatus}
            </span>
            {" · "}
            มอบรางวัล:{" "}
            {DELIVERY_LABELS[w.delivery_status || "pending_delivery"] ||
              w.delivery_status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenUser && w.winner_user_id ? (
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs"
              onClick={() => onOpenUser(w.winner_user_id)}
            >
              <User className="h-3 w-3" /> โปรไฟล์
            </button>
          ) : null}
          {onOpenKycReview && w.winner_user_id ? (
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs"
              onClick={() => onOpenKycReview(w.winner_user_id)}
            >
              <ExternalLink className="h-3 w-3" /> KYC
            </button>
          ) : null}
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              w.marketing_lock ? "bg-amber-200 text-amber-900" : "border"
            }`}
            onClick={() =>
              onAct("อัปเดต lock", () =>
                patchAdminGoldLottoWinner(w.id, {
                  marketing_lock: !w.marketing_lock,
                }),
              )
            }
          >
            <Lock className="mr-1 inline h-3 w-3" />
            {w.marketing_lock ? "Locked" : "Unlocked"}
          </button>
          <select
            className="rounded border px-2 py-1 text-xs"
            value={w.contact_status || "pending"}
            onChange={(e) =>
              onAct("อัปเดตสถานะติดต่อ", () =>
                patchAdminGoldLottoWinner(w.id, {
                  contact_status: e.target.value,
                }),
              )
            }
          >
            <option value="pending">pending</option>
            <option value="contacted">contacted</option>
            <option value="filmed">filmed</option>
            <option value="declined">declined</option>
          </select>
          <select
            className="rounded border px-2 py-1 text-xs"
            value={w.delivery_status || "pending_delivery"}
            onChange={(e) =>
              onAct("อัปเดตสถานะมอบรางวัล", () =>
                patchAdminGoldLottoWinner(w.id, {
                  delivery_status: e.target.value,
                }),
              )
            }
          >
            {Object.entries(DELIVERY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
        <p>งาน: {String(job.title || "—")}</p>
        <p>หมวด: {String(job.category || "—")}</p>
        <p>ที่อยู่งาน: {String(job.location || "—")}</p>
        <p>
          พิกัด:{" "}
          {job.lat != null && job.lng != null ? `${job.lat}, ${job.lng}` : "—"}
        </p>
        <p>
          Skills:{" "}
          {skills
            .map((s) => String(s.skill_name || s.skill_category))
            .join(", ") || "—"}
        </p>
        <p>Email: {String(w.email || user.email || "—")}</p>
        <p className="sm:col-span-2">
          ที่อยู่จัดส่งรางวัล: {formatDeliveryAddress(addr)}
          {w.delivery_consent_at ? (
            <span className="ml-1 text-emerald-700">
              (PDPA consent{" "}
              {new Date(w.delivery_consent_at).toLocaleString("th-TH")})
            </span>
          ) : null}
        </p>
        <label className="sm:col-span-2 text-xs">
          หมายเหตุ admin
          <input
            type="text"
            className="mt-1 w-full rounded border px-2 py-1"
            defaultValue={w.delivery_notes || ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (w.delivery_notes || "")) return;
              onAct("บันทึกหมายเหตุ", () =>
                patchAdminGoldLottoWinner(w.id, { delivery_notes: v }),
              );
            }}
          />
        </label>
      </div>
    </div>
  );
}

export const GoldLottoView: React.FC<GoldLottoViewProps> = ({
  onOpenKycReview,
  onOpenUser,
}) => {
  const [config, setConfig] = useState<GoldLottoConfig | null>(null);
  const [campaign, setCampaign] = useState<GoldLottoCampaignRow | null>(null);
  const [winners, setWinners] = useState<GoldLottoWinnerRow[]>([]);
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [employerPrizeCount, setEmployerPrizeCount] = useState("1");
  const [providerPrizeCount, setProviderPrizeCount] = useState("1");
  const [drawAt, setDrawAt] = useState("");
  const [autoDraw, setAutoDraw] = useState(true);
  const [requireKyc, setRequireKyc] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, winRes, runRes] = await Promise.all([
        getAdminGoldLottoConfig(),
        getAdminGoldLottoWinners(),
        getAdminGoldLottoDrawRuns(),
      ]);
      setConfig(cfgRes.config);
      setCampaign(cfgRes.campaign);
      setWinners(winRes.winners || []);
      setRuns(runRes.runs || []);
      const pools = cfgRes.config?.prize_pools || [];
      setEmployerPrizeCount(
        String(pools.find((p) => p.side === "employer")?.prize_count ?? 1),
      );
      setProviderPrizeCount(
        String(pools.find((p) => p.side === "provider")?.prize_count ?? 1),
      );
      setDrawAt(
        cfgRes.config?.draw_at
          ? new Date(cfgRes.config.draw_at).toISOString().slice(0, 16)
          : "",
      );
      setAutoDraw(cfgRes.config?.auto_draw_enabled !== false);
      setRequireKyc(cfgRes.config?.require_kyc_for_winner !== false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const prize_pools = [
        {
          side: "employer" as const,
          label: "ฝั่งจ้างงาน",
          prize_count: Number(employerPrizeCount) || 1,
          prize_name: "ทองคำ 1 บาท",
        },
        {
          side: "provider" as const,
          label: "ฝั่งรับงาน",
          prize_count: Number(providerPrizeCount) || 1,
          prize_name: "ทองคำ 1 บาท",
        },
      ];
      const drawIso = drawAt ? new Date(drawAt).toISOString() : config?.draw_at;
      const res = await patchAdminGoldLottoConfig({
        prize_pools,
        draw_at: drawIso,
        auto_draw_enabled: autoDraw,
        require_kyc_for_winner: requireKyc,
      });
      setConfig(res.config);
      setCampaign(res.campaign);
      setNotice("บันทึกการตั้งค่าแล้ว");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await fn();
      setNotice(label);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-3">
        <Trophy className="h-8 w-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gold Lotto / จับฉลากทอง
          </h1>
          <p className="text-sm text-slate-500">
            1 งาน = 1 สลาก · ห้ามคนเดียวชนะ 2 pool · ออกผล 30 ธ.ค. 2569 12:00
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="ml-auto flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> รีเฟรช
        </button>
      </div>

      {notice ? (
        <p className="mb-3 text-sm text-emerald-600">{notice}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {campaign?.status && campaign.status !== "draft" ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>แคมเปญจริง ({config?.campaign_id})</strong> อยู่สถานะ{" "}
          <span className="font-semibold capitalize">{campaign.status}</span>
          {campaign.status === "published" || campaign.status === "drawn" ? (
            <span> — ไม่สามารถ Sync / Freeze / จับฉลากซ้ำได้</span>
          ) : campaign.status === "frozen" ? (
            <span> — กด ออกผล (Manual) ได้ หรือรอ cron</span>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">
            สถานะแคมเปญจริง ({config?.campaign_id || "—"})
          </p>
          <p className="text-lg font-bold capitalize">
            {campaign?.status || "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">สลากฝั่งจ้าง</p>
          <p className="text-lg font-bold">
            {campaign?.ticket_count_employer?.toLocaleString() ?? 0}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">สลากฝั่งรับ</p>
          <p className="text-lg font-bold">
            {campaign?.ticket_count_provider?.toLocaleString() ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">ตั้งค่าแคมเปญ</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            วันออกผล (local)
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={drawAt}
              onChange={(e) => setDrawAt(e.target.value)}
            />
          </label>
          <label className="text-sm">
            รางวัลฝั่งจ้าง (จำนวน)
            <input
              type="number"
              min={1}
              max={10}
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={employerPrizeCount}
              onChange={(e) => setEmployerPrizeCount(e.target.value)}
            />
          </label>
          <label className="text-sm">
            รางวัลฝั่งรับ (จำนวน)
            <input
              type="number"
              min={1}
              max={10}
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={providerPrizeCount}
              onChange={(e) => setProviderPrizeCount(e.target.value)}
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoDraw}
              onChange={(e) => setAutoDraw(e.target.checked)}
            />
            ออกผลอัตโนมัติตามเวลา
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireKyc}
              onChange={(e) => setRequireKyc(e.target.checked)}
            />
            ผู้ชนะต้อง KYC ผ่าน
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={saveConfig}
          className="mt-3 flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> บันทึกการตั้งค่า
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act("Sync สลากแล้ว", () => postAdminGoldLottoSyncTickets())
          }
          className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Sync สลาก
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act("Freeze pool แล้ว", () => postAdminGoldLottoFreeze())
          }
          className="flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm"
        >
          <Snowflake className="h-4 w-4" /> Freeze
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("จับฉลากแล้ว", () => postAdminGoldLottoRunDraw())}
          className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-sm text-white"
        >
          <Play className="h-4 w-4" /> ออกผล (Manual)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act("เผยแพร่ผลแล้ว", () => postAdminGoldLottoPublish())
          }
          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
        >
          <Award className="h-4 w-4" /> Publish
        </button>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">ผู้โชคดี + Dossier (แคมเปญจริง)</h2>
        {winners.length === 0 ? (
          <p className="text-sm text-slate-500">
            ยังไม่มีผู้ชนะ — รอหาผู้โชคดีคนต่อไป…
          </p>
        ) : (
          <div className="space-y-3">
            {winners.map((w) => (
              <WinnerDetailCard
                key={w.id}
                w={w}
                busy={busy}
                onAct={act}
                onOpenKycReview={onOpenKycReview}
                onOpenUser={onOpenUser}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Audit — Draw Runs (แคมเปญจริง)</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มี log การจับ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-2">Pool</th>
                  <th className="py-2 pr-2">Rank</th>
                  <th className="py-2 pr-2">Tickets</th>
                  <th className="py-2 pr-2">Index</th>
                  <th className="py-2 pr-2">Trigger</th>
                  <th className="py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={String(r.id)} className="border-b border-slate-100">
                    <td className="py-2 pr-2">{String(r.pool_side)}</td>
                    <td className="py-2 pr-2">{String(r.prize_rank)}</td>
                    <td className="py-2 pr-2">{String(r.ticket_count)}</td>
                    <td className="py-2 pr-2">{String(r.winning_index)}</td>
                    <td className="py-2 pr-2">{String(r.trigger_type)}</td>
                    <td className="py-2 font-mono">
                      {String(r.rng_seed_hash || "").slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
