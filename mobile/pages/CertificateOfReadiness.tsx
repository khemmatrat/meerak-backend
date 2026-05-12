import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Award } from "lucide-react";

export default function CertificateOfReadiness() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = user?.full_name || user?.username || user?.email || "Provider";
  const date = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Luxury Minimalist Certificate */}
        <div className="relative bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/30 to-transparent pointer-events-none" />
          <div className="relative px-10 py-14 md:px-16 md:py-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100/80 text-amber-700 mb-8">
              <Award size={36} strokeWidth={1.5} />
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-stone-400 font-medium mb-4">Nexus Platform</p>
            <h1 className="text-3xl md:text-4xl font-serif text-stone-800 tracking-tight mb-2">
              Certificate of Readiness
            </h1>
            <p className="text-stone-500 text-sm mb-10">Professional Provider Onboarding Complete</p>
            <p className="text-xl md:text-2xl font-serif text-stone-800 mb-2">{displayName}</p>
            <p className="text-stone-500 text-sm">has completed Module 1 (Ethics &amp; Safety), Module 2 (Technical Skills), and Module 3 (Mindset &amp; Practice).</p>
            <div className="mt-12 pt-8 border-t border-stone-200">
              <p className="text-xs text-stone-400">{date}</p>
            </div>
          </div>
        </div>
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/training/dashboard")}
            className="text-stone-500 hover:text-stone-700 text-sm font-medium transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
