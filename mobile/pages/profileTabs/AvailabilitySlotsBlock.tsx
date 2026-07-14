/**
 * Availability slots UI for Provider Portfolio (Advance Booking)
 */
import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useNotification } from "../../context/NotificationContext";

export const AvailabilitySlotsBlock: React.FC = () => {
  const { notify } = useNotification();
  const [slots, setSlots] = useState<
    Array<{ id: string; start_time: string; end_time: string }>
  >([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{
        slots?: Array<{ id: string; start_time: string; end_time: string }>;
      }>("/availability/me/slots");
      setSlots(data.slots || []);
    } catch (_) {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addSlot = async () => {
    if (!start || !end) {
      notify("กรุณาเลือกเวลาเริ่มและสิ้นสุด", "error");
      return;
    }
    setAdding(true);
    try {
      await api.post("/availability/slots", {
        start_time: start,
        end_time: end,
      });
      notify("เพิ่มช่วงเวลาว่างแล้ว", "success");
      setStart("");
      setEnd("");
      load();
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { error?: string } } }).response
        ?.data?.error;
      notify(
        typeof resp === "string" && resp.trim() ? resp : "เพิ่มไม่สำเร็จ",
        "error",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <span className="text-xs font-semibold text-slate-700 mb-1 block">
            เริ่ม
          </span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm"
          />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-700 mb-1 block">
            สิ้นสุด
          </span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={addSlot}
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50"
        >
          {adding ? "กำลังเพิ่ม..." : "เพิ่มช่วงเวลา"}
        </button>
      </div>
      {loading ? (
        <p className="text-[15px] text-slate-600">โหลด...</p>
      ) : slots.length === 0 ? (
        <p className="text-[15px] text-slate-600 font-medium pt-2">
          ยังไม่มีช่วงเวลาว่าง — เพิ่มจากด้านบน
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm text-slate-300">
          {slots.slice(0, 20).map((s) => (
            <li key={s.id}>
              {new Date(s.start_time).toLocaleString("th-TH", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              –{" "}
              {new Date(s.end_time).toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </li>
          ))}
          {slots.length > 20 && (
            <li className="text-slate-500">
              ... และอีก {slots.length - 20} ช่วง
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
