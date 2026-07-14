import React from "react";
import type { PostSharingPrefs } from "../types/postCompose";

export interface PostRemixSettingsPanelProps {
  prefs: PostSharingPrefs;
  onChange: (next: PostSharingPrefs) => void;
  /** แสดงหัวข้อใหญ่ (หน้าตั้งค่า) หรือย่อ (ใน sheet) */
  variant?: "page" | "sheet";
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 border-b border-slate-200 last:border-0 cursor-pointer">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 text-sm">{label}</p>
        {description ? (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 shrink-0"
      />
    </label>
  );
}

export const PostRemixSettingsPanel: React.FC<PostRemixSettingsPanelProps> = ({
  prefs,
  onChange,
  variant = "sheet",
}) => {
  const patch = (partial: Partial<PostSharingPrefs>) =>
    onChange({ ...prefs, ...partial });

  return (
    <div className={variant === "page" ? "space-y-6" : "space-y-2"}>
      {variant === "page" ? (
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            การควบคุมคลิปและรีมิกซ์
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ค่าเริ่มต้นเมื่อโพสต์สตอรี่หรือ Video Feed
          </p>
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-800 px-1">
          การควบคุมรีมิกซ์และดาวน์โหลด
        </p>
      )}

      <section
        className={
          variant === "page"
            ? "luxury-card rounded-2xl p-4 border border-white/10"
            : "rounded-xl bg-slate-50 px-3"
        }
      >
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">
          รีมิกซ์
        </p>
        <ToggleRow
          label="อนุญาตให้รีมิกซ์"
          description="ให้ผู้อื่นสร้างคลิปใหม่จากวิดีโอหรือรูปของคุณ"
          checked={
            prefs.allow_remix_reels ||
            prefs.allow_remix_feed ||
            prefs.allow_remix_photos
          }
          onChange={(on) =>
            patch({
              allow_remix_reels: on,
              allow_remix_feed: on,
              allow_remix_photos: on,
            })
          }
        />
        <ToggleRow
          label="อนุญาตสำหรับคลิป Reels / สตอรี่"
          checked={prefs.allow_remix_reels}
          onChange={(v) => patch({ allow_remix_reels: v })}
        />
        <ToggleRow
          label="อนุญาตสำหรับวิดีโอบนฟีด"
          checked={prefs.allow_remix_feed}
          onChange={(v) => patch({ allow_remix_feed: v })}
        />
        <ToggleRow
          label="อนุญาตให้ใช้รูปภาพ"
          checked={prefs.allow_remix_photos}
          onChange={(v) => patch({ allow_remix_photos: v })}
        />
      </section>

      <section
        className={
          variant === "page"
            ? "luxury-card rounded-2xl p-4 border border-white/10"
            : "rounded-xl bg-slate-50 px-3"
        }
      >
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">
          การดาวน์โหลด
        </p>
        <ToggleRow
          label="อนุญาตให้ดาวน์โหลดคลิปของคุณ"
          description="ถ้าเปิด ผู้อื่นสามารถบันทึกคลิปสาธารณะของคุณได้"
          checked={prefs.allow_download}
          onChange={(v) => patch({ allow_download: v })}
        />
      </section>
    </div>
  );
};
