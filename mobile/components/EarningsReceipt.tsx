/**
 * EarningsReceipt — ใบเสร็จรายได้แบบ Bank-grade
 * แสดง Gross, Platform Fee Breakdown, VIP Discount, Net Earnings
 * รองรับ Download as Image และ Share
 */
import React, { useRef } from "react";
import { X, Download, Share2 } from "lucide-react";
import { VIPBadge, type VIPTier } from "./VIPBadge";
import html2canvas from "html2canvas";

const AQOND_GREEN = "#065f46";

export interface ReceiptData {
  receipt_id: string;
  job_type: "booking" | "match_board" | "bidding";
  gross: number;
  platform_fee: number;
  net: number;
  booking_fee_percent?: number;
  sourcing_fee_percent?: number;
  bidding_fee_percent?: number;
  handling_fee_amount?: number;
  commission_fee_amount?: number;
  /** เปอร์เซ็นต์คอมมิชชั่นแพลตฟอร์ม (Match/Board) — backend ส่งเป็น commission_fee_percent; bidding_fee_percent ใช้คู่กันเมื่อไม่มี */
  commission_fee_percent?: number;
  /** ภาษี 3% บน (Sourcing + Commission) ตาม financialEngine */
  tax_service_amount?: number;
  coach_fee_amount?: number;
  vip_tier?: string;
  vip_discount_applied?: boolean;
  vip_discount_amount?: number;
  created_at?: string;
  booking_id?: string;
  job_id?: string;
  /** จาก backend เมื่อผู้รับงานเป็น BA ที่ใช้สิทธิ์ยกเว้นค่าธรรมเนียมแพลตฟอร์ม */
  brand_adviser_platform_commission_waived?: boolean;
}

interface EarningsReceiptProps {
  data: ReceiptData;
  onClose: () => void;
  talentName?: string;
}

const jobTypeLabel: Record<string, string> = {
  booking: "Slot-based Booking",
  match_board: "Match Board",
  bidding: "Bidding / Advance Job",
};

