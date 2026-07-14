import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import { AnimatePresence, motion } from "framer-motion";
import { useCalendarData, type CalendarEvent } from "../hooks/useCalendarData";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  ExternalLink,
  Clock,
  User,
  Briefcase,
  CalendarCheck,
  Sun,
} from "lucide-react";
import "./ProfileCalendarEmbed.css";

interface ProfileCalendarEmbedProps {
  userId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
}

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const ProfileCalendarEmbed: React.FC<ProfileCalendarEmbedProps> = ({
  userId,
  navigate,
}) => {
  const calendarRef = useRef<FullCalendar>(null);
  const { events, loading, error } = useCalendarData(userId);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [popover, setPopover] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);
  const [dateDrawer, setDateDrawer] = useState<{
    date: Date;
    dayEvents: CalendarEvent[];
  } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const BOTTOM_NAV_HEIGHT = 64; /* ความสูงแท็บด้านล่าง (h-16) */

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const goToday = () => calendarRef.current?.getApi().today();
  const goPrev = () => calendarRef.current?.getApi().prev();
  const goNext = () => calendarRef.current?.getApi().next();

  const handleDatesSet = (arg: DatesSetArg) => {
    if (arg.view.currentStart) setCurrentDate(arg.view.currentStart);
  };

  const handleEventClick = (info: EventClickArg) => {
    const ev = info.event;
    const ext = ev.extendedProps as CalendarEvent["extendedProps"];
    const rect = info.el.getBoundingClientRect();

    if (isMobile) {
      const start = ev.start ? new Date(ev.start) : new Date();
      const dayEvents = events.filter((e) => {
        const es = e.start instanceof Date ? e.start : new Date(e.start);
        return es.toDateString() === start.toDateString();
      });
      setDateDrawer({ date: start, dayEvents });
    } else {
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
        y: rect.bottom + 8,
      });
    }
  };

  const handleDateClick = (arg: { date: Date }) => {
    if (isMobile) {
      const d = arg.date;
      const dayEvents = events.filter((e) => {
        const es = e.start instanceof Date ? e.start : new Date(e.start);
        return es.toDateString() === d.toDateString();
      });
      setDateDrawer({ date: d, dayEvents });
    }
  };

  const handleViewDetails = (ev: CalendarEvent) => {
    const { type, jobId, bookingId } = ev.extendedProps;
    setPopover(null);
    setDateDrawer(null);
    if (type === "job" && jobId) navigate(`/jobs/${jobId}`);
    else if (type === "booking" && bookingId) navigate(`/my-bookings`);
    else if (type === "availability") navigate("/profile");
  };

  const eventClassNames = (arg: { event: { extendedProps?: { type?: string } } }) => {
    const t = arg.event.extendedProps?.type || "";
    return [`fc-event-${t}`];
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

  if (!userId) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-light tracking-wide">
        กรุณาเข้าสู่ระบบเพื่อดูปฏิทิน
      </div>
    );
  }

  const monthYear = `${TH_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear() + 543}`;

  return (
    <div
      className={`profile-calendar-premium space-y-5 ${isMobile ? "profile-calendar-mobile" : ""}`}
    >
      {/* Glassmorphism container */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
        }}
      >
        {/* Custom Header — Serif Month/Year */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200/60">
          <h2
            className="text-xl font-semibold text-slate-700 tracking-wide"
            style={{ fontFamily: "'Playfair Display', 'Inter', serif" }}
          >
            {monthYear}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="p-2 rounded-full text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-200"
              aria-label="เดือนก่อน"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={goToday}
              className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-200"
            >
              วันนี้
            </button>
            <button
              onClick={goNext}
              className="p-2 rounded-full text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-200"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-slate-500 font-light tracking-wide">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-r-lg bg-emerald-100 border-l-4 border-emerald-500" />
            งานที่รับ/จ้างแล้ว
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-r-lg bg-sky-100 border-l-4 border-sky-500" />
            รายการจอง
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-lg bg-amber-50 border border-dashed border-amber-300" />
            ช่วงเวลาว่าง
          </span>
        </div>

        {error && (
          <div className="mx-5 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 text-sm">
            {error}
          </div>
        )}

        <div className="px-4 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-emerald-500" />
            </div>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              datesSet={handleDatesSet}
              headerToolbar={false}
              locale="th"
              height="auto"
              eventDisplay="block"
              dayMaxEvents={4}
              eventClassNames={eventClassNames}
            />
          )}
        </div>
      </div>

      {/* Premium Popover — Floating, AnimatePresence (z-[60] เหนือแท็บด้านล่าง) */}
      <AnimatePresence>
        {popover && (
          <motion.div
            className="calendar-popover fixed z-[60] rounded-2xl overflow-hidden"
            style={{
              left: Math.min(popover.x, window.innerWidth - 300),
              top: Math.min(popover.y, window.innerHeight - 280 - (isMobile ? BOTTOM_NAV_HEIGHT : 0)),
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-5 max-w-[280px]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-slate-800 truncate flex-1">
                  {popover.event.title}
                </h3>
                <button
                  onClick={() => setPopover(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-2 text-sm text-slate-600 font-light">
                <p className="flex items-center gap-2">
                  <Clock size={16} className="text-slate-400 shrink-0" />
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
                    <User size={16} className="text-slate-400 shrink-0" />
                    {popover.event.extendedProps.clientName}
                  </p>
                )}
                {popover.event.extendedProps.talentName && (
                  <p className="flex items-center gap-2">
                    <User size={16} className="text-slate-400 shrink-0" />
                    {popover.event.extendedProps.talentName}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleViewDetails(popover.event)}
                className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
              >
                <ExternalLink size={18} />
                ดูรายละเอียด
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer — Slide up from bottom (z-[60] เหนือแท็บด้านล่าง) */}
      <AnimatePresence>
        {dateDrawer && isMobile && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/30 z-[55]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDateDrawer(null)}
            />
            <motion.div
              className="calendar-date-drawer fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl overflow-hidden"
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.1)",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="p-5 pb-20 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-lg font-semibold text-slate-800"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {dateDrawer.date.toLocaleDateString("th-TH", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </h3>
                  <button
                    onClick={() => setDateDrawer(null)}
                    className="p-2 rounded-full text-slate-500 hover:bg-slate-100"
                  >
                    <X size={20} />
                  </button>
                </div>
                {dateDrawer.dayEvents.length === 0 ? (
                  <p className="text-slate-500 text-sm font-light py-4 calendar-drawer-empty" style={{ color: "#1e293b" }}>
                    ไม่มีรายการในวันนี้
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dateDrawer.dayEvents.map((ev) => {
                      const isJob = ev.type === "job";
                      const isBooking = ev.type === "booking";
                      const isAvail = ev.type === "availability";
                      return (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 rounded-2xl flex items-center gap-3 ${
                            isJob
                              ? "bg-emerald-100 text-emerald-700 border-l-4 border-emerald-500"
                              : isBooking
                              ? "bg-sky-100 text-sky-700 border-l-4 border-sky-500"
                              : "bg-amber-50 text-amber-600 border border-dashed border-amber-300"
                          }`}
                        >
                          <div className="shrink-0">
                            {isJob && <Briefcase size={20} />}
                            {isBooking && <CalendarCheck size={20} />}
                            {isAvail && <Sun size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{ev.title}</p>
                            <p className="text-xs opacity-80 mt-0.5">
                              {ev.start.toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              –{" "}
                              {ev.end.toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleViewDetails(ev)}
                            className="shrink-0 px-3 py-1.5 bg-white/80 hover:bg-white rounded-xl text-sm font-medium shadow-sm"
                          >
                            ดู
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
