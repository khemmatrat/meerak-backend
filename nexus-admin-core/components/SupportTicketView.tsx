import React, { useState, useEffect } from 'react';
import { User, Clock, CheckCircle, Send, Bot, Phone, Mail, FileText, Zap, AlertCircle, Shield, AlertTriangle } from 'lucide-react';
import {
  getSupportTickets,
  getSupportTicketMessages,
  replySupportTicket,
  resolveSupportTicket,
  getSupportAiSuggestion,
  getAdminUser,
  type SupportTicketRow,
  type SupportMessageRow,
} from '../services/adminApi';
import { getAdminToken } from '../services/adminApi';

// คำตอบแนะนำสำหรับ 403 และ 429 — ให้แอดมินกดใช้แล้วส่งได้ทันที แก้ปัญหาจนสิ้นสุด
const CANNED_REPLY_429 = `สวัสดีครับ สำหรับข้อความ **429 (Rate Limit)** ระบบจำกัดจำนวนครั้งในการลองเพื่อความปลอดภัย

**วิธีแก้:**
1. รอเวลาตามที่แอปแจ้ง (มัก 1–15 นาที) แล้วลองเข้าสู่ระบบใหม่
2. ถ้าลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัส
3. ถ้ายังติดอยู่: แจ้งเบอร์โทรหรืออีเมลที่ใช้สมัครมา เราจะตรวจสอบและปลดล็อกให้

หากทำตามแล้วยังไม่ได้ผล แจ้งเพิ่มได้เลยครับ เราจะดำเนินการให้จนแก้ไขสิ้นสุด`;

const CANNED_REPLY_403 = `สวัสดีครับ สำหรับข้อความ **403 (Forbidden / ไม่มีสิทธิ์)**

**กรณีทั่วไป:**
• ตรวจสอบว่าเข้าสู่ระบบแล้ว และบัญชีไม่ถูกระงับ
• ลองออกจากระบบแล้วเข้าสู่ระบบใหม่

**กรณี "เงินถูกล็อก" / ปล่อยเงินไม่ได้:**
• ถ้ามีการยื่น Dispute งานนั้น ระบบจะล็อกเงินไว้จนกว่าแอดมินจะตัดสิน
• รอทีมงานพิจารณา Dispute (24–48 ชม.) แล้วสถานะจะอัปเดต

ถ้าเป็นกรณีอื่น แจ้งรายละเอียด (เช่น หน้าที่เจอ งานที่เกี่ยวข้อง) เราจะตรวจและแก้ให้จนสิ้นสุดครับ`;

function toChatMessage(m: SupportMessageRow): { id: string; sender: 'USER' | 'ADMIN' | 'BOT'; message: string; timestamp: string } {
  return {
    id: m.id,
    sender: m.sender as 'USER' | 'ADMIN' | 'BOT',
    message: m.message,
    timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  };
}