export const EarningsReceipt: React.FC<EarningsReceiptProps> = ({
  data,
  onClose,
  talentName,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const formatBaat = (n: number) =>
    new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `aqond-receipt-${data.receipt_id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleShare = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej()), "image/png")
      );
      const file = new File([blob], "receipt.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "ใบเสร็จรายได้ AQOND",
          text: `รายได้ ฿${formatBaat(data.net)} จาก AQOND`,
          files: [file],
        });
      } else {
        handleDownload();
      }
    } catch (e) {
      handleDownload();
    }
  };

  const vipTier = (data.vip_tier || "none").toLowerCase() as VIPTier;
  const sourcingPct = data.sourcing_fee_percent ?? 0;
  const platformCommissionPct =
    data.commission_fee_percent ?? data.bidding_fee_percent ?? 0;
  const handlingAmt = data.handling_fee_amount ?? 0;
  const commissionAmt = data.commission_fee_amount ?? 0;
  const taxAmt = data.tax_service_amount ?? 0;
  const coachAmt = data.coach_fee_amount ?? 0;
  const showSourcingRow =
    data.job_type !== "booking" &&
    (sourcingPct > 0 || handlingAmt > 0);
  const showPlatformCommissionRow =
    data.job_type !== "booking" &&
    (platformCommissionPct > 0 || commissionAmt > 0);
  const showTaxRow = data.job_type !== "booking" && taxAmt > 0;
  const showCoachRow = data.job_type !== "booking" && coachAmt > 0;
  const hasVip = vipTier !== "none";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-bold text-lg text-gray-800">ใบเสร็จรายได้</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={receiptRef}
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
          >
            {/* Header */}
            <div className="text-center border-b border-gray-200 pb-4 mb-4">
              <h3 className="font-bold text-gray-800 text-lg">AQOND</h3>
              <p className="text-gray-500 text-sm">Professional Service Platform</p>
              <p className="text-gray-400 text-xs mt-1">
                {jobTypeLabel[data.job_type] || data.job_type}
              </p>
              {hasVip && (
                <div className="mt-2 flex justify-center">
                  <VIPBadge tier={vipTier} size="md" showLabel />
                </div>
              )}
            </div>

            {/* Receipt ID */}
            <p className="text-gray-500 text-xs mb-4">
              Receipt ID: {data.receipt_id}
            </p>
            {talentName && (
              <p className="text-gray-600 text-sm mb-2">Talent: {talentName}</p>
            )}

            {/* รายการแยกบรรทัดชัดเจน */}
            <div className="space-y-3 py-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-gray-600">รายได้รวม (Gross)</span>
                <span className="font-semibold text-gray-800 tabular-nums">
                  ฿{formatBaat(data.gross)}
                </span>
              </div>

              {data.job_type === "booking" ? (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600 text-sm">
                    ค่า Booking (เฉพาะหมวด) {data.booking_fee_percent ?? 0}%
                  </span>
                  <span className="text-amber-700 font-medium tabular-nums">
                    -฿{formatBaat(data.platform_fee)}
                  </span>
                </div>
              ) : (
                <>
                  {showSourcingRow && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 text-sm">
                        ค่าจัดหา (Sourcing){sourcingPct > 0 ? ` ${sourcingPct}%` : ""}
                      </span>
                      <span className="text-amber-700 font-medium tabular-nums">
                        -฿{formatBaat(
                          handlingAmt > 0
                            ? handlingAmt
                            : Math.round(data.gross * (sourcingPct / 100) * 100) / 100
                        )}
                      </span>
                    </div>
                  )}
                  {showPlatformCommissionRow && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 text-sm">
                        ค่าคอมมิชชั่นแพลตฟอร์ม
                        {platformCommissionPct > 0 ? ` ${platformCommissionPct}%` : ""}
                      </span>
                      <span className="text-amber-700 font-medium tabular-nums">
                        -฿{formatBaat(
                          commissionAmt > 0
                            ? commissionAmt
                            : Math.round(data.gross * (platformCommissionPct / 100) * 100) / 100
                        )}
                      </span>
                    </div>
                  )}
                  {showTaxRow && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 text-sm">
                        ภาษีบริการ (3% ของ Sourcing+Commission)
                      </span>
                      <span className="text-amber-700 font-medium tabular-nums">
                        -฿{formatBaat(taxAmt)}
                      </span>
                    </div>
                  )}
                  {showCoachRow && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 text-sm">ค่าฝึกอบรม (Coach 3%)</span>
                      <span className="text-amber-700 font-medium tabular-nums">
                        -฿{formatBaat(coachAmt)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {data.vip_discount_applied && (data.vip_discount_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 text-emerald-600">
                  <span className="text-sm">ส่วนลด VIP (ประหยัด)</span>
                  <span className="font-medium tabular-nums">
                    +฿{formatBaat(data.vip_discount_amount ?? 0)}
                  </span>
                </div>
              )}

              {data.brand_adviser_platform_commission_waived && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 leading-snug">
                  งานนี้: ยกเว้นค่าธรรมเนียมแพลตฟอร์มตามโปรแกรม Brand Adviser (BA) — ตัวเลขหักด้านบนสะทธิกับที่ระบบคำนวณเมื่อปิดงาน
                </div>
              )}

              <div
                className="flex justify-between items-center py-4 mt-2 rounded-lg px-4"
                style={{ backgroundColor: `${AQOND_GREEN}12` }}
              >
                <span className="font-bold text-gray-800">รายได้สุทธิ (Net)</span>
                <span
                  className="font-bold text-xl tabular-nums"
                  style={{ color: AQOND_GREEN }}
                >
                  ฿{formatBaat(data.net)}
                </span>
              </div>
            </div>

            {/* Thank you note */}
            <p className="text-center text-gray-500 text-sm mt-4 italic">
              Thank you for your honesty and professional service.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
          >
            <Download size={18} />
            ดาวน์โหลดรูป
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-medium"
            style={{ backgroundColor: AQOND_GREEN }}
          >
            <Share2 size={18} />
            แชร์
          </button>
        </div>
      </div>
    </div>
  );
};

export default EarningsReceipt;
