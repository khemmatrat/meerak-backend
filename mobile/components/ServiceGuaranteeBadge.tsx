/**
 * AQOND Wow 2: Service Guarantee Badge — แสดงบนหน้า Checkout
 */
import React from 'react';
import { Shield, CheckCircle } from 'lucide-react';

interface ServiceGuaranteeBadgeProps {
  className?: string;
}

export const ServiceGuaranteeBadge: React.FC<ServiceGuaranteeBadgeProps> = ({ className = '' }) => (
  <div className={`flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 ${className}`}>
    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
      <Shield size={24} className="text-emerald-600 dark:text-emerald-400" />
    </div>
    <div>
      <p className="font-bold text-emerald-800 dark:text-emerald-200">Service Guarantee</p>
      <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
        <CheckCircle size={14} /> คืนเงินเต็มจำนวนหากงานไม่ตรงตามที่ตกลง
      </p>
    </div>
  </div>
);
