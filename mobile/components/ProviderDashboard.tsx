// src/components/ProviderDashboard.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Briefcase,
  Users,
  DollarSign,
  BarChart3,
  Download,
  Bell,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  MessageSquare,
  Navigation,
  TrendingUp,
  Package,
  Star,
  Award,
  Zap,
  Wallet,
  RefreshCw,
  Calendar,
  Eye,
  PieChart,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Shield,
} from "lucide-react";
import { Job, JobStatus } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { MockApi } from "../services/mockApi";
import { reverseGeocode } from "../services/geoService";
import ProviderMap from "./ProviderMap";
import { BiddingBoard } from "./BiddingBoard";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { MyJobs } from "@/pages/MyJobs";
import { api } from "../services/api";
import { getSocket, joinBiddingRooms } from "../services/socketService";

interface ProviderDashboardProps {
  providerId?: string;
  viewMode?:
    | "overview"
    | "availableJobs"
    | "myJobs"
    | "bookings"
    | "bids"
    | "earnings"
    | "analytics";
}

type RerouteInvitation = {
  ticket_id: string;
  invitation_id: string;
  job_id: string | null;
  status: string;
  sent_at?: string;
  expires_at?: string | null;
  accept_window_ms?: number;
  job?: {
    id?: string;
    title?: string;
    category?: string;
    subcategory?: string;
    price?: number | string;
    datetime?: string;
    status?: string;
  } | null;
  care_stage?: string | null;
};

