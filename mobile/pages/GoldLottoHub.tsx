import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Trophy } from "lucide-react";
import { Layout } from "../components/Layout";
import {
  confirmGoldLottoReceipt,
  fetchGoldLottoCampaign,
  fetchGoldLottoLive,
  fetchGoldLottoMe,
  fetchGoldLottoMyPrize,
  fetchGoldLottoWinners,
  submitGoldLottoDelivery,
  type GoldLottoPrizeWin,
  type GoldLottoWinnerPublic,
} from "../services/goldLottoApi";

function useCountdown(targetIso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    if (!targetIso) return null;
    const end = new Date(targetIso).getTime();
    const diff = Math.max(0, end - now);
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, done: diff <= 0 };
  }, [targetIso, now]);
}

function LottoReveal({ code }: { code: string }) {
  const parts = code.split("-");
  const tail = parts[parts.length - 1] || code;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= tail.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 450);
    return () => clearTimeout(t);
  }, [shown, tail.length]);
  return (
    <div className="flex justify-center gap-1 py-2">
      {tail.split("").map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className={`flex h-10 w-8 items-center justify-center rounded-lg border text-lg font-bold ${
            i < shown
              ? "border-amber-400 bg-amber-100 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-300"
          }`}
        >
          {i < shown ? ch : "?"}
        </span>
      ))}
    </div>
  );
}

function WinnerCard({ w }: { w: GoldLottoWinnerPublic }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
      <p className="text-xs font-medium text-amber-700">
        {w.pool_side === "employer" ? "ฝั่งจ้างงาน" : "ฝั่งรับงาน"} ·{" "}
        {w.prize_name}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">
        {w.winner_name || "ผู้โชคดี"}
      </p>
      <p className="font-mono text-sm text-blue-800">
        {w.winning_display_code}
      </p>
      {w.winning_display_code ? (
        <LottoReveal code={w.winning_display_code} />
      ) : null}
    </div>
  );
}

const DELIVERY_HINT: Record<string, string> = {
  pending_delivery: "รอประกาศผลอย่างเป็นทางการ",
  awaiting_address: "กรุณากรอกที่อยู่จัดส่งรางวัลด้านล่าง",
  address_submitted: "ได้รับที่อยู่แล้ว — รอทีมงานจัดส่ง",
  delivered: "ส่งมอบแล้ว — กดยืนยันเมื่อได้รับทอง",
  confirmed: "ยืนยันรับรางวัลเรียบร้อยแล้ว",
  declined: "ปฏิเสธรางวัล",
};

