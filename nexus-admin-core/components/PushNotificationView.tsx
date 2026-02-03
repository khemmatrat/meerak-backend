import React, { useState } from 'react';
import { Send, Bell, Smartphone, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { MOCK_NOTIFICATIONS } from '../constants';
import { PushNotification } from '../types';

export const PushNotificationView: React.FC = () => {
  const [history, setHistory] = useState<PushNotification[]>(MOCK_NOTIFICATIONS);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'All' | 'iOS' | 'Android'>('All');
  const [isSending, setIsSending] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    // Simulate API call
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
      setHistory([newNotif, ...history]);
      setTitle('');
      setMessage('');
      setIsSending(false);
      alert('ส่งการแจ้งเตือนเรียบร้อยแล้ว');
    }, 1500);
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

            <div className="pt-4">
              <button 
                type="submit" 
                disabled={isSending || !title || !message}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSending ? <span className="animate-spin">⌛</span> : <Send size={18} />}
                ส่งการแจ้งเตือนทันที
              </button>
            </div>
          </form>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h4 className="flex items-center gap-2 font-semibold text-blue-800 mb-2">
            <Smartphone size={18} />
            Live Preview
          </h4>
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