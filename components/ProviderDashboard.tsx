// src/components/ProviderDashboard.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";
import { Job, JobStatus } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { MockApi } from "../services/mockApi";
import ProviderMap from "./ProviderMap";
import { useAuth } from "../context/AuthContext";
import { MyJobs } from "@/pages/MyJobs";

interface ProviderDashboardProps {
  providerId?: string;
  viewMode?: "overview" | "availableJobs" | "myJobs" | "earnings" | "analytics";
}

const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  providerId,
  viewMode: initialViewMode = "overview",
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ✅ States
  const [activeView, setActiveView] = useState<
    "overview" | "availableJobs" | "myJobs" | "earnings" | "analytics"
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
  const [currentLocation] = useState({
    lat: 13.736717,
    lng: 100.523186,
  });

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
          (j) => j.status === JobStatus.OPEN && j.created_by !== user.id
        )
      );
    } catch (error) {
      console.error("❌ Failed to load jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

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
          ].includes(j.status)
      ),
    [allJobs, user?.id]
  );

  const completedJobs = useMemo(
    () =>
      allJobs.filter((j) =>
        [JobStatus.COMPLETED, JobStatus.CANCELLED].includes(j.status)
      ),
    [allJobs]
  );

  const availableJobs = useMemo(() => openJobs, [openJobs]);

  const currentJob = useMemo(
    () =>
      activeJobs.find((j) => j.status === JobStatus.IN_PROGRESS) ||
      activeJobs[0] ||
      null,
    [activeJobs]
  );

  // ✅ Stats
  const stats = useMemo(
    () => ({
      activeCount: activeJobs.length,
      completedCount: completedJobs.length,
      availableCount: availableJobs.length,
      earnings: completedJobs.reduce((sum, j) => sum + j.price, 0),
    }),
    [activeJobs, completedJobs, availableJobs]
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
    [activeJobs, completedJobs, availableJobs]
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
      (j) => j.status === JobStatus.COMPLETED
    );
    const totalEarnings = completed.reduce((sum, j) => sum + j.price, 0);
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
    const prevEarnings = prevJobs.reduce((sum, j) => sum + j.price, 0);
    const earningsChange =
      prevEarnings > 0
        ? ((totalEarnings - prevEarnings) / prevEarnings) * 100
        : 0;

    const categoryEarnings: Record<string, number> = {};
    completed.forEach((job) => {
      categoryEarnings[job.category] =
        (categoryEarnings[job.category] || 0) + job.price;
    });

    const dailyEarnings: Record<string, number> = {};
    completed.forEach((job) => {
      const date = new Date(job.created_at).toLocaleDateString();
      dailyEarnings[date] = (dailyEarnings[date] || 0) + job.price;
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
        .reduce((sum, j) => sum + j.price, 0),
    };
  }, [filteredJobsByTime, allJobs, timeRange]);

  const analyticsMetrics = useMemo(() => {
    const total = filteredJobsByTime.length;
    const completed = filteredJobsByTime.filter(
      (j) => j.status === JobStatus.COMPLETED
    ).length;
    const cancelled = filteredJobsByTime.filter(
      (j) => j.status === JobStatus.CANCELLED
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
          j.description.toLowerCase().includes(q)
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

  const openNavigation = (lat: number, lng: number) => {
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      window.open(`maps://maps.apple.com/?daddr=${lat},${lng}`, "_blank");
    } else if (/android/i.test(userAgent)) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank"
      );
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank"
      );
    }
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
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
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Available Jobs</p>
              <p className="text-3xl font-bold">{stats.availableCount}</p>
            </div>
            <Briefcase size={24} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Active Jobs</p>
              <p className="text-3xl font-bold">{stats.activeCount}</p>
            </div>
            <Zap size={24} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Total Earnings</p>
              <p className="text-3xl font-bold">
                ฿{stats.earnings.toLocaleString()}
              </p>
            </div>
            <DollarSign size={24} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Completed</p>
              <p className="text-3xl font-bold">{stats.completedCount}</p>
            </div>
            <Award size={24} className="opacity-80" />
          </div>
        </div>
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
                    currentJob.location.lng
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
          <h3 className="font-bold text-gray-900 mb-4 flex items-center">
            <MapPin size={20} className="mr-2 text-blue-500" />
            Jobs Near You
          </h3>
          <ProviderMap
            jobs={availableJobs}
            currentLocation={currentLocation}
            acceptedJob={currentJob}
            onJobSelect={(job) => {
              setSelectedJob(job);
              setShowJobModal(true);
            }}
            onNavigateToJob={(job) =>
              openNavigation(job.location.lat, job.location.lng)
            }
            height="300px"
            showControls={false}
          />
        </div>
      </div>
    </div>
  );

  const renderAvailableJobsView = () => (
    <div className="space-y-6">
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
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm opacity-90 mb-1">Total Earnings</p>
              <p className="text-3xl font-bold">
                ฿{earningsMetrics.totalEarnings.toLocaleString()}
              </p>
            </div>
            <DollarSign size={28} className="opacity-80" />
          </div>
          <div className="flex items-center text-sm">
            {earningsMetrics.earningsChange >= 0 ? (
              <ArrowUpRight size={16} className="mr-1" />
            ) : (
              <ArrowDownRight size={16} className="mr-1" />
            )}
            <span className="font-medium">
              {Math.abs(earningsMetrics.earningsChange).toFixed(1)}%
            </span>
            <span className="ml-2 opacity-75">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Average Per Job</p>
              <p className="text-3xl font-bold text-gray-900">
                ฿{earningsMetrics.avgEarnings.toFixed(0)}
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
              const percentage = (amount / earningsMetrics.totalEarnings) * 100;
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
                ...Object.values(earningsMetrics.dailyEarnings)
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

      {/* Export Button */}
      <button className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center transition-colors">
        <Download size={18} className="mr-2" />
        Export Earnings Report
      </button>
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
                {(
                  (analyticsMetrics.completed / analyticsMetrics.totalJobs) *
                    100 || 0
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
              const percentage = (count / analyticsMetrics.totalJobs) * 100;
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
            }
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
                  {((count / analyticsMetrics.totalJobs) * 100).toFixed(1)}% of
                  total
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderJobModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {selectedJob && (
          <>
            <div className="border-b border-gray-200 p-6">
              <div className="flex justify-between items-start">
                <h3 className="text-xl font-bold">{selectedJob.title}</h3>
                <button onClick={() => setShowJobModal(false)}>
                  <XCircle size={24} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="mb-4">{selectedJob.description}</p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="text-3xl font-bold text-emerald-600">
                  ฿{selectedJob.price}
                </div>
              </div>
              <button
                onClick={() => {
                  handleAcceptJob(selectedJob.id);
                  setShowJobModal(false);
                }}
                className="w-full py-3 bg-emerald-600 text-white rounded-lg"
              >
                Accept Job
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

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
            onClick={loadJobs}
            className="p-2 text-gray-500 hover:text-gray-700"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="flex overflow-x-auto">
          {[
            { key: "overview", label: "Overview", icon: BarChart3 },
            { key: "availableJobs", label: "Available", icon: Briefcase },
            { key: "myJobs", label: "My Jobs", icon: Package },
       
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveView(key as any)}
              className={`flex-1 min-w-[120px] py-4 px-4 flex flex-col items-center ${
                activeView === key
                  ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                  : "text-gray-600"
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
          onClick={() => setActiveView(key as any)}
          className={`flex-1 py-2 px-2 rounded-lg font-medium text-xs flex flex-col items-center gap-1 transition-all ${
            activeView === key
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600"
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
        {activeView === "myJobs" && (<MyJobs jobs={allJobs} onNavigate={openNavigation} />)}
        {activeView === "earnings" && renderEarningsView()}
        {activeView === "analytics" && renderAnalyticsView()}
      </div>

      {/* ✅ Fixed Bottom Navigation - ต้องอยู่นอก container หลัก */}
      {showJobModal && renderJobModal()}
    </div>
  );
};

export default ProviderDashboard;