const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  providerId,
  viewMode: initialViewMode = "overview",
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ States
  const [activeView, setActiveView] = useState<
    | "overview"
    | "availableJobs"
    | "myJobs"
    | "bookings"
    | "bids"
    | "earnings"
    | "analytics"
  >(initialViewMode);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL">("ALL");
  const [dateRange, setDateRange] = useState<
    "today" | "week" | "month" | "all"
  >("today");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [timeRange, setTimeRange] = useState<
    "week" | "month" | "quarter" | "year"
  >("month");
  const [currentLocation, setCurrentLocation] = useState({
    lat: 13.736717,
    lng: 100.523186,
  });
  const [pinnedLocation, setPinnedLocation] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);
  /** โหมดหางานบนแผนที่ — แสดงเรดาร์ (สไตล์ LINE MAN) */
  const [isSeekingJobs, setIsSeekingJobs] = useState(false);
  /** จุดที่เลือกบนแผนที่ Jobs Near You (ก่อนกดเริ่มรับงาน) */
  const [jobsNearDraftPick, setJobsNearDraftPick] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [jobsNearSeekSaving, setJobsNearSeekSaving] = useState(false);
  const jobsNearToggleLock = useRef(false);

  const [notifications] = useState([
    {
      id: 1,
      type: "warning",
      message: "Job #1234 is about to expire",
      time: "10 min ago",
    },
    {
      id: 2,
      type: "success",
      message: "Job #1235 has been completed",
      time: "1 hour ago",
    },
  ]);
  const [providerOnboardingStatus, setProviderOnboardingStatus] = useState<
    string | null
  >(null);
  const [bookings, setBookings] = useState<
    Array<{
      id: string;
      slot_id: string;
      booker_id: string;
      talent_id: string;
      status: string;
      job_id: string | null;
      start_time: string;
      end_time: string;
      created_at: string;
      updated_at: string;
      booker_name: string | null;
      booker_phone: string | null;
      booker_email: string | null;
    }>
  >([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);
  const [rerouteInvites, setRerouteInvites] = useState<RerouteInvitation[]>([]);
  const [rerouteInviteLoading, setRerouteInviteLoading] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(
    null,
  );
  const [highlightRerouteInvites, setHighlightRerouteInvites] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    MockApi.getProviderOnboardingStatus(user.id).then((r) =>
      setProviderOnboardingStatus(r?.provider_status ?? null),
    );
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    MockApi.getProfile(user.id)
      .then((p) => {
        const loc = (p as any)?.location;
        if (
          loc &&
          typeof loc === "object" &&
          loc.lat != null &&
          loc.lng != null
        ) {
          setPinnedLocation({
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address,
          });
          setCurrentLocation({ lat: loc.lat, lng: loc.lng });
        }
      })
      .catch(() => {});
  }, [user?.id]);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const { data } = await api.get<{ bookings: typeof bookings }>(
        "/bookings/me",
      );
      setBookings(data?.bookings ?? []);
    } catch (e) {
      console.error("Failed to load bookings", e);
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  const loadRerouteInvites = useCallback(async () => {
    if (!user?.id) return;
    setRerouteInviteLoading(true);
    try {
      const { data } = await api.get<{ invitations: RerouteInvitation[] }>(
        "/support/provider/reroute-invitations",
      );
      setRerouteInvites(data?.invitations || []);
    } catch (e) {
      console.warn("Failed to load reroute invitations", e);
      setRerouteInvites([]);
    } finally {
      setRerouteInviteLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeView === "bookings") loadBookings();
  }, [activeView, loadBookings]);

  const updateBookingStatus = useCallback(
    async (bookingId: string, status: "confirmed" | "cancelled") => {
      setBookingActionId(bookingId);
      try {
        await api.patch(`/bookings/${bookingId}`, { status });
        await loadBookings();
      } catch (e: any) {
        const msg = e?.response?.data?.error || e?.message || "เกิดข้อผิดพลาด";
        alert(msg);
      } finally {
        setBookingActionId(null);
      }
    },
    [loadBookings],
  );

  // ✅ Load Jobs (ไม่ซ้ำซ้อน)
  const loadJobs = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const myJobs = await MockApi.getYourJobs();
      const open = await MockApi.getJobs(); // หรือ getOpenJobs() ถ้ามี

      console.log("📊 Loaded jobs:", {
        myJobs: myJobs.length,
        openJobs: open.length,
      });

      setAllJobs(myJobs);
      setOpenJobs(
        open.filter(
          (j) => j.status === JobStatus.OPEN && j.created_by !== user.id,
        ),
      );
    } catch (error) {
      console.error("❌ Failed to load jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const acceptRerouteInvite = useCallback(
    async (invite: RerouteInvitation) => {
      setAcceptingInviteId(invite.invitation_id);
      try {
        await api.post(
          `/support/provider/reroute-invitations/${encodeURIComponent(
            invite.ticket_id,
          )}/${encodeURIComponent(invite.invitation_id)}/accept`,
          {},
        );
        alert("รับงานแทนสำเร็จ ระบบยืนยันงานนี้ให้คุณแล้ว");
        await Promise.all([loadRerouteInvites(), loadJobs()]);
        setActiveView("myJobs");
      } catch (e: any) {
        alert(
          e?.response?.data?.error ||
            e?.message ||
            "รับงานแทนไม่สำเร็จ กรุณาลองใหม่",
        );
      } finally {
        setAcceptingInviteId(null);
      }
    },
    [loadJobs, loadRerouteInvites],
  );

  useEffect(() => {
    loadJobs();
    loadRerouteInvites();
  }, [loadJobs, loadRerouteInvites]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") !== "reroute_invites") return;
    setActiveView("availableJobs");
    setHighlightRerouteInvites(true);
    void loadRerouteInvites();
    const timer = window.setTimeout(
      () => setHighlightRerouteInvites(false),
      8000,
    );
    return () => window.clearTimeout(timer);
  }, [loadRerouteInvites, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") !== "reroute_invites") return;
    const ticketId = params.get("ticketId");
    const invitationId = params.get("invitationId");
    if (!ticketId || !invitationId) return;
    void api
      .post("/support/provider/reroute-invitations/opened", {
        ticketId,
        invitationId,
        jobId: params.get("jobId") || null,
        source: "provider_dashboard_focus",
      })
      .catch(() => {});
  }, [location.search]);

  useEffect(() => {
    if (!user?.id) return;
    joinBiddingRooms(String(user.id));
    const socket = getSocket();
    const onInvite = () => {
      void loadRerouteInvites();
    };
    socket.on("provider_reroute_invitation", onInvite);
    return () => {
      socket.off("provider_reroute_invitation", onInvite);
    };
  }, [loadRerouteInvites, user?.id]);

  const handleJobsNearSeekingToggle = async () => {
    if (jobsNearToggleLock.current) return;
    jobsNearToggleLock.current = true;
    const release = () => {
      jobsNearToggleLock.current = false;
    };

    if (isSeekingJobs) {
      setJobsNearSeekSaving(true);
      try {
        await MockApi.setProviderAvailability(false);
        setIsSeekingJobs(false);
      } finally {
        setJobsNearSeekSaving(false);
        release();
      }
      return;
    }

    const lat =
      jobsNearDraftPick?.lat ?? pinnedLocation?.lat ?? currentLocation.lat;
    const lng =
      jobsNearDraftPick?.lng ?? pinnedLocation?.lng ?? currentLocation.lng;

    setJobsNearSeekSaving(true);
    try {
      let address = "";
      try {
        const rev = await reverseGeocode(lat, lng);
        if (rev) address = rev.slice(0, 500);
      } catch {
        /* ยังบันทึกพิกัดได้ */
      }
      const pinRes = await MockApi.pinProviderLocation(
        lat,
        lng,
        address.trim() ? address : undefined,
      );
      if (!pinRes.success) {
        alert(pinRes.error || t("jobs.provider_start_failed"));
        return;
      }
      setPinnedLocation({ lat, lng, address: address.trim() || undefined });
      setCurrentLocation({ lat, lng });
      setJobsNearDraftPick(null);
      const avail = await MockApi.setProviderAvailability(true);
      if (!avail.success) {
        alert(t("jobs.provider_start_failed"));
        return;
      }
      setIsSeekingJobs(true);
    } finally {
      setJobsNearSeekSaving(false);
      release();
    }
  };

  // ✅ Computed Jobs (ใช้ useMemo เพื่อ performance)
  const activeJobs = useMemo(
    () =>
      allJobs.filter(
        (j) =>
          j.accepted_by === user?.id &&
          [
            JobStatus.ACCEPTED,
            JobStatus.IN_PROGRESS,
            JobStatus.WAITING_FOR_APPROVAL,
            JobStatus.WAITING_FOR_PAYMENT,
            JobStatus.DISPUTE,
          ].includes(j.status),
      ),
    [allJobs, user?.id],
  );

  const completedJobs = useMemo(
    () =>
      allJobs.filter((j) =>
        [JobStatus.COMPLETED, JobStatus.CANCELLED].includes(j.status),
      ),
    [allJobs],
  );

  const availableJobs = useMemo(() => openJobs, [openJobs]);

  const currentJob = useMemo(
    () =>
      activeJobs.find((j) => j.status === JobStatus.IN_PROGRESS) ||
      activeJobs[0] ||
      null,
    [activeJobs],
  );

  // ✅ Stats — use fallbacks to prevent NaN
  const stats = useMemo(
    () => ({
      activeCount: activeJobs.length,
      completedCount: completedJobs.length,
      availableCount: availableJobs.length,
      earnings: completedJobs.reduce(
        (sum, j) => sum + (Number(j?.price) || 0),
        0,
      ),
    }),
    [activeJobs, completedJobs, availableJobs],
  );

  const statusCounts = useMemo(
    () => ({
      AVAILABLE: availableJobs.length,
      ACCEPTED: activeJobs.filter((j) => j.status === JobStatus.ACCEPTED)
        .length,
      IN_PROGRESS: activeJobs.filter((j) => j.status === JobStatus.IN_PROGRESS)
        .length,
      COMPLETED: completedJobs.filter((j) => j.status === JobStatus.COMPLETED)
        .length,
      CANCELLED: completedJobs.filter((j) => j.status === JobStatus.CANCELLED)
        .length,
    }),
    [activeJobs, completedJobs, availableJobs],
  );

  // ✅ Earnings & Analytics Calculations
  const getDateRange = (range: typeof timeRange) => {
    const now = new Date();
    const start = new Date(now);

    switch (range) {
      case "week":
        start.setDate(now.getDate() - 7);
        break;
      case "month":
        start.setMonth(now.getMonth() - 1);
        break;
      case "quarter":
        start.setMonth(now.getMonth() - 3);
        break;
      case "year":
        start.setFullYear(now.getFullYear() - 1);
        break;
    }

    return { start, end: now };
  };

  const filteredJobsByTime = useMemo(() => {
    const { start, end } = getDateRange(timeRange);
    return allJobs.filter((job) => {
      const jobDate = new Date(job.created_at);
      return jobDate >= start && jobDate <= end;
    });
  }, [allJobs, timeRange]);

  const earningsMetrics = useMemo(() => {
    const completed = filteredJobsByTime.filter(
      (j) => j.status === JobStatus.COMPLETED,
    );
    const totalEarnings = completed.reduce(
      (sum, j) => sum + (Number(j?.price) || 0),
      0,
    );
    const avgEarnings =
      completed.length > 0 ? totalEarnings / completed.length : 0;

    const prevRange = getDateRange(timeRange);
    const prevStart = new Date(prevRange.start);
    const prevEnd = new Date(prevRange.end);
    const rangeDiff = prevEnd.getTime() - prevStart.getTime();
    prevStart.setTime(prevStart.getTime() - rangeDiff);
    prevEnd.setTime(prevEnd.getTime() - rangeDiff);

    const prevJobs = allJobs.filter((job) => {
      const jobDate = new Date(job.created_at);
      return (
        jobDate >= prevStart &&
        jobDate <= prevEnd &&
        job.status === JobStatus.COMPLETED
      );
    });
    const prevEarnings = prevJobs.reduce(
      (sum, j) => sum + (Number(j?.price) || 0),
      0,
    );
    const earningsChange =
      prevEarnings > 0
        ? ((totalEarnings - prevEarnings) / prevEarnings) * 100
        : 0;

    const categoryEarnings: Record<string, number> = {};
    completed.forEach((job) => {
      const amt = Number(job?.price) || 0;
      categoryEarnings[job.category] =
        (categoryEarnings[job.category] || 0) + amt;
    });

    const dailyEarnings: Record<string, number> = {};
    completed.forEach((job) => {
      const date = new Date(job.created_at).toLocaleDateString();
      dailyEarnings[date] =
        (dailyEarnings[date] || 0) + (Number(job?.price) || 0);
    });

    return {
      totalEarnings,
      avgEarnings,
      jobsCompleted: completed.length,
      earningsChange,
      categoryEarnings,
      dailyEarnings,
      pendingPayment: filteredJobsByTime
        .filter((j) => j.status === JobStatus.WAITING_FOR_PAYMENT)
        .reduce((sum, j) => sum + (Number(j?.price) || 0), 0),
    };
  }, [filteredJobsByTime, allJobs, timeRange]);

  const analyticsMetrics = useMemo(() => {
    const total = filteredJobsByTime.length;
    const completed = filteredJobsByTime.filter(
      (j) => j.status === JobStatus.COMPLETED,
    ).length;
    const cancelled = filteredJobsByTime.filter(
      (j) => j.status === JobStatus.CANCELLED,
    ).length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const avgCompletionTime = 2.5;

    const categoryDist: Record<string, number> = {};
    filteredJobsByTime.forEach((job) => {
      categoryDist[job.category] = (categoryDist[job.category] || 0) + 1;
    });

    const statusDist: Record<string, number> = {};
    filteredJobsByTime.forEach((job) => {
      statusDist[job.status] = (statusDist[job.status] || 0) + 1;
    });

    return {
      totalJobs: total,
      completionRate,
      avgCompletionTime,
      categoryDist,
      statusDist,
      completed,
      cancelled,
    };
  }, [filteredJobsByTime]);

  // ✅ Filtered Jobs for Display
  const visibleJobs = useMemo(() => {
    let source = activeView === "availableJobs" ? availableJobs : activeJobs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      source = source.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "ALL") {
      source = source.filter((j) => j.status === statusFilter);
    }

    return source;
  }, [activeView, availableJobs, activeJobs, searchQuery, statusFilter]);

  // ✅ Handlers
  const handleAcceptJob = async (jobId: string) => {
    try {
      await MockApi.acceptJob(jobId);
      alert("Job accepted successfully!");
      await loadJobs();
    } catch (error) {
      console.error("Failed to accept job:", error);
      alert("Failed to accept job");
    }
  };

  const handleStartJob = async (jobId: string) => {
    try {
      await MockApi.updateJobStatus(jobId, JobStatus.IN_PROGRESS);
      alert("Job started!");
      await loadJobs();
    } catch (error) {
      console.error("Failed to start job:", error);
    }
  };

  const handleCompleteJob = async (jobId: string) => {
    try {
      await MockApi.markJobAsDone(jobId, currentLocation);
      alert("Job marked as done!");
      await loadJobs();
    } catch (error) {
      console.error("Failed to complete job:", error);
    }
  };

  const handleExportEarnings = () => {
    const completed = allJobs.filter((j) => j.status === JobStatus.COMPLETED);
    const headers = ["Job ID", "Title", "Amount (฿)", "Date"];
    const rows = completed.map((j) => [
      j.id,
      j.title || "",
      String(Number(j?.price) || 0),
      new Date(j.created_at || j.datetime).toLocaleDateString(),
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `provider-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNavigation = (lat: number, lng: number) => {
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      window.open(`maps://maps.apple.com/?daddr=${lat},${lng}`, "_blank");
    } else if (/android/i.test(userAgent)) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank",
      );
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank",
      );
    }
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case JobStatus.OPEN:
        return "bg-green-100 text-green-800";
      case JobStatus.ACCEPTED:
        return "bg-blue-100 text-blue-800";
      case JobStatus.IN_PROGRESS:
        return "bg-purple-100 text-purple-800";
      case JobStatus.WAITING_FOR_APPROVAL:
        return "bg-orange-100 text-orange-800";
      case JobStatus.COMPLETED:
        return "bg-emerald-100 text-emerald-800";
      case JobStatus.CANCELLED:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // ✅ Render Functions
  const cardBase =
    "rounded-2xl p-6 shadow-lg border border-white/10 font-sans transition-all duration-200 active:scale-[0.98] hover:opacity-95 cursor-pointer text-left";

  const renderRerouteInvites = () => {
    if (!rerouteInviteLoading && rerouteInvites.length === 0) return null;
    return (
      <div
        className={`rounded-2xl border bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-4 shadow-sm transition-all ${
          highlightRerouteInvites
            ? "border-red-400 ring-4 ring-red-200"
            : "border-red-200"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-red-800">
              <Zap size={18} />
              งานด่วนรอรับแทน
            </p>
            <p className="mt-1 text-xs text-red-700">
              ระบบเชิญคุณจาก Care Reroute จริง กดรับได้ทันทีถ้าพร้อมไปแทน
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRerouteInvites()}
            className="rounded-full bg-white/80 p-2 text-red-700 shadow-sm"
            title="Refresh reroute invites"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {rerouteInviteLoading && (
          <p className="text-xs font-semibold text-red-700">
            กำลังตรวจงานด่วน...
          </p>
        )}
        <div className="space-y-2">
          {rerouteInvites.slice(0, 3).map((invite) => {
            const title = invite.job?.title || `งาน #${invite.job_id || "—"}`;
            const price = Number(invite.job?.price || 0);
            return (
              <div
                key={invite.invitation_id}
                className="rounded-xl border border-white/80 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {invite.job?.category || "งานด่วน"}
                      {price > 0 ? ` · ฿${price.toLocaleString()}` : ""}
                    </p>
                    {invite.expires_at && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-orange-700">
                        <Clock size={12} />
                        รับได้ถึง{" "}
                        {new Date(invite.expires_at).toLocaleTimeString(
                          "th-TH",
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void acceptRerouteInvite(invite)}
                    disabled={acceptingInviteId === invite.invitation_id}
                    className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white shadow-sm active:scale-95 disabled:opacity-60"
                  >
                    {acceptingInviteId === invite.invitation_id
                      ? "กำลังรับ..."
                      : "รับงานแทน"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {renderRerouteInvites()}
      {/* Quick Stats — Interactive, clickable cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <button
          type="button"
          onClick={() => navigate("/jobs")}
          className={`${cardBase} bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700 shadow-emerald-500/20`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">
                Available Jobs
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">
                {stats.availableCount}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Briefcase size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("myJobs")}
          className={`${cardBase} bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 shadow-blue-500/20`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">
                Active Jobs
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">
                {stats.activeCount}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Zap size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("earnings")}
          className={`${cardBase} bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 shadow-amber-500/20`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">
                Total Earnings
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">
                ฿ {(stats.earnings || 0).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <DollarSign size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("myJobs");
          }}
          className={`${cardBase} bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-700 shadow-purple-500/20`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">
                Completed
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">
                {stats.completedCount}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Award size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
        </button>
      </div>

      {/* Current Job & Map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {currentJob ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
              <Package size={20} className="mr-2 text-blue-500" />
              Active Job
            </h3>
            <h4 className="text-lg font-bold mb-2">{currentJob.title}</h4>
            <p className="text-gray-600 mb-4">{currentJob.description}</p>
            <div className="flex space-x-2">
              <button
                onClick={() => handleCompleteJob(currentJob.id)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <CheckCircle size={18} className="inline mr-2" />
                Complete
              </button>
              <button
                onClick={() =>
                  openNavigation(
                    currentJob.location.lat,
                    currentJob.location.lng,
                  )
                }
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Navigation size={18} className="inline mr-2" />
                Navigate
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4">No Active Job</h3>
            <p className="text-gray-500 mb-4">
              Browse available jobs to get started.
            </p>
            <button
              onClick={() => setActiveView("availableJobs")}
              className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Browse Jobs
            </button>
          </div>
        )}

        {/* Map */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
            <h3 className="font-bold text-gray-900 flex items-center">
              <MapPin size={20} className="mr-2 text-blue-500" />
              Jobs Near You
            </h3>
            <button
              type="button"
              onClick={() => void handleJobsNearSeekingToggle()}
              disabled={jobsNearSeekSaving}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed ${
                isSeekingJobs
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/25"
              }`}
            >
              {jobsNearSeekSaving
                ? t("jobs.provider_start_busy")
                : isSeekingJobs
                  ? t("jobs.provider_stop_jobs")
                  : t("jobs.provider_start_jobs")}
            </button>
          </div>
          {!isSeekingJobs && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3 leading-relaxed">
              {t("jobs.provider_map_tap_pin")}
            </p>
          )}
          {isSeekingJobs && (
            <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 mb-3 leading-relaxed">
              {t("jobs.provider_radar_hint")}
            </p>
          )}
          <ProviderMap
            jobs={availableJobs}
            currentLocation={currentLocation}
            pinnedLocation={pinnedLocation}
            draftPickLocation={jobsNearDraftPick}
            onMapPick={(lat, lng) => setJobsNearDraftPick({ lat, lng })}
            acceptedJob={currentJob}
            onJobSelect={(job) => {
              setSelectedJob(job);
              setShowJobModal(true);
            }}
            onNavigateToJob={(job) =>
              openNavigation(
                (job as any).location?.lat ?? 0,
                (job as any).location?.lng ?? 0,
              )
            }
            height="300px"
            showControls={true}
            jobSearchMode={true}
            radarOverlay={isSeekingJobs}
          />
        </div>
      </div>
    </div>
  );

  const renderAvailableJobsView = () => (
    <div className="space-y-6">
      {renderRerouteInvites()}
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Available Jobs</h2>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search jobs..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as JobStatus | "ALL")
            }
            className="border border-gray-300 rounded-lg px-4 py-2"
          >
            <option value="ALL">All Jobs</option>
            <option value="OPEN">Open</option>
          </select>
        </div>
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleJobs.map((job) => (
          <div
            key={job.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md"
          >
            <h3 className="font-bold text-gray-900 mb-2">{job.title}</h3>
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {job.description}
            </p>
            <div className="flex justify-between mb-4">
              <span className="font-bold text-emerald-600">฿{job.price}</span>
              <span className="text-sm text-gray-500">{job.category}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setSelectedJob(job);
                  setShowJobModal(true);
                }}
                className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg"
              >
                Details
              </button>
              <button
                onClick={() => handleAcceptJob(job.id)}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg"
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>

      {visibleJobs.length === 0 && (
        <div className="text-center py-12">
          <Briefcase className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">No jobs found</p>
        </div>
      )}
    </div>
  );

  const renderBookingsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Calendar size={22} />
          คำขอจองคิว
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          ดูคำขอจองที่ส่งถึงคุณ แล้วกด ยืนยัน หรือ ยกเลิก
        </p>
        {bookingsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={28} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock size={40} className="mx-auto mb-2 opacity-60" />
                <p>ยังไม่มีคำขอจอง</p>
              </div>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {b.booker_name || "ผู้จอง"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(b.start_time).toLocaleString("th-TH")} –{" "}
                      {new Date(b.end_time).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <span
                      className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${
                        b.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : b.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {b.status === "pending"
                        ? "รอยืนยัน"
                        : b.status === "confirmed"
                          ? "ยืนยันแล้ว"
                          : "ยกเลิก"}
                    </span>
                  </div>
                  {b.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => updateBookingStatus(b.id, "confirmed")}
                        disabled={bookingActionId === b.id}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {bookingActionId === b.id ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                        ยืนยัน
                      </button>
                      <button
                        onClick={() => updateBookingStatus(b.id, "cancelled")}
                        disabled={bookingActionId === b.id}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1"
                      >
                        <XCircle size={16} />
                        ยกเลิก
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderEarningsView = () => (
    <div className="space-y-6">
      {/* Time Range Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              Time Period:
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["week", "month", "quarter", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  timeRange === range
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Earnings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-white rounded-2xl p-6 shadow-lg border border-white/10">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider mb-1">
                Total Earnings
              </p>
              <p className="text-3xl font-bold text-white tabular-nums truncate">
                ฿ {(earningsMetrics.totalEarnings || 0).toLocaleString()}
              </p>
            </div>
            <DollarSign size={28} className="text-white flex-shrink-0" />
          </div>
          <div className="flex items-center text-sm text-white/90">
            {earningsMetrics.earningsChange >= 0 ? (
              <ArrowUpRight size={16} className="mr-1" />
            ) : (
              <ArrowDownRight size={16} className="mr-1" />
            )}
            <span className="font-medium">
              {Math.abs(earningsMetrics.earningsChange || 0).toFixed(1)}%
            </span>
            <span className="ml-2">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Average Per Job</p>
              <p className="text-3xl font-bold text-gray-900">
                ฿{Math.round(earningsMetrics.avgEarnings || 0).toLocaleString()}
              </p>
            </div>
            <Target size={28} className="text-blue-500" />
          </div>
          <p className="text-sm text-gray-500">
            From {earningsMetrics.jobsCompleted} completed jobs
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Jobs Completed</p>
              <p className="text-3xl font-bold text-gray-900">
                {earningsMetrics.jobsCompleted}
              </p>
            </div>
            <CheckCircle size={28} className="text-green-500" />
          </div>
          <p className="text-sm text-gray-500">In selected period</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Pending Payment</p>
              <p className="text-3xl font-bold text-amber-600">
                ฿{earningsMetrics.pendingPayment.toLocaleString()}
              </p>
            </div>
            <Clock size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-gray-500">Awaiting release</p>
        </div>
      </div>

      {/* Earnings by Category */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <PieChart size={20} className="mr-2 text-blue-500" />
          Earnings by Category
        </h3>
        <div className="space-y-3">
          {Object.entries(earningsMetrics.categoryEarnings)
            .sort(([, a], [, b]) => b - a)
            .map(([category, amount]) => {
              const percentage =
                earningsMetrics.totalEarnings > 0
                  ? (amount / earningsMetrics.totalEarnings) * 100
                  : 0;
              return (
                <div key={category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {category}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      ฿{amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {percentage.toFixed(1)}% of total
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      {/* Daily Earnings Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <BarChart3 size={20} className="mr-2 text-blue-500" />
          Daily Earnings Trend
        </h3>
        <div className="flex items-end space-x-2 h-48">
          {Object.entries(earningsMetrics.dailyEarnings)
            .slice(-14)
            .map(([date, amount]) => {
              const maxAmount = Math.max(
                ...Object.values(earningsMetrics.dailyEarnings),
              );
              const height = (amount / maxAmount) * 100;
              return (
                <div key={date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t hover:from-blue-600 hover:to-blue-500 transition-all relative group"
                    style={{ height: `${height}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      ฿{amount.toLocaleString()}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(date).getDate()}
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-95 active:opacity-90 flex items-center justify-center transition-all cursor-pointer font-medium"
        >
          <Wallet size={18} className="mr-2" />
          View Wallet & Transactions
        </button>
        <button
          type="button"
          onClick={handleExportEarnings}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 active:scale-95 active:opacity-90 flex items-center justify-center transition-all cursor-pointer font-medium"
        >
          <Download size={18} className="mr-2" />
          Export Earnings Report
        </button>
      </div>
    </div>
  );

  const renderAnalyticsView = () => (
    <div className="space-y-6">
      {/* Time Range Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              Time Period:
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["week", "month", "quarter", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  timeRange === range
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Completion Rate</p>
              <p className="text-3xl font-bold text-gray-900">
                {analyticsMetrics.completionRate.toFixed(1)}%
              </p>
            </div>
            <Target size={28} className="text-green-500" />
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${analyticsMetrics.completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Avg. Completion Time</p>
              <p className="text-3xl font-bold text-gray-900">
                {analyticsMetrics.avgCompletionTime}h
              </p>
            </div>
            <Clock size={28} className="text-blue-500" />
          </div>
          <p className="text-sm text-gray-500">Per job average</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Jobs</p>
              <p className="text-3xl font-bold text-gray-900">
                {analyticsMetrics.totalJobs}
              </p>
            </div>
            <Award size={28} className="text-purple-500" />
          </div>
          <p className="text-sm text-gray-500">In selected period</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Success Rate</p>
              <p className="text-3xl font-bold text-gray-900">
                {(analyticsMetrics.totalJobs > 0
                  ? (analyticsMetrics.completed / analyticsMetrics.totalJobs) *
                    100
                  : 0
                ).toFixed(1)}
                %
              </p>
            </div>
            <Star size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-gray-500">
            {analyticsMetrics.cancelled} cancelled
          </p>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <BarChart3 size={20} className="mr-2 text-blue-500" />
          Job Status Distribution
        </h3>
        <div className="space-y-3">
          {Object.entries(analyticsMetrics.statusDist).map(
            ([status, count]) => {
              const percentage =
                analyticsMetrics.totalJobs > 0
                  ? (count / analyticsMetrics.totalJobs) * 100
                  : 0;
              const colors: Record<string, string> = {
                COMPLETED: "from-green-500 to-green-600",
                IN_PROGRESS: "from-blue-500 to-blue-600",
                CANCELLED: "from-red-500 to-red-600",
                WAITING_FOR_APPROVAL: "from-orange-500 to-orange-600",
              };
              return (
                <div key={status}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {status.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {count}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`bg-gradient-to-r ${
                        colors[status] || "from-gray-500 to-gray-600"
                      } h-2 rounded-full transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {percentage.toFixed(1)}%
                  </p>
                </div>
              );
            },
          )}
        </div>
      </div>
      {/* Category Performance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <PieChart size={20} className="mr-2 text-blue-500" />
          Performance by Category
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(analyticsMetrics.categoryDist)
            .sort(([, a], [, b]) => b - a)
            .map(([category, count]) => (
              <div
                key={category}
                className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
              >
                <h4 className="font-bold text-gray-900 mb-2">{category}</h4>
                <p className="text-2xl font-bold text-blue-600">{count}</p>
                <p className="text-sm text-gray-500">
                  {(analyticsMetrics.totalJobs > 0
                    ? (count / analyticsMetrics.totalJobs) * 100
                    : 0
                  ).toFixed(1)}
                  % of total
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderJobModal = () => {
    if (!selectedJob) return null;
    const loc = selectedJob.location as
      | { lat?: number; lng?: number; fullAddress?: string; address?: string }
      | undefined;
    const jobLat = Number(loc?.lat) || 0;
    const jobLng = Number(loc?.lng) || 0;
    const address =
      loc?.fullAddress ||
      loc?.address ||
      (jobLat && jobLng
        ? `${jobLat.toFixed(4)}, ${jobLng.toFixed(4)}`
        : "ไม่ระบุที่อยู่");
    const distanceKm =
      jobLat && jobLng
        ? calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            jobLat,
            jobLng,
          )
        : 0;
    const durationHrs =
      (selectedJob.duration_hours ?? selectedJob.duration_minutes)
        ? selectedJob.duration_minutes / 60
        : 2;
    const jobDateTime = new Date(
      selectedJob.datetime || selectedJob.created_at || 0,
    ).getTime();
    const now = Date.now();
    const hoursUntilStart = (jobDateTime - now) / (1000 * 60 * 60);
    const isUrgent = hoursUntilStart > 0 && hoursUntilStart <= 1;
    const hasInsurance = !!(selectedJob as any).has_insurance;
    const hasEscrow =
      !!(selectedJob as any).payment_held ||
      (selectedJob as any).escrow_status === "held";
    const isGuaranteed = hasInsurance || hasEscrow;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 rounded-t-2xl z-10 flex justify-between items-start">
            <h2 className="text-xl font-bold text-slate-900 pr-2">
              {selectedJob.title}
            </h2>
            <button
              type="button"
              onClick={() => setShowJobModal(false)}
              className="p-2 rounded-full hover:bg-gray-100"
            >
              <XCircle size={24} className="text-gray-500" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Urgency Tag */}
            {isUrgent ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-xl text-amber-800 font-medium">
                <Zap size={18} />
                ด่วนมาก — เริ่มงานภายใน 1 ชม.
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm">
                งานทั่วไป
              </div>
            )}

            {/* Trust & Identity */}
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                {selectedJob.category}
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1">
                <Clock size={14} /> ~{durationHrs} ชม.
              </span>
              {isGuaranteed && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-medium flex items-center gap-1">
                  <Shield size={14} /> AQOND Guaranteed
                </span>
              )}
            </div>

            {/* Price */}
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border border-emerald-100">
              <p className="text-sm text-slate-600 mb-1">ค่าจ้าง</p>
              <p className="text-3xl font-bold text-emerald-600">
                ฿ {(Number(selectedJob.price) || 0).toLocaleString()}
              </p>
            </div>

            {/* Employer Profile */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-sm font-medium text-slate-600 mb-3">
                ผู้จ้างงาน
              </p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold overflow-hidden">
                  {selectedJob.created_by_avatar ? (
                    <img
                      src={selectedJob.created_by_avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (selectedJob.created_by_name || "E").charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">
                    {selectedJob.created_by_name || "ผู้จ้าง"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center text-amber-500">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} size={14} className="fill-current" />
                      ))}
                    </div>
                    <span className="text-sm text-slate-600">
                      5.0 · จ้างแล้ว 15 งานสำเร็จ
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                    <Shield size={12} /> Verified Employer
                  </span>
                </div>
              </div>
            </div>

            {/* Location & Map */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800 flex items-center gap-2">
                    <MapPin size={18} className="text-blue-600" />
                    {address}
                  </p>
                  {distanceKm > 0 && (
                    <span className="text-sm font-semibold text-blue-600">
                      {distanceKm.toFixed(1)} กม. จากคุณ
                    </span>
                  )}
                </div>
              </div>
              {jobLat && jobLng && (
                <div className="h-48 bg-slate-100">
                  <ProviderMap
                    jobs={[
                      {
                        ...selectedJob,
                        location: {
                          lat: jobLat,
                          lng: jobLng,
                          fullAddress: address,
                        },
                      },
                    ]}
                    currentLocation={currentLocation}
                    height="192px"
                    showControls={false}
                    jobSearchMode={false}
                  />
                </div>
              )}
              <div className="p-3 bg-white">
                <button
                  type="button"
                  onClick={() =>
                    openNavigation(jobLat || 13.736717, jobLng || 100.523186)
                  }
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-blue-600 font-medium hover:bg-blue-50 rounded-xl transition-colors"
                >
                  <Navigation size={18} />
                  เปิดแผนที่นำทาง
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">
                รายละเอียดงาน
              </p>
              <p className="text-slate-700 leading-relaxed">
                {selectedJob.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowJobModal(false);
                  navigate(`/jobs/${selectedJob.id}`);
                }}
                className="flex-1 py-3 px-4 bg-blue-50 text-blue-700 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-100 active:scale-[0.98] transition-all"
              >
                <MessageSquare size={18} />
                แชทก่อนรับงาน
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAcceptJob(selectedJob.id);
                  setShowJobModal(false);
                }}
                className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.98] transition-all"
              >
                <CheckCircle size={18} />
                รับงาน
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Provider Dashboard</h1>
            <p className="text-gray-500">Welcome, {user?.name}!</p>
          </div>
          <button
            type="button"
            onClick={() => loadJobs()}
            className="p-2.5 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:scale-95 active:opacity-90 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      {providerOnboardingStatus === "PENDING_TEST" && (
        <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-400 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <p className="text-amber-900 font-medium">
            คุณต้องทำแบบทดสอบ &quot;มาตรฐานการบริการและความปลอดภัยของ
            Nexus&quot; (55 ข้อ, ผ่าน ≥85%) ก่อนจึงจะรับงานได้
          </p>
          <a
            href="#/training/dashboard"
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
          >
            ไปทำแบบทดสอบ
          </a>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="flex overflow-x-auto">
          {[
            { key: "overview", label: "Overview", icon: BarChart3 },
            { key: "availableJobs", label: "Available", icon: Briefcase },
            { key: "myJobs", label: "My Jobs", icon: Package },
            { key: "bookings", label: "คำขอจอง", icon: Calendar },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveView(key as any)}
              className={`flex-1 min-w-[120px] py-4 px-4 flex flex-col items-center cursor-pointer active:scale-95 active:opacity-90 transition-all ${
                activeView === key
                  ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={20} className="mb-2" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5">
        {[
          { key: "earnings", label: "Earnings", icon: Wallet },
          { key: "analytics", label: "Analytics", icon: TrendingUp },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveView(key as any)}
            className={`flex-1 py-2 px-2 rounded-xl font-medium text-xs flex flex-col items-center gap-1 transition-all cursor-pointer active:scale-95 active:opacity-90 ${
              activeView === key
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-6">
        {activeView === "overview" && renderOverview()}
        {activeView === "availableJobs" && renderAvailableJobsView()}
        {activeView === "myJobs" && <MyJobs embedded />}
        {activeView === "bookings" && renderBookingsView()}
        {activeView === "bids" && (
          <div className="bg-gray-900 rounded-2xl p-6 border border-amber-500/20">
            <BiddingBoard
              talentId={user?.id || providerId || ""}
              onBidAccepted={loadBookings}
            />
          </div>
        )}
        {activeView === "earnings" && renderEarningsView()}
        {activeView === "analytics" && renderAnalyticsView()}
      </div>

      {/* ✅ Fixed Bottom Navigation - ต้องอยู่นอก container หลัก */}
      {showJobModal && renderJobModal()}
    </div>
  );
};

export default ProviderDashboard;
