import React, { useState, useEffect } from "react";
import { FileText, ArrowLeft, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchComplianceTypes,
  fetchCompliancePolicy,
} from "../services/compliancePolicyService";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

const POLICY_LABELS: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  cookie: "Cookie Policy",
  refund: "Refund Policy",
  community_guidelines: "Community Guidelines",
  kyc_policy: "KYC Policy",
  escrow_policy: "Escrow Policy",
  talent_policy: "Talent Policy",
  night_work_policy: "Safety & Night Work",
  prohibited_services: "Prohibited Services",
  platform_enforcement: "Platform Enforcement",
  anti_fraud: "Anti-Fraud Policy",
  dispute: "Dispute Policy",
  enforcement: "Enforcement Policy",
  freelancer_agreement: "Freelancer Agreement",
  client_agreement: "Client Agreement",
  content_chat: "Content & Chat Policy",
  talent_category_rules: "Talent Category Rules",
  off_platform_transaction: "Off-Platform Transaction",
  escrow_legal_clause: "Escrow Legal Clause",
  liability_limitation: "Liability Limitation",
  aml_policy: "AML Policy",
  risk_monitoring_policy: "Risk Monitoring",
  trust_safety_manual: "Trust & Safety Manual",
  managed_marketplace_policy: "Managed Marketplace Policy",
  high_risk_services_policy: "High-Risk Services Policy",
  safety_incident_policy: "Safety Incident Policy",
};

export const Legal: React.FC = () => {
  const { bootstrap } = useMobileAppConfig();
  const [searchParams] = useSearchParams();
  const [types, setTypes] = useState<
    { type: string; version: string; published_at: string }[]
  >([]);
  const [activeType, setActiveType] = useState<string>("terms");
  const [policy, setPolicy] = useState<{
    content: string;
    version: string;
    published_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    const t = (searchParams.get("type") || "").trim();
    if (t && t in POLICY_LABELS) {
      setActiveType(t);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const list = await fetchComplianceTypes({ force: true });
        setTypes(list);
      } catch {
        setTypes([]);
      } finally {
        setLoading(false);
      }
    };
    loadTypes();
  }, [
    bootstrap.complianceVersions.terms,
    bootstrap.complianceVersions.privacy,
  ]);

  const bootstrapVersionForActive =
    activeType === "terms"
      ? (bootstrap.complianceVersions.terms ?? "")
      : activeType === "privacy"
        ? (bootstrap.complianceVersions.privacy ?? "")
        : "__other__";

  useEffect(() => {
    if (!activeType) return;
    const loadPolicy = async () => {
      setLoadingContent(true);
      try {
        const p = await fetchCompliancePolicy(activeType);
        setPolicy(
          p
            ? {
                content: p.content,
                version: p.version,
                published_at: p.published_at,
              }
            : null,
        );
      } catch {
        setPolicy(null);
      } finally {
        setLoadingContent(false);
      }
    };
    loadPolicy();
  }, [activeType, bootstrapVersionForActive]);

  // แสดงทุก policy types — ใช้จาก API ถ้ามี ไม่ก็ใช้ POLICY_LABELS เพื่อให้เห็นเอกสารใหม่ทั้งหมด
  const typeMap = new Map(types.map((t) => [t.type, t]));
  const displayTypes = Object.keys(POLICY_LABELS).map(
    (t) => typeMap.get(t) || { type: t, version: "", published_at: "" },
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/settings"
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-bold text-lg text-gray-900">
            Legal & Compliance
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Legal Documents (Versioning)
        </h2>
        <div className="flex flex-wrap gap-2 mb-6 bg-white p-2 rounded-xl border border-gray-200 overflow-x-auto">
          {displayTypes.map((t) => (
            <button
              key={t.type}
              onClick={() => setActiveType(t.type)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeType === t.type
                  ? "bg-slate-800 text-white shadow"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {POLICY_LABELS[t.type] || t.type}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-none min-h-[200px]">
          {loadingContent ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : policy?.content ? (
            <div>
              <h2 className="flex items-center text-2xl font-bold text-slate-900 mb-6">
                <FileText className="mr-3 text-emerald-600" />{" "}
                {POLICY_LABELS[activeType] || activeType}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Version {policy.version} •{" "}
                {policy.published_at
                  ? new Date(policy.published_at).toLocaleDateString()
                  : ""}
              </p>
              <div
                className="legal-content"
                dangerouslySetInnerHTML={{ __html: policy.content }}
              />
            </div>
          ) : (
            <div className="text-gray-500 py-8 text-center">
              {loading ? (
                "กำลังโหลด..."
              ) : (
                <>
                  <p className="font-medium">ไม่พบเอกสาร</p>
                  <p className="text-xs mt-2 text-gray-400">
                    เอกสารนี้อาจยังไม่ได้เพิ่มในระบบ
                    กรุณารีเฟรชหรือติดต่อผู้ดูแล
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
