import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import { useAuth } from "../context/AuthContext";
import { useCalendarData, type CalendarEvent } from "../hooks/useCalendarData";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  ExternalLink,
  Clock,
  User,
} from "lucide-react";

export const CalendarView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar>(null);
  const { events, loading, error, refetch } = useCalendarData(user?.id);
  const [popover, setPopover] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);

  const goToday = () => {
    calendarRef.current?.getApi().today();
  };

  const goPrev = () => {
    calendarRef.current?.getApi().prev();
  };

  const goNext = () => {
    calendarRef.current?.getApi().next();
  };

  const handleEventClick = (info: EventClickArg) => {
    const ev = info.event;
    const ext = ev.extendedProps as CalendarEvent["extendedProps"];
    const rect = info.el.getBoundingClientRect();
    setPopover({
      event: {
        id: ev.id,
        title: ev.title || "",
        start: ev.start ? new Date(ev.start) : new Date(),
        end: ev.end ? new Date(ev.end) : new Date(),
        type: ext.type as CalendarEvent["type"],
        backgroundColor: ev.backgroundColor || "",
        extendedProps: ext,
      },
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const handleViewDetails = () => {
    if (!popover) return;
    const { type, jobId, bookingId } = popover.event.extendedProps;
    setPopover(null);
    if (type === "job" && jobId) navigate(`/jobs/${jobId}`);
    else if (type === "booking" && bookingId) navigate(`/my-bookings`);
    else if (type === "availability") navigate("/profile"); // หรือหน้า Set Availability ถ้ามี
  };

  const handleDateClick = () => {
    // คลิกวันที่ว่าง — ไปหน้า Set Availability (หรือ Profile)
    navigate("/profile");
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popover && !(e.target as Element).closest(".calendar-popover, .fc-event")) {
        setPopover(null);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [popover]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500">
        กรุณาเข้าสู่ระบบเพื่อดูปฏิทิน
      </div>
    );
  }

  return (
    <div className="calendar-page max-w-6xl mx-auto p-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Calendar size={24} className="text-emerald-600" />
          ปฏิทินงานของฉัน
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToday}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            วันนี้
          </button>
          <button
            onClick={goNext}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: "#10b981" }} />
          งานที่รับ/จ้างแล้ว
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: "#0ea5e9" }} />
          รายการจอง
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded border-2 border-amber-500 bg-amber-100" />
          ช่วงเวลาว่าง
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-emerald-600" />
          </div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={events}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            headerToolbar={false}
            locale="th"
            height="auto"
            eventDisplay="block"
            dayMaxEvents={4}
          />
        )}
      </div>

      {/* Popover */}
      {popover && (
        <div
          className="calendar-popover fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 max-w-xs animate-in fade-in zoom-in-95"
          style={{
            left: Math.min(popover.x, window.innerWidth - 280),
            top: Math.min(popover.y, window.innerHeight - 200),
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-slate-800 truncate">{popover.event.title}</h3>
            <button
              onClick={() => setPopover(null)}
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <Clock size={14} />
              {popover.event.start.toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {popover.event.end.toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {popover.event.extendedProps.clientName && (
              <p className="flex items-center gap-2">
                <User size={14} />
                {popover.event.extendedProps.clientName}
              </p>
            )}
            {popover.event.extendedProps.talentName && (
              <p className="flex items-center gap-2">
                <User size={14} />
                {popover.event.extendedProps.talentName}
              </p>
            )}
          </div>
          <button
            onClick={handleViewDetails}
            className="mt-3 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
          >
            <ExternalLink size={16} />
            ดูรายละเอียด
          </button>
        </div>
      )}
    </div>
  );
};
