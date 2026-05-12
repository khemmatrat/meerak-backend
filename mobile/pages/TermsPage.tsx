import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LegalPublicShell } from "../components/LegalPublicShell";
import { LegalIdentityContactCard } from "../components/LegalIdentityContactCard";
import { fetchCompliancePolicy } from "../services/compliancePolicyService";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

/**
 * ข้อกำหนดการให้บริการ — เนื้อหาจาก GET /api/compliance/terms (แอดมินแก้ได้โดยไม่ต้องออกแอปใหม่)
 * รีเฟรชเมื่อเวอร์ชันใน bootstrap เปลี่ยน (applyBootstrapComplianceVersions ล้างแคชให้แล้ว)
 */
export const TermsPage: React.FC = () => {
  const { bootstrap } = useMobileAppConfig();
  const termsVersionKey = bootstrap.complianceVersions.terms ?? "";
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const [publishedAt, setPublishedAt] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await fetchCompliancePolicy("terms");
        if (cancelled) return;
        if (p?.content) {
          setHtml(p.content);
          setVersion(p.version || "");
          setPublishedAt(p.published_at || "");
        } else {
          setHtml(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [termsVersionKey]);

  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <LegalPublicShell
      title="ข้อกำหนดการให้บริการ (Terms of Service)"
      subtitle={
        version
          ? `เวอร์ชัน ${version}${dateLabel ? ` · อัปเดต ${dateLabel}` : ""}`
          : "Service Marketplace Platform — AQOND"
      }
    >
      {loading ? (
        <div className="flex justify-center py-16 not-prose">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600" aria-hidden />
        </div>
      ) : html ? (
        <div
          className="legal-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="not-prose text-center text-slate-600 py-8">
          ยังไม่มีข้อกำหนดในระบบ — ดูรายการเอกสารได้ที่{" "}
          <Link to="/legal?type=terms" className="text-emerald-700 font-medium underline">
            Legal &amp; Compliance
          </Link>
        </p>
      )}
      <LegalIdentityContactCard className="my-6 not-prose" />
      <p className="not-prose text-sm text-slate-600 mt-6">
        ดูรายละเอียดการคุ้มครองข้อมูลส่วนบุคคลได้ที่{" "}
        <Link to="/privacy" className="text-emerald-700 font-medium hover:underline">
          นโยบายความเป็นส่วนตัว
        </Link>
      </p>
    </LegalPublicShell>
  );
};