function PrizeDeliveryPanel({
  win,
  onUpdated,
}: {
  win: GoldLottoPrizeWin;
  onUpdated: () => void;
}) {
  const addr = (win.delivery_address_json || {}) as Record<string, unknown>;
  const canSubmit = ["awaiting_address", "address_submitted"].includes(
    win.delivery_status,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [form, setForm] = useState({
    recipient_name: String(addr.recipient_name || ""),
    phone: String(addr.phone || ""),
    address_line: String(addr.address_line || ""),
    subdistrict: String(addr.subdistrict || ""),
    district: String(addr.district || ""),
    province: String(addr.province || ""),
    postal_code: String(addr.postal_code || ""),
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitGoldLottoDelivery({
        winnerId: win.id,
        ...form,
        consent,
      });
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const confirmReceipt = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmGoldLottoReceipt(win.id);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="h-5 w-5 text-amber-600" />
        <h2 className="font-bold text-amber-900">คุณได้รับรางวัลทองคำ!</h2>
      </div>
      <p className="text-sm text-slate-700">
        {win.pool_side === "employer" ? "ฝั่งจ้างงาน" : "ฝั่งรับงาน"} ·{" "}
        {win.prize_name} ·{" "}
        <span className="font-mono">{win.winning_display_code}</span>
      </p>
      <p className="mt-1 text-xs font-medium text-amber-800">
        {DELIVERY_HINT[win.delivery_status] || win.delivery_status}
      </p>

      {canSubmit ? (
        <div className="mt-3 space-y-2">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="ชื่อผู้รับ"
            value={form.recipient_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, recipient_name: e.target.value }))
            }
          />
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="เบอร์โทร"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="ที่อยู่ (บ้านเลขที่ หมู่ ซอย ถนน)"
            rows={2}
            value={form.address_line}
            onChange={(e) =>
              setForm((f) => ({ ...f, address_line: e.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="ตำบล/แขวง"
              value={form.subdistrict}
              onChange={(e) =>
                setForm((f) => ({ ...f, subdistrict: e.target.value }))
              }
            />
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="อำเภอ/เขต"
              value={form.district}
              onChange={(e) =>
                setForm((f) => ({ ...f, district: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="จังหวัด *"
              value={form.province}
              onChange={(e) =>
                setForm((f) => ({ ...f, province: e.target.value }))
              }
            />
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="รหัสไปรษณีย์"
              value={form.postal_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, postal_code: e.target.value }))
              }
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            ยินยอมให้ AQOND เก็บและใช้ที่อยู่เพื่อจัดส่งรางวัล
            และติดต่อเกี่ยวกับ รางวัลตาม PDPA
          </label>
          <button
            type="button"
            disabled={busy || !consent}
            onClick={submit}
            className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก…" : "ส่งที่อยู่จัดส่งรางวัล"}
          </button>
        </div>
      ) : null}

      {win.delivery_status === "delivered" ? (
        <button
          type="button"
          disabled={busy}
          onClick={confirmReceipt}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          ยืนยันว่าได้รับรางวัลแล้ว
        </button>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function GoldLottoHub() {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Awaited<
    ReturnType<typeof fetchGoldLottoCampaign>
  > | null>(null);
  const [myTickets, setMyTickets] = useState<{
    employer: number;
    provider: number;
    total: number;
  } | null>(null);
  const [winners, setWinners] = useState<GoldLottoWinnerPublic[]>([]);
  const [myPrizes, setMyPrizes] = useState<GoldLottoPrizeWin[]>([]);

  const drawAt = campaign?.campaign?.draw_at || campaign?.config?.draw_at;
  const countdown = useCountdown(drawAt);
  const published = campaign?.config?.public_results_enabled;

  const reloadPrizes = useCallback(async () => {
    const wins = await fetchGoldLottoMyPrize().catch(() => []);
    setMyPrizes(wins);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [camp, win, me, prizes] = await Promise.all([
          fetchGoldLottoCampaign(),
          fetchGoldLottoWinners().catch(() => []),
          fetchGoldLottoMe().catch(() => null),
          fetchGoldLottoMyPrize().catch(() => []),
        ]);
        setCampaign(camp);
        setWinners(win);
        setMyPrizes(prizes);
        if (me) {
          setMyTickets({
            employer: me.employer || 0,
            provider: me.provider || 0,
            total: me.total || 0,
          });
        }
        if (camp?.config?.public_results_enabled && camp?.campaign?.id) {
          const live = await fetchGoldLottoLive(camp.campaign.id).catch(
            () => null,
          );
          if (live?.winners?.length) setWinners(live.winners);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (!campaign?.enabled) {
    return (
      <Layout>
        <div className="p-6 text-center text-slate-500">กิจกรรมยังไม่เปิด</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-gradient-to-b from-amber-50 to-slate-50 px-4 py-6 pb-24">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-7 w-7 text-amber-600" />
          <h1 className="text-xl font-bold text-slate-900">
            {campaign.config?.title || "ลุ้นทองคำ 1 บาท"}
          </h1>
        </div>

        <div className="mb-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">
            1 งานจบ + ชำระแล้ว = 1 สลาก · แยกรางวัลฝั่งจ้าง / ฝั่งรับ
          </p>
          {countdown && !countdown.done ? (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["วัน", countdown.d],
                ["ชม.", countdown.h],
                ["น.", countdown.m],
                ["วิ.", countdown.s],
              ].map(([label, val]) => (
                <div
                  key={String(label)}
                  className="rounded-lg bg-amber-100 py-2"
                >
                  <div className="text-xl font-bold text-amber-900">{val}</div>
                  <div className="text-xs text-amber-700">{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-center text-sm font-semibold text-amber-800">
              {published ? "ประกาศผลแล้ว!" : "ถึงเวลาจับฉลาก — รอประกาศผล…"}
            </p>
          )}
          <p className="mt-2 text-center text-xs text-slate-500">
            ออกผล 30 ธ.ค. 2569 เวลา 12:00 น.
          </p>
        </div>

        {myTickets ? (
          <div className="mb-4 rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-semibold text-slate-800">สลากของฉัน</h2>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-2xl font-bold text-blue-800">
                  {myTickets.employer}
                </p>
                <p className="text-slate-500">ฝั่งจ้าง</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">
                  {myTickets.provider}
                </p>
                <p className="text-slate-500">ฝั่งรับ</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">
                  {myTickets.total}
                </p>
                <p className="text-slate-500">รวม</p>
              </div>
            </div>
          </div>
        ) : null}

        {myPrizes.length > 0 ? (
          <div className="space-y-3">
            {myPrizes.map((p) => (
              <PrizeDeliveryPanel key={p.id} win={p} onUpdated={reloadPrizes} />
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-800">
            {winners.length ? "ผู้โชคดี" : "รอหาผู้โชคดีคนต่อไป…"}
          </h2>
          {winners.length === 0 ? (
            <p className="text-sm text-slate-500">
              จับฉลากจากรหัสงาน DRV-… / CLN-… แบบสุ่มโปร่งใส — คนเดียวไม่ได้ 2
              รางวัล
            </p>
          ) : (
            <div className="space-y-3">
              {winners.map((w) => (
                <WinnerCard key={w.id} w={w} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          สลากรวมในระบบ: จ้าง{" "}
          {campaign.campaign?.ticket_count_employer?.toLocaleString() ?? 0} ·
          รับ {campaign.campaign?.ticket_count_provider?.toLocaleString() ?? 0}
        </div>
      </div>
    </Layout>
  );
}
