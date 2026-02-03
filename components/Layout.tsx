
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, PlusCircle, User, LogOut, Menu, X, ShieldCheck, Globe, CheckCircle, AlertCircle, Info, Calendar, Users, Settings, Bell, Sparkles, Plus, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification, NotificationType } from '../context/NotificationContext';
import { MockApi } from '../services/mockApi';
import { UserRole, UserNotification } from '../types';
import { SafetyWidget } from './SafetyWidget';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { toasts, removeToast } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Notifications State
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recommendedCount, setRecommendedCount] = useState(0);

  useEffect(() => {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, []);

  useEffect(() => {
      const fetchData = async () => {
          if (user) {
              // 1. Fetch Notifications
              const notifs = await MockApi.getNotifications();
              setNotifications(notifs);
              setUnreadCount(notifs.filter(n => !n.is_read).length);

              // 2. Fetch Recommended Jobs Count
              const recommended = await MockApi.getRecommendedJobs();
              setRecommendedCount(recommended.length);
          }
      };
      fetchData();
      // Poll every 5 seconds for new notifications and jobs
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNotifClick = async (n: UserNotification) => {
      await MockApi.markNotificationRead(n.id);
      setNotifications(prev => prev.map(item => item.id === n.id ? {...item, is_read: true} : item));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setShowNotifDropdown(false);
      
      if (n.related_id) {
          navigate(`/jobs/${n.related_id}`);
      }
  };

  const NavItem = ({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string, badge?: number }) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors relative ${
          isActive ? 'bg-emerald-100 text-emerald-700' : 'text-gray-600 hover:bg-gray-100'
        }`}
        onClick={() => setIsMenuOpen(false)}
      >
        <div className="relative">
            <Icon size={20} />
            {badge && badge > 0 ? (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                    {badge}
                </span>
            ) : null}
        </div>
        <span className="font-medium">{label}</span>
      </Link>
    );
  };

  const MobileNavItem = ({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string, badge?: number }) => {
      const isActive = location.pathname === to;
      return (
        <Link
          to={to}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative ${
            isActive ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          <div className="relative">
              <Icon size={24} />
              {badge && badge > 0 ? (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                      {badge}
                  </span>
              ) : null}
          </div>
          <span className="text-[10px] font-medium">{label}</span>
        </Link>
      );
  };

  const getToastIcon = (type: NotificationType) => {
      switch(type) {
          case 'success': return <CheckCircle size={20} className="text-emerald-500" />;
          case 'error': return <AlertCircle size={20} className="text-red-500" />;
          default: return <Info size={20} className="text-blue-500" />;
      }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 relative pb-20 md:pb-0">
      
      {/* Offline Banner */}
      {isOffline && (
          <div className="bg-red-600 text-white text-xs font-bold text-center py-1 flex items-center justify-center sticky top-0 z-[60]">
              <WifiOff size={14} className="mr-2" /> No Internet Connection
          </div>
      )}

      {/* Toast Container */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (
              <div 
                  key={toast.id} 
                  className="bg-white border border-gray-100 shadow-lg rounded-lg p-4 flex items-center gap-3 min-w-[300px] animate-in slide-in-from-right pointer-events-auto"
              >
                  {getToastIcon(toast.type)}
                  <p className="text-sm font-medium text-gray-800 flex-1">{toast.message}</p>
                  <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                  </button>
              </div>
          ))}
      </div>

      {/* Top Navigation (Desktop & Tablet) */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex items-center">
                 <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center mr-2">
                    <span className="text-white font-bold text-xl">M</span>
                 </div>
                 <span className="font-bold text-xl text-emerald-900 tracking-tight">Meerak</span>
              </Link>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-2">
              <NavItem to="/" icon={Home} label={t('nav.home')} />
              <NavItem to="/jobs" icon={Briefcase} label={t('nav.jobs')} />
              <NavItem to="/talents" icon={Users} label={t('nav.talents')} />
              <NavItem to="/my-jobs" icon={Calendar} label={t('nav.my_jobs')} badge={recommendedCount} />
              
              {/* Post Job Button */}
              <Link 
                  to="/create-job" 
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200 mx-2"
              >
                  <PlusCircle size={20} />
                  <span className="font-bold">{t('nav.post')}</span>
              </Link>
              
              {/* Notification Bell */}
              <div className="relative ml-2">
                  <button 
                    onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                    className="p-2 text-gray-500 hover:text-emerald-600 rounded-full hover:bg-gray-100 transition-colors relative"
                  >
                      <Bell size={20} />
                      {unreadCount > 0 && (
                          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                      )}
                  </button>

                  {showNotifDropdown && (
                      <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in zoom-in-95">
                          <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                              <h3 className="text-sm font-bold text-gray-700">{t('notif.title')}</h3>
                              {unreadCount > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{unreadCount} new</span>}
                          </div>
                          <div className="max-h-80 overflow-y-auto">
                              {notifications.length === 0 ? (
                                  <div className="p-6 text-center text-gray-500 text-sm">{t('notif.empty')}</div>
                              ) : (
                                  notifications.map(n => (
                                      <div 
                                        key={n.id} 
                                        onClick={() => handleNotifClick(n)}
                                        className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-emerald-50/50' : ''}`}
                                      >
                                          <div className="flex items-start gap-3">
                                              <div className={`mt-1 p-1.5 rounded-full flex-shrink-0 ${!n.is_read ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                                                  {n.type === 'job_match' ? <Sparkles size={14} /> : <Info size={14} />}
                                              </div>
                                              <div>
                                                  <p className={`text-sm ${!n.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{n.title}</p>
                                                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.message}</p>
                                                  <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleTimeString()}</p>
                                              </div>
                                          </div>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  )}
              </div>

              <div className="w-px h-6 bg-gray-200 mx-2"></div>
              <NavItem to="/profile" icon={User} label={t('nav.profile')} />
              
              <div className="relative flex items-center ml-2 border-l pl-4 border-gray-200">
                <Globe size={16} className="text-gray-400 absolute left-6 pointer-events-none" />
                <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg bg-white text-sm text-gray-600 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer hover:bg-gray-50 outline-none"
                >
                    <option value="en">English</option>
                    <option value="th">ไทย</option>
                    <option value="zh">中文</option>
                    <option value="ja">日本語</option>
                    <option value="fr">Français</option>
                    <option value="ru">Русский</option>
                </select>
              </div>

              <Link
                 to="/settings"
                 className="ml-2 p-2 text-gray-500 hover:text-emerald-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                 <Settings size={20} />
              </Link>
            </div>

            {/* Mobile Header Right Actions */}
            <div className="flex items-center md:hidden space-x-3">
               <button 
                    onClick={() => {
                        setShowNotifDropdown(!showNotifDropdown);
                        if (showNotifDropdown) return; 
                    }}
                    className="relative text-gray-500"
               >
                  <Bell size={20} />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
               </button>

               {/* Mobile Notif Dropdown Overlay */}
               {showNotifDropdown && (
                   <div className="absolute top-16 right-2 left-2 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[60vh] overflow-y-auto">
                       <div className="p-3 bg-gray-50 border-b border-gray-100 font-bold text-sm flex justify-between">
                           <span>{t('notif.title')}</span>
                           <button onClick={() => setShowNotifDropdown(false)}><X size={16} /></button>
                       </div>
                       {notifications.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 text-sm">{t('notif.empty')}</div>
                        ) : (
                            notifications.map(n => (
                                <div 
                                key={n.id} 
                                onClick={() => handleNotifClick(n)}
                                className={`p-3 border-b border-gray-50 cursor-pointer ${!n.is_read ? 'bg-emerald-50/50' : ''}`}
                                >
                                    <p className={`text-sm ${!n.is_read ? 'font-bold' : ''}`}>{n.title}</p>
                                    <p className="text-xs text-gray-500 line-clamp-1">{n.message}</p>
                                </div>
                            ))
                        )}
                   </div>
               )}

               <Link to="/settings" className="text-gray-500 hover:text-emerald-600">
                  <Settings size={20} />
               </Link>
               <div className="relative flex items-center">
                    <Globe size={16} className="text-gray-400 absolute left-2 pointer-events-none" />
                    <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value as any)}
                        className="pl-7 pr-2 py-1 border border-gray-200 rounded-lg bg-white text-xs text-gray-600 focus:ring-emerald-500 focus:border-emerald-500 appearance-none cursor-pointer"
                    >
                        <option value="en">EN</option>
                        <option value="th">TH</option>
                        <option value="zh">CN</option>
                        <option value="ja">JP</option>
                        <option value="fr">FR</option>
                        <option value="ru">RU</option>
                    </select>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      
      {/* Safety Widget (Global) */}
      <SafetyWidget />

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-white border-t border-gray-200 md:hidden flex justify-around items-center px-2 pb-safe">
        <MobileNavItem to="/" icon={Home} label={t('nav.home')} />
        <MobileNavItem to="/jobs" icon={Briefcase} label={t('nav.find')} />
        <div className="relative -top-5">
            <Link to="/create-job" className="flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-full shadow-lg text-white hover:bg-emerald-700 transition-transform active:scale-95">
                <PlusCircle size={28} />
            </Link>
        </div>
        <MobileNavItem to="/talents" icon={Users} label={t('nav.talents')} />
        <MobileNavItem to="/my-jobs" icon={Calendar} label={t('nav.my_jobs')} badge={recommendedCount} />
        <MobileNavItem to="/profile" icon={User} label={t('nav.profile')} />
      </div>
    </div>
  );
};
