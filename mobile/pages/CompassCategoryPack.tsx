import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Upload, Check } from "lucide-react";
import {
  getPackForIntent,
  type PackField,
} from "../config/compassCategoryPacks";
import { saveCategoryPackFields } from "../services/compassOnboardingService";
import {
  uploadDocumentToSecure,
  isBlobUrl,
  revokeBlobUrl,
} from "../services/secureDocumentUploadService";
import { shrinkImageForDocumentUpload } from "../utils/shrinkImageForDocumentUpload";

type FieldValues = Record<string, string>;

export const CompassCategoryPack: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent = params.get("intent") || "rider_delivery";
  const pack = useMemo(() => getPackForIntent(intent), [intent]);
  const [values, setValues] = useState<FieldValues>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const setField = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }));
  };

  const handlePhoto = async (field: PackField, file: File) => {
    setUploading(field.id);
    setErr("");
    try {
      const shrunk = await shrinkImageForDocumentUpload(file);
      const { url } = await uploadDocumentToSecure(shrunk, `compass_${pack.key}_${field.id}`);
      const prev = values[field.id];
      if (prev && isBlobUrl(prev)) revokeBlobUrl(prev);
      setField(field.id, url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(null);
    }
  };

  const validate = useCallback((): boolean => {
    for (const f of pack.fields) {
      if (!f.required) continue;
      const v = values[f.id];
      if (f.type === "confirm") {
        if (v !== "yes") {
          setErr(`กรุณายืนยัน: ${f.label}`);
          return false;
        }
      } else if (!v || !String(v).trim()) {
        setErr(`กรุณากรอก: ${f.label}`);
        return false;
      }
    }
    setErr("");
    return true;
  }, [pack.fields, values]);

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      await saveCategoryPackFields(intent, values);
      navigate("/compass", { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
  const defaults: FieldValues = {};
    for (const f of pack.fields) {
      if (f.type === "select" && f.options?.[0]) {
        defaults[f.id] = f.options[0].value;
      }
    }
    setValues((prev) => ({ ...defaults, ...prev }));
  }, [pack.key]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="กลับ">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-bold text-slate-900 text-lg flex-1">{pack.title}</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-sm text-slate-600">{pack.subtitle}</p>
        <p className="text-xs text-emerald-700 mt-1">{pack.socialProof}</p>
        <p className="text-xs text-slate-400 mt-1">
          ขั้นนี้ ~{pack.estimatedMinutes} นาที
        </p>

        <div className="mt-6 space-y-5">
          {pack.fields.map((f) => (
            <div key={f.id}>
              <label className="block text-sm font-medium text-slate-800 mb-2">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>

              {f.type === "photo" && (
                <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-xl bg-white cursor-pointer hover:border-emerald-300">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePhoto(f, file);
                    }}
                  />
                  {values[f.id] ? (
                    <img
                      src={values[f.id]}
                      alt={f.label}
                      className="max-h-40 rounded-lg object-contain"
                    />
                  ) : (
                    <>
                      <Upload className="text-slate-400" size={28} />
                      <span className="text-sm text-slate-500">
                        {uploading === f.id ? "กำลังอัปโหลด…" : "แตะเพื่อถ่าย/เลือกรูป"}
                      </span>
                    </>
                  )}
                </label>
              )}

              {f.type === "text" && (
                <input
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white"
                  value={values[f.id] || ""}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              )}

              {f.type === "select" && (
                <select
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white"
                  value={values[f.id] || f.options?.[0]?.value || ""}
                  onChange={(e) => setField(f.id, e.target.value)}
                >
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}

              {f.type === "confirm" && (
                <button
                  type="button"
                  onClick={() =>
                    setField(f.id, values[f.id] === "yes" ? "" : "yes")
                  }
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border ${
                    values[f.id] === "yes"
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      values[f.id] === "yes"
                        ? "bg-emerald-600 text-white"
                        : "border-2 border-slate-300"
                    }`}
                  >
                    {values[f.id] === "yes" && <Check size={14} />}
                  </div>
                  <span className="text-sm text-slate-700">{f.label}</span>
                </button>
              )}
            </div>
          ))}
        </div>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-8 w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกและกลับเข็มทิศ"}
        </button>
      </div>
    </div>
  );
};

export default CompassCategoryPack;
