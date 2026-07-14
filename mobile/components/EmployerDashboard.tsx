import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Briefcase,
  Users,
  DollarSign,
  BarChart3,
  Filter,
  Download,
  Bell,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MapPin,
  MessageSquare,
  Phone,
  Eye,
  MoreVertical,
  Plus,
  RefreshCw,
  Calendar,
  TrendingUp,
  TrendingDown,
  Star,
  Ban,
  ChevronRight
} from "lucide-react";
import {
  Job,
  JobStatus,
  JobStatistics,
} from "../types";
import { useLanguage } from "../context/LanguageContext";
import { MockApi } from "../services/mockApi";
import JobCounter from "./JobCounter";
import EmployerMap from "./EmployerMap";
import DriverTracking from "./DriverTracking";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

interface EmployerDashboardProps {
  employerId?: string;
  viewMode?: "overview" | "jobs" | "providers" | "analytics";
}

const EmployerDashboard: React.FC<EmployerDashboardProps> = ({
  employerId,
  viewMode: initialViewMode = "overview",
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<
    "overview" | "jobs" | "providers" | "analytics"
  >(initialViewMode);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<JobStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL" | "ACTIVE">("ALL");
  const [dateRange, setDateRange] = useState<
    "today" | "week" | "month" | "all"
  >("today");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [notifications, setNotifications] = useState([
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
    {
      id: 3,
      type: "info",
      message: "New provider applied for job",
      time: "2 hours ago",
    },
  ]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');

  // FIX 1: state สำหรับ rehire provider
  const [selectedProviderForRehire, setSelectedProviderForRehire] = useState<any>(null);
  const [showRehireModal, setShowRehireModal] = useState(false);

  // Modals for interactive cards
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [financialData, setFinancialData] = useState<{
    totalSpent: number;
    jobValue: number;
    serviceFee: number;
    transactions: Array<{ id: string; amount: number; type: string; description: string; created_at: string; job_title?: string }>;
  } | null>(null);

  // Fetch data
  useEffect(() => {
    fetchDashboardData();
  }, [activeView, dateRange, user?.id, employerId]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch employer's jobs
      const allJobs = await MockApi.getYourJobs();
      const employerJobs = employerId
        ? allJobs.filter((job) => job.created_by === employerId)
        : allJobs.filter((job) => job.created_by === user?.id);

      setJobs(employerJobs);
      setFilteredJobs(employerJobs);

      // Fetch statistics
      const stats = await MockApi.getJobStatistics({
        dateRange,
        userId: employerId || user?.id,
        role: "owner",
      });
      setStatistics(stats);

      // Fetch real providers from jobs
      const jobIds = employerJobs.map(job => job.id);
      const realProviders = await fetchRealProviders(jobIds, employerJobs);

      setProviders(realProviders);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [activeView, employerId, user?.id, dateRange]);

  // FIX 2: ดึงผู้ให้บริการจริงจาก jobs (merge hireHistory เมื่อ provider เดียวกันมีหลายงาน)
  const fetchRealProviders = async (jobIds: string[], jobs: Job[]) => {
    try {
      const uniqueProviders = new Map<string, any>();
      
      jobs.forEach(job => {
        if (job.accepted_by) {
          const existing = uniqueProviders.get(job.accepted_by);
          const hireEntry = {
            jobId: job.id,
            jobTitle: job.title,
            jobDate: job.datetime,
            jobStatus: job.status,
            jobPrice: job.price
          };
          let status = 'available';
          if (job.status === JobStatus.IN_PROGRESS || job.status === JobStatus.ACCEPTED) {
            status = 'on_job';
          }
          
          if (existing) {
            existing.hireHistory.push(hireEntry);
            if (status === 'on_job') existing.status = status;
            if (new Date(job.datetime) > new Date(existing.lastActive || 0)) {
              existing.lastActive = job.datetime;
              existing.statusText = getStatusText(job.status);
              existing.currentJob = job.status === JobStatus.IN_PROGRESS ? job.title : null;
            }
          } else {
            uniqueProviders.set(job.accepted_by, {
              id: job.accepted_by,
              name: job.accepted_by_name || `Provider ${job.accepted_by.slice(0, 8)}`,
              phone: job.providerPhone || 'ไม่ระบุ',
              status,
              statusText: getStatusText(job.status),
              currentJob: job.status === JobStatus.IN_PROGRESS ? job.title : null,
              lastActive: job.datetime,
              hireHistory: [hireEntry],
              contactInfo: { phone: job.providerPhone, lastContacted: null }
            });
          }
        }
      });
      
      // ดึงข้อมูลจาก localStorage + enrich ด้วย profile (full_name, vehicle_reg, vehicle_type, worker_grade)
      let providersArray = Array.from(uniqueProviders.values()).map(provider => {
        const contactKey = `contact_${provider.id}_${user?.id}`;
        const contactData = localStorage.getItem(contactKey);
        if (contactData) {
          const contact = JSON.parse(contactData);
          return { ...provider, lastContacted: contact.contactedAt, contactCount: contact.count || 0 };
        }
        return provider;
      });

      // Enrich provider profile (ชื่อจริง, เลขทะเบียนรถ, ชนิดรถ, เกรด)
      providersArray = await Promise.all(providersArray.map(async (p) => {
        try {
          const profile = await MockApi.getProfile(p.id).catch(() => null);
          if (profile) {
            return {
              ...p,
              full_name: profile.full_name || profile.name,
              name: profile.full_name || profile.name || p.name,
              vehicle_reg: (profile as any).vehicle_reg,
              vehicle_type: (profile as any).vehicle_type,
              worker_grade: (profile as any).worker_grade || 'C',
              location: profile.location || p.location
            };
          }
        } catch (_) {}
        return p;
      }));
      
      return providersArray;
      
    } catch (error) {
      console.error('Error fetching providers:', error);
      return getReasonableFallbackProviders();
    }
  };

  // แปลงสถานะ job
  const getStatusText = (status: JobStatus): string => {
    switch (status) {
      case JobStatus.IN_PROGRESS: return '';
      case JobStatus.ACCEPTED: return '';
      case JobStatus.COMPLETED: return ' ()';
      case JobStatus.OPEN: return '';
      default: return '';
    }
  };

  // FIX 3: Fallback providers
  const getReasonableFallbackProviders = () => {
    const reasonableProviders: any[] = [];
    
    // Provider จากงานที่จ้างแล้ว
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED);
    
    completedJobs.slice(0, 3).forEach((job, index) => {
      if (job.accepted_by) {
        reasonableProviders.push({
          id: job.accepted_by,
          name: job.accepted_by_name || `Provider ${index + 1}`,
          type: 'hired',
          previousJobId: job.id,
          previousJobTitle: job.title,
          completedDate: job.datetime,
          rating: 4.0 + (index * 0.2),
          completedJobs: index + 1,
          status: 'available',
          location: (job.location as { city?: string; address?: string })?.city ?? (job.location as { address?: string })?.address ?? 'Bangkok',
          phone: job.providerPhone || '',
          hireHistory: [{
            jobId: job.id,
            jobTitle: job.title,
            jobDate: job.datetime,
            jobStatus: job.status,
            jobPrice: job.price
          }]
        });
      }
    });
    
    return reasonableProviders;
  };

  // FIX 4: handleRehireProvider (commented)
  // const handleRehireProvider = (provider: any) => {
  //   // ค้นหา provider ที่เคยจ้าง
  //   const previousJob = jobs.find(job => 
  //     job.accepted_by === provider.id || 
  //     job.providerId === provider.id
  //   );
    
  //   setSelectedProviderForRehire(provider);
    
  //   if (previousJob) {
  //     // เตรียมข้อมูลงานใหม่
  //     setSelectedJob({
  //       ...previousJob,
  //       id: `job_new_${Date.now()}`,
  //       status: JobStatus.OPEN,
  //       datetime: new Date().toISOString(),
  // accepted_by: undefined, // รอ provider รับงาน
  //       accepted_by_name: undefined,
  //       providerId: undefined,
  //       providerName: undefined,
  //     });
      
  //     // เปิด modal สร้างงานใหม่
  //     setShowRehireModal(true);
  //   } else {
  //     // ไม่มีงานเดิม เปิด modal ใหม่
  //     setShowNewJobModal(true);
  //   }
  // };
  // FIX: handleRehireProvider
// FIX: handleRehireProvider (Firestore)
const handleRehireProvider = async (provider: any) => {
  try {
    // 1. ค้นหา provider ที่เคยจ้าง
    const previousJobs = jobs.filter(job => job.accepted_by === provider.id);
    const latestJob = previousJobs.sort((a, b) => 
      new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
    )[0];

    // 2. เตรียมข้อมูลงานใหม่
    const jobData = {
      // ข้อมูลงานใหม่
      title: `[จ้างงานซ้ำ] ${provider.name} - ${latestJob?.title || 'งานเดิม'}`,
      description: latestJob?.description || ` ${provider.name} `,
      category: latestJob?.category || 'General',
      price: latestJob?.price || 1000,
      datetime: new Date().toISOString(), // วันเวลาปัจจุบัน
      duration_hours: latestJob?.duration_hours || 2,
      
      // location จากงานเดิม
      location: latestJob?.location || {
        lat: 13.7563,
        lng: 100.5018,
        address: ''
      },
      
      // provider ที่จ้าง
      assigned_to: provider.id, // assign provider
      providerId: provider.id,
      providerName: provider.name,
      
      // metadata tracking
      metadata: {
        isRehire: true,
        previousProviderId: provider.id,
        previousProviderName: provider.name,
        previousJobId: latestJob?.id,
        rehireDate: new Date().toISOString(),
        rehireBy: user?.id,
        rehireByName: user?.name
      }
    };

    // 3. เช็ค availability provider
    const isAvailable = await MockApi.checkAvailability(
      provider.id,
      jobData.datetime,
      jobData.duration_hours
    );

    if (!isAvailable) {
      alert(`${provider.name} `);
      return;
    }

    // 4. สร้างงาน MockApi
    const newJob = await MockApi.createJob(jobData);

    // 5. สร้าง notification Firestore
    await MockApi.createNotification({
      userId: provider.id,
      type: 'JOB_REHIRE',
      title: 'จ้างงานซ้ำสำเร็จ!',
      message: `${user?.name} จ้างงานซ้ำสำเร็จ: "${jobData.title}"`,
      jobId: newJob.id,
      employerId: user?.id,
      employerName: user?.name,
      data: {
        jobTitle: jobData.title,
        jobPrice: jobData.price,
        jobDateTime: jobData.datetime,
        isRehire: true,
        previousJobId: latestJob?.id
      },
      read: false,
      createdAt: new Date().toISOString()
    });

    // 6. แจ้งเตือนสำเร็จ (ภาษาไทย)
    alert(
      `🎉 สำเร็จ! คุณได้จ้างงานซ้ำผู้ให้บริการ ${provider.name} เรียบร้อยแล้ว!\n\n` +
      `รายละเอียดงาน: ${jobData.title}\n` +
      `ราคางาน: ${jobData.price} บาท\n\n` +
      `${provider.name} จะได้รับการแจ้งเตือนและสามารถยืนยันการรับงานนี้ได้ทันที`
    );
    
    // 7. รีเฟรช dashboard
    fetchDashboardData();
    
    // 8. ปิด modal
    setSelectedProviderForRehire(null);
    setShowRehireModal(false);

  } catch (error: any) {
    console.error('Failed to rehire provider:', error);
    alert(`❌ ไม่สามารถจ้างงานซ้ำได้: ${error.message || 'เกิดข้อผิดพลาด'}`);
  }
};
  // FIX 5: handleContactProvider message
  const handleContactProvider = async (providerId: string) => {
    try {
      // สร้าง mock chat room
      const mockChatRoom = {
        id: `chat_${providerId}_${user?.id}_${Date.now()}`,
        employerId: user?.id || employerId,
        providerId: providerId,
        createdAt: new Date().toISOString()
      };
      
      // บันทึกการติดต่อ
      localStorage.setItem(
        `contact_${providerId}_${user?.id}`,
        JSON.stringify({
          providerId,
          employerId: user?.id,
          contactedAt: new Date().toISOString(),
          count: (JSON.parse(localStorage.getItem(`contact_count_${providerId}_${user?.id}`) || '0') + 1)
        })
      );
      
      // อัปเดตจำนวนติดต่อ
      const contactCountKey = `contact_count_${providerId}_${user?.id}`;
      const currentCount = parseInt(localStorage.getItem(contactCountKey) || '0');
      localStorage.setItem(contactCountKey, (currentCount + 1).toString());
      
      // ใช้ mock data testing
      alert(`อ๋อครับ)`);
      
      // รีเฟรช provider
      fetchDashboardData();
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('อัปเดตข้อมูลติดต่อล้มเหลว');
    }
  };

  // FIX 6.5: handleBlockProvider
  const handleBlockProvider = async (provider: any) => {
    if (!confirm(`ต้องการบล็อก ${provider.name || provider.full_name} หรือไม่? ผู้ให้บริการนี้จะไม่ปรากฏในรายการแมตช์งานของคุณอีก`)) return;
    try {
      const { success } = await MockApi.blockProvider(provider.id);
      if (success) {
        setProviders((prev) => prev.filter((p) => p.id !== provider.id));
      } else {
        alert('ไม่สามารถบล็อกได้ กรุณาลองใหม่');
      }
    } catch (e) {
      console.error('blockProvider:', e);
      alert('เกิดข้อผิดพลาด');
    }
  };

  // FIX 6: handleCallProvider
  const handleCallProvider = (phone: string) => {
    if (phone && !phone.includes('XXX')) { // เช็คเบอร์โทรศัพท์
      // บันทึกประวัติโทร
      const callHistory = JSON.parse(localStorage.getItem('call_history') || '[]');
      callHistory.push({
        phone,
        calledAt: new Date().toISOString(),
        employerId: user?.id
      });
      localStorage.setItem('call_history', JSON.stringify(callHistory));
      
      // เปิด dialer
      window.location.href = `tel:${phone}`;
    } else {
      alert('เบอร์โทรศัพท์ไม่ถูกต้องหรือไม่สามารถโทรได้');
    }
  };

  // Filter jobs
  useEffect(() => {
    let filtered = [...jobs];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.description.toLowerCase().includes(query) ||
          job.id.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "ALL") {
      if (statusFilter === "ACTIVE") {
        filtered = filtered.filter((job) =>
          [JobStatus.OPEN, JobStatus.ACCEPTED, JobStatus.IN_PROGRESS].includes(job.status)
        );
      } else {
        filtered = filtered.filter((job) => job.status === statusFilter);
      }
    }

    setFilteredJobs(filtered);
  }, [jobs, searchQuery, statusFilter]);

  const getStatusCounts = () => {
    return {
      OPEN: jobs.filter((j) => j.status === JobStatus.OPEN).length,
      ACCEPTED: jobs.filter((j) => j.status === JobStatus.ACCEPTED).length,
      IN_PROGRESS: jobs.filter((j) => j.status === JobStatus.IN_PROGRESS)
        .length,
      COMPLETED: jobs.filter((j) => j.status === JobStatus.COMPLETED).length,
      CANCELLED: jobs.filter((j) => j.status === JobStatus.CANCELLED).length,
    };
  };

  const statusCounts = getStatusCounts();

  const handleCreateJob = () => {
    setShowNewJobModal(true);
  };

  const fetchFinancialData = useCallback(async () => {
    const uid = employerId || user?.id;
    if (!uid) return;
    try {
      const { data } = await api.get<Array<{ id: string; amount: number; type: string; description: string; created_at: string; job_title?: string }>>(`/users/transactions/${uid}`);
      const txns = Array.isArray(data) ? data : [];
      const expenseTxns = txns.filter((t) => (t.type || "").toLowerCase().includes("expense") || (t.type || "").toLowerCase().includes("payment") || (Number(t.amount) || 0) < 0);
      const totalSpent = Math.abs(expenseTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0));
      const completedJobs = jobs.filter((j) => j.status === JobStatus.COMPLETED);
      const jobValue = completedJobs.reduce((s, j) => s + (Number(j?.price) || 0), 0);
      const serviceFee = Math.round((jobValue || 0) * 0.05);
      setFinancialData({
        totalSpent: totalSpent || jobValue + serviceFee,
        jobValue,
        serviceFee,
        transactions: txns.slice(0, 20),
      });
    } catch {
      const completedJobs = jobs.filter((j) => j.status === JobStatus.COMPLETED);
      const jobValue = completedJobs.reduce((s, j) => s + (Number(j?.price) || 0), 0);
      const serviceFee = Math.round((jobValue || 0) * 0.05);
      setFinancialData({
        totalSpent: jobValue + serviceFee,
        jobValue,
        serviceFee,
        transactions: [],
      });
    }
  }, [employerId, user?.id, jobs]);

  const handleExportData = () => {
    const headers = ["Job ID", "Title", "Status", "Price (฿)", "Date"];
    const rows = jobs.map((j) => [
      j.id,
      j.title || "",
      j.status || "",
      String(Number(j.price) || 0),
      new Date(j.datetime).toLocaleDateString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employer-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "refresh":
        fetchDashboardData();
        break;
      case "notify":
        setShowNotificationsModal(true);
        break;
      case "message":
        setActiveView("providers");
        break;
    }
  };
  

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case JobStatus.OPEN:
        return "bg-yellow-100 text-yellow-800";
      case JobStatus.ACCEPTED:
        return "bg-blue-100 text-blue-800";
      case JobStatus.IN_PROGRESS:
        return "bg-purple-100 text-purple-800";
      case JobStatus.WAITING_FOR_APPROVAL:
        return "bg-orange-100 text-orange-800";
      case JobStatus.COMPLETED:
        return "bg-green-100 text-green-800";
      case JobStatus.CANCELLED:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 theme-text-main";
    }
  };

  const activeJobs = jobs.filter(
    (j) => j.status === JobStatus.OPEN || j.status === JobStatus.IN_PROGRESS
  );

  // Filter providers
  const filteredProviders = useMemo(() => {
    let filtered = [...providers];
    
    if (providerSearch) {
      const query = providerSearch.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.location?.toLowerCase().includes(query)
      );
    }
    
    if (providerFilter !== 'all') {
      filtered = filtered.filter(p => p.status === providerFilter);
    }
    
    return filtered;
  }, [providers, providerSearch, providerFilter]);

  // FIX 7: Provider View
  const renderProvidersView = () => {
    // provider ที่เคยจ้าง
    const providersWithHistory = filteredProviders.map(provider => {
      const hireHistory = provider.hireHistory || [];
      const completedJobs = hireHistory.filter((h: any) => 
        h.jobStatus === JobStatus.COMPLETED
      ).length;
      
      return {
        ...provider,
        completedJobsCount: completedJobs,
        hireHistory: hireHistory
      };
    });

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="theme-surface rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold theme-text-main">
                รายการผู้ให้บริการที่เคยจ้าง ({filteredProviders.length})
              </h2>
              <p className="theme-text-sub">
                ผู้ให้บริการเหล่านี้เคยทำงานให้คุณ</p>
            </div>
          </div>
        </div>

        {/* Providers Grid */}
        {filteredProviders.length === 0 ? (
          <div className="text-center py-12 theme-surface rounded-xl border border-gray-200">
            <Users className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="theme-text-sub mb-2">ยังไม่มีรายการผู้ให้บริการที่เคยจ้าง</p>
            <p className="text-sm text-gray-400">
              เมื่อจ้างผู้ให้บริการครั้งแรก รายการจะปรากฏที่นี่</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {providersWithHistory.map((provider) => {
              const hireHistory = provider.hireHistory || [];
              const completedJobs = provider.completedJobsCount || 0;
              
              return (
                <div
                  key={provider.id}
                  className="theme-surface rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  {/* สถานะ */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      provider.status === 'on_job' 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {provider.status === 'on_job' ? 'กำลังทำงาน' : 'ว่างรับงาน'}
                    </span>
                    
                    {provider.lastContacted && (
                      <span className="text-xs theme-text-sub">
                        ติดต่อล่าสุด: {new Date(provider.lastContacted).toLocaleDateString('th-TH')}
                      </span>
                    )}
                  </div>

                  {/* ข้อมูลโปรไฟล์ — ชื่อจริง, เลขทะเบียนรถ, ชนิดรถ, เกรด */}
                  <div className="flex items-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white flex items-center justify-center text-xl font-bold mr-4">
                      {(provider.full_name || provider.name)?.charAt(0) || 'P'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold theme-text-main">{provider.full_name || provider.name}</h3>
                      {provider.worker_grade && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          provider.worker_grade === 'A' ? 'bg-amber-100 text-amber-800' :
                          provider.worker_grade === 'B' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-gray-100 theme-text-sub'
                        }`}>
                          Grade {provider.worker_grade}
                        </span>
                      )}
                      <div className="mt-1 space-y-0.5 text-xs theme-text-sub">
                        {provider.location && <span>สถานที่: {typeof provider.location === 'object' ? provider.location?.address || provider.location?.city : provider.location}</span>}
                        {provider.vehicle_reg && <span className="block">รถ: {provider.vehicle_reg} {provider.vehicle_type ? `(${provider.vehicle_type})` : ''}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ประวัติการจ้าง */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium theme-text-main mb-2">
                      ประวัติการจ้าง:
                    </p>
                    <div className="space-y-2">
                      {hireHistory.slice(0, 2).map((history: any, index: number) => (
                        <div key={index} className="text-sm">
                          <div className="flex justify-between">
                            <span className="theme-text-sub truncate">{history.jobTitle}</span>
                            <span className="text-emerald-600 font-medium">ราคา:{history.jobPrice}</span>
                          </div>
                          <div className="flex justify-between text-xs theme-text-sub">
                            <span>{new Date(history.jobDate).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            <span className={`${
                              history.jobStatus === 'COMPLETED' ? 'text-green-600' :
                              history.jobStatus === 'IN_PROGRESS' ? 'text-blue-600' :
                              'theme-text-sub'
                            }`}>
                              {getStatusText(history.jobStatus as JobStatus)}
                            </span>
                          </div>
                        </div>
                      ))}
                      
                      {hireHistory.length > 2 && (
                        <p className="text-xs theme-text-sub text-center mt-2">
                          + {hireHistory.length - 2} งาน
                        </p>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="theme-text-sub">ประวัติการจ้าง:</span>
                        <span className="font-bold text-green-600">{completedJobs} งาน</span>
                      </div>
                    </div>
                  </div>

                  {/* ปุ่มดำเนินการ */}
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleRehireProvider(provider)}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center"
                    >
                      <Briefcase size={16} className="mr-2" />
                      จ้างงานซ้ำ
                    </button>
                    
                    {provider.phone && provider.phone !== 'ไม่ระบุ' ? (
                      <button 
                        onClick={() => handleCallProvider(provider.phone)}
                        className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center justify-center"
                      >
                        <Phone size={16} className="mr-2" />
                        ติดต่อ
                      </button>
                    ) : (
                      <button 
                        disabled
                        className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed flex items-center justify-center"
                      >
                        <Phone size={16} className="mr-2" />
                        โทรไม่ได้ระบุเบอร์
                      </button>
                    )}
                    
                    <button 
                      onClick={() => handleContactProvider(provider.id)}
                      className="px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center justify-center"
                    >
                      <MessageSquare size={16} className="mr-2" />
                      แชท
                    </button>
                    <button 
                      onClick={() => handleBlockProvider(provider)}
                      className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center justify-center"
                      title="บล็อกผู้ให้บริการ"
                    >
                      <Ban size={16} />
                    </button>
                  </div>
                  
                  {/* ติดต่อผู้ให้บริการแล้ว */}
                  {provider.contactCount > 0 && (
                    <div className="mt-3 text-xs theme-text-sub text-center">
                      📨 ติดต่อผู้ให้บริการแล้ว {provider.contactCount} ครั้ง
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // FIX 8: New Job Modal
  const renderNewJobModal = () => {
    // ใช้ selectedJob หรือ rehire
    const isRehire = !!selectedProviderForRehire;
    const previousProvider = selectedProviderForRehire?.name;
     const handleSubmitRehire = async () => {
    try {
      // 1. ดึงค่าจากฟอร์ม
      const title = (document.getElementById('rehire-job-title') as HTMLInputElement)?.value || '';
      const description = (document.getElementById('rehire-job-desc') as HTMLTextAreaElement)?.value || '';
      const price = Number((document.getElementById('rehire-job-price') as HTMLInputElement)?.value || 0);
      const category = (document.getElementById('rehire-job-category') as HTMLSelectElement)?.value || 'General';
      const datetime = (document.getElementById('rehire-job-datetime') as HTMLInputElement)?.value;

      if (!title || !description || !price || !datetime) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
      }

      // 2. เตรียมข้อมูลงานใหม่
      const jobData = {
        title: isRehire ? `[จ้างงานซ้ำ] ${previousProvider} - ${title}` : title,
        description,
        category,
        price,
        datetime: new Date(datetime).toISOString(),
        duration_hours: 2,
        location: selectedJob?.location || {
          lat: 13.7563,
          lng: 100.5018,
          address: 'กรุงเทพฯ'
        },
        assigned_to: isRehire ? selectedProviderForRehire.id : undefined,
        metadata: isRehire ? {
          isRehire: true,
          previousProviderId: selectedProviderForRehire.id,
          previousProviderName: previousProvider,
          rehireDate: new Date().toISOString()
        } : undefined
      };

      // 3. สร้างงาน
      const newJob = await MockApi.createJob(jobData);

      // 4. ส่ง notification rehire
      if (isRehire && selectedProviderForRehire) {
        await MockApi.createNotification({
          userId: selectedProviderForRehire.id,
          type: 'JOB_REHIRE',
          title: 'จ้างงานซ้ำสำเร็จ!',
          message: `${user?.name} จ้างงานซ้ำสำเร็จ: "${jobData.title}"`,
          jobId: newJob.id,
          employerId: user?.id,
          employerName: user?.name,
          data: {
            jobTitle: jobData.title,
            jobPrice: jobData.price,
            jobDateTime: jobData.datetime,
            isRehire: true
          },
          read: false,
          createdAt: new Date().toISOString()
        });

        alert(`จ้างงานซ้ำสำเร็จ!\n\nจ้างงานซ้ำสำเร็จ ${previousProvider}`);
      } else {
        alert('จ้างงานใหม่สำเร็จ!\n\nจ้างงานใหม่สำเร็จ');
      }

      // 5. ปิด modal และรีเฟรช
      setShowNewJobModal(false);
      setShowRehireModal(false);
      setSelectedJob(null);
      setSelectedProviderForRehire(null);
      fetchDashboardData();

    } catch (error: any) {
      console.error('Error creating job:', error);
      alert(`จ้างงานซ้ำสำเร็จ: ${error.message || 'จ้างงานซ้ำสำเร็จ'}`);
    }
  };
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-xl font-bold theme-text-main">
              {isRehire ? `จ้างงานซ้ำ ${previousProvider} อีกครั้ง` : 'จ้างงานใหม่'}
            </h3>
            <p className="theme-text-sub">
              {isRehire 
                ? `จ้างงานซ้ำ ${previousProvider} อีกครั้ง` 
                : 'จ้างงานใหม่'}
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium theme-text-main mb-1">
                  หัวข้องาน
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="รายละเอียดงาน..."
                  defaultValue={selectedJob?.title || ''}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium theme-text-main mb-1">
                  รายละเอียดงาน
                </label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="รายละเอียดงาน..."
                  defaultValue={selectedJob?.description || ''}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium theme-text-main mb-1">
                    ราคางาน (฿)
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="500"
                    defaultValue={selectedJob?.price || ''}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium theme-text-main mb-1">
                    ประเภทงาน
                  </label>
                  <select 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    defaultValue={selectedJob?.category || 'Cleaning'}
                  >
                  <option value="Cleaning">ทำความสะอาด</option>
                  <option value="Delivery">จัดส่ง</option>
                  <option value="Repair">ซ่อมแซม</option>
                  <option value="Consulting">คำปรึกษา</option>
                  </select>
                </div>
              </div>

                   <div>
              <label className="block text-sm font-medium theme-text-main mb-1">
                วันที่จ้างงานซ้ำ *
              </label>
              <input
                id="rehire-job-datetime"
                type="datetime-local"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                defaultValue={
                  selectedJob?.datetime 
                    ? new Date(selectedJob.datetime).toISOString().slice(0, 16)
                    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16) // พรุ่งนี้
                }
                required
              />
            </div>
              
              {isRehire && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                     จ้างงานซ้ำสำเร็จ <strong>{previousProvider}</strong> 
                  {selectedJob?.title && (
                    <> จ้างงานซ้ำสำเร็จ "{selectedJob?.title}"</>
                  )}
                  <br />
                  <span className="text-xs">
                    {previousProvider} จ้างงานซ้ำสำเร็จ
                  </span>
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNewJobModal(false);
                  setShowRehireModal(false);
                  setSelectedJob(null);
                  setSelectedProviderForRehire(null);
                }}
                className="px-6 py-2 border border-gray-300 theme-text-main rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => {
                  // จ้างงานซ้ำสำเร็จ
                  alert(isRehire 
                    ? `จ้างงานซ้ำ ${previousProvider} สำเร็จ!` 
                    : 'จ้างงานใหม่สำเร็จ!');
                  setShowNewJobModal(false);
                  setShowRehireModal(false);
                  setSelectedJob(null);
                  setSelectedProviderForRehire(null);
                  fetchDashboardData(); // รีเฟรช
                }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                {isRehire ? 'จ้างงานซ้ำ' : 'จ้างงานใหม่'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // FIX 9: Rehire modal
  const renderRehireModal = () => {
    if (!selectedProviderForRehire) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-xl font-bold theme-text-main">
              จ้างงานซ้ำ {selectedProviderForRehire.name} อีกครั้ง
            </h3>
            <p className="theme-text-sub">
              กรุณากรอกรายละเอียดงานที่ต้องการจ้าง {selectedProviderForRehire.name} อีกครั้ง
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {/* ... สร้างงาน ... */}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // render Overview, Jobs, Analytics
  const renderOverview = () => {
    const totalRevenue = jobs.reduce((sum, job) => sum + (Number(job?.price) || 0), 0);
    const avgPerJob = jobs.length > 0 ? Math.round(totalRevenue / jobs.length) : 0;
    const completionRate = jobs.length > 0 ? Math.round((statusCounts.COMPLETED / jobs.length) * 100) : 0;
    const activeCount = statusCounts.IN_PROGRESS + statusCounts.ACCEPTED;

    const cardBase = "rounded-2xl p-6 shadow-lg border border-white/10 font-sans transition-all duration-200 active:scale-[0.98] hover:opacity-95 cursor-pointer";

    return (
    <div className="space-y-8">
      {/* Quick Stats Row — Interactive, clickable cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <button
          type="button"
          onClick={() => { setActiveView("jobs"); setStatusFilter("ALL"); }}
          className={`${cardBase} bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 shadow-blue-500/20 text-left`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">Total Jobs</p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">{jobs.length}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Briefcase size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/20 text-sm text-white/80">
            {statusCounts.OPEN} open · {statusCounts.COMPLETED} completed
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setActiveView("jobs"); setStatusFilter("ACTIVE"); }}
          className={`${cardBase} bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700 shadow-emerald-500/20 text-left`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">Active Jobs</p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">{activeCount}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Users size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/20 text-sm text-white/80">
            {statusCounts.IN_PROGRESS} in progress · {statusCounts.ACCEPTED} accepted
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setShowFinancialModal(true); fetchFinancialData(); }}
          className={`${cardBase} bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-700 shadow-purple-500/20 text-left`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">Total Revenue</p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">฿ {(totalRevenue || 0).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <DollarSign size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/20 text-sm text-white/80 space-y-1">
            <div>Jobs: ฿ {(totalRevenue || 0).toLocaleString()}</div>
            <div>Avg per job: ฿ {(avgPerJob || 0).toLocaleString()}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setShowCompletionModal(true)}
          className={`${cardBase} bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 shadow-amber-500/20 text-left`}
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white uppercase tracking-wider">Completion Rate</p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-white truncate">{completionRate}%</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-white/20">
                <CheckCircle size={24} className="text-white" strokeWidth={2} />
              </div>
              <ChevronRight size={20} className="text-white/80" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/20 text-sm text-white/80">
            {statusCounts.COMPLETED} completed
          </div>
        </button>
      </div>
      
      
      {/* แผนที่แสดงงานที่กำลังดำเนินการ (EmployerMap) */}
      {activeJobs.length > 0 && (
        <div className="theme-surface rounded-xl border border-gray-200 p-6">
          <EmployerMap jobs={activeJobs} height="500px" />
        </div>
      )}

      {/* Recent Activity & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Jobs */}
        <div className="theme-surface rounded-xl border border-gray-200 p-4">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center">
            <h3 className="font-bold theme-text-main">Recent Jobs</h3>
            <button
              onClick={() => setActiveView("jobs")}
              className="text-blue-600 text-sm font-medium hover:text-blue-800"
            >
              View All โ’
            </button>
          </div>
          <div className="p-4">
            {jobs.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg mb-2 cursor-pointer"
                onClick={() => {
                  setSelectedJob(job);
                  setShowJobModal(true);
                }}
              >
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-3 ${
                      job.status === JobStatus.COMPLETED
                        ? "bg-green-500"
                        : job.status === JobStatus.IN_PROGRESS
                        ? "bg-blue-500"
                        : job.status === JobStatus.OPEN
                        ? "bg-yellow-500"
                        : "bg-gray-500"
                    }`}
                  ></div>
                  <div>
                    <p className="font-medium">{job.title}</p>
                    <p className="text-sm theme-text-sub">{job.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">
                    ฿{job.price}
                  </p>
                  <p className="text-xs theme-text-sub">
                    {new Date(job.datetime).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="theme-surface rounded-xl border border-gray-200">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center">
            <h3 className="font-bold theme-text-main">Notifications</h3>
            <Bell size={20} className="text-gray-400" />
          </div>
          <div className="p-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg mb-2 ${
                  notification.type === "warning"
                    ? "bg-yellow-50 border border-yellow-100"
                    : notification.type === "success"
                    ? "bg-green-50 border border-green-100"
                    : "bg-blue-50 border border-blue-100"
                }`}
              >
                <div className="flex justify-between items-start">
                  <p className="font-medium">{notification.message}</p>
                  <span className="text-xs theme-text-sub">
                    {notification.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
  };

  const renderJobsView = () => (
    <div className="space-y-6">
      {/* Jobs Header */}
      <div className="theme-surface rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold theme-text-main">Job Management</h2>
            <p className="theme-text-sub">Manage all your posted jobs</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleCreateJob}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center"
            >
              <Plus size={18} className="mr-2" />
              Create New Job
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search jobs..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as JobStatus | "ALL" | "ACTIVE")
            }
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active (Open + In Progress)</option>
            <option value="OPEN">Open</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="theme-surface rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium theme-text-sub uppercase tracking-wider">
                  Job Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium theme-text-sub uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium theme-text-sub uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium theme-text-sub uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium theme-text-sub uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium theme-text-main">
                        {job.title}
                      </div>
                      <div className="text-sm theme-text-sub truncate max-w-xs">
                        {job.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(
                        job.status
                      )}`}
                    >
                      {job.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm theme-text-sub">
                    {new Date(job.datetime).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-emerald-600">
                    ฿{job.price}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedJob(job);
                          setShowJobModal(true);
                        }}
                        className="p-1 text-blue-600 hover:text-blue-800"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => {
                          // ส่ง message ให้ provider
                          if (job.accepted_by) {
                            handleContactProvider(job.accepted_by);
                          } else {
                            alert('ติดต่อผู้ให้บริการไม่สำเร็จ');
                          }
                        }}
                        className="p-1 text-green-600 hover:text-green-800"
                        title="Chat"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <button className="p-1 text-gray-400 hover:theme-text-sub">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center py-12">
            <Briefcase className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="theme-text-sub">No jobs found</p>
            <button
              onClick={handleCreateJob}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Create Your First Job
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderAnalyticsView = () => (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div className="theme-surface rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold theme-text-main">
              Analytics & Reports
            </h2>
            <p className="theme-text-sub">
              Detailed insights and performance metrics
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleExportData}
              className="px-4 py-2 bg-gray-100 theme-text-main rounded-lg hover:bg-gray-200 active:scale-95 active:opacity-90 flex items-center cursor-pointer transition-all"
            >
              <Download size={18} className="mr-2" />
              Export Data
            </button>
            <button
              type="button"
              onClick={handleExportData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 active:opacity-90 cursor-pointer transition-all"
            >
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Full Statistics */}
      <JobCounter showCharts={true} />

      {/* Revenue Chart */}
      <div className="theme-surface rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold theme-text-main mb-4">Revenue Trend</h3>
        <div className="h-64 flex items-end space-x-2">
          {[65, 45, 75, 85, 55, 95, 70].map((value, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-emerald-500 to-green-300 rounded-t-lg"
                style={{ height: `${value}%` }}
              ></div>
              <div className="text-xs theme-text-sub mt-2">Day {index + 1}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="theme-surface rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold theme-text-main mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="theme-text-sub">Average Response Time</span>
              <span className="font-bold">12 minutes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text-sub">Job Completion Time</span>
              <span className="font-bold">2.5 hours</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text-sub">Provider Satisfaction</span>
              <span className="font-bold text-emerald-600">94%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text-sub">Repeat Hiring Rate</span>
              <span className="font-bold text-blue-600">68%</span>
            </div>
          </div>
        </div>

        <div className="theme-surface rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold theme-text-main mb-4">Category Performance</h3>
          <div className="space-y-3">
            {[
              { category: "Cleaning", revenue: 45000, growth: "+15%" },
              { category: "Delivery", revenue: 32000, growth: "+8%" },
              { category: "Repair", revenue: 28000, growth: "+22%" },
              { category: "Consulting", revenue: 19000, growth: "-3%" },
            ].map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                  <span>{item.category}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-bold">
                    ฿{item.revenue.toLocaleString()}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      item.growth.startsWith("+")
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.growth}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Job Detail Modal
  const renderJobModal = () => {
    if (!selectedJob) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
            <h3 className="text-xl font-bold theme-text-main">Job Details</h3>
            <button
              onClick={() => setShowJobModal(false)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <XCircle size={24} className="text-gray-400" />
            </button>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div>
                <h4 className="font-bold theme-text-main mb-2">
                  {selectedJob.title}
                </h4>
                <p className="theme-text-sub mb-4">{selectedJob.description}</p>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <span className="theme-text-sub w-32">Status:</span>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(
                        selectedJob.status
                      )}`}
                    >
                      {selectedJob.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="theme-text-sub w-32">Category:</span>
                    <span className="font-medium">{selectedJob.category}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="theme-text-sub w-32">Price:</span>
                    <span className="font-bold text-emerald-600">
                    ฿{selectedJob.price}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="theme-text-sub w-32">Date:</span>
                    <span>
                      {new Date(selectedJob.datetime).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="theme-text-sub w-32">Location:</span>
                    <span>
                      {selectedJob.location.lat.toFixed(4)},{" "}
                      {selectedJob.location.lng.toFixed(4)}
                      {selectedJob.location.fullAddress && (
                        <div className="mt-1 text-sm theme-text-sub">
                          ที่อยู่: {selectedJob.location.fullAddress}
                        </div>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              

              {/* Right Column - Actions */}
              <div>
                <h4 className="font-bold theme-text-main mb-4">Quick Actions</h4>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedJob.accepted_by) {
                        handleContactProvider(selectedJob.accepted_by);
                        setShowJobModal(false);
                      } else {
                        alert("ยังไม่มีผู้รับงาน");
                      }
                    }}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-[0.98] active:opacity-90 flex items-center justify-center cursor-pointer transition-all"
                  >
                    <MessageSquare size={18} className="mr-2" />
                    Chat with Provider
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowJobModal(false);
                      navigate(`/jobs/${selectedJob.id}`);
                    }}
                    className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-[0.98] active:opacity-90 flex items-center justify-center cursor-pointer transition-all"
                  >
                    <Eye size={18} className="mr-2" />
                    View Full Details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowJobModal(false);
                      navigate(`/jobs/${selectedJob.id}`);
                    }}
                    className="w-full py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 active:scale-[0.98] active:opacity-90 flex items-center justify-center cursor-pointer transition-all"
                  >
                    <RefreshCw size={18} className="mr-2" />
                    Update Status
                  </button>
                  {selectedJob.status === JobStatus.OPEN && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("ต้องการยกเลิกงานนี้หรือไม่?")) {
                          setShowJobModal(false);
                          fetchDashboardData();
                        }
                      }}
                      className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 active:scale-[0.98] active:opacity-90 flex items-center justify-center cursor-pointer transition-all"
                    >
                      <XCircle size={18} className="mr-2" />
                      Cancel Job
                    </button>
                  )}
                </div>

                {/* Assigned Provider */}
                {selectedJob.accepted_by && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h5 className="font-bold theme-text-main mb-2">
                      Assigned Provider
                    </h5>
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white flex items-center justify-center font-bold mr-3">
                        {selectedJob.accepted_by_name?.charAt(0) || "P"}
                      </div>
                      <div>
                        <p className="font-medium">
                          {selectedJob.accepted_by_name || "Provider"}
                        </p>
                        <p className="text-sm theme-text-sub">
                          Rating: 4.8 โ€ข 42 jobs completed
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  

  if (loading && !jobs.length) {
    return (
      <div className="theme-surface rounded-xl border border-gray-200 p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Dashboard Header — Professional, clean, high-end financial app style */}
      <div className="bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-950 text-white rounded-2xl p-6 md:p-8 shadow-xl border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Employer Dashboard</h1>
            <p className="text-slate-300 mt-1">
              Welcome back, <span className="font-semibold text-white">{user?.name || "Employer"}</span>
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                {jobs.length} jobs
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleQuickAction("refresh")}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 active:scale-95 transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={20} className="text-white" />
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction("notify")}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 active:scale-95 transition-all cursor-pointer relative"
              title="Notifications"
            >
              <Bell size={20} className="text-white" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {notifications.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleExportData}
              className="px-5 py-2.5 bg-white text-slate-800 rounded-xl hover:bg-slate-100 active:scale-95 active:bg-slate-200 transition-all font-semibold flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Download size={18} strokeWidth={2} />
              Export
            </button>
          </div>
        </div>

        {/* Navigation Tabs — Interactive with press feedback */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveView("overview");
              if (activeView === "overview") fetchDashboardData();
            }}
            className={`px-4 py-2 rounded-lg transition-all flex items-center cursor-pointer active:scale-95 active:opacity-90 ${
              activeView === "overview"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <BarChart3 size={18} className="mr-2" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveView("jobs")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center cursor-pointer active:scale-95 active:opacity-90 ${
              activeView === "jobs"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <Briefcase size={18} className="mr-2" />
            Jobs ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("providers")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center cursor-pointer active:scale-95 active:opacity-90 ${
              activeView === "providers"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <Users size={18} className="mr-2" />
            Providers ({providers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("analytics")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center cursor-pointer active:scale-95 active:opacity-90 ${
              activeView === "analytics"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <TrendingUp size={18} className="mr-2" />
            Analytics
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div>
        {activeView === "overview" && renderOverview()}
        {activeView === "jobs" && renderJobsView()}
        {activeView === "providers" && renderProvidersView()}
        {activeView === "analytics" && renderAnalyticsView()}
      </div>

      {/* Modals */}
      {showJobModal && renderJobModal()}
      {(showNewJobModal || showRehireModal) && renderNewJobModal()}

      {/* Financial Summary Modal */}
      {showFinancialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center rounded-t-2xl">
              <h3 className="text-xl font-bold text-slate-900">Financial Summary</h3>
              <button onClick={() => setShowFinancialModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <XCircle size={24} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                <span className="text-slate-600">Total Spent</span>
                <span className="text-2xl font-bold text-slate-900">฿ {(financialData?.totalSpent ?? 0).toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Job Value</span>
                  <span className="font-semibold">฿ {(financialData?.jobValue ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Service Fee (5%)</span>
                  <span className="font-semibold">฿ {(financialData?.serviceFee ?? 0).toLocaleString()}</span>
                </div>
              </div>
              {financialData?.transactions && financialData.transactions.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-semibold text-slate-800 mb-3">Recent Transactions</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {financialData.transactions.slice(0, 10).map((t) => (
                      <div key={t.id} className="flex justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                        <span className="text-slate-600 truncate max-w-[180px]">{t.job_title || t.description || "Payment"}</span>
                        <span className="font-medium">{Math.abs(Number(t.amount) || 0).toLocaleString()} ฿</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Notifications</h3>
              <button type="button" onClick={() => setShowNotificationsModal(false)} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <XCircle size={24} className="text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {notifications.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl mb-2 cursor-default ${
                      n.type === "warning" ? "bg-amber-50 border border-amber-100" :
                      n.type === "success" ? "bg-green-50 border border-green-100" :
                      "bg-blue-50 border border-blue-100"
                    }`}
                  >
                    <p className="font-medium text-slate-800">{n.message}</p>
                    <span className="text-xs text-slate-500">{n.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completion Breakdown Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Completion Breakdown</h3>
              <button type="button" onClick={() => setShowCompletionModal(false)} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <XCircle size={24} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                <div className="flex items-center gap-3">
                  <CheckCircle size={28} className="text-green-600" />
                  <span className="font-medium text-slate-800">Completed</span>
                </div>
                <span className="text-2xl font-bold text-green-700">{statusCounts.COMPLETED}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
                <div className="flex items-center gap-3">
                  <XCircle size={28} className="text-red-600" />
                  <span className="font-medium text-slate-800">Cancelled</span>
                </div>
                <span className="text-2xl font-bold text-red-700">{statusCounts.CANCELLED}</span>
              </div>
              <div className="pt-3 border-t border-gray-200 text-sm text-slate-600">
                Total: {jobs.length} jobs · Completion rate: {jobs.length > 0 ? Math.round((statusCounts.COMPLETED / jobs.length) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployerDashboard;
