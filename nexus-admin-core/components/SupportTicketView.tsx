import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Clock, CheckCircle, Send, Phone, Mail, Zap, Shield, AlertTriangle, BookOpen, Trash2, X, Bot, Sparkles, Briefcase, UserPlus, Rocket, ExternalLink } from 'lucide-react';
import {
  getSupportTickets,
  replySupportTicket,
  resolveSupportTicket,
  setSupportTicketAiMode,
  getSupportAiSuggestion,
  saveSupportBestAnswer,
  getFaqKnowledge,
  deleteFaqKnowledge,
  listKnowledgeDrafts,
  promoteKnowledgeDraft,
  getAdminUser,
  inviteSupportProvider,
  postSupportLearningFeedback,
  generateSupportFaqDraft,
  addSupportTicketMediaUrl,
  patchSupportTicket,
  getAdminSocketOrigin,
  getAdminToken,
  type SupportTicketRow,
  type FaqKnowledgeItem,
} from '../services/adminApi';
import { useChatMessages } from '../hooks/useChatMessages';
import { MessageBubble } from './chat/MessageBubble';
import { AiModeToggle } from './chat/AiModeToggle';
import { Toast } from './chat/Toast';

// คำตอบแนะนำสำหรับ 403 และ 429 — ให้แอดมินกดใช้แล้วส่งได้ทันที แก้ปัญหาจนสิ้นสุด
const CANNED_REPLY_429 = `สวัสดีครับ สำหรับข้อความ **429 (Rate Limit)** ระบบจำกัดจำนวนครั้งในการลองเพื่อความปลอดภัย

**วิธีแก้:**
1. รอเวลาตามที่แอปแจ้ง (มัก 1–15 นาที) แล้วลองเข้าสู่ระบบใหม่
2. ถ้าลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัส
3. ถ้ายังติดอยู่: แจ้งเบอร์โทรหรืออีเมลที่ใช้สมัครมา เราจะตรวจสอบและปลดล็อกให้

หากทำตามแล้วยังไม่ได้ผล แจ้งเพิ่มได้เลยครับ เราจะดำเนินการให้จนแก้ไขสิ้นสุด`;

function priorityRank(p: string): number {
  const u = (p || '').toUpperCase();
  if (u === 'URGENT') return 0;
  if (u === 'HIGH') return 1;
  if (u === 'MEDIUM') return 2;
  if (u === 'LOW') return 3;
  return 2;
}

/** Sentiment สำหรับเรียงคิว: ค่าต่ำ = ลูกค้าหงุดหงิดมากกว่า (ดูก่อน) — ใช้ค่าจาก backend หรือประมาณจากหัวข้อ */
function effectiveSentiment(t: SupportTicketRow): { label: string; score: number } {
  if (t.sentiment_label != null && t.sentiment_score != null && !Number.isNaN(Number(t.sentiment_score))) {
    return { label: String(t.sentiment_label), score: Number(t.sentiment_score) };
  }
  const text = `${t.subject} ${t.category} ${t.source || ''}`.toLowerCase();
  let score = 0.5;
  const neg = ['แย่', 'โกง', 'ร้อง', 'ฟ้อง', 'ไม่พอใจ', 'รอนาน', 'เงิน', 'dispute', 'refund', 'error', 'บั๊ก', 'bug', 'urgent', 'ด่วน'];
  const pos = ['ขอบคุณ', 'ดีมาก', 'สุดยอด', 'ok', 'thanks', 'hello'];
  for (const w of neg) if (text.includes(w)) score -= 0.07;
  for (const w of pos) if (text.includes(w)) score += 0.06;
  if (t.priority === 'URGENT' || t.priority === 'HIGH') score -= 0.08;
  score = Math.max(0, Math.min(1, score));
  let label = 'neutral';
  if (score < 0.38) label = 'negative';
  else if (score > 0.62) label = 'positive';
  return { label, score };
}

