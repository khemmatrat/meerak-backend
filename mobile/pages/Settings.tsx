
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { App } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useMobileAppConfig } from '../context/MobileAppConfigContext';
import { MockApi } from '../services/mockApi';
import { subscribeSupportTicketRoom } from '../services/supportSocket';
import { fetchBrandAdviserRules, type BrandAdviserRules } from '../services/brandAdviserRulesService';
import { verifyDocumentWithOCR, fileToBase64, type DocumentType } from '../services/documentVerifyService';
import { uploadDocumentToSecure, fileToBlobUrl, revokeBlobUrl, isBlobUrl } from '../services/secureDocumentUploadService';
import {
  companyLegal,
  getCompanyLineOpenUrl,
  getLineContactListSubtitle,
  hasLineContactInApp,
} from "../config/companyLegal";
import { User, Bell, Lock, HelpCircle, Globe, LogOut, ChevronRight, Trash2, Shield, FileText, X, MessageSquare, Mail, Phone, Edit, ToggleLeft, ToggleRight, CreditCard, Plus, Building, Smartphone, Send, Bot, Info, Heart, Zap, MapPin, IdCard, Car, Camera, Upload, CheckCircle, Briefcase, Moon, Palette, Award, RotateCcw, Loader2, Sailboat, AlertCircle, Wifi, Download, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { VIPBadge } from '../components/VIPBadge';
import {
  BrandAdviserBadge,
  BrandAdviserSuspendBanner,
  BrandAdviserProgramOffNotice,
  BrandAdviserReputationHint,
} from '../components/BrandAdviserBadge';
import { CoachConnectionSection } from '../components/CoachConnection';
import { BankAccount } from '../types';

function parseKycVehiclesJson(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** PDPA: แสดงเลขบัตรแบบปิดบางส่วน (รายการ Settings) */
function maskID(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return "••••";
  if (digits.length <= 9) return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
  return `${digits.slice(0, 3)}•••••${digits.slice(-4)}`;
}

// Theme Card for Personalization
const ThemeCard = ({
  id,
  label,
  desc,
  locked,
  comingSoon,
  currentTheme,
  onSelect,
}: {
  id: "vip-silver" | "vip-gold" | "vip-platinum";
  label: string;
  desc: string;
  locked: boolean;
  comingSoon?: boolean;
  currentTheme: string;
  onSelect: (t: "standard" | "vip-silver" | "vip-gold" | "vip-platinum") => void;
}) => {
  const isDisabled = locked || comingSoon;
  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(id)}
      disabled={isDisabled}
      className={`p-4 rounded-xl border-2 text-left transition-all relative ${
        currentTheme === id && !isDisabled
          ? "border-emerald-500 bg-emerald-50"
          : isDisabled
            ? "border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 text-amber-600 text-[10px] font-bold uppercase">Coming Soon</span>
      )}
      {locked && !comingSoon && (
        <span className="absolute top-2 right-2 text-gray-400" title="สมัคร VIP เพื่อปลดล็อค">
          <Lock size={14} />
        </span>
      )}
      <p className="font-bold text-gray-800 text-sm">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{comingSoon ? "Coming Soon..." : desc}</p>
    </button>
  );
};

// Reusable Components within file
const Section = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
        </div>
        <div className="divide-y divide-gray-50">
            {children}
        </div>
    </div>
);

const Item = ({ icon: Icon, label, onClick, value, danger, toggle, onToggle }: any) => (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left relative">
        <div className="flex items-center">
            <Icon size={20} className={`mr-3 ${danger ? 'text-red-500' : 'text-gray-400'}`} />
            <span className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
        </div>
        <div className="flex items-center">
            {toggle !== undefined ? (
                <div onClick={(e) => { e.stopPropagation(); onToggle && onToggle(); }} className="cursor-pointer text-emerald-600">
                    {toggle ? <ToggleRight size={32} fill="#10B981" className="text-white" /> : <ToggleLeft size={32} className="text-gray-300" />}
                </div>
            ) : (
                <>
                    {value && <span className="text-sm text-gray-400 mr-2">{value}</span>}
                    <ChevronRight size={16} className="text-gray-300" />
                </>
            )}
        </div>
    </button>
);

const Modal = ({ isOpen, onClose, title, children }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="settings-modal-content bg-white rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                    <h3 className="font-bold text-gray-800">{title}</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- Support Chat (รับค่าจริงจาก Backend + AI ตอบอัตโนมัติ) ---
const EMERGENCY_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'sexual_harassment', label: 'คุกคามทางเพศ / Sexual harassment' },
  { value: 'physical_assault', label: 'ทำร้ายร่างกาย / Physical assault' },
  { value: 'life_threatening', label: 'อันตรายถึงชีวิต / Life-threatening' },
  { value: 'natural_disaster', label: 'ภัยธรรมชาติรุนแรง / Severe natural disaster' },
  { value: 'other_safety', label: 'ความปลอดภัยอื่น (ระบุด้านล่าง)' },
];

const SupportChat = ({
  user: supportUser,
  initialDraft,
  authToken,
}: {
  user?: { name?: string; phone?: string; email?: string } | null;
  initialDraft?: string;
  authToken?: string | null;
}) => {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('meerak_user_id') : null;
    const [messages, setMessages] = useState<{ text: string; isBot: boolean }[]>([
        { text: "สวัสดีครับ! นี่คือระบบช่วยเหลืออัตโนมัติ Meerak ต้องการสอบถามเรื่องอะไรครับ?", isBot: true }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [ticketId, setTicketId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [useBackend, setUseBackend] = useState(true);
    const [emergencyOpen, setEmergencyOpen] = useState(false);
    const [emergencyKind, setEmergencyKind] = useState('life_threatening');
    const [emergencyDetail, setEmergencyDetail] = useState('');
    const [emergencySending, setEmergencySending] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialDraft && initialDraft.trim()) {
            setInput(initialDraft.trim());
        }
    }, [initialDraft]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    useEffect(() => {
        if (!userId || !useBackend) return;
        let cancelled = false;
        (async () => {
            try {
                const { tickets } = await MockApi.getMySupportTickets(userId);
                const open = (tickets || []).find((t: any) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
                if (cancelled || !open) return;
                setTicketId(open.id);
                const { messages: msgs } = await MockApi.getSupportTicketMessages(open.id);
                if (cancelled) return;
                setMessages((msgs || []).map((m: any) => ({
                    text: m.message,
                    isBot: m.sender === 'BOT' || m.sender === 'ADMIN'
                })));
                setLoadError(null);
            } catch (e) {
                if (!cancelled) setLoadError(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId, useBackend]);

    useEffect(() => {
        if (!ticketId || !useBackend || !authToken) return;
        return subscribeSupportTicketRoom(ticketId, authToken, async () => {
            try {
                const { messages: msgs } = await MockApi.getSupportTicketMessages(ticketId);
                setMessages((msgs || []).map((m: any) => ({
                    text: m.message,
                    isBot: m.sender === 'BOT' || m.sender === 'ADMIN',
                })));
            } catch {
                /* ignore */
            }
        });
    }, [ticketId, useBackend, authToken]);

    const reloadMessages = async (tid: string) => {
        const { messages: msgs } = await MockApi.getSupportTicketMessages(tid);
        setMessages((msgs || []).map((m: any) => ({ text: m.message, isBot: m.sender === 'BOT' || m.sender === 'ADMIN' })));
    };

    const handleSend = async (text: string) => {
        if (!text.trim()) return;
        setMessages(prev => [...prev, { text, isBot: false }]);
        setInput('');
        setIsTyping(true);
        setLoadError(null);

        try {
            if (useBackend) {
                if (!ticketId) {
                    const { ticket } = await MockApi.createSupportTicket({
                        userId: userId || undefined,
                        message: text,
                        subject: text.slice(0, 80),
                        category: 'General',
                        email: supportUser?.email,
                        full_name: supportUser?.name,
                        phone: supportUser?.phone
                    });
                    setTicketId(ticket.id);
                    await reloadMessages(ticket.id);
                } else {
                    await MockApi.sendSupportMessage(ticketId, text);
                    await reloadMessages(ticketId);
                }
            } else {
                const reply = await MockApi.getBotResponse(text);
                setMessages(prev => [...prev, { text: reply, isBot: true }]);
            }
        } catch (e) {
            setLoadError('ไม่สามารถส่งได้ กรุณาลองใหม่หรือติดต่อ support@aqond.com');
            const reply = await MockApi.getBotResponse(text);
            setMessages(prev => [...prev, { text: reply, isBot: true }]);
        } finally {
            setIsTyping(false);
        }
    };

    const submitEmergency = async () => {
        const detail = emergencyDetail.trim();
        if (!detail || !userId) return;
        setEmergencySending(true);
        setLoadError(null);
        try {
            const subject = `[ฉุกเฉิน] ${EMERGENCY_KIND_OPTIONS.find((k) => k.value === emergencyKind)?.label || emergencyKind}`;
            const message = `[EMERGENCY:${emergencyKind}] ${detail}`;
            const { ticket } = await MockApi.createSupportTicket({
                userId: userId || undefined,
                subject: subject.slice(0, 80),
                message,
                category: 'General',
                email: supportUser?.email,
                full_name: supportUser?.name,
                phone: supportUser?.phone,
                is_emergency: true,
                emergency_kind: emergencyKind,
            });
            setTicketId(ticket.id);
            setEmergencyOpen(false);
            setEmergencyDetail('');
            await reloadMessages(ticket.id);
            setMessages((prev) => [
                ...prev,
                {
                    text: 'แจ้งฉุกเฉินถูกส่งถึงทีมแล้ว — หากอยู่ในอันตรายทันที โปรดโทร 191 หรือ 1669',
                    isBot: true,
                },
            ]);
        } catch {
            setLoadError('ส่งแจ้งฉุกเฉินไม่สำเร็จ — โปรดโทร 191 / 1669 หากเป็นเหตุเร่งด่วน');
        } finally {
            setEmergencySending(false);
        }
    };

    const quickReplies = [
      "แจ้งปัญหา 403 Forbidden",
      "แจ้งปัญหา 429 Rate Limit",
      "เงินไม่เข้า",
      "งานหายไปไหน?",
      "KYC ไม่ผ่าน",
      "ถอนเงินยังไง",
    ];

    return (
        <div className="relative flex flex-col h-[400px]">
            {emergencyOpen && (
                <div className="absolute inset-0 z-30 flex flex-col rounded-lg bg-white p-3 shadow-lg ring-1 ring-red-200">
                    <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
                        <div className="text-xs text-gray-800 space-y-1">
                            <p className="font-semibold text-red-800">แจ้งเหตุความปลอดภัย / ฉุกเฉิน</p>
                            <p>ใช้เมื่อตกอยู่ในอันตรายจริง (เช่น ถูกคุกคาม ถูกทำร้าย อันตรายถึงชีวิต หรือภัยธรรมชาติรุนแรง)</p>
                            <p className="text-red-700 font-medium">AQOND ไม่ใช่เลขฉุกเฉิน — หากต้องการความช่วยเหลือทันที โทร 191 (ตำรวจ) หรือ 1669 (แพทย์ฉุกเฉิน)</p>
                        </div>
                    </div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">ประเภทเหตุ</label>
                    <select
                        className="mb-2 w-full rounded border border-gray-300 text-sm py-1.5 px-2"
                        value={emergencyKind}
                        onChange={(e) => setEmergencyKind(e.target.value)}
                    >
                        {EMERGENCY_KIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <textarea
                        className="mb-2 w-full flex-1 min-h-[72px] rounded border border-gray-300 text-sm p-2"
                        placeholder="อธิบายสถานการณ์ สถานที่ และสิ่งที่เกิดขึ้น (บังคับ)"
                        value={emergencyDetail}
                        onChange={(e) => setEmergencyDetail(e.target.value)}
                    />
                    <div className="flex gap-2 mt-auto">
                        <button
                            type="button"
                            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
                            onClick={() => { setEmergencyOpen(false); setEmergencyDetail(''); }}
                            disabled={emergencySending}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={!emergencyDetail.trim() || emergencySending}
                            onClick={() => void submitEmergency()}
                        >
                            {emergencySending ? 'กำลังส่ง…' : 'ยืนยันส่งแจ้งเตือนทีม'}
                        </button>
                    </div>
                </div>
            )}
            {loadError && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">{loadError}</div>
            )}
            <button
                type="button"
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                onClick={() => setEmergencyOpen(true)}
            >
                <AlertTriangle className="h-4 w-4" />
                ปุ่มฉุกเฉิน — ความปลอดภัย / ชีวิต / ภัยธรรมชาติ
            </button>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.isBot ? 'justify-start' : 'justify-end'}`}>
                        {m.isBot && <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2"><Bot size={16} className="text-blue-600"/></div>}
                        <div className={`px-4 py-2 rounded-2xl text-sm max-w-[80%] ${m.isBot ? 'bg-gray-100 text-gray-800 rounded-tl-none whitespace-pre-wrap' : 'bg-emerald-600 text-white rounded-tr-none'}`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2"><Bot size={16} className="text-blue-600"/></div>
                        <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-tl-none text-gray-400 text-xs animate-pulse">กำลังพิมพ์...</div>
                    </div>
                )}
                <div ref={endRef}></div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                {quickReplies.map(q => (
                    <button key={q} onClick={() => handleSend(q)} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full hover:bg-emerald-100 transition-colors">
                        {q}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <input
                    type="text"
                    className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="พิมพ์คำถามของคุณ..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend(input)}
                />
                <button
                    onClick={() => handleSend(input)}
                    disabled={!input.trim() || isTyping}
                    className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                    <Send size={18} />
                </button>
            </div>
            <div className="mt-2 space-y-1 text-center">
                <a href="mailto:support@aqond.com" className="text-[10px] text-gray-400 hover:text-emerald-600 underline block">
                    อีเมล support@aqond.com (คิวแยกจากตั๋วในแอป — ใช้เมื่อเข้าแอปไม่ได้)
                </a>
            </div>
        </div>
    );
};

export const Settings: React.FC = () => {
  const { user, logout, login, token, refreshUser } = useAuth();
  const { theme, setTheme, setBadgeDisplay, badgeDisplay, restoreDefault, availableVipThemes } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const lineContactUrl = useMemo(() => getCompanyLineOpenUrl(), []);
  const lineContactSubtitle = useMemo(() => getLineContactListSubtitle(), []);
  const showLineContactRow = useMemo(() => hasLineContactInApp(), []);

  // State for Modals
  const [activeModal, setActiveModal] = useState<'profile' | 'password' | 'support' | 'payment_methods' | 'add_payment' | 'about' | 'thai_id' | 'marine_kyc' | 'line_contact' | null>(null);
  const [supportInitialDraft, setSupportInitialDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dataExportLoading, setDataExportLoading] = useState(false);
  /** จาก Android versionName / versionCode — ไม่ใช่ข้อความฮาร์ดโค้ดใน i18n */
  const [nativeAppVersion, setNativeAppVersion] = useState<string | null>(null);

  // Forms Data
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '', bio: '', blood_type: '', allergies: '', emergency_contact: '' });
  const [passwordForm, setPasswordForm] = useState({ old: '', new: '', confirm: '' });
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [paymentForm, setPaymentForm] = useState<{type: 'bank'|'truemoney'|'stripe'|'card', provider_name: string, account_number: string, account_name: string}>({
      type: 'bank',
      provider_name: 'KBANK',
      account_number: '',
      account_name: ''
  });
  
  // Power to the User: Role & Peace Mode
  const [modeStatus, setModeStatus] = useState<{ role: string; is_peace_mode: boolean; peace_mode_until: string | null; is_banned: boolean; provider_available: boolean } | null>(null);
  const [peaceHours, setPeaceHours] = useState<number>(8);

  /** Brand Adviser — จาก backend profile (ไม่ sync ทุกครั้งใน AuthContext) */
  const [baProfile, setBaProfile] = useState<{
    is_brand_adviser?: boolean;
    adviser_status?: string | null;
    brand_adviser_program_enabled?: boolean;
    adviser_reputation_score?: number;
    brand_adviser_suspend_warning?: boolean;
    days_until_suspend_estimate?: number | null;
  } | null>(null);
  const [baRules, setBaRules] = useState<BrandAdviserRules | null>(null);

  // Thai ID Form State — SECURITY: OCR data in React state only; never localStorage.
  // Preview: Blob URL or backend URL. Pending files stored in ref for upload.
  const [thaiIDForm, setThaiIDForm] = useState<{
    national_id: string;
    id_card_front: string | null;
    id_card_back: string | null;
    driver_license_number: string;
    driver_license_photo: string | null;
    driver_license_expiry: string;
    vehicle_license_plate: string;
    vehicle_registration_photo: string | null;
    vehicle_brand: string;
    vehicle_category: 'standard' | 'premium' | null; // From backend only; never set by client
  }>({
    national_id: '',
    id_card_front: null,
    id_card_back: null,
    driver_license_number: '',
    driver_license_photo: null,
    driver_license_expiry: '',
    vehicle_license_plate: '',
    vehicle_registration_photo: null,
    vehicle_brand: '',
    vehicle_category: null
  });
  const [thaiIDOcrVerified, setThaiIDOcrVerified] = useState(false);
  const [thaiIDUploading, setThaiIDUploading] = useState<string | null>(null);
  /** มีแถว kyc_submissions ล่าสุดจาก backend (Wizard) */
  const [kycSubmissionHint, setKycSubmissionHint] = useState<{
    status?: string;
    submittedAt?: string;
  } | null>(null);
  const [marineKYCForm, setMarineKYCForm] = useState<{
    skipper_license_number: string;
    skipper_license_expiry: string;
    skipper_license_photo: string | null;
    boat_registration_number: string;
    boat_brand: string;
    boat_registration_photo: string | null;
  }>({
    skipper_license_number: '',
    skipper_license_expiry: '',
    skipper_license_photo: null,
    boat_registration_number: '',
    boat_brand: '',
    boat_registration_photo: null,
  });
  const [marineKYCUploading, setMarineKYCUploading] = useState<string | null>(null);
  const skipperLicenseRef = useRef<HTMLInputElement>(null);
  const boatRegRef = useRef<HTMLInputElement>(null);
  const marinePendingFilesRef = useRef<Record<string, File>>({});
  const idCardFrontRef = useRef<HTMLInputElement>(null);
  const idCardBackRef = useRef<HTMLInputElement>(null);
  const driverLicenseRef = useRef<HTMLInputElement>(null);
  const vehicleRegRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<Record<string, File>>({});

  useEffect(() => {
      if (user) {
          MockApi.getModeStatus().then(setModeStatus).catch(() => setModeStatus(null));
      }
  }, [user]);

  useEffect(() => {
    void App.getInfo()
      .then((info) => {
        setNativeAppVersion(`${info.version} · build ${info.build}`);
      })
      .catch(() => setNativeAppVersion(null));
  }, []);

  useEffect(() => {
    fetchBrandAdviserRules()
      .then((d) => setBaRules(d.rules))
      .catch(() => {});
  }, []);

  useEffect(() => {
      if (!user?.id) {
        setBaProfile(null);
        return;
      }
      MockApi.getProfile(user.id, { refresh: false })
        .then((p) => {
          setBaProfile({
            is_brand_adviser: p.is_brand_adviser,
            adviser_status: p.adviser_status,
            brand_adviser_program_enabled: p.brand_adviser_program_enabled,
            adviser_reputation_score: p.adviser_reputation_score,
            brand_adviser_suspend_warning: p.brand_adviser_suspend_warning,
            days_until_suspend_estimate: p.days_until_suspend_estimate ?? null,
          });
        })
        .catch(() => setBaProfile(null));
  }, [user?.id]);

  useEffect(() => {
      if (user) {
          setProfileForm({
              name: user.name || '',
              phone: user.phone || '',
              email: user.email || '',
              bio: user.bio || '',
              blood_type: (user as any).blood_type || '',
              allergies: (user as any).allergies || '',
              emergency_contact: (user as any).emergency_contact || ''
          });
          setNotifEnabled(user.notifications_enabled !== false);
      }
  }, [user]);

  /** เปิดศูนย์ช่วยเหลือจากหน้างาน (แจ้งปัญหา) — navigate state: { openSupport: true, supportPrefill?: string } */
  useEffect(() => {
    const st = location.state as { openSupport?: boolean; supportPrefill?: string } | undefined;
    if (!st?.openSupport) return;
    setActiveModal("support");
    if (typeof st.supportPrefill === "string" && st.supportPrefill.trim()) {
      setSupportInitialDraft(st.supportPrefill.trim());
    } else {
      setSupportInitialDraft("");
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);
  
  // Load KYC data when Thai ID modal opens
  useEffect(() => {
      if (activeModal === 'thai_id' && user) {
          loadKYCData();
      }
  }, [activeModal, user]);

  // SECURITY: Cleanup on Thai ID modal close — revoke Blob URLs, clear temp buffers
  const handleThaiIDModalClose = () => {
      const urls = [
          thaiIDForm.id_card_front,
          thaiIDForm.id_card_back,
          thaiIDForm.driver_license_photo,
          thaiIDForm.vehicle_registration_photo
      ].filter(Boolean) as string[];
      urls.forEach(revokeBlobUrl);
      pendingFilesRef.current = {};
      setActiveModal(null);
  };

  const handleMarineKYCModalClose = () => {
      [marineKYCForm.skipper_license_photo, marineKYCForm.boat_registration_photo].filter(Boolean).forEach(revokeBlobUrl);
      marinePendingFilesRef.current = {};
      setActiveModal(null);
  };

  useEffect(() => {
      if (activeModal === 'marine_kyc' && user) {
          setMarineKYCForm({
              skipper_license_number: (user as any).skipper_license_number || '',
              skipper_license_expiry: (user as any).skipper_license_expiry || '',
              skipper_license_photo: (user as any).skipper_license_photo_url || null,
              boat_registration_number: (user as any).boat_registration_number || '',
              boat_brand: (user as any).boat_brand || '',
              boat_registration_photo: (user as any).boat_registration_photo_url || null,
          });
      }
  }, [activeModal, user]);

  const handleMarineKYCFileChange = async (field: 'skipper_license_photo' | 'boat_registration_photo', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) {
      notify('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
      return;
    }
    setMarineKYCUploading(field);
    try {
      const blobUrl = fileToBlobUrl(file);
      marinePendingFilesRef.current[field] = file;
      setMarineKYCForm(prev => ({ ...prev, [field]: blobUrl }));
      notify('อัปโหลดรูปสำเร็จ', 'success');
    } catch {
      notify('อัปโหลดไม่สำเร็จ', 'error');
    } finally {
      setMarineKYCUploading(null);
    }
  };

  // โหลดข้อมูลช่องทางรับเงินล่าสุดเมื่อเปิดโมดอล (ยกเว้นเมื่อเพิ่งบันทึกจาก add_payment)
  useEffect(() => {
      if (activeModal === 'payment_methods' && !skipPaymentRefreshRef.current) {
          refreshUser();
      }
  }, [activeModal, refreshUser]);
  
  // โหลดจากโปรไฟล์ + แถวล่าสุดใน kyc_submissions (Wizard → backend)
  const loadKYCData = async () => {
    if (!user) return;

    try {
      const profile = await MockApi.getProfile(user.id, { refresh: true });

      type LatestKycPack = Awaited<ReturnType<typeof MockApi.getMyLatestKycSubmission>>;
      let sub: LatestKycPack["submission"] = null;
      try {
        const pack = await MockApi.getMyLatestKycSubmission();
        if (pack?.found && pack.submission) sub = pack.submission;
      } catch {
        /* ไม่มีสิทธิ์หรือ endpoint ยังไม่ deploy — ใช้แค่โปรไฟล์ */
      }

      const vehicles = parseKycVehiclesJson(sub?.vehicles_json);
      const v0 = vehicles[0];

      const national_from_profile =
        profile.national_id || profile.kyc_id_card_number || profile.id_card_number || "";
      const national_from_kyc = sub?.id_card_number ? String(sub.id_card_number).replace(/\D/g, "").slice(0, 13) : "";
      const national_id = national_from_kyc || national_from_profile;

      const id_card_front =
        sub?.id_card_front_url ||
        profile.id_card_front_url ||
        profile.kyc_docs?.id_card_front ||
        null;
      const id_card_back =
        sub?.id_card_back_url ||
        profile.id_card_back_url ||
        profile.kyc_docs?.id_card_back ||
        null;

      const driver_license_photo =
        sub?.driving_license_front_url ||
        profile.driver_license_photo_url ||
        profile.kyc_docs?.driving_license_front ||
        null;

      let vehicle_license_plate = profile.vehicle_license_plate || "";
      let vehicle_registration_photo =
        profile.vehicle_registration_photo_url || (profile as any)?.vehicle_registration_photo_url || null;
      let vehicle_brand = (profile as any)?.vehicle_brand || "";

      if (v0) {
        const plate = [v0.license_plate, v0.vehicle_province].filter(Boolean).join(" ").trim();
        if (plate) vehicle_license_plate = plate;
        const regUrl = v0.registration_book_photo_url;
        if (typeof regUrl === "string" && regUrl.trim()) vehicle_registration_photo = regUrl.trim();
        const vb = v0.vehicle_brand;
        if (typeof vb === "string" && vb.trim()) vehicle_brand = vb.trim();
      }

      const vehicleCategory =
        (profile as any)?.vehicle_category === "premium"
          ? "premium"
          : (profile as any)?.vehicle_category === "standard"
            ? "standard"
            : null;

      setThaiIDForm({
        national_id,
        id_card_front,
        id_card_back,
        driver_license_number: profile.driver_license_number || "",
        driver_license_photo,
        driver_license_expiry: profile.driver_license_expiry || "",
        vehicle_license_plate,
        vehicle_registration_photo,
        vehicle_brand,
        vehicle_category: vehicleCategory,
      });

      if (sub) {
        setKycSubmissionHint({
          status: sub.status,
          submittedAt: typeof sub.submitted_at === "string" ? sub.submitted_at : undefined,
        });
      } else {
        setKycSubmissionHint(null);
      }

      const hasId13 = national_id.length === 13;
      const hasAnyImage = !!(id_card_front || id_card_back || driver_license_photo || vehicle_registration_photo);
      setThaiIDOcrVerified(hasId13 && hasAnyImage);
    } catch (error) {
      console.error("❌ Error loading KYC data:", error);
      setKycSubmissionHint(null);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      try {
          const updatedUser = await MockApi.updateProfile({
              name: profileForm.name,
              bio: profileForm.bio,
              email: profileForm.email,
              phone: profileForm.phone,
              blood_type: profileForm.blood_type || null,
              allergies: profileForm.allergies || null,
              emergency_contact: profileForm.emergency_contact || null
          });
          if (token) login(updatedUser, token);
          notify(t('settings.saved'), 'success');
          setActiveModal(null);
      } catch (e: any) {
          console.error('[Settings] Profile update failed:', e?.response?.data || e?.message, e);
          notify(e?.message || 'Update failed', 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordForm.new !== passwordForm.confirm) {
          notify('Passwords do not match', 'error');
          return;
      }
      if (passwordForm.new.length < 6) {
          notify('Password too short', 'error');
          return;
      }
      setIsLoading(true);
      try {
          await MockApi.changePassword(passwordForm.old, passwordForm.new);
          notify(t('settings.pass_updated'), 'success');
          setActiveModal(null);
          setPasswordForm({ old: '', new: '', confirm: '' });
      } catch (e) {
          notify('Failed to change password', 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleToggleNotif = async () => {
      const newState = !notifEnabled;
      setNotifEnabled(newState);
      try {
          const updatedUser = await MockApi.updateProfile({ notifications_enabled: newState });
          if (token) login(updatedUser, token);
          notify(`Notifications ${newState ? 'On' : 'Off'}`, 'info');
      } catch (e) {
          setNotifEnabled(!newState); // Revert
      }
  };

  const skipPaymentRefreshRef = useRef(false);
  const PAYMENT_LOCK_MS = 5000; // Prevent refreshUser from overwriting for 5s after save

  const handleThaiIDFileChange = async (docType: DocumentType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) {
      notify('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
      return;
    }
    setThaiIDUploading(docType);
    try {
      const base64 = await fileToBase64(file);
      const result = await verifyDocumentWithOCR(base64, docType);
      if (result.status === 'success' && result.data) {
        const blobUrl = fileToBlobUrl(file);
        const key = docType === 'thai_id_front' ? 'id_card_front' : docType === 'thai_id_back' ? 'id_card_back' : docType === 'driver_license' ? 'driver_license_photo' : 'vehicle_registration_photo';
        pendingFilesRef.current[key] = file;
        setThaiIDOcrVerified(true);
        setThaiIDForm((prev) => {
          const next = { ...prev };
          if (docType === 'thai_id_front' || docType === 'thai_id_back') {
            next[docType === 'thai_id_front' ? 'id_card_front' : 'id_card_back'] = blobUrl;
            if (result.data?.national_id) next.national_id = result.data.national_id;
          } else if (docType === 'driver_license') {
            next.driver_license_photo = blobUrl;
            if (result.data?.driver_license_number) next.driver_license_number = result.data.driver_license_number;
            if (result.data?.expiry_date) next.driver_license_expiry = result.data.expiry_date;
          } else if (docType === 'vehicle_registration') {
            next.vehicle_registration_photo = blobUrl;
            if (result.data?.vehicle_license_plate) next.vehicle_license_plate = result.data.vehicle_license_plate;
            if (result.data?.vehicle_brand) next.vehicle_brand = result.data.vehicle_brand;
          }
          return next;
        });
        notify(result.message || 'ตรวจสอบเอกสารสำเร็จ', 'success');
      } else {
        notify(result.message || 'Document unclear', 'error');
      }
    } catch (err) {
      notify('เกิดข้อผิดพลาดในการอ่านเอกสาร', 'error');
    } finally {
      setThaiIDUploading(null);
    }
  };

  const canSaveThaiID = thaiIDOcrVerified && thaiIDForm.national_id.length === 13;

  const handleAddPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentForm.account_number || !paymentForm.account_name) {
          notify('Please fill all fields', 'error');
          return;
      }
      setIsLoading(true);
      const prevUser = user;
      const optimisticAccount: BankAccount = {
          id: `bank-${Date.now()}`,
          type: paymentForm.type,
          provider_name: paymentForm.provider_name,
          account_number: paymentForm.account_number,
          account_name: paymentForm.account_name,
      };
      try {
          // Optimistic update: show new account in UI immediately
          if (token && prevUser) {
              const optimisticUser = {
                  ...prevUser,
                  bank_accounts: [...(prevUser.bank_accounts || []), optimisticAccount],
              };
              login(optimisticUser, token);
          }
          skipPaymentRefreshRef.current = true;
          setActiveModal('payment_methods');
          const savedAccountNumber = paymentForm.account_number;
          const savedAccountName = paymentForm.account_name;
          const formToSave = { ...paymentForm };
          setPaymentForm({ type: 'bank', provider_name: 'KBANK', account_number: '', account_name: '' });

          const updatedUser = await MockApi.addBankAccount(formToSave);
          const hasNewAccount = (updatedUser?.bank_accounts || []).some(
              (a) => a.account_number === savedAccountNumber && a.account_name === savedAccountName
          );
          if (token) {
              const finalUser = hasNewAccount ? updatedUser : { ...updatedUser, bank_accounts: [...(updatedUser?.bank_accounts || []), optimisticAccount] };
              login(finalUser, token);
          }
          notify(t('settings.add_success'), 'success');
      } catch (e: any) {
          if (token && prevUser) login(prevUser, token);
          const msg = e?.response?.data?.error || e?.message || 'ไม่สามารถบันทึกช่องทางรับเงินได้';
          notify(msg, 'error');
      } finally {
          setIsLoading(false);
          setTimeout(() => { skipPaymentRefreshRef.current = false; }, PAYMENT_LOCK_MS);
      }
  };

  const handleRemovePayment = async (id: string) => {
      if(window.confirm(t('settings.remove_payment_confirm') || 'Remove this payment method?')) {
          try {
              const updatedUser = await MockApi.removeBankAccount(id);
              if(token) login(updatedUser, token);
              await refreshUser();
              notify('Payment method removed', 'success');
          } catch(e) {
              notify('Failed to remove', 'error');
          }
      }
  };

  const handleDelete = () => {
      if(window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
          logout();
      }
  };

  const handleDataExportRequest = async () => {
      if (!window.confirm('ส่งคำขอรับสำเนาข้อมูลส่วนบุคคล (PDPA) ไปยังทีมงาน?\n\nคำขอจะเข้าคิวดำเนินการภายในระยะเวลาที่กฎหมายกำหนด (โดยทั่วไปไม่เกิน 30 วัน)')) {
          return;
      }
      setDataExportLoading(true);
      try {
          const res = await api.post('/account/data-export-request');
          const msg = (res.data as { message?: string })?.message || 'ส่งคำขอสำเร็จ';
          notify(msg, 'success');
      } catch (e: unknown) {
          const err = e as { response?: { data?: { error?: string } }; message?: string };
          notify(err?.response?.data?.error || err?.message || 'ส่งคำขอไม่สำเร็จ', 'error');
      } finally {
          setDataExportLoading(false);
      }
  };

  return (
    <div className="settings-page max-w-2xl mx-auto pb-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('settings.title')}</h1>

        <div className="flex items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
            <img src={user?.avatar_url} alt="Profile" className="w-16 h-16 rounded-full mr-4 border-2 border-emerald-100 object-cover" />
            <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">{user?.name}</h2>
                <p className="text-sm text-gray-500">{user?.email || user?.phone}</p>
            </div>
            <button 
                onClick={() => setActiveModal('profile')} 
                className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors absolute top-4 right-4"
            >
                <Edit size={18} />
            </button>
        </div>

        {baProfile?.brand_adviser_suspend_warning && (
            <BrandAdviserSuspendBanner
                show
                tone="light"
                daysLeft={baProfile.days_until_suspend_estimate ?? undefined}
                inactivityDays={baRules?.inactivity_days}
                warnDaysBeforeSuspend={baRules?.warn_days_before_suspend}
                className="mb-4"
            />
        )}

        {(baProfile?.is_brand_adviser || baProfile?.brand_adviser_program_enabled) && (
            <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-100 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Award size={20} className="text-amber-600" />
                        <span className="text-sm font-bold text-gray-800">Brand Adviser</span>
                        <BrandAdviserBadge
                            isBrandAdviser={baProfile?.is_brand_adviser}
                            adviserStatus={baProfile?.adviser_status}
                            tone="light"
                        />
                    </div>
                    {typeof baProfile?.adviser_reputation_score === "number" && baProfile.adviser_reputation_score > 0 && (
                        <span className="text-xs text-gray-500">Reputation {baProfile.adviser_reputation_score.toLocaleString()}</span>
                    )}
                </div>
                {baProfile?.is_brand_adviser && baProfile?.brand_adviser_program_enabled === false && (
                    <BrandAdviserProgramOffNotice className="mt-2" />
                )}
                {baProfile?.is_brand_adviser && (
                    <BrandAdviserReputationHint rules={baRules} className="mt-2 text-gray-500" />
                )}
                {baRules && (baProfile?.is_brand_adviser || baProfile?.brand_adviser_program_enabled) && (
                    <p className="text-[11px] text-gray-500 mt-2 leading-relaxed border-t border-amber-100 pt-2">
                        เกณฑ์เวลาจากแอดมิน: ไม่มีกิจกรรมอ้างอิงต่อเนื่องเกิน {baRules.inactivity_days} วัน · แจ้งเตือนก่อนพัก {baRules.warn_days_before_suspend} วัน
                        {baRules.program_enabled === false ? " — โปรแกรม BA ปิดบนแพลตฟอร์ม" : ""}
                    </p>
                )}
            </div>
        )}

        <Section title={t('settings.account')}>
            <Item icon={User} label={t('settings.edit_profile')} onClick={() => setActiveModal('profile')} />
            <Item icon={Wifi} label={t('settings.connectivity_services')} onClick={() => navigate('/internet-packages')} />
            <Item icon={CreditCard} label={t('settings.payment_methods')} onClick={() => setActiveModal('payment_methods')} />
            <Item 
                icon={IdCard} 
                label="Thai ID & Documents" 
                onClick={() => setActiveModal('thai_id')} 
                value={
                    user?.national_id || user?.kyc_id_card_number || user?.id_card_number
                        ? `✓ ${maskID(user?.national_id || user?.kyc_id_card_number || user?.id_card_number)}` 
                        : ''
                } 
            />
            <Item 
                icon={Sailboat} 
                label="Marine Captain (ใบอนุญาตขับขี่เรือ)" 
                onClick={() => setActiveModal('marine_kyc')} 
                value={(user as any)?.skipper_license_number ? '✓ Registered' : ''} 
            />
            <Item icon={Lock} label={t('settings.password')} onClick={() => setActiveModal('password')} />
            <Item 
                icon={Bell} 
                label={t('settings.notifications')} 
                toggle={notifEnabled} 
                onToggle={handleToggleNotif} 
            />
            <div className="px-4 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center">
                    <Globe size={20} className="mr-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{t('settings.language')}</span>
                </div>
                <select 
                    value={language}
                    onChange={(e) => { setLanguage(e.target.value as any); notify('Language Updated', 'success'); }}
                    className="bg-transparent text-sm text-emerald-600 font-medium focus:outline-none cursor-pointer"
                >
                    <option value="en">English</option>
                    <option value="th">ไทย</option>
                    <option value="zh">中文</option>
                    <option value="ja">日本語</option>
                    <option value="fr">Français</option>
                    <option value="ru">Русский</option>
                </select>
            </div>
        </Section>

        <Section title="Power to the User">
            <div className="px-4 py-3">
                <p className="text-xs text-gray-500 mb-3">สลับบทบาทและโหมดสงบ</p>
                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">บทบาท (Level 1)</p>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        await MockApi.setAppMode('employer');
                                        setModeStatus(prev => prev ? { ...prev, role: 'user' } : null);
                                        if (token) await refreshUser?.();
                                        window.dispatchEvent(new CustomEvent('peace-mode-changed'));
                                        notify('สลับเป็นโหมดจ้างงานแล้ว', 'success');
                                    } catch (e: any) {
                                        notify(e?.message || 'ไม่สามารถเปลี่ยนได้', 'error');
                                    }
                                }}
                                className={`role-employer-btn flex-1 py-2 rounded-lg text-sm font-medium ${['user', 'employer'].includes(modeStatus?.role || user?.role || '') ? 'role-employer-active bg-rose-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                            >
                                <Briefcase size={16} className="inline mr-1" /> Employer
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await MockApi.setAppMode('provider');
                                        setModeStatus(prev => prev ? { ...prev, role: 'provider' } : null);
                                        if (token) await refreshUser?.();
                                        window.dispatchEvent(new CustomEvent('peace-mode-changed'));
                                        notify('สลับเป็นโหมดรับงานแล้ว', 'success');
                                    } catch (e: any) {
                                        notify(e?.message || 'ไม่สามารถเปลี่ยนได้', 'error');
                                    }
                                }}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium ${(modeStatus?.role || user?.role) === 'provider' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                            >
                                <User size={16} className="inline mr-1" /> Provider
                            </button>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Peace Mode (Level 2)</p>
                        <p className="text-xs text-gray-500 mb-2">ปิด Push งานใหม่ + ซ่อนจาก search</p>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">กลับมาออนไลน์ใน (ชม.)</span>
                            <select
                                value={peaceHours}
                                onChange={(e) => setPeaceHours(parseInt(e.target.value, 10))}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20"
                            >
                                <option value={4}>4 ชม.</option>
                                <option value={8}>8 ชม.</option>
                                <option value={12}>12 ชม.</option>
                                <option value={24}>24 ชม.</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                            <span className="text-sm text-gray-600 flex items-center gap-1">
                                <Moon size={16} className="text-gray-400" />
                                {modeStatus?.is_peace_mode ? 'โหมดสงบเปิดอยู่' : 'โหมดสงบปิดอยู่'}
                            </span>
                            <div onClick={(e) => e.stopPropagation()}>
                                {modeStatus?.is_peace_mode ? (
                                    <ToggleRight size={32} fill="#10B981" className="text-emerald-600" />
                                ) : (
                                    <ToggleLeft size={32} className="text-gray-300" />
                                )}
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                const newState = !modeStatus?.is_peace_mode;
                                try {
                                    await MockApi.setPeaceMode(newState, newState ? peaceHours : undefined);
                                    setModeStatus(prev => prev ? { ...prev, is_peace_mode: newState } : null);
                                    window.dispatchEvent(new CustomEvent('peace-mode-changed'));
                                    notify(newState ? `โหมดสงบเปิด — กลับมาออนไลน์ใน ${peaceHours} ชม.` : 'โหมดสงบปิดแล้ว', 'success');
                                } catch (e: any) {
                                    notify(e?.message || 'ไม่สามารถเปลี่ยนได้', 'error');
                                }
                            }}
                            className={`mt-2 w-full py-2 rounded-lg text-sm font-medium ${modeStatus?.is_peace_mode ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
                        >
                            {modeStatus?.is_peace_mode ? 'ปิดโหมดสงบ' : 'เปิดโหมดสงบ'}
                        </button>
                        {modeStatus?.is_banned && (
                            <p className="mt-2 text-xs text-rose-600">บัญชีถูก Lock 24 ชม. เนื่องจาก Collision</p>
                        )}
                    </div>
                </div>
            </div>
        </Section>

        <Section title="Theme & Personalization">
            <div className="p-4 space-y-6">
                <div>
                    <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <Palette size={18} /> Theme Selection
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button
                            type="button"
                            onClick={() => setTheme("standard")}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                                theme === "standard"
                                    ? "border-emerald-500 bg-emerald-50"
                                    : "border-gray-200 hover:border-gray-300"
                            }`}
                        >
                            <p className="font-bold text-gray-800 text-sm">Standard</p>
                            <p className="text-xs text-gray-500 mt-0.5">ฟรี · เน้นความสะอาด</p>
                        </button>
                        <ThemeCard id="vip-silver" label="Silver" desc="Metallic Slate" locked={!availableVipThemes.includes("vip-silver")} currentTheme={theme} onSelect={setTheme} />
                        <ThemeCard id="vip-gold" label="Gold" desc="Royal Obsidian" locked={true} comingSoon currentTheme={theme} onSelect={setTheme} />
                        <ThemeCard id="vip-platinum" label="Platinum" desc="Midnight Platinum" locked={true} comingSoon currentTheme={theme} onSelect={setTheme} />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <Award size={18} /> Badge Display
                    </p>
                    <p className="text-xs text-gray-500 mb-2">เลือก Badge ที่จะแสดงข้างชื่อคุณ</p>
                    <div className="flex flex-wrap gap-2">
                        {(["none", "member", "vip", "coach"] as const).map((b) => (
                            <button
                                key={b}
                                type="button"
                                onClick={() => setBadgeDisplay(b)}
                                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                                    badgeDisplay === b
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                                }`}
                            >
                                {b === "none" && "ไม่แสดง"}
                                {b === "member" && "Member"}
                                {b === "vip" && <span className="flex items-center gap-1"><VIPBadge tier={user?.vip_tier} size="sm" showLabel /> VIP</span>}
                                {b === "coach" && "Coach"}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={restoreDefault}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <RotateCcw size={16} /> Restore Default
                </button>
            </div>
        </Section>

        <Section title="โค้ช & ศิษย์ (Connection)">
            <div className="p-4">
                <CoachConnectionSection notify={notify} />
            </div>
        </Section>

        <Section title="ข้อมูลส่วนบุคคล (PDPA)">
            <button
                type="button"
                disabled={dataExportLoading}
                onClick={handleDataExportRequest}
                className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
            >
                <div className="flex items-center min-w-0">
                    <Download size={20} className="mr-3 text-emerald-600 shrink-0" />
                    <span className="text-sm font-medium text-gray-700">ขอส่งออกสำเนาข้อมูล (PDPA)</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {dataExportLoading ? 'กำลังส่ง…' : 'ส่งคำขอ'}
                </span>
            </button>
            <Item
                icon={Shield}
                label="การลบบัญชี / ลบหรือแก้ไขข้อมูลบางส่วน"
                onClick={() => navigate('/account-deletion')}
            />
        </Section>

        <Section title={t('settings.help')}>
            {showLineContactRow ? (
              <button
                type="button"
                onClick={() => setActiveModal("line_contact")}
                className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#06C755]/[0.06] transition-colors text-left"
              >
                <div className="flex items-center min-w-0">
                  <MessageSquare size={20} className="mr-3 text-[#06C755] shrink-0" aria-hidden />
                  <div className="min-w-0 text-left">
                    <span className="block text-sm font-medium text-gray-800">{t("settings.line_contact")}</span>
                    {lineContactSubtitle ? (
                      <span className="block text-xs text-[#06C755] font-medium mt-0.5 truncate">{lineContactSubtitle}</span>
                    ) : null}
                    <span className="block text-[11px] text-gray-500 mt-0.5">{t("settings.line_contact_desc")}</span>
                  </div>
                </div>
                <div className="flex items-center shrink-0 ml-2">
                  <ChevronRight size={16} className="text-gray-300" aria-hidden />
                </div>
              </button>
            ) : null}
            <Item icon={HelpCircle} label={t('settings.help')} value={t('settings.support_desc')} onClick={() => setActiveModal('support')} />
            <Item icon={FileText} label="Legal & Terms" onClick={() => navigate('/legal')} />
            <Item icon={Shield} label={t('settings.about')} onClick={() => setActiveModal('about')} />
        </Section>

        <div className="mt-8 space-y-3">
            <button 
                onClick={logout} 
                className="w-full py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 flex items-center justify-center"
            >
                <LogOut size={18} className="mr-2" /> {t('nav.logout')}
            </button>
            
            <button 
                onClick={handleDelete}
                className="w-full py-3 bg-white border border-red-100 text-red-500 font-medium rounded-xl hover:bg-red-50 flex items-center justify-center"
            >
                <Trash2 size={18} className="mr-2" /> {t('settings.delete')}
            </button>
        </div>

        <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">
              AQOND App · {nativeAppVersion ?? t('settings.current_ver')}
            </p>
        </div>

        {/* --- MODALS --- */}

        {/* Edit Profile Modal */}
        <Modal isOpen={activeModal === 'profile'} onClose={() => setActiveModal(null)} title={t('settings.edit_profile')}>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('auth.name')}</label>
                    <div className="relative">
                        <User className="absolute top-3 left-3 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                            value={profileForm.name}
                            onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('auth.phone')}</label>
                    <div className="relative">
                        <Phone className="absolute top-3 left-3 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                            value={profileForm.phone}
                            onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Email</label>
                    <div className="relative">
                        <Mail className="absolute top-3 left-3 text-gray-400" size={16} />
                        <input 
                            type="email" 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                            value={profileForm.email}
                            onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Bio</label>
                    <textarea 
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                        rows={3}
                        value={profileForm.bio}
                        onChange={e => setProfileForm({...profileForm, bio: e.target.value})}
                    />
                </div>
                {/* ข้อมูลฉุกเฉิน (SOS) — สำคัญสำหรับระบบ SOS */}
                <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-2">
                        <AlertCircle size={14} className="text-amber-500" /> ข้อมูลฉุกเฉิน (SOS)
                    </p>
                    <p className="text-[11px] text-gray-500 mb-3">ข้อมูลนี้จะถูกส่งให้หน่วยกู้ภัยเมื่อกด SOS</p>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">กรุ๊ปเลือด</label>
                            <select
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                                value={profileForm.blood_type}
                                onChange={e => setProfileForm({...profileForm, blood_type: e.target.value})}
                            >
                                <option value="">— เลือก —</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="AB">AB</option>
                                <option value="O">O</option>
                                <option value="A+">A+</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B-">B-</option>
                                <option value="AB+">AB+</option>
                                <option value="AB-">AB-</option>
                                <option value="O+">O+</option>
                                <option value="O-">O-</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">โรคประจำตัว / แพ้ยา</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                                placeholder="เช่น แพ้เพนิซิลลิน, เบาหวาน"
                                value={profileForm.allergies}
                                onChange={e => setProfileForm({...profileForm, allergies: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">เบอร์ติดต่อฉุกเฉิน</label>
                            <div className="relative">
                                <Phone className="absolute top-3 left-3 text-gray-400" size={16} />
                                <input
                                    type="tel"
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                                    placeholder="08X-XXX-XXXX"
                                    value={profileForm.emergency_contact}
                                    onChange={e => setProfileForm({...profileForm, emergency_contact: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {isLoading && <Loader2 size={18} className="animate-spin" />}
                    {isLoading ? t('settings.saving') || 'Saving...' : t('settings.save')}
                </button>
            </form>
        </Modal>

        {/* Payment Methods List Modal */}
        <Modal isOpen={activeModal === 'payment_methods'} onClose={() => setActiveModal(null)} title={t('settings.payment_methods')}>
            <div className="space-y-4">
                {(!user?.bank_accounts || user.bank_accounts.length === 0) && (
                    <p className="text-center text-gray-500 text-sm py-4">{t('settings.no_payment_methods')}</p>
                )}
                
                {user?.bank_accounts?.map((acc) => (
                    <div key={acc.id} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-xl ${acc.type === 'truemoney' ? 'bg-orange-50' : acc.type === 'bank' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                                    {acc.type === 'truemoney' ? <Smartphone size={24} className="text-orange-500"/> : 
                                     acc.type === 'bank' ? <Building size={24} className="text-blue-600"/> : 
                                     <CreditCard size={24} className="text-purple-600"/>}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">
                                      {acc.type === 'bank' || acc.type === 'truemoney'
                                        ? (t(`bank.${acc.provider_name?.toLowerCase?.()}`) || acc.provider_name)
                                        : acc.type === 'stripe'
                                          ? 'Stripe Connect'
                                          : 'บัตรเครดิต / เดบิต'}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-0.5">{acc.account_name}</p>
                                    <p className="text-xs text-gray-500 font-mono mt-1">•••• {String(acc.account_number).slice(-4)}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleRemovePayment(acc.id)} 
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="ลบ"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        {acc.is_default && (
                            <span className="absolute top-2 right-12 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">ค่าเริ่มต้น</span>
                        )}
                    </div>
                ))}

                <button 
                    onClick={() => setActiveModal('add_payment')}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:bg-gray-50 hover:border-emerald-300 hover:text-emerald-600 flex items-center justify-center transition-colors"
                >
                    <Plus size={18} className="mr-2" /> {t('settings.add_payment')}
                </button>
            </div>
        </Modal>

        {/* Add Payment Modal */}
        <Modal isOpen={activeModal === 'add_payment'} onClose={() => setActiveModal('payment_methods')} title={t('settings.add_payment')}>
            <form onSubmit={handleAddPayment} className="settings-add-payment-form space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-800 uppercase mb-1">Type</label>
                    <select 
                        className="settings-payment-select w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium bg-white"
                        value={paymentForm.type}
                        onChange={e => {
                          const v = e.target.value;
                          const provider =
                            v === 'truemoney' ? 'TrueMoney' :
                            v === 'stripe' ? 'Stripe' :
                            v === 'card' ? 'Credit Card' :
                            'KBANK';
                          setPaymentForm({ ...paymentForm, type: v as any, provider_name: provider });
                        }}
                    >
                        <option value="bank">Bank Transfer</option>
                        <option value="truemoney">TrueMoney Wallet</option>
                        <option value="stripe">Stripe Connect</option>
                        <option value="card">บัตรเครดิต / เดบิต</option>
                    </select>
                </div>

                {paymentForm.type === 'bank' && (
                    <div>
                        <label className="block text-xs font-bold text-gray-800 uppercase mb-1">Bank</label>
                        <select 
                            className="settings-payment-select w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium bg-white"
                            value={paymentForm.provider_name}
                            onChange={e => setPaymentForm({...paymentForm, provider_name: e.target.value})}
                        >
                            <option value="KBANK">Kasikorn Bank (KBANK)</option>
                            <option value="SCB">Siam Commercial Bank (SCB)</option>
                            <option value="BBL">Bangkok Bank (BBL)</option>
                            <option value="KTB">Krungthai Bank (KTB)</option>
                            <option value="TTB">TMBThanachart (TTB)</option>
                            <option value="BAY">Krungsri (BAY)</option>
                            <option value="GSB">Government Savings Bank (GSB)</option>
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-gray-800 uppercase mb-1">{t('settings.acc_no')}</label>
                    <input 
                        type="text" 
                        required
                        className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium"
                        placeholder={paymentForm.type === 'truemoney' ? '08X-XXX-XXXX' : 'Account Number'}
                        value={paymentForm.account_number}
                        onChange={e => setPaymentForm({...paymentForm, account_number: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-800 uppercase mb-1">{t('settings.acc_name')}</label>
                    <input 
                        type="text" 
                        required
                        className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium"
                        placeholder="Account Holder Name"
                        value={paymentForm.account_name}
                        onChange={e => setPaymentForm({...paymentForm, account_name: e.target.value})}
                    />
                </div>

                <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {isLoading ? 'Adding...' : t('settings.save')}
                </button>
            </form>
        </Modal>

        {/* Change Password Modal */}
        <Modal isOpen={activeModal === 'password'} onClose={() => setActiveModal(null)} title={t('settings.password')}>
            <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('settings.old_password')}</label>
                    <input 
                        type="password" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                        value={passwordForm.old}
                        onChange={e => setPasswordForm({...passwordForm, old: e.target.value})}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('settings.new_password')}</label>
                    <input 
                        type="password" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                        value={passwordForm.new}
                        onChange={e => setPasswordForm({...passwordForm, new: e.target.value})}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('settings.confirm_password')}</label>
                    <input 
                        type="password" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                        value={passwordForm.confirm}
                        onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
                    />
                </div>
                <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {isLoading ? 'Updating...' : t('settings.save')}
                </button>
            </form>
        </Modal>

        {/* Support Chat Modal */}
        <Modal isOpen={activeModal === 'support'} onClose={() => { setActiveModal(null); setSupportInitialDraft(''); }} title={t('settings.contact_support')}>
            <SupportChat user={user ? { name: user.name, phone: user.phone, email: user.email } : null} initialDraft={supportInitialDraft || undefined} authToken={token || undefined} />
        </Modal>

        <Modal isOpen={activeModal === 'line_contact'} onClose={() => setActiveModal(null)} title={t('settings.line_contact')}>
            <div className="space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">{t('settings.line_contact_sheet_hint')}</p>
                {companyLegal.lineQrImageUrl.trim() ? (
                    <div className="flex justify-center rounded-xl bg-white p-4 border border-gray-100">
                        <img
                            src={companyLegal.lineQrImageUrl.trim()}
                            alt="LINE Add Friend QR"
                            className="w-44 h-44 object-contain"
                            loading="lazy"
                        />
                    </div>
                ) : null}
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t('settings.line_contact_id_label')}</p>
                    <p className="text-sm font-semibold text-slate-900 font-mono mt-0.5 break-all">{lineContactSubtitle || '—'}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {lineContactUrl ? (
                        <button
                            type="button"
                            onClick={() => window.open(lineContactUrl, '_blank', 'noopener,noreferrer')}
                            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#06C755] text-white py-3 px-4 font-semibold text-sm hover:brightness-95 transition-[filter]"
                        >
                            <ExternalLink size={18} aria-hidden />
                            {t('settings.line_contact_open_line')}
                        </button>
                    ) : null}
                    {lineContactUrl ? (
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(lineContactUrl);
                                    notify(t('settings.line_contact_copied'), 'success');
                                } catch {
                                    notify('Could not copy', 'error');
                                }
                            }}
                            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 px-4 font-semibold text-sm text-gray-800 hover:bg-gray-50"
                        >
                            <Copy size={18} aria-hidden />
                            {t('settings.line_contact_copy_link')}
                        </button>
                    ) : null}
                </div>
                {!lineContactUrl && companyLegal.lineQrImageUrl.trim() ? (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-snug">
                        ตั้งค่า <span className="font-mono">VITE_COMPANY_LINE_URL</span> ตอน build เพื่อให้ปุ่มเปิดลิงก์เพิ่มเพื่อนทำงาน — ตอนนี้ใช้สแกน QR ได้ตามปกติ
                    </p>
                ) : null}
            </div>
        </Modal>

        {/* Thai ID & Documents Modal */}
        <Modal isOpen={activeModal === 'thai_id'} onClose={handleThaiIDModalClose} title="Thai ID & Documents">
            {/* Info Banner */}
            {/* PDPA: Thai ID shown masked in summaries; full value only in secure View with re-auth */}
            {(kycSubmissionHint || user?.national_id || user?.kyc_docs?.id_card_front) && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                        <Shield className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
                        <div className="text-xs text-blue-800">
                            <span className="font-bold">ข้อมูลเอกสาร:</span>{" "}
                            {kycSubmissionHint ? (
                              <>
                                ดึงจากใบสมัคร KYC ล่าสุดที่ส่งไปยังระบบ
                                {kycSubmissionHint.status ? ` (สถานะ: ${kycSubmissionHint.status})` : ""}
                                {kycSubmissionHint.submittedAt
                                  ? ` · ส่งเมื่อ ${new Date(kycSubmissionHint.submittedAt).toLocaleString()}`
                                  : ""}
                                ส่วนที่ยังว่างสามารถอัปโหลดเพิ่มด้านล่าง
                              </>
                            ) : (
                              <>
                                ข้อมูลด้านล่างมาจากโปรไฟล์ / การยืนยันตัวตนของคุณ
                                <span className="text-blue-700"> แก้ไขและบันทึกได้ตามต้องการ</span>
                              </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <div className="space-y-6">
                {/* National ID Section */}
                <div>
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                        <IdCard size={18} className="mr-2 text-blue-600" />
                        บัตรประชาชน
                    </h4>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">เลขบัตรประชาชน (13 หลัก)</label>
                            <input 
                                type="text"
                                maxLength={13}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                placeholder="1234567890123"
                                value={thaiIDForm.national_id}
                                onChange={e => setThaiIDForm({...thaiIDForm, national_id: e.target.value})}
                            />
                        </div>
                        
                        <input type="file" ref={idCardFrontRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleThaiIDFileChange('thai_id_front', e)} />
                        <input type="file" ref={idCardBackRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleThaiIDFileChange('thai_id_back', e)} />
                        <input type="file" ref={driverLicenseRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleThaiIDFileChange('driver_license', e)} />
                        <input type="file" ref={vehicleRegRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleThaiIDFileChange('vehicle_registration', e)} />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">บัตรหน้า</label>
                                <div className="relative">
                                    <button 
                                        type="button"
                                        onClick={() => idCardFrontRef.current?.click()}
                                        disabled={!!thaiIDUploading}
                                        className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                                            thaiIDForm.id_card_front 
                                                ? 'border-green-300 bg-green-50' 
                                                : 'border-gray-300 hover:border-blue-500 text-gray-500 hover:text-blue-600'
                                        }`}
                                    >
                                        {thaiIDForm.id_card_front ? (
                                            <>
                                                <img src={thaiIDForm.id_card_front} alt="ID Front" className="w-full h-full object-cover rounded-lg absolute inset-0" />
                                                <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                                                    <CheckCircle className="text-green-600" size={24} />
                                                </div>
                                            </>
                                        ) : thaiIDUploading === 'thai_id_front' ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Camera size={20} className="mb-1" />
                                                <span className="text-xs">อัปโหลดรูป</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">บัตรหลัง</label>
                                <div className="relative">
                                    <button 
                                        type="button"
                                        onClick={() => idCardBackRef.current?.click()}
                                        disabled={!!thaiIDUploading}
                                        className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                                            thaiIDForm.id_card_back 
                                                ? 'border-green-300 bg-green-50' 
                                                : 'border-gray-300 hover:border-blue-500 text-gray-500 hover:text-blue-600'
                                        }`}
                                    >
                                        {thaiIDForm.id_card_back ? (
                                            <>
                                                <img src={thaiIDForm.id_card_back} alt="ID Back" className="w-full h-full object-cover rounded-lg absolute inset-0" />
                                                <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                                                    <CheckCircle className="text-green-600" size={24} />
                                                </div>
                                            </>
                                        ) : thaiIDUploading === 'thai_id_back' ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Camera size={20} className="mb-1" />
                                                <span className="text-xs">อัปโหลดรูป</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Driver License Section */}
                <div className="pt-4 border-t border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                        <CreditCard size={18} className="mr-2 text-purple-600" />
                        ใบขับขี่ (ถ้ามี)
                    </h4>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">เลขใบขับขี่</label>
                            <input 
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                placeholder="12345678"
                                value={thaiIDForm.driver_license_number}
                                onChange={e => setThaiIDForm({...thaiIDForm, driver_license_number: e.target.value})}
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">วันหมดอายุ</label>
                            <input 
                                type="date"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                value={thaiIDForm.driver_license_expiry}
                                onChange={e => setThaiIDForm({...thaiIDForm, driver_license_expiry: e.target.value})}
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">รูปใบขับขี่</label>
                            <div className="relative">
                                <button 
                                    type="button"
                                    onClick={() => driverLicenseRef.current?.click()}
                                    disabled={!!thaiIDUploading}
                                    className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                                        thaiIDForm.driver_license_photo 
                                            ? 'border-green-300 bg-green-50' 
                                            : 'border-gray-300 hover:border-purple-500 text-gray-500 hover:text-purple-600'
                                    }`}
                                >
                                    {thaiIDForm.driver_license_photo ? (
                                        <>
                                            <img src={thaiIDForm.driver_license_photo} alt="Driver License" className="w-full h-full object-cover rounded-lg absolute inset-0" />
                                            <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                                                <CheckCircle className="text-green-600" size={24} />
                                            </div>
                                        </>
                                    ) : thaiIDUploading === 'driver_license' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Upload size={20} className="mb-1" />
                                            <span className="text-xs">อัปโหลดรูป</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Vehicle Registration Section */}
                <div className="pt-4 border-t border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                        <Car size={18} className="mr-2 text-emerald-600" />
                        ทะเบียนรถ (ถ้ามี)
                    </h4>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">เลขทะเบียนรถ</label>
                            <input 
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                                placeholder="กก 1234 กรุงเทพมหานคร"
                                value={thaiIDForm.vehicle_license_plate}
                                onChange={e => setThaiIDForm({...thaiIDForm, vehicle_license_plate: e.target.value})}
                            />
                            {thaiIDForm.vehicle_category && (
                                <p className="mt-2 text-xs font-medium">
                                    <span className={`px-2 py-0.5 rounded-full ${thaiIDForm.vehicle_category === 'premium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                        เกรดรถ: {thaiIDForm.vehicle_category === 'premium' ? 'Premium' : 'Standard'}
                                    </span>
                                </p>
                            )}
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">รูปเล่มทะเบียนรถ</label>
                            <div className="relative">
                                <button 
                                    type="button"
                                    onClick={() => vehicleRegRef.current?.click()}
                                    disabled={!!thaiIDUploading}
                                    className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                                        thaiIDForm.vehicle_registration_photo 
                                            ? 'border-green-300 bg-green-50' 
                                            : 'border-gray-300 hover:border-emerald-500 text-gray-500 hover:text-emerald-600'
                                    }`}
                                >
                                    {thaiIDForm.vehicle_registration_photo ? (
                                        <>
                                            <img src={thaiIDForm.vehicle_registration_photo} alt="Vehicle Registration" className="w-full h-full object-cover rounded-lg absolute inset-0" />
                                            <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                                                <CheckCircle className="text-green-600" size={24} />
                                            </div>
                                        </>
                                    ) : thaiIDUploading === 'vehicle_registration' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Upload size={20} className="mb-1" />
                                            <span className="text-xs">อัปโหลดรูป</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <button 
                    type="button"
                    disabled={!thaiIDOcrVerified || thaiIDForm.national_id.length !== 13}
                    className={`w-full py-3 rounded-lg font-bold transition-colors ${
                        thaiIDOcrVerified && thaiIDForm.national_id.length === 13
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    onClick={async () => {
                        try {
                            const pending = pendingFilesRef.current;
                            let idCardFrontUrl = thaiIDForm.id_card_front;
                            let idCardBackUrl = thaiIDForm.id_card_back;
                            let driverLicenseUrl = thaiIDForm.driver_license_photo;
                            let vehicleRegUrl = thaiIDForm.vehicle_registration_photo;

                            if (pending.id_card_front) {
                                const { url } = await uploadDocumentToSecure(pending.id_card_front, 'thai_id_front', token || undefined);
                                if (!isBlobUrl(url)) idCardFrontUrl = url;
                            }
                            if (pending.id_card_back) {
                                const { url } = await uploadDocumentToSecure(pending.id_card_back, 'thai_id_back', token || undefined);
                                if (!isBlobUrl(url)) idCardBackUrl = url;
                            }
                            if (pending.driver_license_photo) {
                                const { url } = await uploadDocumentToSecure(pending.driver_license_photo, 'driver_license', token || undefined);
                                if (!isBlobUrl(url)) driverLicenseUrl = url;
                            }
                            if (pending.vehicle_registration_photo) {
                                const { url } = await uploadDocumentToSecure(pending.vehicle_registration_photo, 'vehicle_registration', token || undefined);
                                if (!isBlobUrl(url)) vehicleRegUrl = url;
                            }

                            const payload: Record<string, unknown> = {
                                national_id: thaiIDForm.national_id,
                                driver_license_number: thaiIDForm.driver_license_number,
                                driver_license_expiry: thaiIDForm.driver_license_expiry,
                                vehicle_license_plate: thaiIDForm.vehicle_license_plate
                            };
                            if (idCardFrontUrl && !isBlobUrl(idCardFrontUrl)) payload.id_card_front_url = idCardFrontUrl;
                            if (idCardBackUrl && !isBlobUrl(idCardBackUrl)) payload.id_card_back_url = idCardBackUrl;
                            if (driverLicenseUrl && !isBlobUrl(driverLicenseUrl)) payload.driver_license_photo_url = driverLicenseUrl;
                            if (vehicleRegUrl && !isBlobUrl(vehicleRegUrl)) payload.vehicle_registration_photo_url = vehicleRegUrl;
                            if (thaiIDForm.vehicle_brand) payload.vehicle_brand = thaiIDForm.vehicle_brand;

                            const updatedUser = await MockApi.updateProfile(payload as any);
                            if (token) login(updatedUser, token);
                            notify('✅ บันทึกข้อมูลสำเร็จ', 'success');
                            handleThaiIDModalClose();
                        } catch (error) {
                            notify('❌ บันทึกข้อมูลไม่สำเร็จ', 'error');
                            console.error('Error saving Thai ID:', error);
                        }
                    }}
                >
                    บันทึกข้อมูล
                </button>
            </div>
        </Modal>

        {/* Marine KYC Modal — ใบอนุญาตขับขี่เรือ & ทะเบียนเรือ */}
        <Modal isOpen={activeModal === 'marine_kyc'} onClose={handleMarineKYCModalClose} title="Marine Captain (ใบอนุญาตขับขี่เรือ)">
            <div className="space-y-4">
                <p className="text-sm text-gray-500">สำหรับกัปตันเรือที่ต้องการลงทะเบียนใน AQOND Marine</p>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ใบอนุญาตขับขี่เรือ</label>
                    <input type="file" ref={skipperLicenseRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleMarineKYCFileChange('skipper_license_photo', e)} />
                    <button type="button" onClick={() => skipperLicenseRef.current?.click()} className="w-full py-3 rounded-xl border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50">
                        {marineKYCUploading === 'skipper_license_photo' ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                        {marineKYCForm.skipper_license_photo ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                    </button>
                    {marineKYCForm.skipper_license_photo && (
                        <img src={marineKYCForm.skipper_license_photo} alt="Skipper" className="mt-2 w-full max-h-32 object-contain rounded-lg border" />
                    )}
                    <input type="text" value={marineKYCForm.skipper_license_number} onChange={e => setMarineKYCForm(p => ({ ...p, skipper_license_number: e.target.value }))} placeholder="เลขที่ใบอนุญาต" className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200" />
                    <input type="date" value={marineKYCForm.skipper_license_expiry} onChange={e => setMarineKYCForm(p => ({ ...p, skipper_license_expiry: e.target.value }))} placeholder="วันหมดอายุ" className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ทะเบียนเรือ / ใบอนุญาตใช้เรือ</label>
                    <input type="file" ref={boatRegRef} accept="image/*" capture="environment" className="hidden" onChange={e => handleMarineKYCFileChange('boat_registration_photo', e)} />
                    <button type="button" onClick={() => boatRegRef.current?.click()} className="w-full py-3 rounded-xl border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50">
                        {marineKYCUploading === 'boat_registration_photo' ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                        {marineKYCForm.boat_registration_photo ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                    </button>
                    {marineKYCForm.boat_registration_photo && (
                        <img src={marineKYCForm.boat_registration_photo} alt="Boat" className="mt-2 w-full max-h-32 object-contain rounded-lg border" />
                    )}
                    <input type="text" value={marineKYCForm.boat_registration_number} onChange={e => setMarineKYCForm(p => ({ ...p, boat_registration_number: e.target.value }))} placeholder="เลขทะเบียนเรือ" className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200" />
                    <input type="text" value={marineKYCForm.boat_brand} onChange={e => setMarineKYCForm(p => ({ ...p, boat_brand: e.target.value }))} placeholder="ยี่ห้อ/ประเภทเรือ (เช่น Longtail, Speedboat, Yacht)" className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200" />
                </div>
                <button
                    type="button"
                    className="w-full py-3 rounded-xl font-bold text-white"
                    style={{ backgroundColor: '#0891b2' }}
                    onClick={async () => {
                        try {
                            const payload: Record<string, unknown> = {
                                skipper_license_number: marineKYCForm.skipper_license_number,
                                skipper_license_expiry: marineKYCForm.skipper_license_expiry || null,
                                boat_registration_number: marineKYCForm.boat_registration_number,
                                boat_brand: marineKYCForm.boat_brand || null,
                            };
                            const pending = marinePendingFilesRef.current;
                            if (pending.skipper_license_photo) {
                                const { url } = await uploadDocumentToSecure(pending.skipper_license_photo, 'skipper_license', token || undefined);
                                if (!isBlobUrl(url)) payload.skipper_license_photo_url = url;
                            } else if (marineKYCForm.skipper_license_photo && !isBlobUrl(marineKYCForm.skipper_license_photo)) {
                                payload.skipper_license_photo_url = marineKYCForm.skipper_license_photo;
                            }
                            if (pending.boat_registration_photo) {
                                const { url } = await uploadDocumentToSecure(pending.boat_registration_photo, 'boat_registration', token || undefined);
                                if (!isBlobUrl(url)) payload.boat_registration_photo_url = url;
                            } else if (marineKYCForm.boat_registration_photo && !isBlobUrl(marineKYCForm.boat_registration_photo)) {
                                payload.boat_registration_photo_url = marineKYCForm.boat_registration_photo;
                            }
                            const updatedUser = await MockApi.updateProfile(payload as any);
                            if (token) login(updatedUser, token);
                            notify('✅ บันทึกข้อมูล Marine KYC สำเร็จ', 'success');
                            handleMarineKYCModalClose();
                        } catch (error) {
                            notify('❌ บันทึกข้อมูลไม่สำเร็จ', 'error');
                            console.error('Error saving Marine KYC:', error);
                        }
                    }}
                >
                    บันทึกข้อมูล
                </button>
            </div>
        </Modal>

        {/* About Us Modal */}
        <Modal isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} title={t('settings.about')}>
            <div className="text-center space-y-6">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 overflow-hidden bg-white">
                    <img src="/logo.png" alt="AQOND" className="w-full h-full object-contain p-1" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">AQOND Applications</h2>
                    <p className="text-sm text-gray-500">People2People Services Platform</p>
                </div>
                
                <div className="bg-emerald-50 p-4 rounded-xl text-left border border-emerald-100">
                    <h3 className="font-bold text-emerald-800 text-sm mb-2 flex items-center"><Heart size={16} className="mr-2" /> Mission</h3>
                    <p className="text-emerald-700 text-xs leading-relaxed">
                        To connect people with reliable local services and lifestyle companions, fostering trust, economic opportunity, and community support in a safe environment.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
                        <Shield className="text-emerald-500 mb-1" size={20}/>
                        <span className="text-[10px] font-bold text-gray-600">Trust</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
                        <Zap className="text-amber-500 mb-1" size={20}/>
                        <span className="text-[10px] font-bold text-gray-600">Speed</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
                        <Info className="text-blue-500 mb-1" size={20}/>
                        <span className="text-[10px] font-bold text-gray-600">Support</span>
                    </div>
                </div>

                <div className="space-y-2 text-left pt-2">
                    <div className="flex items-center text-sm text-gray-600">
                        <Mail size={16} className="mr-3 text-gray-400" />{" "}
                        {mobileAppConfig.remote.complianceSupportEmail?.trim() ? (
                          <a
                            href={`mailto:${mobileAppConfig.remote.complianceSupportEmail.trim()}`}
                            className="text-emerald-600 hover:underline"
                          >
                            {mobileAppConfig.remote.complianceSupportEmail.trim()}
                          </a>
                        ) : (
                          <a href="mailto:support@aqond.com" className="text-gray-600 hover:underline">
                            support@aqond.com
                          </a>
                        )}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Phone size={16} className="mr-3 text-gray-400" /> +66 2 123 4567
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <MapPin size={16} className="mr-3 text-gray-400" /> Bangkok, Thailand
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Version 1.1.2</p>
                    <p className="text-[10px] text-gray-300 mt-1">© 2025 AQOND. All rights reserved.</p>
                </div>
            </div>
        </Modal>
    </div>
  );
};
