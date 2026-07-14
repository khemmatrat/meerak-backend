import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { fetchCompassStatus } from "../services/compassOnboardingService";

/** แถบเล็กใต้ header — แสดงเมื่ออยู่ใน Compass track */
export const CompassProgressStrip: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLabel(null);
      return;
    }
    let alive = true;
    void fetchCompassStatus()
      .then((s) => {
        if (!alive) return;
        if (s.compassMode && !s.allDone && s.progress) {
          setLabel(
            `เส้นทางรับงานของคุณ — ขั้น ${s.progress.completed}/${s.progress.total}`,
          );
        } else {
          setLabel(null);
        }
      })
      .catch(() => {
        if (alive) setLabel(null);
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  if (!label) return null;

  return (
    <Link
      to="/compass"
      className="flex items-center justify-center gap-2 py-1.5 px-3 bg-emerald-600 text-white text-xs font-medium"
    >
      <Compass size={14} />
      {label}
    </Link>
  );
};

export default CompassProgressStrip;
