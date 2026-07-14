import React, { ReactNode } from "react";
import { motion } from "framer-motion";
import { VIPBadge, type VIPTier } from "./VIPBadge";

const round2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const VIP_TIERS = {
  none: { quotaPerMonth: 0, discountPercent: 0 },
  silver: { quotaPerMonth: 12, discountPercent: 5 },
  gold: { quotaPerMonth: 30, discountPercent: 5 },
  platinum: { quotaPerMonth: 999, discountPercent: 5 },
} as const;

function getVipEligible(
  tier: VIPTier | string | null | undefined,
  quotaBalance: number | null | undefined,
  expiry: string | null | undefined
): boolean {
  const t = (tier || "none").toString().toLowerCase();
  if (t === "none" || !["silver", "gold", "platinum"].includes(t)) return false;
  const expiryDate = expiry ? new Date(expiry) : null;
  if (expiryDate && expiryDate.getTime() < Date.now()) return false;
  const quota = quotaBalance != null ? Number(quotaBalance) : 0;
  return quota > 0;
}

// -----------------------------------------------------------------------------
// VipThemeWrapper: ใช้ vip_tier ใส่ theme class (Silver/Gold/Platinum) + Platinum Starry Animation
// -----------------------------------------------------------------------------
interface VipThemeWrapperProps {
  vip_tier: VIPTier | string | null | undefined;
  children: ReactNode;
  className?: string;
}

export const VipThemeWrapper: React.FC<VipThemeWrapperProps> = ({
  vip_tier,
  children,
  className = "",
}) => {
  const t = (vip_tier || "none").toString().toLowerCase();
  const themeClass =
    t === "silver"
      ? "vip-theme-silver"
      : t === "gold"
        ? "vip-theme-gold"
        : t === "platinum"
          ? "vip-theme-platinum"
          : "vip-theme-standard";

  const style = {
    ...(t === "silver" && {
      ["--vip-bg" as string]: "#f8fafc",
      ["--vip-surface" as string]: "rgba(255,255,255,0.85)",
    }),
    ...(t === "gold" && {
      ["--vip-bg" as string]: "#0c0a09",
      ["--vip-text" as string]: "#fef3c7",
    }),
    ...(t === "platinum" && {
      ["--vip-bg" as string]: "#1e1b4b",
      ["--vip-text" as string]: "#e2e8f0",
    }),
  } as React.CSSProperties;

  if (t === "platinum") {
    return (
      <div
        className={`${themeClass} min-h-full relative overflow-hidden ${className}`}
        style={style as React.CSSProperties}
      >
        {/* Starry background - Framer Motion (Platinum only) */}
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
        >
          {[...Array(28)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                left: `${(i * 7) % 100}%`,
                top: `${(i * 11 + 3) % 100}%`,
                boxShadow: "0 0 6px 2px rgba(255,255,255,0.6)",
              }}
              animate={{
                opacity: [0.3, 0.9, 0.3],
                scale: [1, 1.3, 1],
              }}
              transition={{
                duration: 2 + (i % 3) * 0.5,
                repeat: Infinity,
                delay: i * 0.06,
              }}
            />
          ))}
        </motion.div>
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`${themeClass} min-h-full ${className}`}
      style={Object.keys(style).length ? style : undefined}
    >
      {children}
    </div>
  );
};

// -----------------------------------------------------------------------------
// VipDiscountDisplay: แสดงราคาหลังหักส่วนลด 5% + Badge เมื่อมีสิทธิ์ VIP และยังมีโควตา
// -----------------------------------------------------------------------------
interface VipDiscountDisplayProps {
  vip_tier: VIPTier | string | null | undefined;
  vip_quota_balance?: number | null;
  vip_expiry?: string | null;
  commissionAmount: number;
  className?: string;
}

export const VipDiscountDisplay: React.FC<VipDiscountDisplayProps> = ({
  vip_tier,
  vip_quota_balance,
  vip_expiry,
  commissionAmount,
  className = "",
}) => {
  const eligible = getVipEligible(vip_tier, vip_quota_balance, vip_expiry);
  const t = (vip_tier || "none").toString().toLowerCase() as VIPTier;
  const config = VIP_TIERS[t as keyof typeof VIP_TIERS] || VIP_TIERS.none;

  if (!eligible || config.discountPercent <= 0 || commissionAmount <= 0) return null;

  const discountAmount = round2(commissionAmount * (config.discountPercent / 100));
  const afterDiscount = round2(commissionAmount - discountAmount);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <VIPBadge tier={vip_tier} size="md" showLabel />
      <span className="text-sm text-emerald-700 font-medium">
        ส่วนลด VIP {config.discountPercent}%: ราคาค่าบริการหลังหัก <strong>{afterDiscount.toLocaleString()}</strong> บาท
      </span>
    </div>
  );
};

// -----------------------------------------------------------------------------
// VipQuotaInfo: แสดงจำนวนสิทธิ์ส่วนลดที่เหลือ (Platinum = Unlimited Status)
// -----------------------------------------------------------------------------
interface VipQuotaInfoProps {
  vip_tier: VIPTier | string | null | undefined;
  vip_quota_balance?: number | null;
  vip_expiry?: string | null;
  className?: string;
}

export const VipQuotaInfo: React.FC<VipQuotaInfoProps> = ({
  vip_tier,
  vip_quota_balance,
  vip_expiry,
  className = "",
}) => {
  const t = (vip_tier || "none").toString().toLowerCase();
  if (t === "none" || !["silver", "gold", "platinum"].includes(t)) return null;

  const expiryDate = vip_expiry ? new Date(vip_expiry) : null;
  if (expiryDate && expiryDate.getTime() < Date.now()) return null;

  const quota = vip_quota_balance != null ? Number(vip_quota_balance) : 0;
  const isPlatinum = t === "platinum";

  return (
    <div className={`text-xs text-gray-500 ${className}`}>
      {isPlatinum ? (
        <span className="inline-flex items-center gap-1">
          <VIPBadge tier={vip_tier} size="sm" showLabel />
          สถานะ: <strong className="text-emerald-600">Unlimited</strong>
        </span>
      ) : (
        <span>
          สิทธิ์ส่วนลดคงเหลือ: <strong>{Math.max(0, quota)}</strong> ครั้ง
        </span>
      )}
    </div>
  );
};
