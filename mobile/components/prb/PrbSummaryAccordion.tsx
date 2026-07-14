import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PrbOrderPayload } from "../../services/prbApi";

export function PrbSummaryAccordion({
  form,
}: {
  form: Partial<PrbOrderPayload>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-blue-100 bg-sky-50/50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-blue-900"
        onClick={() => setOpen((v) => !v)}
      >
        สรุปรายละเอียด (ตรวจสอบก่อนชำระ)
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open ? (
        <div className="space-y-1 border-t border-blue-100 px-4 py-3 text-xs text-slate-700">
          <p>
            ทะเบียน: {form.registration_number} {form.registration_province}
          </p>
          <p>ตัวถัง: {form.chassis_number}</p>
          <p>
            รถ: {form.vehicle_brand} {form.vehicle_model} ({form.vehicle_year})
          </p>
          <p>
            ผู้เอาประกัน: {form.name_prefix} {form.first_name} {form.last_name}
          </p>
          <p>เลขบัตร: {form.national_id}</p>
          <p>โทร: {form.phone_number}</p>
          <p>
            ที่อยู่: {form.address_line} {form.address_subdistrict}{" "}
            {form.address_district} {form.address_province} {form.postal_code}
          </p>
        </div>
      ) : null}
    </div>
  );
}