function sortOpenTickets(a: SupportTicketRow, b: SupportTicketRow): number {
  if (!!a.isEmergency !== !!b.isEmergency) return a.isEmergency ? -1 : 1;
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const sa = effectiveSentiment(a).score;
  const sb = effectiveSentiment(b).score;
  if (sa !== sb) return sa - sb;
  return new Date(a.createdAt || a.lastUpdated).getTime() - new Date(b.createdAt || b.lastUpdated).getTime();
}

const CANNED_REPLY_403 = `สวัสดีครับ สำหรับข้อความ **403 (Forbidden / ไม่มีสิทธิ์)**

**กรณีทั่วไป:**
• ตรวจสอบว่าเข้าสู่ระบบแล้ว และบัญชีไม่ถูกระงับ
• ลองออกจากระบบแล้วเข้าสู่ระบบใหม่

**กรณี "เงินถูกล็อก" / ปล่อยเงินไม่ได้:**
• ถ้ามีการยื่น Dispute งานนั้น ระบบจะล็อกเงินไว้จนกว่าแอดมินจะตัดสิน
• รอทีมงานพิจารณา Dispute (24–48 ชม.) แล้วสถานะจะอัปเดต

ถ้าเป็นกรณีอื่น แจ้งรายละเอียด (เช่น หน้าที่เจอ งานที่เกี่ยวข้อง) เราจะตรวจและแก้ให้จนสิ้นสุดครับ`;

export interface SupportTicketViewProps {
  /** ลดความสูงเมื่อฝังใน Dashboard (มีแท็บ + banner ด้านบน) */
  embeddedInDashboard?: boolean;
  /** เปิด User Management โฟกัส user นี้ (จากตั๋ว) */
  onOpenUserInAdmin?: (userId: string) => void;
}

