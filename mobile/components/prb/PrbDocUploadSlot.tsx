import React, { useRef } from "react";
import { Upload, FileText } from "lucide-react";
import { uploadDocumentToSecure } from "../../services/secureDocumentUploadService";
import { shrinkImageForDocumentUpload } from "../../utils/shrinkImageForDocumentUpload";

export function PrbDocUploadSlot({
  label,
  required,
  url,
  onUploaded,
}: {
  label: string;
  required?: boolean;
  url?: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const blob = file.type.startsWith("image/")
        ? await shrinkImageForDocumentUpload(file)
        : file;
      const result = await uploadDocumentToSecure(
        blob as File,
        "vehicle_registration",
        {
          allowBlobFallback: false,
        },
      );
      onUploaded(result.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
        {url ? (
          <button
            type="button"
            className="text-xs text-blue-600"
            onClick={() => inputRef.current?.click()}
          >
            เปลี่ยน
          </button>
        ) : null}
      </div>
      {url ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <FileText className="h-4 w-4" /> อัปโหลดแล้ว
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-50 py-6 text-sm text-blue-700"
        >
          <Upload className="h-5 w-5" />
          {busy ? "กำลังอัปโหลด..." : "แตะเพื่ออัปโหลด"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
