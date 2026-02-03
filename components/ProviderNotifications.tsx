import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MockApi } from '../services/mockApi';
import { Bell, CheckCircle, XCircle, Briefcase, User, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProviderNotifications: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
    }
  }, [user?.id]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await MockApi.getUserNotifications(user!.id);
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptJob = async (notification: any) => {
    try {
      // อัปเดตสถานะงานเป็น ACCEPTED
      await MockApi.updateJobStatus(notification.jobId, 'ACCEPTED', user!.id);
      
      // อัปเดต notification เป็นอ่านแล้ว
      await markAsRead(notification.id);
      
      alert(`✅ คุณรับงาน "${notification.data?.jobTitle}" สำเร็จ!`);
      navigate(`/jobs/${notification.jobId}`);
      
    } catch (error: any) {
      alert(`❌ ไม่สามารถรับงานได้: ${error.message}`);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // อัปเดตใน Firestore
      await MockApi.markNotificationAsRead(notificationId);
      
      // อัปเดต state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, read: true, readAt: new Date().toISOString() }
            : n
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  if (loading) {
    return <div>กำลังโหลด...</div>;
  }

  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Bell className="mr-3 text-blue-600" size={28} />
          การแจ้งเตือน
          {unreadNotifications.length > 0 && (
            <span className="ml-3 bg-red-500 text-white text-sm px-2 py-1 rounded-full">
              {unreadNotifications.length} ใหม่
            </span>
          )}
        </h1>
      </div>

      {/* แจ้งเตือนใหม่ */}
      {unreadNotifications.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">📩 แจ้งเตือนใหม่</h2>
          {unreadNotifications.map(notification => (
            <div
              key={notification.id}
              className="bg-white border-l-4 border-blue-500 rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      notification.type === 'JOB_REHIRE' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {notification.type === 'JOB_REHIRE' ? '🎉 จ้างงานซ้ำ' : '📨 งานใหม่'}
                    </span>
                    <span className="text-xs text-gray-500 ml-3">
                      {new Date(notification.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-gray-900 text-lg mb-2">
                    {notification.title}
                  </h3>
                  
                  <p className="text-gray-700 mb-3">
                    {notification.message}
                  </p>
                  
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex items-center mb-1">
                      <User size={14} className="mr-2 text-gray-500" />
                      <span className="text-gray-600">ผู้จ้าง: </span>
                      <span className="font-medium ml-1">{notification.employerName}</span>
                    </div>
                    <div className="flex items-center mb-1">
                      <Briefcase size={14} className="mr-2 text-gray-500" />
                      <span className="text-gray-600">งาน: </span>
                      <span className="font-medium ml-1">{notification.data?.jobTitle}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock size={14} className="mr-2 text-gray-500" />
                      <span className="text-gray-600">ค่าจ้าง: </span>
                      <span className="font-bold text-emerald-600 ml-1">฿{notification.data?.jobPrice}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2 ml-4">
                  <button
                    onClick={() => handleAcceptJob(notification)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center"
                  >
                    <CheckCircle size={16} className="mr-2" />
                    รับงาน
                  </button>
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    ปิด
                  </button>
                  <button
                    onClick={() => navigate(`/jobs/${notification.jobId}`)}
                    className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                  >
                    ดูรายละเอียดงาน
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Bell className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 text-lg">ไม่มีการแจ้งเตือนใหม่</p>
          <p className="text-gray-400 text-sm mt-2">
            เมื่อมีงานใหม่หรือการจ้างงานซ้ำ คุณจะได้รับการแจ้งเตือนที่นี่
          </p>
        </div>
      )}

      {/* ประวัติแจ้งเตือน */}
      {readNotifications.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">📚 ประวัติแจ้งเตือน</h2>
          {readNotifications.map(notification => (
            <div
              key={notification.id}
              className="bg-gray-50 rounded-lg p-4 border border-gray-100"
            >
              <div className="flex justify-between">
                <div>
                  <h4 className="font-medium text-gray-700">{notification.title}</h4>
                  <p className="text-sm text-gray-500">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    อ่านแล้ว • {new Date(notification.readAt).toLocaleString('th-TH')}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/jobs/${notification.jobId}`)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  ดูงาน
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProviderNotifications;