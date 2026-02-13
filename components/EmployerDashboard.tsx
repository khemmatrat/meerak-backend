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
  Star
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
  const [activeView, setActiveView] = useState<
    "overview" | "jobs" | "providers" | "analytics"
  >(initialViewMode);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<JobStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL">("ALL");
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

  // 🔥 FIX 1: เพิ่ม state สำหรับการจ้างงานซ้ำ
  const [selectedProviderForRehire, setSelectedProviderForRehire] = useState<any>(null);
  const [showRehireModal, setShowRehireModal] = useState(false);

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
      const stats = await MockApi.getJobStatistics(
        dateRange,
        employerId || user?.id,
        "owner"
      );
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

  // 🔥 FIX 2: ฟังก์ชันดึงข้อมูลผู้รับจ้างจริงจากงาน
  const fetchRealProviders = async (jobIds: string[], jobs: Job[]) => {
    try {
      const uniqueProviders = new Map<string, any>();
      
      jobs.forEach(job => {
        if (job.accepted_by) {
          // ตรวจสอบสถานะจาก job ปัจจุบัน
          let status = 'available';
          if (job.status === JobStatus.IN_PROGRESS || job.status === JobStatus.ACCEPTED) {
            status = 'on_job';
          } else if (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED) {
            status = 'available';
          }
          
          uniqueProviders.set(job.accepted_by, {
            id: job.accepted_by,
            name: job.accepted_by_name || `Provider ${job.accepted_by.slice(0, 8)}`,
            phone: job.providerPhone || 'ไม่มีข้อมูล',
            status: status,
            // ข้อมูลสถานะที่ชัดเจน
            statusText: getStatusText(job.status),
            currentJob: job.status === JobStatus.IN_PROGRESS ? job.title : null,
            lastActive: job.datetime,
            // ประวัติการจ้างงาน
            hireHistory: [{
              jobId: job.id,
              jobTitle: job.title,
              jobDate: job.datetime,
              jobStatus: job.status,
              jobPrice: job.price
            }],
            // ข้อมูลติดต่อ
            contactInfo: {
              phone: job.providerPhone,
              lastContacted: null
            }
          });
        }
      });
      
      // เพิ่มข้อมูลสถานะจาก localStorage (ถ้ามีการติดต่อก่อนหน้า)
      const providersArray = Array.from(uniqueProviders.values()).map(provider => {
        // ดึงข้อมูลการติดต่อจาก localStorage
        const contactKey = `contact_${provider.id}_${user?.id}`;
        const contactData = localStorage.getItem(contactKey);
        
        if (contactData) {
          const contact = JSON.parse(contactData);
          return {
            ...provider,
            lastContacted: contact.contactedAt,
            contactCount: contact.count || 0
          };
        }
        return provider;
      });
      
      return providersArray;
      
    } catch (error) {
      console.error('Error fetching providers:', error);
      return getReasonableFallbackProviders();
    }
  };

  // ฟังก์ชันช่วยแปลงสถานะ
  const getStatusText = (status: JobStatus): string => {
    switch (status) {
      case JobStatus.IN_PROGRESS: return 'กำลังทำงานอยู่';
      case JobStatus.ACCEPTED: return 'รับงานแล้ว';
      case JobStatus.COMPLETED: return 'ว่าง (เคยทำงานให้แล้ว)';
      case JobStatus.OPEN: return 'ว่าง';
      default: return 'ว่าง';
    }
  };

  // 🔥 FIX 3: Fallback function ที่มีเหตุผล
  const getReasonableFallbackProviders = () => {
    const reasonableProviders = [];
    
    // Provider จากงานที่เสร็จแล้ว
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
          location: job.location?.city || 'Bangkok',
          phone: job.providerPhone || 'ไม่มีข้อมูล',
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

  // 🔥 FIX 4: ฟังก์ชันจ้างงานซ้ำ
  // const handleRehireProvider = (provider: any) => {
  //   // ค้นหางานที่เคยทำกับ provider นี้
  //   const previousJob = jobs.find(job => 
  //     job.accepted_by === provider.id || 
  //     job.providerId === provider.id
  //   );
    
  //   setSelectedProviderForRehire(provider);
    
  //   if (previousJob) {
  //     // เตรียมข้อมูลสำหรับจ้างงานใหม่
  //     setSelectedJob({
  //       ...previousJob,
  //       id: `job_new_${Date.now()}`,
  //       status: JobStatus.OPEN,
  //       datetime: new Date().toISOString(),
  //       accepted_by: undefined, // ล้างข้อมูลผู้รับจ้างเก่า
  //       accepted_by_name: undefined,
  //       providerId: undefined,
  //       providerName: undefined,
  //     });
      
  //     // เปิด modal สร้างงานใหม่พร้อมเติมข้อมูลเก่า
  //     setShowRehireModal(true);
  //   } else {
  //     // ถ้าไม่เจองานเก่า ให้เปิด modal เปล่าๆ
  //     setShowNewJobModal(true);
  //   }
  // };
  // 🔥 FIX: ฟังก์ชันจ้างงานซ้ำที่ทำงานได้จริง
// 🔥 FIX: ฟังก์ชันจ้างงานซ้ำที่ทำงานกับ Firestore จริง
const handleRehireProvider = async (provider: any) => {
  try {
    // 1. ค้นหางานที่เคยทำกับ provider นี้ล่าสุด
    const previousJobs = jobs.filter(job => job.accepted_by === provider.id);
    const latestJob = previousJobs.sort((a, b) => 
      new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
    )[0];

    // 2. เตรียมข้อมูลสำหรับจ้างงานใหม่
    const jobData = {
      // ข้อมูลจากงานเก่า
      title: `[จ้างงานซ้ำ] ${provider.name} - ${latestJob?.title || 'งานใหม่'}`,
      description: latestJob?.description || `จ้างงาน ${provider.name} อีกครั้ง`,
      category: latestJob?.category || 'General',
      price: latestJob?.price || 1000,
      datetime: new Date().toISOString(), // เวลาเริ่มงานใหม่
      duration_hours: latestJob?.duration_hours || 2,
      
      // ข้อมูล location จากงานเก่าหรือ employer
      location: latestJob?.location || {
        lat: 13.7563,
        lng: 100.5018,
        address: 'กรุงเทพฯ'
      },
      
      // ข้อมูล provider ที่จะจ้าง
      assigned_to: provider.id, // 🔥 ส่งตรงไปหา provider เลย
      providerId: provider.id,
      providerName: provider.name,
      
      // metadata สำหรับ tracking
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

    // 3. ตรวจสอบความพร้อมของ provider ก่อน (ถ้าต้องการ)
    const isAvailable = await MockApi.checkAvailability(
      provider.id,
      jobData.datetime,
      jobData.duration_hours
    );

    if (!isAvailable) {
      alert(`${provider.name} ไม่ว่างในช่วงเวลานี้ กรุณาเลือกเวลาอื่น`);
      return;
    }

    // 4. สร้างงานใหม่ผ่าน MockApi (ซึ่งเชื่อมกับ Firestore จริง)
    const newJob = await MockApi.createJob(jobData);

    // 5. สร้าง notification ใน Firestore
    await MockApi.createNotification({
      userId: provider.id,
      type: 'JOB_REHIRE',
      title: 'คุณถูกจ้างงานซ้ำ! 🎉',
      message: `${user?.name} ต้องการจ้างคุณอีกครั้งสำหรับงาน: "${jobData.title}"`,
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

    // 6. แจ้งเตือนผู้ใช้
    alert(`✅ ส่งคำเชิญจ้างงานไปหา ${provider.name} แล้ว!\n\nงาน: ${jobData.title}\nค่าจ้าง: ฿${jobData.price}\n\n${provider.name} จะได้รับแจ้งเตือนและสามารถตอบรับงานได้`);
    
    // 7. รีเฟรชข้อมูล dashboard
    fetchDashboardData();
    
    // 8. ปิด modal
    setSelectedProviderForRehire(null);
    setShowRehireModal(false);

  } catch (error: any) {
    console.error('Failed to rehire provider:', error);
    alert(`❌ ไม่สามารถจ้างงานซ้ำได้: ${error.message || 'โปรดลองอีกครั้ง'}`);
  }
};
  // 🔥 FIX 5: ฟังก์ชันส่ง message
  const handleContactProvider = async (providerId: string) => {
    try {
      // สร้าง mock chat room
      const mockChatRoom = {
        id: `chat_${providerId}_${user?.id}_${Date.now()}`,
        employerId: user?.id || employerId,
        providerId: providerId,
        createdAt: new Date().toISOString()
      };
      
      // บันทึกการติดต่อ (สำหรับระบบเก็บประวัติ)
      localStorage.setItem(
        `contact_${providerId}_${user?.id}`,
        JSON.stringify({
          providerId,
          employerId: user?.id,
          contactedAt: new Date().toISOString(),
          count: (JSON.parse(localStorage.getItem(`contact_count_${providerId}_${user?.id}`) || '0') + 1)
        })
      );
      
      // อัปเดตจำนวนการติดต่อ
      const contactCountKey = `contact_count_${providerId}_${user?.id}`;
      const currentCount = parseInt(localStorage.getItem(contactCountKey) || '0');
      localStorage.setItem(contactCountKey, (currentCount + 1).toString());
      
      // ใส่ mock data สำหรับ testing
      alert(`เริ่มแชทกับผู้รับจ้าง (ระบบแชทอยู่ระหว่างการพัฒนา)`);
      
      // รีเฟรชข้อมูล provider เพื่อแสดงจำนวนการติดต่อที่อัปเดต
      fetchDashboardData();
    } catch (error) {
      console.error('Failed to start chat:', error);
      alert('ระบบแชทยังไม่พร้อมใช้งานในขณะนี้');
    }
  };

  // 🔥 FIX 6: ฟังก์ชันโทรติดต่อ
  const handleCallProvider = (phone: string) => {
    if (phone && !phone.includes('XXX')) { // ตรวจสอบว่าเป็นเบอร์จริง
      // บันทึกประวัติการโทร
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
      alert('เบอร์โทรศัพท์ไม่ถูกต้องหรือไม่มีข้อมูล');
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
      filtered = filtered.filter((job) => job.status === statusFilter);
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

  const handleExportData = () => {
    alert("Export feature would download data as CSV");
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "refresh":
        fetchDashboardData();
        break;
      case "notify":
        alert("Notification settings would open");
        break;
      case "message":
        alert("Messaging center would open");
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
        return "bg-gray-100 text-gray-800";
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

  // 🔥 FIX 7: RENDER FUNCTIONS - Provider View ที่แก้ไขแล้ว
  const renderProvidersView = () => {
    // ตรวจสอบ provider ที่มีข้อมูลประวัติการจ้างงาน
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                👥 ผู้รับจ้างที่เคยทำงานให้คุณ ({filteredProviders.length})
              </h2>
              <p className="text-gray-500">
                จ้างงานซ้ำได้ง่ายๆ แค่คลิกเดียว
              </p>
            </div>
          </div>
        </div>

        {/* Providers Grid */}
        {filteredProviders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Users className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 mb-2">ยังไม่มีผู้รับจ้างที่เคยทำงานให้คุณ</p>
            <p className="text-sm text-gray-400">
              เมื่อคุณจ้างงานสำเร็จ ผู้รับจ้างจะปรากฏที่นี่
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {providersWithHistory.map((provider) => {
              const hireHistory = provider.hireHistory || [];
              const completedJobs = provider.completedJobsCount || 0;
              
              return (
                <div
                  key={provider.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  {/* สถานะ */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      provider.status === 'on_job' 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {provider.status === 'on_job' ? '🔴 กำลังทำงาน' : '🟢 ว่างรับงาน'}
                    </span>
                    
                    {provider.lastContacted && (
                      <span className="text-xs text-gray-500">
                        📞 ติดต่อล่าสุด: {new Date(provider.lastContacted).toLocaleDateString('th-TH')}
                      </span>
                    )}
                  </div>

                  {/* ข้อมูลพื้นฐาน */}
                  <div className="flex items-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white flex items-center justify-center text-xl font-bold mr-4">
                      {provider.name?.charAt(0) || 'P'}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{provider.name}</h3>
                      <div className="flex items-center mt-1">
                        <span className="text-sm text-gray-500">
                          📍 {provider.location || 'กรุงเทพฯ'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ประวัติการจ้างงาน */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      📊 ประวัติการจ้างงานจากคุณ:
                    </p>
                    <div className="space-y-2">
                      {hireHistory.slice(0, 2).map((history: any, index: number) => (
                        <div key={index} className="text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 truncate">{history.jobTitle}</span>
                            <span className="text-emerald-600 font-medium">฿{history.jobPrice}</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{new Date(history.jobDate).toLocaleDateString('th-TH')}</span>
                            <span className={`${
                              history.jobStatus === 'COMPLETED' ? 'text-green-600' :
                              history.jobStatus === 'IN_PROGRESS' ? 'text-blue-600' :
                              'text-gray-500'
                            }`}>
                              {getStatusText(history.jobStatus as JobStatus)}
                            </span>
                          </div>
                        </div>
                      ))}
                      
                      {hireHistory.length > 2 && (
                        <p className="text-xs text-gray-500 text-center mt-2">
                          + อีก {hireHistory.length - 2} งาน
                        </p>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">งานที่สำเร็จ:</span>
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
                      จ้างงานใหม่
                    </button>
                    
                    {provider.phone && provider.phone !== 'ไม่มีข้อมูล' ? (
                      <button 
                        onClick={() => handleCallProvider(provider.phone)}
                        className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center justify-center"
                      >
                        <Phone size={16} className="mr-2" />
                        โทร
                      </button>
                    ) : (
                      <button 
                        disabled
                        className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed flex items-center justify-center"
                      >
                        <Phone size={16} className="mr-2" />
                        ไม่มีเบอร์
                      </button>
                    )}
                    
                    <button 
                      onClick={() => handleContactProvider(provider.id)}
                      className="px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center justify-center"
                    >
                      <MessageSquare size={16} className="mr-2" />
                      แชท
                    </button>
                  </div>
                  
                  {/* จำนวนการติดต่อ */}
                  {provider.contactCount > 0 && (
                    <div className="mt-3 text-xs text-gray-500 text-center">
                      📞 ติดต่อแล้ว {provider.contactCount} ครั้ง
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

  // 🔥 FIX 8: แก้ไข New Job Modal ให้รองรับการจ้างงานซ้ำ
  const renderNewJobModal = () => {
    // ใช้ข้อมูลจาก selectedJob ถ้ามี (สำหรับจ้างงานซ้ำ)
    const isRehire = !!selectedProviderForRehire;
    const previousProvider = selectedProviderForRehire?.name;
     const handleSubmitRehire = async () => {
    try {
      // 1. เก็บค่าจากฟอร์ม
      const title = (document.getElementById('rehire-job-title') as HTMLInputElement)?.value || '';
      const description = (document.getElementById('rehire-job-desc') as HTMLTextAreaElement)?.value || '';
      const price = Number((document.getElementById('rehire-job-price') as HTMLInputElement)?.value || 0);
      const category = (document.getElementById('rehire-job-category') as HTMLSelectElement)?.value || 'General';
      const datetime = (document.getElementById('rehire-job-datetime') as HTMLInputElement)?.value;

      if (!title || !description || !price || !datetime) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
      }

      // 2. เตรียมข้อมูล job
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

      // 4. ถ้าเป็นการจ้างงานซ้ำ ส่ง notification
      if (isRehire && selectedProviderForRehire) {
        await MockApi.createNotification({
          userId: selectedProviderForRehire.id,
          type: 'JOB_REHIRE',
          title: '📨 คุณได้รับคำเชิญงานใหม่',
          message: `${user?.name} ต้องการจ้างคุณสำหรับงาน: "${jobData.title}"`,
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

        alert(`✅ ส่งคำเชิญงานไปหา ${previousProvider} แล้ว!\n\nงานจะปรากฏในรายการ "งานที่รอตอบรับ" ของ ${previousProvider}`);
      } else {
        alert('✅ สร้างงานใหม่สำเร็จ!\n\nงานจะปรากฏในระบบและเปิดให้ provider ทั่วไปรับงาน');
      }

      // 5. ปิด modal และรีเฟรช
      setShowNewJobModal(false);
      setShowRehireModal(false);
      setSelectedJob(null);
      setSelectedProviderForRehire(null);
      fetchDashboardData();

    } catch (error: any) {
      console.error('Error creating job:', error);
      alert(`❌ สร้างงานไม่สำเร็จ: ${error.message || 'โปรดลองอีกครั้ง'}`);
    }
  };
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900">
              {isRehire ? `จ้างงาน ${previousProvider} อีกครั้ง` : 'สร้างงานใหม่'}
            </h3>
            <p className="text-gray-500">
              {isRehire 
                ? `จ้างงาน ${previousProvider} ด้วยข้อมูลงานเดิม` 
                : 'กรอกข้อมูลเพื่อสร้างงานใหม่'}
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่องาน
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="เช่น ทำความสะอาดออฟฟิศ"
                  defaultValue={selectedJob?.title || ''}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียด
                </label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="ระบุรายละเอียดงาน..."
                  defaultValue={selectedJob?.description || ''}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ค่าจ้าง (บาท)
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ประเภทงาน
                  </label>
                  <select 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    defaultValue={selectedJob?.category || 'Cleaning'}
                  >
                  <option value="Cleaning">ทำความสะอาด</option>
                  <option value="Delivery">จัดส่ง</option>
                  <option value="Repair">ซ่อมแซม</option>
                  <option value="Consulting">ให้คำปรึกษา</option>
                  </select>
                </div>
              </div>

                   <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันและเวลาเริ่มงาน *
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
                     💡 คุณกำลังจ้างงานซ้ำกับ <strong>{previousProvider}</strong> 
                  {selectedJob?.title && (
                    <> โดยอิงจากงานเดิม "{selectedJob?.title}"</>
                  )}
                  <br />
                  <span className="text-xs">
                    {previousProvider} จะได้รับแจ้งเตือนทันทีที่คุณสร้างงาน
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
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => {
                  // จำลองการสร้างงาน
                  alert(isRehire 
                    ? `สร้างงานใหม่สำหรับ ${previousProvider} สำเร็จ!` 
                    : 'สร้างงานใหม่สำเร็จ!');
                  setShowNewJobModal(false);
                  setShowRehireModal(false);
                  setSelectedJob(null);
                  setSelectedProviderForRehire(null);
                  fetchDashboardData(); // รีเฟรชข้อมูล
                }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                {isRehire ? 'ยืนยันการจ้างงานซ้ำ' : 'สร้างงาน'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🔥 FIX 9: เพิ่มโมดอลสำหรับจ้างงานซ้ำโดยเฉพาะ
  const renderRehireModal = () => {
    if (!selectedProviderForRehire) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900">
              จ้างงาน {selectedProviderForRehire.name} อีกครั้ง
            </h3>
            <p className="text-gray-500">
              กรอกข้อมูลงานใหม่ที่จะจ้างให้ {selectedProviderForRehire.name}
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {/* ... ฟอร์มสร้างงาน ... */}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ส่วน render อื่นๆ (Overview, Jobs, Analytics) เหมือนเดิม
  const renderOverview = () => (
    console.log("Active jobs count:", activeJobs.length),
console.log("Active jobs data:", activeJobs),
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Total Jobs</p>
              <p className="text-3xl font-bold">{jobs.length}</p>
            </div>
            <Briefcase size={24} className="opacity-80" />
          </div>
          <div className="mt-3 text-sm">
            <span className="opacity-90">+12% from last month</span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Active Jobs</p>
              <p className="text-3xl font-bold">
                {statusCounts.IN_PROGRESS + statusCounts.ACCEPTED}
              </p>
            </div>
            <Users size={24} className="opacity-80" />
          </div>
          <div className="mt-3 text-sm">
            <span className="opacity-90">3 in progress now</span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Total Revenue</p>
              <p className="text-3xl font-bold">
                ฿
                {jobs.reduce((sum, job) => sum + job.price, 0).toLocaleString()}
              </p>
            </div>
            <DollarSign size={24} className="opacity-80" />
          </div>
          <div className="mt-3 text-sm">
            <span className="opacity-90">
              Avg: ฿
              {Math.round(
                jobs.reduce((sum, job) => sum + job.price, 0) /
                  (jobs.length || 1)
              )}{" "}
              per job
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-90">Completion Rate</p>
              <p className="text-3xl font-bold">
                {jobs.length > 0
                  ? Math.round((statusCounts.COMPLETED / jobs.length) * 100)
                  : 0}
                %
              </p>
            </div>
            <CheckCircle size={24} className="opacity-80" />
          </div>
          <div className="mt-3 text-sm">
            <span className="opacity-90">
              {statusCounts.COMPLETED} completed
            </span>
          </div>
        </div>
      </div>
      
      
      {/* จัดการกับ EmployerMap หากมี */}
      {activeJobs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <EmployerMap jobs={activeJobs} height="500px" />
        </div>
      )}

      {/* Recent Activity & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Recent Jobs</h3>
            <button
              onClick={() => setActiveView("jobs")}
              className="text-blue-600 text-sm font-medium hover:text-blue-800"
            >
              View All →
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
                    <p className="text-sm text-gray-500">{job.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">฿{job.price}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(job.datetime).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Notifications</h3>
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
                  <span className="text-xs text-gray-500">
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

  const renderJobsView = () => (
    <div className="space-y-6">
      {/* Jobs Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Job Management</h2>
            <p className="text-gray-500">Manage all your posted jobs</p>
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
              setStatusFilter(e.target.value as JobStatus | "ALL")
            }
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">All Status</option>
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">
                        {job.title}
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
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
                  <td className="px-6 py-4 text-sm text-gray-500">
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
                          // ส่ง message ไปหา provider
                          if (job.accepted_by) {
                            handleContactProvider(job.accepted_by);
                          } else {
                            alert('ยังไม่มีผู้รับจ้างงานนี้');
                          }
                        }}
                        className="p-1 text-green-600 hover:text-green-800"
                        title="Chat"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <button className="p-1 text-gray-400 hover:text-gray-600">
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
            <p className="text-gray-500">No jobs found</p>
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
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Analytics & Reports
            </h2>
            <p className="text-gray-500">
              Detailed insights and performance metrics
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportData}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center"
            >
              <Download size={18} className="mr-2" />
              Export Data
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Full Statistics */}
      <JobCounter showCharts={true} />

      {/* Revenue Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Revenue Trend</h3>
        <div className="h-64 flex items-end space-x-2">
          {[65, 45, 75, 85, 55, 95, 70].map((value, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-emerald-500 to-green-300 rounded-t-lg"
                style={{ height: `${value}%` }}
              ></div>
              <div className="text-xs text-gray-500 mt-2">Day {index + 1}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Average Response Time</span>
              <span className="font-bold">12 minutes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Job Completion Time</span>
              <span className="font-bold">2.5 hours</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Provider Satisfaction</span>
              <span className="font-bold text-emerald-600">94%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Repeat Hiring Rate</span>
              <span className="font-bold text-blue-600">68%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Category Performance</h3>
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
            <h3 className="text-xl font-bold text-gray-900">Job Details</h3>
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
                <h4 className="font-bold text-gray-900 mb-2">
                  {selectedJob.title}
                </h4>
                <p className="text-gray-600 mb-4">{selectedJob.description}</p>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <span className="text-gray-500 w-32">Status:</span>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(
                        selectedJob.status
                      )}`}
                    >
                      {selectedJob.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-32">Category:</span>
                    <span className="font-medium">{selectedJob.category}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-32">Price:</span>
                    <span className="font-bold text-emerald-600">
                      ฿{selectedJob.price}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-32">Date:</span>
                    <span>
                      {new Date(selectedJob.datetime).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-32">Location:</span>
                    <span>
                      {selectedJob.location.lat.toFixed(4)},{" "}
                      {selectedJob.location.lng.toFixed(4)}
                      {selectedJob.location.fullAddress && (
                        <div className="mt-1 text-sm text-gray-600">
                          📍 {selectedJob.location.fullAddress}
                        </div>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              

              {/* Right Column - Actions */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4">Quick Actions</h4>
                <div className="space-y-3">
                  <button className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center">
                    <MessageSquare size={18} className="mr-2" />
                    Chat with Provider
                  </button>
                  <button className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center">
                    <Eye size={18} className="mr-2" />
                    View Full Details
                  </button>
                  <button className="w-full py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center justify-center">
                    <RefreshCw size={18} className="mr-2" />
                    Update Status
                  </button>
                  {selectedJob.status === JobStatus.OPEN && (
                    <button className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center">
                      <XCircle size={18} className="mr-2" />
                      Cancel Job
                    </button>
                  )}
                </div>

                {/* Assigned Provider */}
                {selectedJob.accepted_by && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h5 className="font-bold text-gray-900 mb-2">
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
                        <p className="text-sm text-gray-500">
                          Rating: 4.8 • 42 jobs completed
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
      <div className="bg-white rounded-xl border border-gray-200 p-8">
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
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Employer Dashboard</h1>
            <p className="text-blue-100">
              Welcome back, {user?.name || "Employer"}!
              <span className="ml-2 bg-white/20 px-2 py-1 rounded-full text-xs">
                {jobs.length} active jobs
              </span>
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleQuickAction("refresh")}
              className="p-2 bg-white/20 rounded-full hover:bg-white/30"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
            <button
              onClick={() => handleQuickAction("notify")}
              className="p-2 bg-white/20 rounded-full hover:bg-white/30 relative"
              title="Notifications"
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
            <button
              onClick={handleExportData}
              className="px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 flex items-center"
            >
              <Download size={18} className="mr-2" />
              Export
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveView("overview")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center ${
              activeView === "overview"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <BarChart3 size={18} className="mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveView("jobs")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center ${
              activeView === "jobs"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <Briefcase size={18} className="mr-2" />
            Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setActiveView("providers")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center ${
              activeView === "providers"
                ? "bg-white text-blue-700 shadow-lg"
                : "bg-white/20 hover:bg-white/30"
            }`}
          >
            <Users size={18} className="mr-2" />
            Providers ({providers.length})
          </button>
          <button
            onClick={() => setActiveView("analytics")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center ${
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
    </div>
  );
};

export default EmployerDashboard;