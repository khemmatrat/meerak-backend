import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Loader2, RefreshCw, Save, Search, ShieldCheck } from "lucide-react";
import {
  getAdminTaxProfile,
  getMissingTaxProfiles,
  getTaxCompanySettings,
  patchAdminTaxProfile,
  patchTaxCompanySettings,
  type MissingTaxProfileRow,
  type TaxCompanySettings,
  type TaxUserProfile,
} from "../services/adminApi";

function canWriteTax(role: string | undefined): boolean {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "ACCOUNTANT";
}

const emptyProfile: TaxUserProfile = {
  user_id: null,
  legal_name: null,
  tax_id: null,
  tax_entity_type: "unknown",
  registered_address: null,
  branch_code: null,
  branch_name: null,
  country: "TH",
  email: null,
  phone_optional: null,
  verified_status: "unverified",
  reviewed_by: null,
  reviewed_at: null,
  created_at: null,
  updated_at: null,
};

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-500";

export const TaxIdentityView: React.FC<{ currentUserRole: string }> = ({ currentUserRole }) => {
  const canSave = canWriteTax(currentUserRole);
  const [settings, setSettings] = useState<TaxCompanySettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Partial<TaxCompanySettings>>({});
  const [missingRows, setMissingRows] = useState<MissingTaxProfileRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<TaxUserProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const taxReady = !!settings?.tax_invoice_ready;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, missingRes] = await Promise.all([
        getTaxCompanySettings(),
        getMissingTaxProfiles(80),
      ]);
      setSettings(settingsRes.settings);
      setSettingsDraft(settingsRes.settings);
      setMissingRows(missingRes.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedRow = useMemo(
    () => missingRows.find((r) => r.user_id === selectedUserId) || null,
    [missingRows, selectedUserId]
  );

  const selectUser = async (userId: string) => {
    setSelectedUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await getAdminTaxProfile(userId);
      setProfileDraft({
        ...emptyProfile,
        ...(res.profile || {}),
        user_id: userId,
        email: res.profile?.email || res.user?.email || null,
        legal_name: res.profile?.legal_name || res.user?.full_name || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveSettings = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchTaxCompanySettings({
        ...settingsDraft,
        reason: "accounting_tax_identity_foundation",
      });
      setSettings(res.settings);
      setSettingsDraft(res.settings);
      setNotice("บันทึกข้อมูลบริษัทสำเร็จ");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!canSave || !selectedUserId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchAdminTaxProfile(selectedUserId, {
        ...profileDraft,
        reason: "accounting_tax_profile_review",
      });
      setProfileDraft({ ...emptyProfile, ...res.profile });
      setNotice("บันทึก Tax Profile สำเร็จ");
      const missingRes = await getMissingTaxProfiles(80);
      setMissingRows(missingRes.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (key: keyof TaxCompanySettings, value: unknown) => {
    setSettingsDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateProfile = (key: keyof TaxUserProfile, value: unknown) => {
    setProfileDraft((prev) => ({ ...prev, [key]: value as never }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={28} />
            Tax Identity Foundation
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            ตั้งค่าตัวตนภาษีบริษัทและคิว Tax Profile ของผู้ใช้ สำหรับ Tax Invoice / ใบกำกับภาษี แบบ VAT-registered
            โดยไม่แตะยอดเงินหรือ ledger เดิม
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {!canSave && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          ดูได้ทุกบทบาทการเงิน แต่แก้ไขได้เฉพาะ ADMIN / SUPER_ADMIN / ACCOUNTANT
        </div>
      )}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                  Company Tax Settings
                </h2>
                <p className="text-xs text-slate-500 mt-1">ข้อมูลนี้จะถูก snapshot ไปใช้กับเอกสารภาษีในเฟสถัดไป</p>
              </div>
              {taxReady ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Tax Invoice ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> Missing official data
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Legal name">
                <input className={inputClass} value={settingsDraft.legal_name || ""} disabled={!canSave} onChange={(e) => updateSettings("legal_name", e.target.value)} />
              </Field>
              <Field label="Tax ID">
                <input className={`${inputClass} font-mono`} value={settingsDraft.tax_id || ""} disabled={!canSave} onChange={(e) => updateSettings("tax_id", e.target.value)} placeholder="เลขประจำตัวผู้เสียภาษีจริง" />
              </Field>
              <Field label="Branch code">
                <input className={inputClass} value={settingsDraft.branch_code || ""} disabled={!canSave} onChange={(e) => updateSettings("branch_code", e.target.value)} />
              </Field>
              <Field label="Branch name">
                <input className={inputClass} value={settingsDraft.branch_name || ""} disabled={!canSave} onChange={(e) => updateSettings("branch_name", e.target.value)} />
              </Field>
              <Field label="VAT rate %">
                <input className={inputClass} type="number" value={settingsDraft.vat_rate_percent ?? 7} disabled={!canSave} onChange={(e) => updateSettings("vat_rate_percent", Number(e.target.value))} />
              </Field>
              <Field label="WHT rate %">
                <input className={inputClass} type="number" value={settingsDraft.wht_rate_percent ?? 3} disabled={!canSave} onChange={(e) => updateSettings("wht_rate_percent", Number(e.target.value))} />
              </Field>
              <Field label="Support email">
                <input className={inputClass} value={settingsDraft.support_email || ""} disabled={!canSave} onChange={(e) => updateSettings("support_email", e.target.value)} />
              </Field>
              <Field label="Office/contact phone (optional)">
                <input className={inputClass} value={settingsDraft.phone_optional || ""} disabled={!canSave} onChange={(e) => updateSettings("phone_optional", e.target.value)} placeholder="ปล่อยว่างได้ถ้าไม่มีเบอร์จริง" />
              </Field>
            </div>
            <Field label="Registered address">
              <textarea className={`${inputClass} min-h-24`} value={settingsDraft.registered_address || ""} disabled={!canSave} onChange={(e) => updateSettings("registered_address", e.target.value)} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Line OA / support channel">
                <input className={inputClass} value={settingsDraft.support_line || ""} disabled={!canSave} onChange={(e) => updateSettings("support_line", e.target.value)} />
              </Field>
              <Field label="Help center URL">
                <input className={inputClass} value={settingsDraft.help_center_url || ""} disabled={!canSave} onChange={(e) => updateSettings("help_center_url", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settingsDraft.vat_registered !== false}
                disabled={!canSave}
                onChange={(e) => updateSettings("vat_registered", e.target.checked)}
                className="rounded border-slate-300"
              />
              บริษัทจด VAT แล้ว และพร้อมออก Tax Invoice เมื่อข้อมูลครบ
            </label>
            {canSave && (
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                บันทึกข้อมูลบริษัท
              </button>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Search className="h-5 w-5 text-indigo-600" />
                Missing Tax Profile Queue
              </h2>
              <p className="text-xs text-slate-500 mt-1">ผู้ใช้ที่ยังไม่มีข้อมูลครบหรือยังไม่ verified สำหรับการออกเอกสารภาษี</p>
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {missingRows.length ? missingRows.map((row) => (
                <button
                  key={row.user_id}
                  type="button"
                  onClick={() => void selectUser(row.user_id)}
                  className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selectedUserId === row.user_id ? "bg-indigo-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{row.full_name || row.email || row.user_id}</p>
                      <p className="text-xs text-slate-500">{row.email || "-"} · {row.role || "user"}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      {row.verified_status}
                    </span>
                  </div>
                </button>
              )) : (
                <p className="px-4 py-8 text-center text-sm text-slate-500">ไม่มีคิวที่ข้อมูลขาด</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="font-semibold text-slate-900">Edit Tax Profile</h3>
              <p className="text-xs text-slate-500">
                {selectedRow ? `${selectedRow.full_name || selectedRow.email || selectedRow.user_id}` : "เลือกผู้ใช้จากคิวเพื่อแก้ข้อมูล"}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Legal name">
                  <input className={inputClass} value={profileDraft.legal_name || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("legal_name", e.target.value)} />
                </Field>
                <Field label="Tax ID">
                  <input className={`${inputClass} font-mono`} value={profileDraft.tax_id || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("tax_id", e.target.value)} />
                </Field>
                <Field label="Entity type">
                  <select className={inputClass} value={profileDraft.tax_entity_type} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("tax_entity_type", e.target.value)}>
                    <option value="unknown">unknown</option>
                    <option value="individual">individual</option>
                    <option value="company">company</option>
                    <option value="foreign">foreign</option>
                  </select>
                </Field>
                <Field label="Verified status">
                  <select className={inputClass} value={profileDraft.verified_status} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("verified_status", e.target.value)}>
                    <option value="unverified">unverified</option>
                    <option value="pending_review">pending_review</option>
                    <option value="verified">verified</option>
                    <option value="rejected">rejected</option>
                  </select>
                </Field>
                <Field label="Branch code">
                  <input className={inputClass} value={profileDraft.branch_code || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("branch_code", e.target.value)} />
                </Field>
                <Field label="Branch name">
                  <input className={inputClass} value={profileDraft.branch_name || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("branch_name", e.target.value)} />
                </Field>
                <Field label="Email">
                  <input className={inputClass} value={profileDraft.email || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("email", e.target.value)} />
                </Field>
                <Field label="Phone optional">
                  <input className={inputClass} value={profileDraft.phone_optional || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("phone_optional", e.target.value)} />
                </Field>
              </div>
              <Field label="Registered address">
                <textarea className={`${inputClass} min-h-20`} value={profileDraft.registered_address || ""} disabled={!canSave || !selectedUserId} onChange={(e) => updateProfile("registered_address", e.target.value)} />
              </Field>
              {canSave && (
                <button
                  type="button"
                  onClick={() => void saveProfile()}
                  disabled={!selectedUserId || saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  บันทึก Tax Profile
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
