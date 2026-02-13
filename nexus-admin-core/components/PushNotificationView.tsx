import React, { useState, useEffect } from 'react';
import { Send, Bell, Smartphone, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { MOCK_NOTIFICATIONS } from '../constants';
import { PushNotification } from '../types';
import { getAdminToken } from '../services/adminApi';
import { sendBroadcastNotification, getAdminNotifications } from '../services/adminApi';

const PREVIEW_TEMPLATES: { title: string; message: string }[] = [
  { title: 'เตือนแจ้งภัยมิจฉาชีพ', message: 'ระวังมิจฉาชีพโทรหลอกหรือแอบอ้างหน่วยงาน อย่าหลงส่งเงินหรือข้อมูลส่วนตัวทางโทรศัพท์หรือลิงก์ที่ไม่รู้จัก' },
  { title: 'แจ้งการแจกโบนัสหรือของรางวัล', message: 'มีกิจกรรมแจกโบนัสและของรางวัลสำหรับสมาชิก ตรวจสอบเงื่อนไขและระยะเวลาได้ในแอป' },
  { title: 'อัปเดตระบบและเวลาให้บริการ', message: 'แจ้งให้ทราบว่ามีการอัปเดตระบบในวันที่กำหนด บริการอาจชั่วคราวไม่พร้อมใช้' },
  { title: 'โปรโมชั่นและส่วนลดพิเศษ', message: 'ใช้รหัสส่วนลดได้ที่งานที่ร่วมรายการ หมดเขตเร็ว อย่าพลาด!' },
  { title: 'ยืนยันการสมัครหรือการจอง', message: 'ยืนยันการสมัคร/จองงานของคุณเรียบร้อยแล้ว ตรวจสอบรายละเอียดในแอป' },
  { title: 'เตือนกำหนดส่งงานหรือรายงาน', message: 'ใกล้ถึงกำหนดส่งงานหรือรายงานแล้ว กรุณาเตรียมและส่งให้ตรงเวลา' },
  { title: 'ประกาศจากแอดมิน', message: 'มีประกาศสำคัญจากทีมงาน กรุณาอ่านรายละเอียดในแอป' },
  { title: 'กิจกรรมและงานอีเวนต์', message: 'มีกิจกรรมและงานอีเวนต์ที่น่าสนใจ ลงทะเบียนหรือดูรายละเอียดได้ในแอป' },
];

function toPushNotif(item: { id: string; title: string; message: string; target: string; sentAt: string }): PushNotification {
  return {
    id: item.id,
    title: item.title,
    message: item.message,
    target: (item.target as 'All' | 'iOS' | 'Android') || 'All',
    sentAt: item.sentAt ? new Date(item.sentAt).toLocaleString('th-TH') : new Date().toLocaleString('th-TH'),
    status: 'Sent',
    openRate: 0
  };
}

export const PushNotificationView: React.FC = () => {
  const [history, setHistory] = useState<PushNotification[]>(MOCK_NOTIFICATIONS);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'All' | 'iOS' | 'Android'>('All');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useBackend = !!getAdminToken();

  useEffect(() => {
    if (!useBackend) return;
    getAdminNotifications(50)
      .then((res) => {
        if (res.notifications?.length) {
          setHistory(res.notifications.map(toPushNotif));
        }
      })
      .catch(() => {});
  }, [useBackend]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSending(true);
    if (useBackend) {
      try {
        const res = await sendBroadcastNotification({ title, message, target });
        const newNotif: PushNotification = {
          id: res.id,
          title,
          message,
          target,
          sentAt: new Date(res.sentAt).toLocaleString('th-TH'),
          status: 'Sent',
          openRate: 0
        };
        setHistory((prev) => [newNotif, ...prev]);
        setTitle('');
        setMessage('');
        alert('ส่งการแจ้งเตือนเรียบร้อยแล้ว — ข้อความจะไปแสดงที่หน้า Home ของแอปผู้ใช้');
      } catch (err: any) {
        setError(err?.message || 'ส่งไม่สำเร็จ');
      } finally {
        setIsSending(false);
      }
      return;
    }
    setTimeout(() => {
      const newNotif: PushNotification = {
        id: `N${Date.now()}`,
        title,
        message,
        target,
        sentAt: new Date().toLocaleString('th-TH'),
        status: 'Sent',
        openRate: 0
      };
      setHistory((prev) => [newNotif, ...prev]);
      setTitle('');
      setMessage('');
      setIsSending(false);
      alert('ส่งการแจ้งเตือนเรียบร้อยแล้ว (โหมดจำลอง — Login Backend เพื่อส่งจริงไปที่แอป)');
    }, 800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Compose Form */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Send size={20} />
            </div>
            <h2 className="font-bold text-slate-800">สร้างการแจ้งเตือนใหม่</h2>
          </div>

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">หัวข้อ (Title)</label>
              <input 
                type="text" 
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="เช่น โปรโมชั่นพิเศษ!"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ข้อความ (Message)</label>
              <textarea 
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                placeholder="รายละเอียดข้อความ..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">กลุ่มเป้าหมาย (Target)</label>
              <div className="grid grid-cols-3 gap-2">
                {['All', 'iOS', 'Android'].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setTarget(t as any)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                      target === t 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <div className="pt-4">
              <button 
                type="submit" 
                disabled={isSending || !title || !message}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSending ? <span className="animate-spin">⌛</span> : <Send size={18} />}
                {useBackend ? 'ส่งการแจ้งเตือนทันที (ไปที่แอปผู้ใช้)' : 'ส่งการแจ้งเตือน (จำลอง)'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h4 className="flex items-center gap-2 font-semibold text-blue-800 mb-2">
            <Smartphone size={18} />
            Live Preview
          </h4>
          <p className="text-xs text-blue-700/80 mb-2">กดเลือกหัวข้อตัวอย่างเพื่อแสดงในพรีวิวและใส่ในฟอร์ม</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PREVIEW_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTitle(tpl.title);
                  setMessage(tpl.message);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  title === tpl.title && message === tpl.message
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                }`}
              >
                {tpl.title}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 max-w-sm mx-auto mt-2">
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                <Bell size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{title || 'หัวข้อแจ้งเตือน'}</p>
                <p className="text-slate-500 text-xs line-clamp-2">{message || 'ข้อความตัวอย่างจะแสดงที่นี่...'}</p>
              </div>
              <span className="text-[10px] text-slate-400">now</span>
            </div>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">ประวัติการส่ง (Notification History)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  <th className="px-6 py-4 font-semibold">Message Info</th>
                  <th className="px-6 py-4 font-semibold">Target</th>
                  <th className="px-6 py-4 font-semibold">Sent Time</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Open Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map((notif) => (
                  <tr key={notif.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{notif.title}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{notif.message}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        {notif.target}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {notif.sentAt}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        {notif.status === 'Sent' && <CheckCircle size={14} className="text-emerald-500" />}
                        {notif.status === 'Scheduled' && <Clock size={14} className="text-amber-500" />}
                        {notif.status === 'Failed' && <AlertCircle size={14} className="text-rose-500" />}
                        <span className={`text-sm ${
                          notif.status === 'Sent' ? 'text-emerald-600' : 
                          notif.status === 'Scheduled' ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          {notif.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-medium text-slate-700">{notif.openRate}%</span>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                        <div 
                          className="bg-indigo-500 h-1.5 rounded-full" 
                          style={{ width: `${notif.openRate}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};