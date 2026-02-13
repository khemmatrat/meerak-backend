
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { MockApi } from '../services/mockApi';
import { User, Bell, Lock, HelpCircle, Globe, LogOut, ChevronRight, Trash2, Shield, FileText, X, MessageSquare, Mail, Phone, Edit, ToggleLeft, ToggleRight, CreditCard, Plus, Building, Smartphone, Send, Bot, Info, Heart, Zap, MapPin, IdCard, Car, Camera, Upload, CheckCircle } from 'lucide-react';
import { BankAccount } from '../types';

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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
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
const SupportChat = ({ user: supportUser }: { user?: { name?: string; phone?: string; email?: string } | null }) => {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('meerak_user_id') : null;
    const [messages, setMessages] = useState<{ text: string; isBot: boolean }[]>([
        { text: "สวัสดีครับ! นี่คือระบบช่วยเหลืออัตโนมัติ Meerak ต้องการสอบถามเรื่องอะไรครับ?", isBot: true }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [ticketId, setTicketId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [useBackend, setUseBackend] = useState(true);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    // โหลด ticket ที่เปิดอยู่และข้อความ (ค่าจริงจาก Backend)
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
            return () => { cancelled = true; };
        })();
    }, [userId, useBackend]);

    const handleSend = async (text: string) => {
        if (!text.trim()) return;
        setMessages(prev => [...prev, { text, isBot: false }]);
        setInput('');
        setIsTyping(true);
        setLoadError(null);

        try {
            if (useBackend) {
                if (!ticketId) {
                    const { ticket, message } = await MockApi.createSupportTicket({
                        userId: userId || undefined,
                        message: text,
                        subject: text.slice(0, 80),
                        category: 'General',
                        email: supportUser?.email,
                        full_name: supportUser?.name,
                        phone: supportUser?.phone
                    });
                    setTicketId(ticket.id);
                    const { messages: msgs } = await MockApi.getSupportTicketMessages(ticket.id);
                    setMessages((msgs || []).map((m: any) => ({ text: m.message, isBot: m.sender === 'BOT' || m.sender === 'ADMIN' })));
                } else {
                    await MockApi.sendSupportMessage(ticketId, text);
                    const { messages: msgs } = await MockApi.getSupportTicketMessages(ticketId);
                    setMessages((msgs || []).map((m: any) => ({ text: m.message, isBot: m.sender === 'BOT' || m.sender === 'ADMIN' })));
                }
            } else {
                const reply = await MockApi.getBotResponse(text);
                setMessages(prev => [...prev, { text: reply, isBot: true }]);
            }
        } catch (e) {
            setLoadError('ไม่สามารถส่งได้ กรุณาลองใหม่หรือติดต่อ support@meerak.app');
            const reply = await MockApi.getBotResponse(text);
            setMessages(prev => [...prev, { text: reply, isBot: true }]);
        } finally {
            setIsTyping(false);
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
        <div className="flex flex-col h-[400px]">
            {loadError && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">{loadError}</div>
            )}
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
            <div className="mt-2 text-center">
                <a href="mailto:support@meerak.app" className="text-[10px] text-gray-400 hover:text-emerald-600 underline">ติดต่อเจ้าหน้าที่ (Human Agent)</a>
            </div>
        </div>
    );
};

