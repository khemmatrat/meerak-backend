/**
 * การตั้งค่าการเงินแบบเรียลไทม์ (DB) — ปิดบัญชีรับชั่วคราว + เกตเวย์สำรอง 2C2P / GB Prime Pay
 * PATCH: เฉพาะ ADMIN / SUPER_ADMIN (backend)
 */
import React, { useMemo, useState } from "react";
import { Loader2, RefreshCw, Shield, Landmark, Save, AlertTriangle } from "lucide-react";
import { useFinanceRuntime } from "../context/FinanceRuntimeContext";
import type { FinanceBackupGatewayEntry } from "../services/adminApi";

function canPatchFinanceRuntime(role: string | undefined): boolean {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN";
}

export const FinanceRuntimeSettingsView: React.FC<{ currentUserRole: string }> = ({
  currentUserRole,
}) => {
  const { config, loading, error, refresh, patch } = useFinanceRuntime();
  const [saving, setSaving] = useState(false);
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const canSave = canPatchFinanceRuntime(currentUserRole);

  const twoc2p = config?.backup_gateways?.twoc2p;
  const gb = config?.backup_gateways?.gb_prime_pay;

  const handleTogglePersonal = async (enabled: boolean) => {
    if (!canSave) return;
    if (!enabled) {
      const ok = confirm(
        "ปิดบัญชีรับชั่วคราว — แอดมินจะไม่สามารถบันทึก/แก้ไขรายการใหม่ได้ (ใช้ Payment Gateway แทน) ยืนยันหรือไม่?"
      );
      if (!ok) return;
    }
    setPatchErr(null);
    setSaving(true);
    try {
      await patch({ personal_settlement_manual_enabled: enabled });
    } catch {
      /* patch ตั้ง error ใน context แล้ว */
    } finally {
      setSaving(false);
    }
  };

  const updateGateway = async (
    key: "twoc2p" | "gb_prime_pay",
    partial: Partial<FinanceBackupGatewayEntry>
  ) => {
    if (!canSave) return;
    setPatchErr(null);
    setSaving(true);
    try {
      await patch({
        backup_gateways: {
          [key]: partial,
        },
      });
    } catch (e) {
      setPatchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const settlementOn = useMemo(() => config?.personal_settlement_manual_enabled !== false, [config]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="text-indigo-600" size={28} />
            การเงินเรียลไทม์ &amp; เกตเวย์สำรอง
          </h1>
          <p className="text-slate-600 mt-1 text-sm max-w-2xl">
            ค่าถูกเก็บใน <code className="bg-slate-100 px-1 rounded text-xs">system_settings.finance_runtime_config</code> — ไม่ต้อง build
            ใหม่เมื่อสลับ PaySo/Ksher (ใช้เมนู Payment Gateway) หรือเมื่อปิดบัญชีรับชั่วคราว
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {!canSave && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <Shield className="inline w-4 h-4 mr-1 align-text-bottom" />
          ดูได้ทุกบทบาท — แก้ไขได้เฉพาะ <strong>ADMIN</strong> / <strong>SUPER_ADMIN</strong>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm">{error}</div>
      )}
      {patchErr && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm">{patchErr}</div>
      )}

      {loading && !config ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : config ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-slate-900">บัญชีรับชั่วคราว (Manual)</h2>
                <p className="text-sm text-slate-600 mt-1">
                  เมื่อปิด: เมนู &quot;บัญชีรับชั่วคราว&quot; จะถูกซ่อน และ API จะปฏิเสธการสร้าง/แก้ไขรายการ (แนะนำให้ใช้ Payment
                  Gateway / AQOND Gateway แทน)
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">
                    สถานะ: {settlementOn ? <span className="text-emerald-700">เปิดใช้</span> : <span className="text-rose-700">ปิดแล้ว</span>}
                  </span>
                  {canSave ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleTogglePersonal(!settlementOn)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                        settlementOn ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                      } disabled:opacity-50`}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {settlementOn ? "ปิดบัญชีรับชั่วคราว" : "เปิดบัญชีรับชั่วคราว"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm space-y-4">
            <h2 className="font-bold text-indigo-950 flex items-center gap-2">
              <Landmark className="w-5 h-5" />
              เกตเวย์สำรอง (คอนฟิก — ไม่เก็บ secret ใน DB)
            </h2>
            <p className="text-sm text-slate-600">
              เปิดใช้ที่นี่เป็นเพียง <strong>สวิตช์นโยบาย + ชื่อแสดงผล</strong> — การเชื่อมจริง (webhook, key) ยังตั้งใน ENV / backend ตามผู้ให้บริการ
            </p>

            <GatewayCard
              title={twoc2p?.display_name || "2C2P"}
              entry={twoc2p}
              disabled={!canSave || saving}
              onSave={(partial) => void updateGateway("twoc2p", partial)}
            />
            <GatewayCard
              title={gb?.display_name || "GB Prime Pay"}
              entry={gb}
              disabled={!canSave || saving}
              onSave={(partial) => void updateGateway("gb_prime_pay", partial)}
            />
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            หมายเหตุ: เกตเวย์หลักสำหรับ QR ในประเทศยังสลับได้ที่เมนู{" "}
            <strong>Payment Gateway (Payso/Ksher)</strong> — ส่วนนี้ใช้ประกาศว่าระบบพร้อมรองรับเกตเวย์สำรองเมื่อทีม backend เชื่อม endpoint
          </p>
        </div>
      ) : null}
    </div>
  );
};

function GatewayCard({
  title,
  entry,
  disabled,
  onSave,
}: {
  title: string;
  entry: FinanceBackupGatewayEntry | undefined;
  disabled: boolean;
  onSave: (p: Partial<FinanceBackupGatewayEntry>) => void;
}) {
  const [localNotes, setLocalNotes] = useState(entry?.notes ?? "");
  const [localEnv, setLocalEnv] = useState(entry?.merchant_id_env ?? "");

  React.useEffect(() => {
    setLocalNotes(entry?.notes ?? "");
    setLocalEnv(entry?.merchant_id_env ?? "");
  }, [entry?.notes, entry?.merchant_id_env]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">{title}</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!entry?.enabled}
            disabled={disabled}
            onChange={(e) => onSave({ enabled: e.target.checked })}
            className="rounded border-slate-300"
          />
          <span>เปิดใช้ (นโยบาย)</span>
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs text-slate-500 mb-1">ชื่อ ENV สำหรับ Merchant ID (อ้างอิง)</label>
          <input
            type="text"
            value={localEnv}
            disabled={disabled}
            onChange={(e) => setLocalEnv(e.target.value)}
            onBlur={() => {
              if (localEnv !== (entry?.merchant_id_env ?? "")) onSave({ merchant_id_env: localEnv.trim() });
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            placeholder="เช่น TWOC2P_MERCHANT_ID"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">หมายเหตุภายใน</label>
          <input
            type="text"
            value={localNotes}
            disabled={disabled}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => {
              if (localNotes !== (entry?.notes ?? "")) onSave({ notes: localNotes.trim() });
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="—"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSave({
            merchant_id_env: localEnv.trim(),
            notes: localNotes.trim(),
          })
        }
        className="text-sm font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
      >
        บันทึกฟิลด์นี้
      </button>
    </div>
  );
}
