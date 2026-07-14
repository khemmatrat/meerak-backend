import React from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Film, Sparkles } from "lucide-react";
import type { PostDestination } from "../types/postCompose";

export interface PostTypeChooserProps {
  /** compact = ในแท็บโปรไฟล์, full = หน้าเลือกประเภท */
  variant?: "compact" | "full";
  className?: string;
}

export const PostTypeChooser: React.FC<PostTypeChooserProps> = ({
  variant = "compact",
  className = "",
}) => {
  const navigate = useNavigate();

  const go = (type: PostDestination) => {
    navigate(`/post/create?type=${type}`);
  };

  const cards = [
    {
      id: "story" as const,
      icon: Clock,
      title: "สตอรี่ 24 ชม.",
      desc: "แสดงบนหน้าแรก หมดอายุใน 24 ชั่วโมง รองรับรูป วิดีโอ และข้อความ",
      border: "border-fuchsia-400/60",
      iconBg: "bg-fuchsia-100 text-fuchsia-700",
    },
    {
      id: "feed" as const,
      icon: Film,
      title: "คลิปผลงาน / Video Feed",
      desc: "คลิปถาวรในฟีด มีลายน้ำและฉากจบ ลูกค้าค้นเจอได้นาน",
      border: "border-emerald-400/60",
      iconBg: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {variant === "full" ? (
        <div className="text-center space-y-1 mb-2">
          <div className="inline-flex items-center gap-2 text-fuchsia-300 text-sm font-medium">
            <Sparkles size={16} />
            โพสต์ใหม่
          </div>
          <h2 className="text-xl font-bold text-white">เลือกประเภทการโพสต์</h2>
          <p className="text-sm text-slate-400">
            เลือกสตอรี่ชั่วคราว หรือคลิปถาวรใน Video Feed
          </p>
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-200">โพสต์เนื้อหาใหม่</p>
      )}

      <div
        className={
          variant === "full"
            ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
            : "grid grid-cols-1 sm:grid-cols-2 gap-2"
        }
      >
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(c.id)}
            className={`text-left rounded-2xl border-2 bg-white shadow-md p-4 transition hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] ${c.border}`}
          >
            <span className={`inline-flex p-2.5 rounded-xl mb-3 ${c.iconBg}`}>
              <c.icon size={variant === "full" ? 26 : 22} />
            </span>
            <p className="font-bold text-gray-900 text-sm sm:text-base">
              {c.title}
            </p>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              {c.desc}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};
