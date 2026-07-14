import React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { SubscriptionUpsell799 } from "../components/growth/SubscriptionUpsell799";

export const TalentPro799: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link to="/talent/incubation" className="text-slate-600" aria-label="กลับ">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="font-bold text-slate-900">AQOND Pro 799</h1>
      </header>
      <div className="p-4">
        <SubscriptionUpsell799 variant="talent" />
      </div>
    </div>
  );
};

export default TalentPro799;
