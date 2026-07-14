import React, { useEffect, useState } from "react";
import {
  fetchPrbAddressChildren,
  fetchPrbProvinces,
} from "../../services/prbApi";
import { PrbSearchableSelect } from "./PrbSearchableSelect";

export function PrbAddressPicker({
  province,
  district,
  subdistrict,
  postalCode,
  onChange,
}: {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
  onChange: (patch: {
    province?: string;
    district?: string;
    subdistrict?: string;
    postal_code?: string;
    province_id?: number;
    district_id?: number;
  }) => void;
}) {
  const [provinces, setProvinces] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [subdistricts, setSubdistricts] = useState<
    { id: number; name: string; postal_code?: string }[]
  >([]);
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);

  useEffect(() => {
    fetchPrbProvinces()
      .then(setProvinces)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!provinceId) return;
    fetchPrbAddressChildren(provinceId)
      .then((rows) =>
        setDistricts(rows.map((r) => ({ id: r.id, name: r.name }))),
      )
      .catch(() => {});
  }, [provinceId]);

  useEffect(() => {
    if (!districtId) return;
    fetchPrbAddressChildren(districtId)
      .then((rows) =>
        setSubdistricts(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            postal_code: r.postal_code,
          })),
        ),
      )
      .catch(() => {});
  }, [districtId]);

  return (
    <div className="space-y-3">
      <PrbSearchableSelect
        label="จังหวัด"
        required
        value={province}
        options={provinces.map((p) => p.name)}
        onChange={(name) => {
          const p = provinces.find((x) => x.name === name);
          setProvinceId(p?.id ?? null);
          setDistrictId(null);
          setDistricts([]);
          setSubdistricts([]);
          onChange({
            province: name,
            district: "",
            subdistrict: "",
            postal_code: "",
            province_id: p?.id,
          });
        }}
      />
      <PrbSearchableSelect
        label="เขต/อำเภอ"
        required
        value={district}
        options={districts.map((d) => d.name)}
        onChange={(name) => {
          const d = districts.find((x) => x.name === name);
          setDistrictId(d?.id ?? null);
          setSubdistricts([]);
          onChange({
            district: name,
            subdistrict: "",
            postal_code: "",
            district_id: d?.id,
          });
        }}
      />
      <PrbSearchableSelect
        label="แขวง/ตำบล"
        required
        value={subdistrict}
        options={subdistricts.map((s) => s.name)}
        onChange={(name) => {
          const s = subdistricts.find((x) => x.name === name);
          onChange({
            subdistrict: name,
            postal_code: s?.postal_code || postalCode,
          });
        }}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          รหัสไปรษณีย์ <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
          value={postalCode}
          onChange={(e) => onChange({ postal_code: e.target.value })}
        />
      </div>
    </div>
  );
}