export const SupportTicketView: React.FC = () => {
  const [allTickets, setAllTickets] = useState<SupportTicketRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<{ id: string; sender: 'USER' | 'ADMIN' | 'BOT'; message: string; timestamp: string }[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTickets = allTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  const resolvedTickets = allTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
  const tickets = statusFilter === 'OPEN'
    ? [...openTickets].sort((a, b) => new Date(a.createdAt || a.lastUpdated).getTime() - new Date(b.createdAt || b.lastUpdated).getTime())
    : [...resolvedTickets].sort((a, b) => new Date(b.lastUpdated || b.createdAt).getTime() - new Date(a.lastUpdated || a.createdAt).getTime());
  const openCount = openTickets.length;
  const resolvedCount = resolvedTickets.length;
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  const [selectedUserDetail, setSelectedUserDetail] = useState<{ full_name?: string; email?: string; phone?: string } | null>(null);
  useEffect(() => {
    if (!selectedTicket?.userId || !getAdminToken()) {
      setSelectedUserDetail(null);
      return;
    }
    let cancelled = false;
    getAdminUser(selectedTicket.userId)
      .then((res) => {
        if (!cancelled && res?.user)
          setSelectedUserDetail({
            full_name: res.user.full_name,
            email: res.user.email,
            phone: res.user.phone,
          });
        else if (!cancelled) setSelectedUserDetail(null);
      })
      .catch(() => {
        if (!cancelled) setSelectedUserDetail(null);
      });
    return () => { cancelled = true; };
  }, [selectedTicket?.userId]);

  const fetchTickets = async () => {
    if (!getAdminToken()) {
      setError('กรุณา Login เพื่อดูตั๋วสนับสนุนจากผู้ใช้จริง');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getSupportTickets();
      const list = res.tickets || [];
      setAllTickets(list);
      const openList = list.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
      const openSorted = [...openList].sort((a, b) => new Date(a.createdAt || a.lastUpdated).getTime() - new Date(b.createdAt || b.lastUpdated).getTime());
      if (!selectedTicketId && openSorted.length > 0) {
        setSelectedTicketId(openSorted[0].id);
      } else if (!selectedTicketId && list.length > 0) {
        setSelectedTicketId(list[0].id);
      }
      if (selectedTicketId && !list.find((t) => t.id === selectedTicketId)) {
        setSelectedTicketId(openSorted[0]?.id ?? list[0]?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || 'โหลดตั๋วไม่สำเร็จ');
      setAllTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 15000);
    return () => clearInterval(interval);
  }, []);

  // โหลดข้อความ + Polling แบบ Realtime (ทุก 3 วินาที) เพื่อรับแชทจาก user อีกฝั่ง
  useEffect(() => {
    if (!selectedTicketId || !getAdminToken()) {
      setChatHistory([]);
      return;
    }
    let cancelled = false;
    const fetchMessages = () => {
      getSupportTicketMessages(selectedTicketId!)
        .then((res) => {
          if (!cancelled) setChatHistory((res.messages || []).map(toChatMessage));
        })
        .catch(() => {
          if (!cancelled) setChatHistory((prev) => prev);
        });
    };
    fetchMessages();
    const pollInterval = setInterval(fetchMessages, 3000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [selectedTicketId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedTicketId) return;
    setSending(true);
    try {
      await replySupportTicket(selectedTicketId, messageInput.trim(), false);
      setMessageInput('');
      const res = await getSupportTicketMessages(selectedTicketId);
      setChatHistory((res.messages || []).map(toChatMessage));
    } catch (e: any) {
      setError(e?.message || 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedTicketId) return;
    try {
      await resolveSupportTicket(selectedTicketId, 'RESOLVED');
      await fetchTickets();
      if (tickets.find((t) => t.id === selectedTicketId)) {
        const next = tickets.filter((t) => t.id !== selectedTicketId)[0];
        setSelectedTicketId(next?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || 'อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedTicketId) return;
    setAiLoading(true);
    try {
      const res = await getSupportAiSuggestion(selectedTicketId);
      setMessageInput(res.suggestion || '');
    } catch {
      setMessageInput('สวัสดีครับ ขอบคุณที่ติดต่อเรา ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6">
      {/* Left: Ticket List (ค่าจริงจาก Backend) */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 mb-2">Support Tickets</h3>
          {error && (
            <p className="text-xs text-rose-600 mb-2">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('OPEN')}
              className={`flex-1 py-1 text-xs font-bold rounded ${statusFilter === 'OPEN' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
            >
              Open ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('RESOLVED')}
              className={`flex-1 py-1 text-xs font-bold rounded ${statusFilter === 'RESOLVED' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
            >
              Resolved ({resolvedCount})
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {loading && tickets.length === 0 && (
            <div className="p-4 text-slate-500 text-sm">กำลังโหลด...</div>
          )}
          {!loading && tickets.length === 0 && (
            <div className="p-4 text-slate-500 text-sm">ไม่มีตั๋วในกลุ่มนี้</div>
          )}
          {tickets.map((ticket, index) => {
            const queueNum = statusFilter === 'OPEN' ? index + 1 : null;
            return (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${selectedTicketId === ticket.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {queueNum != null && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                        คิว #{queueNum}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ticket.priority === 'URGENT' ? 'bg-rose-100 text-rose-600' :
                      ticket.priority === 'HIGH' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'
                    }`}>{ticket.priority}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {ticket.lastUpdated ? new Date(ticket.lastUpdated).toLocaleDateString('th-TH') : ''}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-800 mb-1 truncate">{ticket.subject}</h4>
                <p className="text-xs text-slate-500 truncate">
                  {ticket.userId} • {ticket.category}
                  {ticket.source === 'dispute' && ' • Dispute'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              {selectedTicket?.subject ?? 'เลือกตั๋ว'}
              {selectedTicket && (
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-xs font-normal text-slate-600">{selectedTicket.id}</span>
              )}
            </h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock size={12} /> Response Time Target: &lt; 15 mins
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">อัปเดตข้อความอัตโนมัติทุก 3 วินาที (Realtime)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={!selectedTicketId || aiLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-100 text-purple-700 text-xs font-bold disabled:opacity-50"
            >
              <Zap size={16} />
              {aiLoading ? 'กำลังสร้าง...' : 'AI สร้างข้อความตอบ'}
            </button>
            <button
              type="button"
              onClick={() => setMessageInput(CANNED_REPLY_429)}
              disabled={!selectedTicketId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs font-bold disabled:opacity-50 hover:bg-amber-100"
              title="ใช้คำตอบแนะนำสำหรับปัญหา 429 Rate Limit"
            >
              <AlertTriangle size={14} /> คำตอบ 429
            </button>
            <button
              type="button"
              onClick={() => setMessageInput(CANNED_REPLY_403)}
              disabled={!selectedTicketId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-xs font-bold disabled:opacity-50 hover:bg-rose-100"
              title="ใช้คำตอบแนะนำสำหรับปัญหา 403 Forbidden"
            >
              <Shield size={14} /> คำตอบ 403
            </button>
            <button
              type="button"
              onClick={handleMarkResolved}
              disabled={!selectedTicketId}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} /> Mark Resolved
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {!selectedTicketId && (
            <div className="text-center text-slate-500 py-12">เลือกตั๋วจากรายการด้านซ้าย</div>
          )}
          {selectedTicketId && chatHistory.length === 0 && !loading && (
            <div className="text-center text-slate-500 py-12">ยังไม่มีข้อความ</div>
          )}
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[80%] ${msg.sender === 'ADMIN' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.sender === 'ADMIN' ? 'bg-indigo-600 text-white' :
                  msg.sender === 'BOT' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {msg.sender === 'ADMIN' && <User size={16} />}
                  {msg.sender === 'BOT' && <Bot size={16} />}
                  {msg.sender === 'USER' && <User size={16} />}
                </div>
                <div>
                  <div className={`p-3 rounded-2xl text-sm ${
                    msg.sender === 'ADMIN' ? 'bg-indigo-600 text-white rounded-tr-none' :
                    msg.sender === 'BOT' ? 'bg-purple-50 text-purple-900 border border-purple-100 rounded-tl-none' :
                    'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                  }`}>
                    {msg.sender === 'BOT' && (
                      <div className="text-[10px] font-bold text-purple-600 mb-1 flex items-center gap-1">
                        <Zap size={10} /> Automated Response
                      </div>
                    )}
                    {msg.message}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block px-1">{msg.timestamp}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex flex-col gap-3">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type your reply... (หรือกด คำตอบ 429 / คำตอบ 403 สำหรับคำตอบแนะนำ)"
            rows={3}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all resize-y min-h-[60px]"
          />
          <div className="flex gap-3">
          <button
            type="submit"
            disabled={!messageInput.trim() || sending || !selectedTicketId}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} /> Send
          </button>
          </div>
        </form>
      </div>

      {/* Right: User ที่ติดต่อมา (ดึงจาก Admin API) */}
      <div className="w-80 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-2xl mb-3">
            {(selectedUserDetail?.full_name || selectedTicket?.full_name || selectedTicket?.userId)?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <h3 className="font-bold text-lg text-slate-800 truncate w-full text-center">
            {(selectedUserDetail?.full_name || selectedTicket?.full_name || selectedTicket?.userId) ?? '—'}
          </h3>
          <span className="text-xs text-slate-500 mt-0.5">
            {selectedTicket?.userId && (selectedUserDetail?.full_name || selectedTicket?.full_name) ? selectedTicket.userId : null}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${
            selectedTicket?.status === 'OPEN' || selectedTicket?.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}>{selectedTicket?.status ?? '—'}</span>
        </div>
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Contact</h4>
            <div className="space-y-3 text-sm">
              {(selectedUserDetail?.email || selectedTicket?.email) && (
                <div className="flex items-center gap-3 text-slate-600">
                  <Mail size={16} /> <span className="truncate">{selectedUserDetail?.email || selectedTicket?.email}</span>
                </div>
              )}
              {(selectedUserDetail?.phone || selectedTicket?.phone) && (
                <div className="flex items-center gap-3 text-slate-600">
                  <Phone size={16} /> <span>{selectedUserDetail?.phone || selectedTicket?.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-slate-600">
                <span className="text-slate-400">User ID</span> <span className="font-mono text-xs truncate">{selectedTicket?.userId ?? '—'}</span>
              </div>
            </div>
          </div>
          {selectedTicket?.source === 'dispute' && selectedTicket?.jobId && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Dispute</h4>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-slate-600 text-xs">งานที่เกี่ยวข้อง</p>
                <p className="font-mono font-bold text-slate-800">Job #{selectedTicket.jobId}</p>
              </div>
            </div>
          )}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Category</h4>
            <p className="text-sm text-slate-600">{selectedTicket?.category ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