export const Settings: React.FC = () => {
  const { user, logout, login, token } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { notify } = useNotification();
  const navigate = useNavigate();

  // State for Modals
  const [activeModal, setActiveModal] = useState<'profile' | 'password' | 'support' | 'payment_methods' | 'add_payment' | 'about' | 'thai_id' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Forms Data
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '', bio: '' });
  const [passwordForm, setPasswordForm] = useState({ old: '', new: '', confirm: '' });
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [paymentForm, setPaymentForm] = useState<{type: 'bank'|'truemoney'|'stripe'|'omise', provider_name: string, account_number: string, account_name: string}>({
      type: 'bank',
      provider_name: 'KBANK',
      account_number: '',
      account_name: ''
  });
  
  // Thai ID Form State
  const [thaiIDForm, setThaiIDForm] = useState<{
    national_id: string;
    id_card_front: string | null;
    id_card_back: string | null;
    driver_license_number: string;
    driver_license_photo: string | null;
    driver_license_expiry: string;
    vehicle_license_plate: string;
    vehicle_registration_photo: string | null;
  }>({
    national_id: '',
    id_card_front: null,
    id_card_back: null,
    driver_license_number: '',
    driver_license_photo: null,
    driver_license_expiry: '',
    vehicle_license_plate: '',
    vehicle_registration_photo: null
  });

  useEffect(() => {
      if (user) {
          setProfileForm({
              name: user.name || '',
              phone: user.phone || '',
              email: user.email || '',
              bio: user.bio || ''
          });
          setNotifEnabled(user.notifications_enabled !== false);
      }
  }, [user]);
  
  // Load KYC data when Thai ID modal opens
  useEffect(() => {
      if (activeModal === 'thai_id' && user) {
          loadKYCData();
      }
  }, [activeModal, user]);
  
  // Load KYC data from user profile
  const loadKYCData = async () => {
    if (!user) return;
    
    try {
      // Get KYC data from user profile
      // Priority: Settings fields > KYC docs > Legacy fields
      const national_id = user.national_id || user.kyc_id_card_number || user.id_card_number || '';
      const id_card_front = user.id_card_front_url || user.kyc_docs?.id_card_front || null;
      const id_card_back = user.id_card_back_url || user.kyc_docs?.id_card_back || null;
      const driver_license_photo = user.driver_license_photo_url || user.kyc_docs?.driving_license_front || null;
      
      setThaiIDForm({
        national_id: national_id,
        id_card_front: id_card_front,
        id_card_back: id_card_back,
        driver_license_number: user.driver_license_number || '',
        driver_license_photo: driver_license_photo,
        driver_license_expiry: user.driver_license_expiry || '',
        vehicle_license_plate: user.vehicle_license_plate || '',
        vehicle_registration_photo: user.vehicle_registration_photo_url || null
      });
      
      console.log('✅ Loaded KYC data:', {
        has_national_id: !!national_id,
        has_id_front: !!id_card_front,
        has_id_back: !!id_card_back,
        has_driver_license: !!user.driver_license_number,
        has_vehicle: !!user.vehicle_license_plate
      });
    } catch (error) {
      console.error('❌ Error loading KYC data:', error);
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
              phone: profileForm.phone
          });
          if (token) login(updatedUser, token);
          notify(t('settings.saved'), 'success');
          setActiveModal(null);
      } catch (e) {
          notify('Update failed', 'error');
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

  const handleAddPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentForm.account_number || !paymentForm.account_name) {
          notify('Please fill all fields', 'error');
          return;
      }
      setIsLoading(true);
      try {
          const updatedUser = await MockApi.addBankAccount(paymentForm);
          if (token) login(updatedUser, token);
          notify(t('settings.add_success'), 'success');
          setActiveModal('payment_methods'); // Go back to list
          setPaymentForm({ type: 'bank', provider_name: 'KBANK', account_number: '', account_name: '' });
      } catch (e: any) {
          notify(e.message, 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleRemovePayment = async (id: string) => {
      if(window.confirm('Remove this payment method?')) {
          try {
              const updatedUser = await MockApi.removeBankAccount(id);
              if(token) login(updatedUser, token);
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

  return (
    <div className="max-w-2xl mx-auto pb-20">
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

        <Section title={t('settings.account')}>
            <Item icon={User} label={t('settings.edit_profile')} onClick={() => setActiveModal('profile')} />
            <Item icon={CreditCard} label={t('settings.payment_methods')} onClick={() => setActiveModal('payment_methods')} />
            <Item 
                icon={IdCard} 
                label="Thai ID & Documents" 
                onClick={() => setActiveModal('thai_id')} 
                value={
                    user?.national_id || user?.kyc_id_card_number || user?.id_card_number
                        ? '✓ มีข้อมูล' 
                        : ''
                } 
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

        <Section title={t('settings.help')}>
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
            <p className="text-xs text-gray-400">Meerak App {t('settings.current_ver')}</p>
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
                <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {isLoading ? 'Saving...' : t('settings.save')}
                </button>
            </form>
        </Modal>

        {/* Payment Methods List Modal */}
        <Modal isOpen={activeModal === 'payment_methods'} onClose={() => setActiveModal(null)} title={t('settings.payment_methods')}>
            <div className="space-y-4">
                {(!user?.bank_accounts || user.bank_accounts.length === 0) && (
                    <p className="text-center text-gray-500 text-sm py-4">{t('settings.no_payment_methods')}</p>
                )}
                
                {user?.bank_accounts?.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center">
                            <div className="p-2 bg-gray-50 rounded-lg mr-3">
                                {acc.type === 'truemoney' ? <Smartphone size={20} className="text-orange-500"/> : 
                                 acc.type === 'bank' ? <Building size={20} className="text-blue-600"/> : 
                                 <CreditCard size={20} className="text-purple-600"/>}
                            </div>
                            <div>
                                <p className="font-bold text-sm text-gray-900">{t(`bank.${acc.provider_name.toLowerCase()}`) || acc.provider_name}</p>
                                <p className="text-xs text-gray-500">{acc.account_number} • {acc.account_name}</p>
                            </div>
                        </div>
                        <button onClick={() => handleRemovePayment(acc.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}

                <button 
                    onClick={() => setActiveModal('add_payment')}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium hover:bg-gray-50 flex items-center justify-center"
                >
                    <Plus size={18} className="mr-2" /> {t('settings.add_payment')}
                </button>
            </div>
        </Modal>

        {/* Add Payment Modal */}
        <Modal isOpen={activeModal === 'add_payment'} onClose={() => setActiveModal('payment_methods')} title={t('settings.add_payment')}>
            <form onSubmit={handleAddPayment} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                    <select 
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        value={paymentForm.type}
                        onChange={e => setPaymentForm({...paymentForm, type: e.target.value as any, provider_name: e.target.value === 'truemoney' ? 'TrueMoney' : e.target.value === 'stripe' ? 'Stripe' : 'KBANK'})}
                    >
                        <option value="bank">Bank Transfer</option>
                        <option value="truemoney">TrueMoney Wallet</option>
                        <option value="stripe">Stripe Connect</option>
                        <option value="omise">Omise</option>
                    </select>
                </div>

                {paymentForm.type === 'bank' && (
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bank</label>
                        <select 
                            className="w-full p-2 border border-gray-300 rounded-lg"
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
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('settings.acc_no')}</label>
                    <input 
                        type="text" 
                        required
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        placeholder={paymentForm.type === 'truemoney' ? '08X-XXX-XXXX' : 'Account Number'}
                        value={paymentForm.account_number}
                        onChange={e => setPaymentForm({...paymentForm, account_number: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('settings.acc_name')}</label>
                    <input 
                        type="text" 
                        required
                        className="w-full p-2 border border-gray-300 rounded-lg"
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
        <Modal isOpen={activeModal === 'support'} onClose={() => setActiveModal(null)} title={t('settings.contact_support')}>
            <SupportChat user={user ? { name: user.name, phone: user.phone, email: user.email } : null} />
        </Modal>

        {/* Thai ID & Documents Modal */}
        <Modal isOpen={activeModal === 'thai_id'} onClose={() => setActiveModal(null)} title="Thai ID & Documents">
            {/* Info Banner */}
            {(user?.national_id || user?.kyc_docs?.id_card_front) && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                        <Shield className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
                        <div className="text-xs text-blue-800">
                            <span className="font-bold">✓ ข้อมูลจาก KYC:</span> ข้อมูลด้านล่างดึงมาจากการยืนยันตัวตนของคุณ 
                            <span className="text-blue-700"> คุณสามารถแก้ไขได้ตามต้องการ</span>
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
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">บัตรหน้า</label>
                                <div className="relative">
                                    <button 
                                        type="button"
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
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">รูปเล่มทะเบียนรถ</label>
                            <div className="relative">
                                <button 
                                    type="button"
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
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                    onClick={async () => {
                        try {
                            // Save to user profile
                            const updatedUser = await MockApi.updateProfile({
                                national_id: thaiIDForm.national_id,
                                id_card_front_url: thaiIDForm.id_card_front,
                                id_card_back_url: thaiIDForm.id_card_back,
                                driver_license_number: thaiIDForm.driver_license_number,
                                driver_license_photo_url: thaiIDForm.driver_license_photo,
                                driver_license_expiry: thaiIDForm.driver_license_expiry,
                                vehicle_license_plate: thaiIDForm.vehicle_license_plate,
                                vehicle_registration_photo_url: thaiIDForm.vehicle_registration_photo
                            });
                            
                            if (token) login(updatedUser, token);
                            notify('✅ บันทึกข้อมูลสำเร็จ', 'success');
                            setActiveModal(null);
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

        {/* About Us Modal */}
        <Modal isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} title={t('settings.about')}>
            <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
                    <span className="text-white font-bold text-4xl">M</span>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Meerak Application</h2>
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
                        <Mail size={16} className="mr-3 text-gray-400" /> support@meerak.app
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Phone size={16} className="mr-3 text-gray-400" /> +66 2 123 4567
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <MapPin size={16} className="mr-3 text-gray-400" /> Bangkok, Thailand
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Version 1.0.0 (Build 2025.11.24)</p>
                    <p className="text-[10px] text-gray-300 mt-1">© 2025 Meerak. All rights reserved.</p>
                </div>
            </div>
        </Modal>
    </div>
  );
};