export const SupportTicketView: React.FC<SupportTicketViewProps> = ({ embeddedInDashboard = false, onOpenUserInAdmin }) => {
  const [allTickets, setAllTickets] = useState<SupportTicketRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** AI Toggle: true = น้องรักษ์ตอบอัตโนมัติเมื่อ User ส่ง + Admin ส่งเป็น BOT, false = Manual */
  const [aiMode, setAiMode] = useState(false);
  /** ข้อความที่ Admin บันทึกเป็น Best Answer แล้ว (เพื่อแสดงดาวสีเหลืองถาวร) */
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  /** Toast */
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Knowledge Saved');
  /** Knowledge Base Modal */
  const [kbOpen, setKbOpen] = useState(false);
  const [kbItems, setKbItems] = useState<FaqKnowledgeItem[]>([]);
  const [kbDrafts, setKbDrafts] = useState<Array<{ id: string; question: string; draft_answer: string; category: string; created_at: string }>>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<{ full_name?: string; email?: string; phone?: string } | null>(null);
  /** Shadow Mode: เก็บ draft ล่าสุดจาก AI Suggest เพื่อบันทึก learning เมื่อ Admin แก้ก่อนส่ง */
  const [lastAiSuggestion, setLastAiSuggestion] = useState<string | null>(null);
  /** Three-way: ส่งในชื่อ Verified Pro (หลังเชิญแล้ว) */
  const [sendAsProvider, setSendAsProvider] = useState(false);
  const [invitingPro, setInvitingPro] = useState(false);
  const [draftFaqOnResolve, setDraftFaqOnResolve] = useState(false);
  const [faqDraftLoading, setFaqDraftLoading] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [promotingDraftId, setPromotingDraftId] = useState<string | null>(null);

  const { messages, fetchMessages, messagesEndRef } = useChatMessages(selectedTicketId, getAdminToken);

  const fetchKb = useCallback(async () => {
    setKbLoading(true);
    try {
      const [res, drafts] = await Promise.all([
        getFaqKnowledge(),
        listKnowledgeDrafts(30).catch(() => ({ items: [] })),
      ]);
      setKbItems(res.items || []);
      setKbDrafts(drafts.items || []);
    } catch {
      setKbItems([]);
      setKbDrafts([]);
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kbOpen) fetchKb();
  }, [kbOpen, fetchKb]);

  // โหลด KB เมื่อเปิดหน้า Support (เพื่อ sync ดาวกับข้อความที่เคยบันทึก)
  useEffect(() => {
    fetchKb();
  }, [fetchKb]);

  // Sync saved state: ถ้า message ตรงกับ faq item ให้แสดงดาวสีเหลือง
  useEffect(() => {
    if (kbItems.length === 0) return;
    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      for (let idx = 0; idx < messages.length; idx++) {
        const msg = messages[idx];
        if (msg.sender !== 'ADMIN') continue;
        const prevUserMsg = [...messages].slice(0, idx).reverse().find((m) => m.sender === 'USER');
        const hasMatch = kbItems.some(
          (faq) =>
            faq.best_answer.trim() === msg.message.trim() &&
            (!prevUserMsg || faq.question.trim() === prevUserMsg.message.trim())
        );
        if (hasMatch) next.add(msg.id);
      }
      return next;
    });
  }, [kbItems, messages]);

  const openTickets = allTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  const resolvedTickets = allTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
  const tickets = statusFilter === 'OPEN'
    ? [...openTickets].sort(sortOpenTickets)
    : [...resolvedTickets].sort((a, b) => new Date(b.lastUpdated || b.createdAt).getTime() - new Date(a.lastUpdated || a.createdAt).getTime());

  const queueKpis = useMemo(() => {
    const open = allTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
    const urgent = open.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length;
    const aiOn = open.filter((t) => t.ai_mode_enabled).length;
    const neg = open.filter((t) => effectiveSentiment(t).label === 'negative').length;
    return { open: open.length, urgent, aiOn, neg };
  }, [allTickets]);
  const openCount = openTickets.length;
  const resolvedCount = resolvedTickets.length;
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  useEffect(() => {
    if (selectedTicket) setAiMode(!!selectedTicket.ai_mode_enabled);
  }, [selectedTicket?.id, selectedTicket?.ai_mode_enabled]);

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
      const openSorted = [...openList].sort(sortOpenTickets);
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

  useEffect(() => {
    if (!getAdminToken()) return;
    const origin = getAdminSocketOrigin();
    if (!origin) return;
    const socket: Socket = io(origin, { path: '/socket.io', transports: ['websocket', 'polling'] });
    const join = () => {
      const t = getAdminToken();
      if (t) socket.emit('joinAdminSupport', { token: t });
    };
    socket.on('connect', join);
    const bump = () => {
      getSupportTickets()
        .then((res) => {
          const list = res.tickets || [];
          setAllTickets(list);
        })
        .catch(() => {});
    };
    socket.on('support_event', bump);
    return () => {
      socket.off('connect', join);
      socket.off('support_event', bump);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setLastAiSuggestion(null);
    setSendAsProvider(false);
  }, [selectedTicketId]);

  // โหลดข้อความ + Polling แบบ Realtime — ใช้ useChatMessages hook (รองรับ WebSocket ในอนาคต)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedTicketId) return;
    if (sendAsProvider && !aiMode && !selectedTicket?.invited_provider_id) {
      setError('กดเชิญ Verified Pro ก่อน แล้วค่อยส่งในชื่อ Pro');
      return;
    }
    const final = messageInput.trim();
    setSending(true);
    try {
      await replySupportTicket(selectedTicketId, final, aiMode, !aiMode && sendAsProvider);
      if (!aiMode && lastAiSuggestion && final !== lastAiSuggestion.trim()) {
        postSupportLearningFeedback({
          ticket_id: selectedTicketId,
          ai_suggestion: lastAiSuggestion,
          admin_final: final,
        }).catch(() => {});
      }
      setLastAiSuggestion(null);
      setMessageInput('');
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const handleInviteProvider = async () => {
    if (!selectedTicketId) return;
    setInvitingPro(true);
    setError(null);
    try {
      const res = await inviteSupportProvider(selectedTicketId);
      setAllTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicketId
            ? { ...t, invited_provider_id: res.invited_provider_id, invited_provider_name: res.invited_provider_name }
            : t
        )
      );
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || 'เชิญ Verified Pro ไม่สำเร็จ');
    } finally {
      setInvitingPro(false);
    }
  };

  const handleGenerateFaqDraft = async () => {
    if (!selectedTicketId) return;
    setFaqDraftLoading(true);
    setError(null);
    try {
      await generateSupportFaqDraft(selectedTicketId);
      setToastMessage('บันทึก FAQ draft ลง knowledge_base_drafts แล้ว');
      setToastVisible(true);
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || 'สร้าง FAQ draft ไม่สำเร็จ');
    } finally {
      setFaqDraftLoading(false);
    }
  };

  const handleAddMediaUrl = async () => {
    if (!selectedTicketId || !mediaUrlInput.trim()) return;
    setMediaSaving(true);
    setError(null);
    try {
      await addSupportTicketMediaUrl(selectedTicketId, { url: mediaUrlInput.trim(), type: 'image' });
      setMediaUrlInput('');
      await fetchTickets();
      setTimeout(() => fetchTickets(), 4000);
    } catch (e: any) {
      setError(e?.message || 'แนบลิงก์มีเดียไม่สำเร็จ');
    } finally {
      setMediaSaving(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedTicketId) return;
    try {
      if (draftFaqOnResolve) {
        setFaqDraftLoading(true);
        try {
          await generateSupportFaqDraft(selectedTicketId);
        } catch (e: any) {
          setError(e?.message || 'สร้าง FAQ draft ไม่สำเร็จ — ยังไม่ปิดตั๋ว');
          setFaqDraftLoading(false);
          return;
        } finally {
          setFaqDraftLoading(false);
        }
      }
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

  const handleAssignMe = async () => {
    if (!selectedTicketId) return;
    setError(null);
    try {
      await patchSupportTicket(selectedTicketId, { assignToMe: true });
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || 'มอบหมายไม่สำเร็จ');
    }
  };

  const handleWaitingOnChange = async (v: string) => {
    if (!selectedTicketId) return;
    setError(null);
    try {
      await patchSupportTicket(selectedTicketId, { waitingOn: v });
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || 'อัปเดตป้ายไม่สำเร็จ');
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedTicketId) return;
    setAiLoading(true);
    try {
      const res = await getSupportAiSuggestion(selectedTicketId);
      const s = res.suggestion || '';
      setMessageInput(s);
      setLastAiSuggestion(s || null);
    } catch {
      const fallback = 'สวัสดีครับ ขอบคุณที่ติดต่อเรา ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ';
      setMessageInput(fallback);
      setLastAiSuggestion(fallback);
    } finally {
      setAiLoading(false);
    }
  };

  const shellClass = embeddedInDashboard
    ? 'flex flex-col gap-4 min-h-[calc(100vh-280px)]'
    : 'flex flex-col gap-4 h-[calc(100vh-140px)]';

  return (
    <div className={shellClass}>
      {/* Executive / Ops strip — ให้ผู้บริหารเห็นภาพรวมว่า AI + ทีมรับมือได้ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 shrink-0">
        <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Sparkles size={12} className="text-indigo-500" /> Minnie + Help Center
          </p>
          <p className="text-lg font-bold text-slate-800 mt-0.5">AI บรรทัดแรก</p>
          <p className="text-[11px] text-slate-500">เชื่อม KB อัตโนมัติ 24 ชม.</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500">คิวเปิด</p>
          <p className="text-lg font-bold text-indigo-700">{queueKpis.open}</p>
          <p className="text-[11px] text-slate-500">รอแอดมิน / AI</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-rose-700">ด่วน / High</p>
          <p className="text-lg font-bold text-rose-800">{queueKpis.urgent}</p>
          <p className="text-[11px] text-rose-600/90">Priority สูงสุดก่อน</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-amber-800">Sentiment เสี่ยง</p>
          <p className="text-lg font-bold text-amber-900">{queueKpis.neg}</p>
          <p className="text-[11px] text-amber-800/90">ประมาณจากข้อความ</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-emerald-800 flex items-center gap-1">
            <Bot size={12} /> AI mode เปิด
          </p>
          <p className="text-lg font-bold text-emerald-900">{queueKpis.aiOn}</p>
          <p className="text-[11px] text-emerald-800/90">ตั๋วที่ปล่อยบอทตอบ</p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 flex-col lg:flex-row">
      {/* ========== ฝั่งซ้าย: Visual queue (ตาราง) ========== */}
      <div className={`flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden shrink-0 ${embeddedInDashboard ? 'w-full xl:w-[min(100%,520px)] xl:max-h-[55vh]' : 'w-full max-w-xl xl:max-w-[440px]'}`}>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 mb-1">Ticket queue</h3>
          <p className="text-[11px] text-slate-500 mb-2">เรียง: Priority → Sentiment (ลูกค้าไม่พอใจก่อน) → เวลารอ</p>
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
        <div className="overflow-auto flex-1">
          {loading && tickets.length === 0 && (
            <div className="p-4 text-slate-500 text-sm">กำลังโหลด...</div>
          )}
          {!loading && tickets.length === 0 && (
            <div className="p-4 text-slate-500 text-sm">ไม่มีตั๋วในกลุ่มนี้</div>
          )}
          {tickets.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0 z-[1] border-b border-slate-200">
                <tr>
                  <th className="px-2 py-2 font-semibold text-slate-600 w-10">#</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Pri</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Sentiment</th>
                  <th className="px-2 py-2 font-semibold text-slate-600 min-w-[120px]">หัวข้อ</th>
                  <th className="px-2 py-2 font-semibold text-slate-600 hidden sm:table-cell">User</th>
                  <th className="px-2 py-2 font-semibold text-slate-600 hidden md:table-cell">AI</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, index) => {
                  const queueNum = statusFilter === 'OPEN' ? index + 1 : index + 1;
                  const sent = effectiveSentiment(ticket);
                  const sentCls =
                    sent.label === 'negative'
                      ? 'bg-rose-100 text-rose-700'
                      : sent.label === 'positive'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600';
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`cursor-pointer border-b border-slate-50 hover:bg-indigo-50/80 ${selectedTicketId === ticket.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                    >
                      <td className="px-2 py-2 font-mono text-indigo-600 font-bold">{queueNum}</td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                            ticket.priority === 'URGENT'
                              ? 'bg-rose-100 text-rose-600'
                              : ticket.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${sentCls}`}>
                          {sent.label} <span className="opacity-70">({sent.score.toFixed(2)})</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 max-w-[200px]">
                        <div className="font-semibold text-slate-800 truncate flex items-center gap-1" title={ticket.subject}>
                          {ticket.isEmergency && <AlertTriangle size={14} className="text-red-600 shrink-0" aria-label="ฉุกเฉิน" />}
                          {ticket.subject}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{ticket.category}{ticket.source === 'dispute' ? ' · Dispute' : ''}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-600 hidden sm:table-cell truncate max-w-[100px]" title={ticket.userId}>{ticket.userId}</td>
                      <td className="px-2 py-2 hidden md:table-cell">{ticket.ai_mode_enabled ? <span className="text-emerald-600 font-bold">ON</span> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========== ฝั่งขวา: Chat Window (เนื้อหาแชท) ========== */}
      <div className={`flex-1 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden min-h-0 ${embeddedInDashboard ? 'min-h-[320px] xl:max-h-[70vh]' : ''}`}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/30 flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              {selectedTicket?.subject ?? 'เลือกตั๋ว'}
              {selectedTicket && (
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-xs font-normal text-slate-600">{selectedTicket.id}</span>
              )}
            </h3>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Clock size={12} />{' '}
              SLA:{' '}
              {selectedTicket?.slaDueAt
                ? `ครบกำหนดตอบ ${new Date(selectedTicket.slaDueAt).toLocaleString('th-TH')}`
                : '—'}
              {selectedTicket?.firstAdminReplyAt && (
                <span className="text-emerald-700">
                  {' '}
                  · ตอบแรก: {new Date(selectedTicket.firstAdminReplyAt).toLocaleString('th-TH')}
                </span>
              )}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              อัปเดตทันทีผ่าน Socket.IO + polling สำรอง ~12 วินาที
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              PII safety: เลขบัตร / เบอร์ / อีเมล ถูก mask ก่อนส่งเข้า AI ที่เซิร์ฟเวอร์
            </p>
            {selectedTicket?.isEmergency && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
                <AlertTriangle size={14} /> ฉุกเฉิน / ความปลอดภัย
                {selectedTicket.emergencyKind ? ` · ${selectedTicket.emergencyKind}` : ''}
              </div>
            )}
            {selectedTicket?.invited_provider_id && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                <Briefcase size={14} /> Three-way: {selectedTicket.invited_provider_name || 'Verified Pro'} ในแชทแล้ว
              </div>
            )}
            {selectedTicket && (
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                <span>{(selectedUserDetail?.full_name || selectedTicket?.full_name || selectedTicket?.userId) ?? '—'}</span>
                {(selectedUserDetail?.email || selectedTicket?.email) && (
                  <span className="flex items-center gap-1"><Mail size={12} /> {selectedUserDetail?.email || selectedTicket?.email}</span>
                )}
                {(selectedUserDetail?.phone || selectedTicket?.phone) && (
                  <span className="flex items-center gap-1"><Phone size={12} /> {selectedUserDetail?.phone || selectedTicket?.phone}</span>
                )}
              </div>
            )}
            {selectedTicket && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => void handleAssignMe()}
                  className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  disabled={!selectedTicketId}
                >
                  รับเคสนี้
                </button>
                <label className="flex items-center gap-1 text-slate-600">
                  ป้ายรอ
                  <select
                    className="border border-slate-200 rounded px-1 py-0.5 text-xs bg-white"
                    value={selectedTicket.waitingOn || 'none'}
                    onChange={(e) => void handleWaitingOnChange(e.target.value)}
                  >
                    <option value="none">ดำเนินการ</option>
                    <option value="customer">รอลูกค้า</option>
                    <option value="internal">รอภายใน</option>
                  </select>
                </label>
                {selectedTicket.assignedToName && (
                  <span className="text-slate-500">ผู้รับผิดชอบ: {selectedTicket.assignedToName}</span>
                )}
                {onOpenUserInAdmin && selectedTicket.userId && selectedTicket.userId !== 'anonymous' && (
                  <button
                    type="button"
                    onClick={() => onOpenUserInAdmin(selectedTicket.userId)}
                    className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline"
                  >
                    <ExternalLink size={12} /> User Management
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={!selectedTicketId || aiLoading}
              title={!aiMode ? 'Draft from chat + job context — review then Send' : 'Generate reply from Minnie / KB'}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-50 ${
                !aiMode ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-purple-50 border-purple-100 text-purple-700'
              }`}
            >
              <Zap size={16} />
              {aiLoading ? 'Generating…' : 'AI Suggest Response'}
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
              onClick={() => setKbOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold"
              title="ดูคลังความรู้ที่ Admin เทรนไว้"
            >
              <BookOpen size={14} /> ดูคลังความรู้ AI
            </button>
            <button
              type="button"
              onClick={handleInviteProvider}
              disabled={!selectedTicketId || !selectedTicket?.jobId || invitingPro || !!selectedTicket?.invited_provider_id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 text-amber-900 text-xs font-bold disabled:opacity-50"
              title={selectedTicket?.jobId ? 'เชิญผู้ให้บริการที่รับงานนี้เข้าแชท (ข้อพิพาท)' : 'ต้องมีงานผูกกับตั๋ว (เช่น Dispute)'}
            >
              <UserPlus size={14} /> {invitingPro ? 'กำลังเชิญ…' : 'เชิญ Verified Pro'}
            </button>
            <button
              type="button"
              onClick={handleGenerateFaqDraft}
              disabled={!selectedTicketId || faqDraftLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 text-violet-900 text-xs font-bold disabled:opacity-50"
              title="Minnie สรุปบทสนทนาเป็น FAQ → knowledge_base_drafts"
            >
              <Sparkles size={14} /> {faqDraftLoading ? 'กำลังสร้าง…' : 'Generate FAQ Draft'}
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none max-w-[140px]">
              <input
                type="checkbox"
                checked={draftFaqOnResolve}
                onChange={(e) => setDraftFaqOnResolve(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              Draft as FAQ ตอนปิดตั๋ว
            </label>
            <button
              type="button"
              onClick={handleMarkResolved}
              disabled={!selectedTicketId || faqDraftLoading}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} /> Mark Resolved
            </button>
          </div>
        </div>

        {selectedTicketId && (
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">AI Summary (รูป / สื่อ)</p>
            {selectedTicket?.ai_summary ? (
              <p className="text-xs text-slate-800 whitespace-pre-wrap border border-slate-200 rounded-lg p-2 bg-white">{selectedTicket.ai_summary}</p>
            ) : (
              <p className="text-[11px] text-slate-400">ยังไม่มี — แนบ URL รูปด้านล่าง (Vision) หรือสร้าง FAQ draft หลังแก้เคส</p>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <input
                type="url"
                value={mediaUrlInput}
                onChange={(e) => setMediaUrlInput(e.target.value)}
                placeholder="https://… รูป (jpg/png/webp) สาธารณะ"
                className="flex-1 min-w-[200px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddMediaUrl}
                disabled={!mediaUrlInput.trim() || mediaSaving}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {mediaSaving ? 'กำลังแนบ…' : 'แนบ & สรุปภาพ'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {!selectedTicketId && (
            <div className="text-center text-slate-500 py-12">เลือกตั๋วจากรายการด้านซ้าย</div>
          )}
          {selectedTicketId && messages.length === 0 && !loading && (
            <div className="text-center text-slate-500 py-12">ยังไม่มีข้อความ</div>
          )}
          {messages.map((msg, idx) => {
            const prevUserMsg = [...messages].slice(0, idx).reverse().find((m) => m.sender === 'USER');
            const questionForFaq =
              msg.sender === 'ADMIN' || msg.sender === 'BOT' || msg.sender === 'PROVIDER'
                ? (prevUserMsg?.message || selectedTicket?.subject || '').trim() || undefined
                : undefined;
            return (
              <MessageBubble
                key={msg.id}
                sender={msg.sender}
                message={msg.message}
                timestamp={msg.timestamp}
                questionForFaq={questionForFaq}
                ticketId={selectedTicketId ?? undefined}
                saved={savedMessageIds.has(msg.id)}
                source={msg.source}
                faqScore={msg.faqScore}
                onSaveAsBestAnswer={async (q, a, tid) => {
                  try {
                    await saveSupportBestAnswer({ question: q, best_answer: a, ticket_id: tid });
                    setSavedMessageIds((prev) => new Set(prev).add(msg.id));
                    setToastMessage('Knowledge Saved');
                    setToastVisible(true);
                    fetchKb();
                  } catch (err) {
                    setError((err as Error)?.message || 'บันทึกลงคลังความรู้ไม่สำเร็จ');
                  }
                }}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <AiModeToggle
              enabled={aiMode}
              onChange={async (enabled) => {
                if (!selectedTicketId) return;
                setAiMode(enabled);
                try {
                  await setSupportTicketAiMode(selectedTicketId, enabled);
                  setAllTickets((prev) => prev.map((t) => (t.id === selectedTicketId ? { ...t, ai_mode_enabled: enabled } : t)));
                } catch {
                  setAiMode(!enabled);
                }
              }}
              disabled={!selectedTicketId}
            />
            {!aiMode && selectedTicketId && (
              <span className="text-xs text-slate-500">
                Manual: กด <strong>AI Suggest Response</strong> แล้วตรวจทานก่อน Send — ระบบบันทึกความต่างลง <strong>learning_feedback</strong> อัตโนมัติ
              </span>
            )}
          </div>
          {!aiMode && selectedTicket?.invited_provider_id && (
            <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendAsProvider}
                onChange={(e) => setSendAsProvider(e.target.checked)}
                className="rounded border-amber-400 text-amber-700 focus:ring-amber-500"
              />
              ส่งในชื่อ Verified Pro (three-way chat)
            </label>
          )}
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={!aiMode ? "Type a reply, or use AI Suggest Response (Help Center + context)" : "พิมพ์คำตอบ..."}
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
      </div>

      {/* ========== Knowledge Base Modal ========== */}
      {kbOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setKbOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <BookOpen size={20} /> คลังความรู้ AI
              </h3>
              <button
                type="button"
                onClick={() => setKbOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {kbLoading && <p className="text-slate-500 text-sm">กำลังโหลด...</p>}
              {!kbLoading && kbItems.length === 0 && kbDrafts.length === 0 && (
                <p className="text-slate-500 text-sm">ยังไม่มีข้อมูลในคลังความรู้ กดปุ่มดาว ⭐ที่ข้อความ Admin หรือใช้ Generate FAQ Draft หลังแก้เคส</p>
              )}
              {!kbLoading && kbDrafts.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-sm text-violet-800 mb-2 flex items-center gap-1">
                    <Sparkles size={16} /> FAQ Drafts (knowledge_base_drafts)
                  </h4>
                  <div className="space-y-3">
                    {kbDrafts.map((d) => (
                      <div key={d.id} className="p-3 rounded-lg border border-violet-200 bg-violet-50/50">
                        <p className="text-xs text-violet-700 mb-0.5">คำถาม</p>
                        <p className="text-sm text-slate-800">{d.question}</p>
                        <p className="text-xs text-violet-700 mt-2 mb-0.5">คำตอบ (draft)</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{d.draft_answer}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                          <p className="text-[10px] text-slate-400 mb-0">{d.category} • {d.created_at ? new Date(d.created_at).toLocaleString('th-TH') : ''}</p>
                          <button
                            type="button"
                            disabled={promotingDraftId === d.id}
                            onClick={async () => {
                              setError(null);
                              setPromotingDraftId(d.id);
                              try {
                                await promoteKnowledgeDraft(d.id);
                                setToastMessage('One-Click Promote: เข้าคลังจริง (faq_knowledge) แล้ว');
                                setToastVisible(true);
                                await fetchKb();
                              } catch (e: unknown) {
                                setError((e as Error)?.message || 'โปรโมท draft ไม่สำเร็จ');
                              } finally {
                                setPromotingDraftId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="บันทึก draft เข้า faq_knowledge ในคลิกเดียว"
                          >
                            <Rocket size={14} />
                            {promotingDraftId === d.id ? 'กำลังโปรโมท…' : 'One-Click Promote'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!kbLoading && kbItems.length > 0 && (
                <div className="space-y-4">
                  {kbItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50/50"
                    >
                      <p className="text-xs text-slate-500 mb-1">คำถาม</p>
                      <p className="text-sm text-slate-800 mb-1 truncate">{item.question}</p>
                      <p className="text-xs text-slate-500 mb-1">คำตอบ</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{item.best_answer}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-slate-400">{item.category} • {item.created_at ? new Date(item.created_at).toLocaleDateString('th-TH') : ''}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('ลบรายการนี้จากคลังความรู้?')) return;
                            await deleteFaqKnowledge(item.id);
                            fetchKb();
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                          title="ลบ"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
};
