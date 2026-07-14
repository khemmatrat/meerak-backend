/**
 * UserDisplayBadge — แสดง Badge ตาม badgeDisplay ที่ผู้ใช้เลือกใน Settings
 * ใช้เฉพาะกับข้อมูลของ current user (Layout nav, Profile header)
 */
import React from "react";
import { GraduationCap, User } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { VIPBadge, type VIPTier } from "./VIPBadge";

interface UserDisplayBadgeProps {
  /** VIP tier ของ user (ใช้เมื่อ badgeDisplay === "vip") */
  vipTier?: VIPTier | string | null;
  /** User เป็น coach หรือไม่ (ใช้เมื่อ badgeDisplay === "coach") */
  isCoach?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export const UserDisplayBadge: React.FC<UserDisplayBadgeProps> = ({
  vipTier,
  isCoach = false,
  size = "sm",
  showLabel = false,
  className = "",
}) => {
  const { badgeDisplay } = useTheme();

  if (badgeDisplay === "none") return null;

  if (badgeDisplay === "member") {
    const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-xs px-2 py-1" : "text-sm px-2.5 py-1";
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-[50px] font-bold uppercase tracking-wide bg-slate-500/80 text-white border border-slate-400 ${sizeClass} ${className}`}
        title="Member"
      >
        <User size={size === "sm" ? 10 : size === "md" ? 12 : 14} className="flex-shrink-0" />
        {showLabel ? "Member" : "M"}
      </span>
    );
  }

  if (badgeDisplay === "vip") {
    const hasVip = vipTier && vipTier !== "none";
    if (!hasVip) return null;
    return <VIPBadge tier={vipTier} size={size} showLabel={showLabel} className={className} />;
  }

  if (badgeDisplay === "coach") {
    if (!isCoach) return null;
    const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-xs px-2 py-1" : "text-sm px-2.5 py-1";
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-[50px] font-bold uppercase tracking-wide bg-indigo-600 text-white border border-indigo-400 ${sizeClass} ${className}`}
        title="Coach"
      >
        <GraduationCap size={size === "sm" ? 10 : size === "md" ? 12 : 14} className="flex-shrink-0" />
        {showLabel ? "Coach" : "C"}
      </span>
    );
  }

  return null;
};
