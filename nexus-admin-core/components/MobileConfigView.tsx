import React, { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Save,
  AlertTriangle,
  Power,
  ToggleLeft,
  ToggleRight,
  Layers,
  CreditCard,
  MessageSquare,
  Briefcase,
  RefreshCw,
  CheckCircle,
  Bell,
} from "lucide-react";
import { INITIAL_CONFIG } from "../constants";
import { ServerConfig } from "../types";
import { getMobileConfig, patchMobileConfig } from "../services/adminApi";

function mergeFetchedServerConfig(
  c: Partial<ServerConfig> | undefined,
): ServerConfig {
  return {
    ...INITIAL_CONFIG,
    ...c,
    remote: {
      ...INITIAL_CONFIG.remote,
      ...(c?.remote && typeof c.remote === "object" ? c.remote : {}),
    },
    featureFlags: {
      ...INITIAL_CONFIG.featureFlags,
      ...(c?.featureFlags || {}),
    },
  } as ServerConfig;
}

export const MobileConfigView: React.FC = () => {
  const [config, setConfig] = useState<ServerConfig>(() => ({
    ...INITIAL_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMobileConfig();
      const c = res.config as Partial<ServerConfig> | undefined;
      setConfig(mergeFetchedServerConfig(c));
      setLastUpdated(
        res.updatedAt ? new Date(res.updatedAt).toLocaleString() : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
      setConfig({ ...INITIAL_CONFIG }); // fallback on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await patchMobileConfig(config);
      const c = res.config as Partial<ServerConfig> | undefined;
      setConfig(mergeFetchedServerConfig(c));
      setLastUpdated(new Date(res.updatedAt).toLocaleString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFeature = (key: keyof typeof config.featureFlags) => {
    setConfig({
      ...config,
      featureFlags: {
        ...config.featureFlags,
        [key]: !config.featureFlags[key],
      },
    });
  };

  if (loading && !config) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center h-64">
        <div className="text-slate-500 flex items-center gap-2">
          <RefreshCw size={20} className="animate-spin" />
          Loading config...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Smartphone size={20} className="text-indigo-600" />
            Mobile App Remote Config
          </h2>
          <p className="text-slate-500 text-sm">
            ควบคุมเวอร์ชันและฟีเจอร์ของแอปพลิเคชันแบบ Real-time
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          {lastUpdated && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle size={12} /> Updated: {lastUpdated}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-70 shadow-lg shadow-indigo-200"
          >
            {isSaving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Publish Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Versioning */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full"></div>
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Layers size={18} className="text-blue-600" /> Version Control
              (Force Update)
            </h3>

            <div className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                  <span className="text-slate-400"></span> iOS Minimum Version
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.iosMinVersion}
                    onChange={(e) =>
                      setConfig({ ...config, iosMinVersion: e.target.value })
                    }
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-center font-bold text-slate-800"
                    placeholder="1.2.0"
                  />
                  <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600">
                    Check Store
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                  <span className="text-emerald-500">🤖</span> Android Minimum
                  Version
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.androidMinVersion}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        androidMinVersion: e.target.value,
                      })
                    }
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-center font-bold text-slate-800"
                    placeholder="1.4.5"
                  />
                  <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600">
                    Check Store
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-100">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>
                  การเปลี่ยนเลข Version
                  จะบังคับให้ผู้ใช้ที่ต่ำกว่าเวอร์ชันนี้ต้องอัปเดตแอปทันที
                  (Force Update blocking screen).
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                <label className="text-sm font-bold text-slate-700">
                  ข้อความบังคับอัปเดต (Force Update)
                </label>
                <textarea
                  rows={2}
                  value={config.forceUpdateMessage}
                  onChange={(e) =>
                    setConfig({ ...config, forceUpdateMessage: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      iOS App Store URL
                    </label>
                    <input
                      type="url"
                      value={config.iosStoreUrl}
                      onChange={(e) =>
                        setConfig({ ...config, iosStoreUrl: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono mt-1"
                      placeholder="https://apps.apple.com/..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Google Play URL
                    </label>
                    <input
                      type="url"
                      value={config.playStoreUrl}
                      onChange={(e) =>
                        setConfig({ ...config, playStoreUrl: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono mt-1"
                      placeholder="https://play.google.com/..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-800 mb-4">Welcome Message</h3>
            <textarea
              rows={3}
              value={config.welcomeMessage}
              onChange={(e) =>
                setConfig({ ...config, welcomeMessage: e.target.value })
              }
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
              placeholder="ข้อความต้อนรับเมื่อเปิดแอป..."
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
            <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
              <MessageSquare size={18} className="text-violet-600" /> Remote
              notices (แอป — ไม่ต้อง build ใหม่)
            </h3>
            <p className="text-xs text-slate-500">
              แสดงบน mobile ตามภาษา (TH / EN) — ชำระเงิน, Transport Hub,
              หน้าแรกโปร, อีเมล compliance ใน About
            </p>
            <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/80 space-y-2">
              <label className="text-xs font-semibold text-emerald-900">
                จำนวนออนไลน์หน้าแรก (ขั้นต่ำ / social proof)
              </label>
              <p className="text-[11px] text-emerald-800/90 leading-snug">
                แอปแสดง{" "}
                <strong>
                  max(ค่านี้, ผู้ใช้ที่มีกิจกรรมจริงภายใน ~15 นาที)
                </strong>
                ใส่ <strong>0</strong> เพื่อซ่อนแถบเมื่อไม่มีผู้ใช้ active
                ในระบบ
              </p>
              <input
                type="number"
                min={0}
                step={1}
                value={
                  config.remote.socialProofOnlineFloor != null &&
                  Number.isFinite(Number(config.remote.socialProofOnlineFloor))
                    ? Number(config.remote.socialProofOnlineFloor)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === "") {
                    const nextRemote = { ...config.remote };
                    delete nextRemote.socialProofOnlineFloor;
                    setConfig({ ...config, remote: nextRemote });
                    return;
                  }
                  const num = Math.min(
                    99_999_999,
                    Math.max(0, Math.floor(Number(v))),
                  );
                  setConfig({
                    ...config,
                    remote: {
                      ...config.remote,
                      socialProofOnlineFloor: Number.isFinite(num) ? num : 0,
                    },
                  });
                }}
                className="w-full max-w-[220px] mt-1 px-3 py-2 border border-emerald-200 rounded-lg text-sm font-mono bg-white"
                placeholder="เช่น 1240"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Payment notice (TH)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.paymentNoticeTh}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        paymentNoticeTh: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Payment notice (EN)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.paymentNoticeEn}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        paymentNoticeEn: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Transport notice (TH)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.transportNoticeTh}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        transportNoticeTh: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Transport notice (EN)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.transportNoticeEn}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        transportNoticeEn: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Promo / home notice (TH)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.promoNoticeTh}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        promoNoticeTh: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Promo / home notice (EN)
                </label>
                <textarea
                  rows={2}
                  value={config.remote.promoNoticeEn}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      remote: {
                        ...config.remote,
                        promoNoticeEn: e.target.value,
                      },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Compliance / legal contact email (About)
              </label>
              <input
                type="email"
                value={config.remote.complianceSupportEmail}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    remote: {
                      ...config.remote,
                      complianceSupportEmail: e.target.value,
                    },
                  })
                }
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                placeholder="legal@example.com"
              />
            </div>
            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  แสดงยอดกองทุนโปร (public)
                </p>
                <p className="text-xs text-slate-500">
                  เปิดเมื่อต้องการโชว์งบ discount_promo_fund บนหน้าแรก
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig({
                    ...config,
                    remote: {
                      ...config.remote,
                      showPromoFundBalance: !config.remote.showPromoFundBalance,
                    },
                  })
                }
                className={
                  config.remote.showPromoFundBalance
                    ? "text-emerald-500"
                    : "text-slate-300"
                }
              >
                {config.remote.showPromoFundBalance ? (
                  <ToggleRight size={32} />
                ) : (
                  <ToggleLeft size={32} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Feature Flags */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 h-fit">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Power size={18} className="text-indigo-600" /> Feature Flags
            (System Toggles)
          </h3>

          <div className="space-y-4">
            {/* Global Maintenance */}
            <div
              className={`p-4 rounded-xl border-2 transition-all ${config.featureFlags.maintenanceMode ? "bg-rose-50 border-rose-200 shadow-sm" : "bg-white border-slate-100"}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    size={20}
                    className={
                      config.featureFlags.maintenanceMode
                        ? "text-rose-600"
                        : "text-slate-400"
                    }
                  />
                  <span
                    className={`font-bold ${config.featureFlags.maintenanceMode ? "text-rose-700" : "text-slate-700"}`}
                  >
                    Maintenance Mode
                  </span>
                </div>
                <button
                  onClick={() => toggleFeature("maintenanceMode")}
                  className={`text-3xl transition-colors ${config.featureFlags.maintenanceMode ? "text-rose-600" : "text-slate-300"}`}
                >
                  {config.featureFlags.maintenanceMode ? (
                    <ToggleRight size={36} />
                  ) : (
                    <ToggleLeft size={36} />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 pl-7">
                เมื่อเปิดใช้งาน แอปจะแสดงหน้า "ปิดปรับปรุง"
                และบล็อกการใช้งานทั้งหมด
              </p>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${config.pushNotificationEnabled ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}
                >
                  <Bell size={18} />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">
                    Push Notifications
                  </p>
                  <p className="text-xs text-slate-500">
                    เปิด/ปิด การส่ง push notification ทั้งระบบ
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setConfig({
                    ...config,
                    pushNotificationEnabled: !config.pushNotificationEnabled,
                  })
                }
                className={`transition-colors ${config.pushNotificationEnabled ? "text-emerald-500" : "text-slate-300"}`}
              >
                {config.pushNotificationEnabled ? (
                  <ToggleRight size={32} />
                ) : (
                  <ToggleLeft size={32} />
                )}
              </button>
            </div>

            {/* Individual Features List */}
            <div className="space-y-2">
              {[
                {
                  key: "enableSignups",
                  label: "New User Signups",
                  icon: Smartphone,
                  desc: "เปิด/ปิด การสมัครสมาชิกใหม่",
                },
                {
                  key: "enablePayments",
                  label: "Payments System",
                  icon: CreditCard,
                  desc: "ระบบฝาก/ถอนเงิน",
                },
                {
                  key: "enableJobPosting",
                  label: "Job Posting",
                  icon: Briefcase,
                  desc: "การโพสต์งานใหม่",
                },
                {
                  key: "enableChat",
                  label: "Chat System",
                  icon: MessageSquare,
                  desc: "ระบบแชทภายในแอป",
                },
                {
                  key: "enablePromoVouchers",
                  label: "Promo / โค้ดส่วนลด",
                  icon: Layers,
                  desc: "รับ/ใช้วอเชอร์จากแบนเนอร์ (ผูกกองทุน)",
                },
              ].map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${config.featureFlags[feature.key as keyof typeof config.featureFlags] ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}
                    >
                      <feature.icon size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">
                        {feature.label}
                      </p>
                      <p className="text-xs text-slate-500">{feature.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      toggleFeature(
                        feature.key as keyof typeof config.featureFlags,
                      )
                    }
                    className={`transition-colors ${config.featureFlags[feature.key as keyof typeof config.featureFlags] ? "text-emerald-500" : "text-slate-300"}`}
                  >
                    {config.featureFlags[
                      feature.key as keyof typeof config.featureFlags
                    ] ? (
                      <ToggleRight size={32} />
                    ) : (
                      <ToggleLeft size={32} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
