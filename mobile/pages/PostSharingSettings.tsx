import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PostRemixSettingsPanel } from "../components/PostRemixSettingsPanel";
import { useNotification } from "../context/NotificationContext";
import type { PostSharingPrefs } from "../types/postCompose";
import {
  loadPostSharingPrefs,
  savePostSharingPrefs,
} from "../utils/postSharingPrefs";

export const PostSharingSettings: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [prefs, setPrefs] = useState<PostSharingPrefs>(loadPostSharingPrefs);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 max-w-lg mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-slate-400 text-sm mb-4"
      >
        <ChevronLeft size={18} /> กลับ
      </button>
      <PostRemixSettingsPanel
        prefs={prefs}
        onChange={setPrefs}
        variant="page"
      />
      <button
        type="button"
        className="w-full mt-6 py-3 rounded-xl bg-blue-500 text-white font-semibold"
        onClick={() => {
          savePostSharingPrefs(prefs);
          notify("บันทึกการตั้งค่าแล้ว", "success");
          navigate(-1);
        }}
      >
        บันทึก
      </button>
    </div>
  );
};

export default PostSharingSettings;
