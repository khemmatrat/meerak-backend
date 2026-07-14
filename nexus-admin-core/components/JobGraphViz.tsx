import React, { useCallback, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type {
  AdminJobGraph,
  AdminJobGraphStep,
  AdminJobGraphStepAction,
} from "../services/adminApi";
import {
  adminRejectJob,
  adminReleaseJobEscrow,
  adminSuspendJob,
  getAdminJobGraphDetail,
  postAdminUserSupportCase,
  runAutoRelease,
} from "../services/adminApi";
import type { AdminJobGraphPlaybookItem } from "../services/adminApi";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";

const FUNNEL_KEYS = ["post", "bid", "accept", "pay", "review"] as const;

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function stepStyle(state: AdminJobGraphStep["state"]) {
  if (state === "done") return "bg-emerald-500 border-emerald-600 text-white";
  if (state === "stuck")
    return "bg-amber-500 border-amber-600 text-white animate-pulse";
  if (state === "blocked") return "bg-red-500 border-red-700 text-white";
  return "bg-slate-100 border-slate-200 text-slate-400";
}

function labelStyle(state: AdminJobGraphStep["state"]) {
  if (state === "done") return "text-emerald-700";
  if (state === "stuck") return "text-amber-700 font-bold";
  if (state === "blocked") return "text-red-700 font-bold";
  return "text-slate-400";
}

function fallbackSteps(graph: AdminJobGraph): AdminJobGraphStep[] {
  const types = new Set(graph.nodes.map((n) => n.type));
  const defs = [
    { key: "post", label: "Post", types: ["job_posted"] },
    { key: "bid", label: "Bid", types: ["job_bid"] },
    {
      key: "accept",
      label: "Accept",
      types: ["job_bid_accepted", "job_accepted"],
    },
    { key: "pay", label: "Pay", types: ["payment_created", "escrow_held"] },
    { key: "review", label: "Review", types: ["job_review"] },
  ];
  return defs.map((d) => {
    const ev = graph.nodes.filter((n) => d.types.includes(n.type));
    const done = ev.length > 0;
    const latest = ev[ev.length - 1];
    return {
      key: d.key,
      label: d.label,
      state: done ? "done" : "pending",
      ts: latest?.ts ?? null,
      amount: latest?.amount ?? null,
      events: ev.map((e) => ({
        type: e.type,
        ts: e.ts,
        amount: e.amount,
        source: e.source,
      })),
      admin_actions: [],
    };
  });
}

export interface JobGraphVizProps {
  graphs: AdminJobGraph[];
  maxJobs?: number;
  userId?: string;
  onNavigate?: (view: string) => void;
  onOpenJobOps?: (jobId: string) => void;
  onOpenUserPayouts?: () => void;
  onScrollToSection?: (section: string) => void;
  onFilterMovementsByJob?: (jobId: string) => void;
  onRefresh?: () => void;
  onNotice?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const JobGraphViz: React.FC<JobGraphVizProps> = ({
  graphs,
  maxJobs = 6,
  userId,
  onNavigate,
  onOpenJobOps,
  onOpenUserPayouts,
  onScrollToSection,
  onFilterMovementsByJob,
  onRefresh,
  onNotice,
}) => {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<{
    jobId: string;
    key: string;
  } | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AdminJobGraph>>(
    {},
  );
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const loadDetail = useCallback(
    async (jobId: string) => {
      if (detailCache[jobId]) return detailCache[jobId];
      setLoadingDetail(jobId);
      try {
        const res = await getAdminJobGraphDetail(jobId);
        setDetailCache((c) => ({ ...c, [jobId]: res.graph as AdminJobGraph }));
        return res.graph as AdminJobGraph;
      } catch (e) {
        onNotice?.(
          e instanceof Error ? e.message : "โหลดรายละเอียด job ไม่สำเร็จ",
          "error",
        );
        return null;
      } finally {
        setLoadingDetail(null);
      }
    },
    [detailCache, onNotice],
  );

  const handleStepClick = async (
    graph: AdminJobGraph,
    step: AdminJobGraphStep,
  ) => {
    setExpandedJob(graph.job_id);
    setSelectedStep({ jobId: graph.job_id, key: step.key });
    await loadDetail(graph.job_id);
  };

  const runAction = async (action: AdminJobGraphStepAction, jobId: string) => {
    if (action.action === "info") return;
    if (action.action === "navigate" && action.view) {
      if (action.view === "job-ops" && onOpenJobOps) {
        onOpenJobOps(jobId);
        return;
      }
      if (action.view === "user-payouts" && onOpenUserPayouts) {
        onOpenUserPayouts();
        return;
      }
      onNavigate?.(action.view);
      return;
    }
    if (action.action === "scroll" && action.section) {
      onScrollToSection?.(action.section);
      return;
    }
    if (action.action === "api") {
      setActing(true);
      try {
        if (action.api === "suspend_job") {
          const reason =
            window.prompt("เหตุผลระงับงาน (optional):") || undefined;
          if (reason === null) return;
          await adminSuspendJob(jobId, reason);
          onNotice?.("ระงับงานแล้ว", "success");
        } else if (action.api === "reject_job") {
          const reason =
            window.prompt("เหตุผลปฏิเสธงาน:") || "Rejected by admin";
          if (!window.confirm("ยืนยันปฏิเสธงานนี้?")) return;
          await adminRejectJob(jobId, reason);
          onNotice?.("ปฏิเสธงานแล้ว", "success");
        } else if (action.api === "run_auto_release") {
          if (!window.confirm("รัน auto-release ทั้งระบบ?")) return;
          const r = await runAutoRelease();
          onNotice?.(`Auto-release: ${r.released} job(s)`, "success");
        } else if (action.api === "release_job_escrow") {
          if (!window.confirm(`ปล่อย escrow สำหรับ job นี้เท่านั้น?\n${jobId}`))
            return;
          const r = await adminReleaseJobEscrow(jobId);
          onNotice?.(
            `Release สำเร็จ ฿${Number(r.amount || 0).toLocaleString()}${r.net_available != null ? ` (net ฿${r.net_available.toLocaleString()})` : ""}`,
            "success",
          );
        } else if (action.api === "create_support_case") {
          if (!userId) {
            onNotice?.("ไม่มี userId สำหรับสร้าง case", "error");
            return;
          }
          const subject =
            window.prompt("หัวข้อ case (optional):") ||
            `Job stuck — ${jobId.slice(0, 8)}`;
          if (subject === null) return;
          await postAdminUserSupportCase(userId, {
            subject,
            force_new: true,
          });
          onNotice?.("สร้าง support case แล้ว", "success");
        }
        setDetailCache((c) => {
          const next = { ...c };
          delete next[jobId];
          return next;
        });
        onRefresh?.();
      } catch (e) {
        onNotice?.(
          e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ",
          "error",
        );
      } finally {
        setActing(false);
      }
    }
  };

  const renderPlaybookItem = (
    item: AdminJobGraphPlaybookItem,
    jobId: string,
  ) => (
    <li
      key={item.id}
      className={`flex flex-wrap items-start gap-2 py-1.5 border-b border-slate-100 last:border-0 ${
        item.done ? "opacity-70" : ""
      }`}
    >
      {item.done ? (
        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <Circle size={14} className="text-slate-400 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] font-medium ${item.done ? "line-through text-slate-500" : "text-slate-800"}`}
        >
          {item.label}
        </p>
        {item.hint ? (
          <p className="text-[10px] text-slate-500">{item.hint}</p>
        ) : null}
      </div>
      {item.action && !item.done ? (
        <button
          type="button"
          disabled={acting}
          onClick={() => runAction(item.action!, jobId)}
          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {item.action.label}
        </button>
      ) : null}
    </li>
  );

  if (!graphs.length) {
    return (
      <p className="text-sm text-slate-500">
        ยังไม่มี job graph — รอ commerce sync หรือ user ยังไม่มีงาน
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-400">
        ข้อมูลจริงจาก user_commerce_events + jobs + ledger ·
        คลิกขั้นตอนเพื่อแก้ไข
      </p>
      {graphs.slice(0, maxJobs).map((raw) => {
        const graph = detailCache[raw.job_id] || raw;
        const steps = graph.steps?.length ? graph.steps : fallbackSteps(graph);
        const isOpen = expandedJob === graph.job_id;
        const activeStep =
          selectedStep?.jobId === graph.job_id
            ? steps.find((s) => s.key === selectedStep.key)
            : null;

        return (
          <div
            key={graph.job_id}
            className={`border rounded-lg p-3 bg-white ${
              graph.is_stuck
                ? "border-amber-300 bg-amber-50/30"
                : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-900 truncate">
                  {graph.title || "งานไม่มีชื่อ"}
                </p>
                <p className="font-mono text-[10px] text-slate-500">
                  {graph.job_id.slice(0, 8)}… · {graph.job_status || "—"}
                  {graph.category ? ` · ${graph.category}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {graph.is_stuck && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-200 text-amber-900">
                    <AlertTriangle size={10} /> ติด {graph.stuck_step}
                  </span>
                )}
                {onFilterMovementsByJob && (
                  <button
                    type="button"
                    onClick={() => onFilterMovementsByJob(graph.job_id)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                    title="กรองประวัติการเงินตาม job นี้"
                  >
                    <ExternalLink size={10} /> Movements
                  </button>
                )}
                {onOpenJobOps && (
                  <button
                    type="button"
                    onClick={() => onOpenJobOps(graph.job_id)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                    title="เปิดใน Job Operations"
                  >
                    <ExternalLink size={10} /> Job Ops
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedJob(isOpen ? null : graph.job_id)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                >
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {graph.is_stuck && graph.playbook && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5">
                <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1 mb-1.5">
                  <ListChecks size={12} /> {graph.playbook.title}
                </p>
                <ul className="space-y-0">
                  {graph.playbook.items.map((item) =>
                    renderPlaybookItem(item, graph.job_id),
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {FUNNEL_KEYS.map((key, idx) => {
                const step = steps.find((s) => s.key === key);
                if (!step) return null;
                const selected =
                  selectedStep?.jobId === graph.job_id &&
                  selectedStep.key === key;
                return (
                  <React.Fragment key={key}>
                    {idx > 0 && (
                      <div
                        className={`h-0.5 w-3 shrink-0 ${
                          step.state === "done"
                            ? "bg-emerald-400"
                            : step.state === "stuck" || step.state === "blocked"
                              ? "bg-amber-400"
                              : "bg-slate-200"
                        }`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleStepClick(graph, step)}
                      className={`flex flex-col items-center min-w-[48px] shrink-0 rounded-lg p-1 transition-colors ${
                        selected
                          ? "ring-2 ring-indigo-400 bg-indigo-50"
                          : "hover:bg-slate-50"
                      }`}
                      title={`${step.label} · ${formatTs(step.ts)}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${stepStyle(step.state)}`}
                      >
                        {idx + 1}
                      </div>
                      <span
                        className={`text-[9px] mt-0.5 font-medium ${labelStyle(step.state)}`}
                      >
                        {step.label}
                      </span>
                      {step.amount != null && Number(step.amount) > 0 && (
                        <span className="text-[8px] text-slate-500">
                          ฿{Number(step.amount).toLocaleString()}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {(graph.extras?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
                {graph.extras!.map((n, i) => (
                  <span
                    key={`${n.type}-${i}`}
                    className="px-1.5 py-0.5 rounded text-[9px] bg-amber-50 text-amber-800 border border-amber-100"
                  >
                    {n.type.replace(/_/g, " ")} · {formatTs(n.ts)}
                  </span>
                ))}
              </div>
            )}

            {isOpen && activeStep && (
              <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Wrench size={14} className="text-indigo-600" />
                  {activeStep.label} —{" "}
                  {activeStep.state === "stuck"
                    ? "ติดขั้นตอนนี้"
                    : activeStep.state === "blocked"
                      ? "ถูก block (dispute)"
                      : activeStep.state === "done"
                        ? "เสร็จแล้ว"
                        : "ยังไม่ถึง"}
                  {loadingDetail === graph.job_id && (
                    <Loader2
                      size={12}
                      className="animate-spin text-slate-400"
                    />
                  )}
                </div>

                {activeStep.events.length > 0 ? (
                  <ul className="text-[10px] space-y-1 max-h-24 overflow-y-auto bg-slate-50 rounded p-2">
                    {activeStep.events.map((ev, i) => (
                      <li key={i} className="font-mono text-slate-600">
                        {ev.type} · {formatTs(ev.ts)}
                        {ev.amount != null
                          ? ` · ฿${Number(ev.amount).toLocaleString()}`
                          : ""}
                        {ev.source ? (
                          <span className="text-slate-400"> · {ev.source}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    ยังไม่มี event ในขั้นนี้ — ตรวจ live จาก jobs/ledger
                    ด้านล่าง
                  </p>
                )}

                {graph.live && (
                  <p className="text-[10px] text-slate-500">
                    Live: bids={String((graph.live as any).bid_count ?? 0)} ·
                    escrow=
                    {(graph.live as any).has_escrow ? "yes" : "no"} · review=
                    {(graph.live as any).has_review ? "yes" : "no"}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {(activeStep.admin_actions || []).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={acting || action.action === "info"}
                      onClick={() => runAction(action, graph.job_id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium ${
                        action.action === "info"
                          ? "bg-slate-100 text-slate-500 cursor-default"
                          : action.action === "api"
                            ? "bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-50"
                            : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                      }`}
                    >
                      {action.action !== "info" && <ExternalLink size={10} />}
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!!loadingDetail}
                    onClick={() => loadDetail(graph.job_id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    <RefreshCw
                      size={10}
                      className={
                        loadingDetail === graph.job_id ? "animate-spin" : ""
                      }
                    />
                    รีเฟรช
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
