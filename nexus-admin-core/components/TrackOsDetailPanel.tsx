import React from "react";
import { Loader2, MapPin, Radio, RefreshCw } from "lucide-react";
import type { AdminFoodTrackProjection } from "../services/adminApi";

function fmtThbMicro(micro?: number) {
  if (micro == null) return "—";
  return `฿${(micro / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
}

function fmtDt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH");
  } catch {
    return iso;
  }
}

type Props = {
  orderId: string;
  projection: AdminFoodTrackProjection | null;
  loading: boolean;
  live: boolean;
  onRefresh: () => void;
  onOpenUser?: (userId: string) => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

export function TrackOsDetailPanel({
  orderId,
  projection,
  loading,
  live,
  onRefresh,
  onOpenUser,
}: Props) {
  if (loading && !projection) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลด Track OS…
      </div>
    );
  }

  if (!projection) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        ไม่พบข้อมูล Track OS สำหรับออเดอร์นี้
      </div>
    );
  }

  const p = projection;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">Track OS — Single Pane</p>
          <p className="font-mono text-sm text-slate-800">{orderId}</p>
          <p className="text-xs text-slate-600">
            {p.status_th || p.phase} · อัปเดต {fmtDt(p.generated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
              live ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            <Radio className={`h-3 w-3${live ? " animate-pulse" : ""}`} />
            {live ? "Live" : "Paused"}
          </span>
          <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">seq {p.realtime_seq}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3 w-3${loading ? " animate-spin" : ""}`} />
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Order Summary">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Phase</dt>
              <dd className="font-medium text-slate-900">{p.phase}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Dispatch</dt>
              <dd className="text-right text-slate-800">{p.dispatch_status}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Fulfillment</dt>
              <dd>{p.order?.fulfillment_status || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Amount</dt>
              <dd>{fmtThbMicro(p.order?.amount_micro)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Payment</dt>
              <dd>{p.order?.payment_method || "—"}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Parties">
          <ul className="space-y-2 text-sm">
            {p.parties.map((party) => (
              <li key={party.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {party.role === "customer" && "👤 "}
                    {party.role === "merchant" && "🍽️ "}
                    {party.role === "rider" && "🛵 "}
                    {party.label}
                  </p>
                  <p className="text-xs text-slate-500">{party.role}</p>
                  {party.phone && <p className="text-xs text-slate-500">{party.phone}</p>}
                </div>
                {onOpenUser && party.role === "customer" && (
                  <button
                    type="button"
                    className="text-xs text-emerald-700 hover:underline"
                    onClick={() => onOpenUser(party.id)}
                  >
                    เปิด
                  </button>
                )}
              </li>
            ))}
            {!p.parties.length && <li className="text-slate-500">—</li>}
          </ul>
        </Section>

        <Section title="GPS / Realtime">
          {p.gps?.lat != null && p.gps.lng != null ? (
            <div className="space-y-2 text-sm">
              <p className="inline-flex items-center gap-1 text-slate-800">
                <MapPin className="h-4 w-4 text-emerald-600" />
                {p.gps.lat.toFixed(5)}, {p.gps.lng.toFixed(5)}
              </p>
              <p className="text-xs text-slate-500">อัปเดต {fmtDt(p.gps.updated_at)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีพิกัด GPS</p>
          )}
          {p.dispatch_job && (
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Job</dt>
                <dd className="font-mono">{p.dispatch_job.id.slice(0, 12)}…</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Rider</dt>
                <dd className="font-mono">{p.dispatch_job.rider_id?.slice(0, 12) || "—"}</dd>
              </div>
            </dl>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Customer Confirmation">
          {p.confirm?.customer_confirmed_at ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Confirmed</dt>
                <dd>{fmtDt(p.confirm.customer_confirmed_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Method</dt>
                <dd>{p.confirm.confirm_method || "manual"}</dd>
              </div>
            </dl>
          ) : p.confirm?.rider_delivered_at ? (
            <p className="text-sm text-amber-700">
              รอลูกค้ายืนยัน — auto {fmtDt(p.confirm.auto_confirm_at)}
            </p>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่ถึงขั้นยืนยัน</p>
          )}
        </Section>

        <Section title="Review & Tip">
          {p.review ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Stars</dt>
                <dd>{p.review.stars} ★</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tip</dt>
                <dd>{fmtThbMicro(p.review.tip_micro)}</dd>
              </div>
              {p.review.comment && <p className="text-xs text-slate-600">{p.review.comment}</p>}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีรีวิว</p>
          )}
        </Section>
      </div>

      <Section title="Proof Gallery">
        {p.proofs.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {p.proofs.map((proof) => (
              <figure key={proof.kind} className="overflow-hidden rounded-lg border border-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proof.url} alt={proof.label} className="h-32 w-full object-cover" />
                <figcaption className="px-2 py-1 text-xs text-slate-600">
                  {proof.label}
                  {proof.at && ` · ${fmtDt(proof.at)}`}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">ยังไม่มีหลักฐานรูป</p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Timeline">
          <ol className="max-h-72 space-y-0 overflow-y-auto border-l-2 border-emerald-200 pl-4">
            {p.timeline.events.map((e) => (
              <li key={e.id} className="relative pb-3">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-mono text-xs text-slate-400">{e.time_label}</span>
                <p className="text-sm font-medium text-slate-800">{e.label}</p>
                <p className="text-xs text-slate-400">{e.kind} · {e.source}</p>
              </li>
            ))}
            {!p.timeline.events.length && <li className="text-sm text-slate-500">ไม่มี event</li>}
          </ol>
        </Section>

        <Section title="Audit History">
          <ol className="max-h-72 space-y-0 overflow-y-auto border-l-2 border-slate-200 pl-4">
            {p.audit_events.map((e) => (
              <li key={`audit-${e.id}`} className="relative pb-3">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-mono text-xs text-slate-400">{e.time_label}</span>
                <p className="text-sm text-slate-800">{e.event_type}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Issue / Claim Status">
          {p.issues.length ? (
            <ul className="space-y-2 text-sm">
              {p.issues.map((issue) => (
                <li key={issue.id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                  <p className="font-medium text-slate-900">{issue.title}</p>
                  <p className="text-xs text-slate-600">
                    {issue.category} · {issue.status}
                    {issue.refund_amount_micro != null && ` · refund ${fmtThbMicro(issue.refund_amount_micro)}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">ไม่มีเคสปัญหา</p>
          )}
        </Section>

        <Section title="Incidents">
          {p.incidents.length ? (
            <ul className="space-y-2 text-sm">
              {p.incidents.map((inc) => (
                <li key={inc.id} className="rounded-lg border border-red-100 bg-red-50/40 px-3 py-2">
                  <p className="font-medium text-red-900">{inc.category}</p>
                  <p className="text-xs text-slate-600">{inc.transcript.slice(0, 120)}</p>
                  <p className="text-xs text-slate-400">{fmtDt(inc.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">ไม่มี incident</p>
          )}
        </Section>
      </div>

      <Section title="Chats">
        {p.chats.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {p.chats.map((thread) => (
              <div key={thread.channel} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">{thread.peer_label}</p>
                <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                  {thread.messages.slice(-8).map((m) => (
                    <li key={m.id} className="rounded bg-white px-2 py-1">
                      <span className="text-xs font-medium text-emerald-700">{m.from}</span>
                      <p className="text-slate-800">{m.text}</p>
                      <span className="text-xs text-slate-400">{fmtDt(m.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">ยังไม่มีแชท</p>
        )}
      </Section>
    </div>
  );
}
