import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  Sun,
  Moon,
  ShoppingCart,
  User,
  Search,
  Paperclip,
  Send,
  DoorOpen,
  ShoppingBag,
  UtensilsCrossed,
  Briefcase,
  Calendar,
  Users,
  Bike,
  BarChart3,
  HelpCircle,
  GraduationCap,
  Globe,
  Crown,
  TrendingUp,
  Star,
  MessageCircle,
  Package,
  CheckCircle2,
  Plus,
  Mic,
  Square,
  ArrowRight,
} from "lucide-react";
import {
  queryAIOrchestrator,
  confirmHermesTool,
  type HermesConsentCard,
} from "../services/aiOrchestratorApi";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { navigateToMarketplace } from "../services/marketplaceHandoff";
import { AqondSuperProfileModal } from "../components/AqondSuperProfileModal";
import { AqondCartDrawer } from "../components/AqondCartDrawer";
import { osChatCopy } from "../i18n/osChatCopy";
import {
  loadSessions,
  upsertSession,
  loadSessionMessages,
  saveSessionMessages,
  loadFavoriteSessionIds,
  toggleFavoriteSession,
  loadFavoriteProducts,
  toggleFavoriteProduct,
  loadCart,
  addToCart,
  clearCart,
  cartCount,
  type OsChatSession,
  type OsFavProduct,
  type OsCartItem,
  type OsStoredChatMsg,
} from "../services/osChatLocalStore";

type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  cards?: Array<{
    type: string;
    data: {
      id?: string;
      title?: string;
      price?: number | string;
      image?: string;
      imageUrl?: string;
      open_path?: string;
      description?: string;
      rating?: number;
      location?: string;
      progress?: string;
      minutes?: number;
    };
  }>;
  searchPath?: string;
  consent?: HermesConsentCard;
  consentResolved?: "approved" | "rejected";
};

const SIDEBAR_ITEMS = [
  {
    id: "marketplace",
    label: "Marketplace",
    subtitle: "Curated Products",
    icon: ShoppingBag,
    hint: null as string | null,
  },
  {
    id: "food",
    label: "Food Merchant",
    subtitle: "Gourmet Concierge",
    icon: UtensilsCrossed,
    hint: "88,900",
  },
  {
    id: "jobs",
    label: "Job Board",
    subtitle: "Premium Jobs",
    icon: Briefcase,
    hint: null,
  },
  {
    id: "booking",
    label: "Booking",
    subtitle: "Lounge Reservation",
    icon: Calendar,
    hint: null,
  },
  {
    id: "talents",
    label: "Talents OS",
    subtitle: "Vetted Freelancers",
    icon: Users,
    hint: null,
  },
  {
    id: "rider",
    label: "Rider OS",
    subtitle: "VIP Courier",
    icon: Bike,
    hint: "82,450",
  },
  {
    id: "crm",
    label: "CRM",
    subtitle: "Business Analytics",
    icon: BarChart3,
    hint: null,
  },
];

/**
 * Page Chat UI — ported from aqond-ui-chat MainAppScreen (Image 5).
 * Door icon → /explore (Image 1 SUPERAPP).
 */
export const AqondOsChat: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const copy = osChatCopy(language);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [available, setAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    const existing = loadSessions()[0];
    return existing?.id || `sess-${Date.now()}`;
  });
  const [sessions, setSessions] = useState<OsChatSession[]>(() => loadSessions());
  const [favSessionIds, setFavSessionIds] = useState<string[]>(() =>
    loadFavoriteSessionIds(),
  );
  const [favProducts, setFavProducts] = useState<OsFavProduct[]>(() =>
    loadFavoriteProducts(),
  );
  const [cart, setCart] = useState<OsCartItem[]>(() => loadCart());
  const [lastProductQuery, setLastProductQuery] = useState<string | null>(() => {
    const existing = loadSessions()[0];
    return existing?.lastProductQuery || null;
  });
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const sid = loadSessions()[0]?.id;
    if (sid) {
      const stored = loadSessionMessages(sid);
      if (stored.length) return stored as ChatMsg[];
    }
    return [
      {
        id: "1",
        role: "ai",
        text: osChatCopy(
          typeof localStorage !== "undefined"
            ? localStorage.getItem("aqond_lang") || "en"
            : "en",
        ).welcome,
      },
    ];
  });
  const listRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [listening, setListening] = useState(false);
  const sttSupported =
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition
    );

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isTyping]);

  // Persist full chat history per session (local) so switching recent chats restores context
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    saveSessionMessages(sessionId, messages as OsStoredChatMsg[]);
  }, [sessionId, messages]);

  const gold = "#D4AF37";
  const surface = dark ? "#1A1510" : "#FFFFFF";
  const bg = dark ? "#12100E" : "#FAF6F1";
  const text = dark ? "#F5F0E8" : "#2C2419";
  const muted = dark ? "#A89880" : "#8B7355";
  const border = dark ? "rgba(212,175,55,0.25)" : "rgba(212,175,55,0.35)";

  const send = async (override?: string) => {
    const t = (override ?? input).trim();
    if (!t || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");

    const userMsg: ChatMsg = {
      id: String(Date.now()),
      role: "user",
      text: t,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const history = [...messages, userMsg].slice(-10);
      const result = await queryAIOrchestrator(t, {
        userId: user?.id || null,
        history,
        role: "customer",
        lastProductQuery,
        language,
      });
      const cards = (result.actions || []).filter(
        (a) =>
          (a.type === "product_card" ||
            a.type === "service_card" ||
            a.type === "onboarding_step") &&
          a.data,
      ) as ChatMsg["cards"];
      const payloadData = result.payload?.data as
        | { search_open_path?: string; query?: string }
        | undefined;
      const searchPath = payloadData?.search_open_path || undefined;
      const consentAction = (result.actions || []).find(
        (a) => a.type === "tool_consent",
      );
      const consent = (
        result.payload?.type === "tool_consent"
          ? result.payload.data
          : consentAction?.data
      ) as HermesConsentCard | undefined;
      const nextProductQuery = payloadData?.query
        ? String(payloadData.query)
        : result.intent === "marketplace_search"
          ? t
          : lastProductQuery;
      if (payloadData?.query) {
        setLastProductQuery(String(payloadData.query));
      } else if (result.intent === "marketplace_search") {
        setLastProductQuery(t);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "ai",
          text: result.message,
          cards: cards?.length ? cards : undefined,
          searchPath,
          consent: consent?.proposalId ? consent : undefined,
        },
      ]);
      const titleHint =
        t.length > 28 ? `${t.slice(0, 28)}…` : t || "AQOND Assistant Chat";
      setSessions(
        upsertSession({
          id: sessionId,
          title: titleHint,
          preview: result.message.slice(0, 60),
          lastProductQuery: nextProductQuery,
        }),
      );
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "ai",
          text: copy.error,
        },
      ]);
    } finally {
      setIsTyping(false);
      sendingRef.current = false;
    }
  };

  const openModule = (id: string) => {
    setSidebarOpen(false);
    if (id === "jobs") navigate("/jobs");
    else if (id === "talents") navigate("/talents");
    else if (id === "marketplace" || id === "food") {
      navigateToMarketplace(navigate, id === "food" ? "food" : "home");
    } else navigate("/home");
  };

  const openProduct = (card: NonNullable<ChatMsg["cards"]>[number]) => {
    const path =
      card.data.open_path ||
      `/storefront?p=${encodeURIComponent(`/m/product/${card.data.id || ""}`)}`;
    if (path.startsWith("/")) navigate(path);
    else navigateToMarketplace(navigate, "home");
  };

  // Confirm / cancel a Hermes tool proposal (both audited server-side).
  const handleConsent = async (
    consent: HermesConsentCard,
    decision: "approve" | "reject",
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.consent?.proposalId === consent.proposalId
          ? {
              ...m,
              consent: undefined,
              consentResolved: decision === "approve" ? "approved" : "rejected",
            }
          : m,
      ),
    );
    const res = await confirmHermesTool(
      consent.proposalId,
      decision,
      user?.id || null,
    );
    const next = res.progress?.nextAction;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now() + 2),
        role: "ai",
        text:
          res.message ||
          (decision === "approve"
            ? "ดำเนินการเรียบร้อยครับ"
            : "ยกเลิกแล้วครับ"),
        cards:
          decision === "approve" && next?.href
            ? [
                {
                  type: "onboarding_step",
                  data: {
                    id: next.id,
                    title: next.label,
                    open_path: next.href,
                    minutes: next.minutes,
                    progress: res.progress?.progress
                      ? `${res.progress.progress.completed}/${res.progress.progress.total}`
                      : undefined,
                  },
                },
              ]
            : undefined,
      },
    ]);
  };

  // Client-side STT (Web Speech API). Native STT plugin for iOS can replace this later.
  const toggleMic = () => {
    if (!sttSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = language === "th" ? "th-TH" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: {
      results: ArrayLike<ArrayLike<{ transcript?: string }>>;
    }) => {
      const transcript = String(e.results?.[0]?.[0]?.transcript || "").trim();
      if (transcript) {
        setInput(transcript);
        void send(transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const startNewChat = () => {
    // Flush current thread before switching
    if (sessionId && messages.length) {
      saveSessionMessages(sessionId, messages as OsStoredChatMsg[]);
    }
    const id = `sess-${Date.now()}`;
    setSessionId(id);
    setLastProductQuery(null);
    const welcome: ChatMsg = {
      id: "1",
      role: "ai",
      text: copy.newChat,
    };
    setMessages([welcome]);
    saveSessionMessages(id, [welcome]);
    setSessions(
      upsertSession({
        id,
        title: "AQOND Assistant Chat",
        preview: language === "th" ? "แชทใหม่" : "New chat",
        lastProductQuery: null,
      }),
    );
  };

  const selectSession = (id: string) => {
    if (sessionId && messages.length) {
      saveSessionMessages(sessionId, messages as OsStoredChatMsg[]);
    }
    setSessionId(id);
    setSidebarOpen(false);
    const sess = sessions.find((s) => s.id === id);
    setLastProductQuery(sess?.lastProductQuery || null);
    const stored = loadSessionMessages(id);
    if (stored.length) {
      setMessages(stored as ChatMsg[]);
    } else {
      setMessages([
        {
          id: "1",
          role: "ai",
          text: copy.sessionOpen,
        },
      ]);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: bg, color: text }}>
      {/* Top bar */}
      <header
        className="h-14 shrink-0 flex items-center gap-2 px-3 border-b"
        style={{ background: surface, borderColor: border }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-2 rounded-lg"
          aria-label="Menu"
        >
          <Menu size={22} style={{ color: gold }} />
        </button>
        <img
          src="/logo.png"
          alt=""
          className="w-8 h-8 rounded-full border object-cover"
          style={{ borderColor: gold }}
        />
        <span className="font-extrabold tracking-wide" style={{ color: gold }}>
          AQOND
        </span>
        <div className="flex-1" />
        {/* Door → Image 1 Explore SUPERAPP */}
        <button
          type="button"
          onClick={() => navigate("/explore")}
          className="p-2 rounded-lg border mr-1"
          style={{ borderColor: border, color: gold }}
          aria-label="ไปหน้า SUPERAPP"
          title="ประตู → SUPERAPP"
        >
          <DoorOpen size={20} />
        </button>
        <button
          type="button"
          onClick={() => setLanguage(language === "th" ? "en" : "th")}
          className="p-2 rounded-lg text-[11px] font-extrabold"
          style={{ color: gold }}
          aria-label="Language"
          title="TH / EN"
        >
          {language === "th" ? "TH" : "EN"}
        </button>
        <button
          type="button"
          onClick={() => setDark((v) => !v)}
          className="p-2 rounded-lg"
          aria-label="Theme"
        >
          {dark ? <Sun size={18} style={{ color: gold }} /> : <Moon size={18} style={{ color: gold }} />}
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="p-2 rounded-lg relative"
          aria-label="Shopping cart"
              title="Cart → Marketplace"
        >
          <ShoppingCart size={18} style={{ color: gold }} />
          {cartCount(cart) > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: "#E11D48" }}
            >
              {cartCount(cart)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="p-1.5 rounded-full border"
          style={{ borderColor: gold }}
          aria-label="AQOND Super Profile"
          title="โปรไฟล์"
        >
          <User size={18} style={{ color: gold }} />
        </button>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* Sidebar overlay */}
        {sidebarOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-20 md:hidden"
            style={{ background: "rgba(0,0,0,0.35)" }}
            aria-label="Close sidebar backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={`absolute md:relative z-30 h-full w-[85%] max-w-[320px] flex flex-col border-r transition-transform duration-200 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-0"
          }`}
          style={{ background: surface, borderColor: border }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: border }}
          >
            <img
              src="/logo.png"
              alt=""
              className="w-9 h-9 rounded-full object-cover border"
              style={{ borderColor: gold }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: gold }}>
                AQOND OS
              </p>
              <span
                className="inline-flex text-[10px] font-bold px-1.5 rounded-full text-white"
                style={{ background: "#E11D48" }}
              >
                2
              </span>
            </div>
            <button
              type="button"
              className="md:hidden p-1"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close"
            >
              <X size={18} style={{ color: muted }} />
            </button>
          </div>

          <div
            className="mx-3 mt-3 p-3 rounded-xl border flex items-center justify-between"
            style={{ borderColor: border }}
          >
            <div>
              <p className="text-sm font-bold">Status: Available</p>
              <p className="text-[11px] text-emerald-600">Accepting Rider Jobs</p>
            </div>
            <button
              type="button"
              onClick={() => setAvailable((v) => !v)}
              className={`w-11 h-6 rounded-full relative transition-colors ${
                available ? "bg-emerald-500" : "bg-slate-300"
              }`}
              aria-label="Toggle available"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  available ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="px-3 mt-3">
            <div
              className="flex items-center gap-2 rounded-full border px-3 py-2"
              style={{ borderColor: border }}
            >
              <Search size={16} style={{ color: muted }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menus, jobs"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: text }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-4 mt-3 mb-1">
            <p className="text-xs font-semibold" style={{ color: gold }}>
              Recent / Recommended
            </p>
            <button
              type="button"
              className="text-[11px]"
              style={{ color: muted }}
              onClick={() => {
                setSessions([]);
                try {
                  localStorage.removeItem("aqond_os_chat_sessions_v1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Clear
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
            {/* Favorites */}
            <div>
              <p
                className="px-2 text-xs font-bold flex items-center gap-1 mb-1"
                style={{ color: gold }}
              >
                <Star size={12} /> Favorites
              </p>
              {favProducts.length === 0 &&
              favSessionIds.filter((id) => sessions.some((s) => s.id === id))
                .length === 0 ? (
                <p className="px-2 text-[11px]" style={{ color: muted }}>
                  No favorite items or chats yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {favProducts.map((p) => (
                    <button
                      type="button"
                      key={`fav-p-${p.id}`}
                      onClick={() =>
                        navigate(
                          p.open_path ||
                            `/storefront?p=${encodeURIComponent(`/m/product/${p.id}`)}`,
                        )
                      }
                      className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/5"
                    >
                      <Star size={12} style={{ color: gold }} />
                      <span className="text-xs font-semibold truncate flex-1">
                        {p.title}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavProducts(toggleFavoriteProduct(p));
                        }}
                      >
                        ✕
                      </button>
                    </button>
                  ))}
                  {sessions
                    .filter((s) => favSessionIds.includes(s.id))
                    .map((s) => (
                      <button
                        type="button"
                        key={`fav-s-${s.id}`}
                        onClick={() => selectSession(s.id)}
                        className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/5"
                      >
                        <MessageCircle size={12} style={{ color: gold }} />
                        <span className="text-xs font-semibold truncate">
                          {s.title}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Recent Activity (shell — matches OS mock) */}
            <div>
              <p className="px-2 text-xs font-bold mb-1" style={{ color: muted }}>
                Recent Activity
              </p>
              <div className="space-y-1.5 px-1">
                {[
                  { icon: Package, label: "New order placed", ago: "7 min ago" },
                  {
                    icon: Briefcase,
                    label: "Applied: Senior UI Designer",
                    ago: "15 min ago",
                  },
                  {
                    icon: CheckCircle2,
                    label: "Confirmed: Deep Tissue Massage",
                    ago: "2 hours ago",
                  },
                ].map((a) => {
                  const Icon = a.icon;
                  return (
                    <div
                      key={a.label}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg"
                    >
                      <Icon size={14} style={{ color: gold }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate">
                          {a.label}
                        </p>
                        <p className="text-[10px]" style={{ color: muted }}>
                          {a.ago}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Chats */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <p className="text-xs font-bold" style={{ color: muted }}>
                  Recent Chats
                </p>
                <button type="button" onClick={startNewChat} aria-label="New chat">
                  <Plus size={14} style={{ color: gold }} />
                </button>
              </div>
              {(sessions.length ? sessions : []).slice(0, 8).map((s) => {
                const isFav = favSessionIds.includes(s.id);
                const active = s.id === sessionId;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 rounded-lg px-1"
                    style={{
                      background: active ? "rgba(212,175,55,0.12)" : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => selectSession(s.id)}
                      className="flex-1 flex items-center gap-2 px-2 py-2 text-left min-w-0"
                    >
                      <MessageCircle size={14} style={{ color: gold }} />
                      <span className="text-xs font-semibold truncate">
                        {s.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFavSessionIds(toggleFavoriteSession(s.id))
                      }
                      className="p-1.5"
                      aria-label="Favorite chat"
                    >
                      <Star
                        size={14}
                        fill={isFav ? gold : "none"}
                        style={{ color: isFav ? gold : muted }}
                      />
                    </button>
                  </div>
                );
              })}
              {sessions.length === 0 ? (
                <p className="px-2 text-[11px]" style={{ color: muted }}>
                  {language === "th"
                    ? "ยังไม่มีแชท — พิมพ์ข้อความเพื่อเริ่ม"
                    : "No chats yet — type a message to start"}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between px-2 pt-1">
              <p className="text-xs font-semibold" style={{ color: muted }}>
                AQOND Ecosystem
              </p>
            </div>

            {SIDEBAR_ITEMS.filter(
              (i) =>
                !query ||
                i.label.toLowerCase().includes(query.toLowerCase()) ||
                i.subtitle.toLowerCase().includes(query.toLowerCase()),
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openModule(item.id)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-black/5"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(212,175,55,0.12)", color: gold }}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{item.label}</p>
                    <p className="text-[11px] truncate" style={{ color: muted }}>
                      {item.subtitle}
                    </p>
                  </div>
                  {item.hint ? (
                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5">
                      <TrendingUp size={12} />
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t" style={{ borderColor: border }}>
            <button
              type="button"
              onClick={() => navigate("/vip")}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2C2419] flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(90deg,#F5E6A8,#D4AF37,#AA7C11)",
              }}
            >
              <Crown size={16} />
              {copy.upgrade}
            </button>
            <div className="flex justify-around mt-3 items-center" style={{ color: muted }}>
              <HelpCircle size={18} />
              <GraduationCap size={18} />
              <button
                type="button"
                onClick={() => setLanguage(language === "th" ? "en" : "th")}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold"
                style={{ color: gold }}
                aria-label="Language"
              >
                <Globe size={16} />
                {language === "th" ? "TH" : "EN"}
              </button>
              <button type="button" onClick={() => setDark((v) => !v)}>
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </aside>

        {/* Chat pane */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user" ? "ml-auto" : "mr-auto"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: gold, color: "#2C2419" }
                      : {
                          background: dark ? "#241C14" : "#FFF",
                          border: `1px solid ${border}`,
                          color: text,
                        }
                  }
                >
                  {m.text}
                </div>
                {m.cards?.length ? (
                  <div className="mr-auto max-w-[92%] space-y-2">
                    {m.cards.map((card, idx) => {
                      if (card.type === "onboarding_step") {
                        return (
                          <div
                            key={`${m.id}-card-${idx}`}
                            className="w-full rounded-xl border p-3"
                            style={{
                              background: dark ? "#1E1712" : "#FFF",
                              borderColor: gold,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{
                                  background: "rgba(212,175,55,0.14)",
                                  color: gold,
                                }}
                              >
                                <GraduationCap size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold truncate">
                                  {card.data.title ||
                                    (language === "th"
                                      ? "ขั้นตอนต่อไป"
                                      : "Next step")}
                                </p>
                                <p
                                  className="text-[11px]"
                                  style={{ color: muted }}
                                >
                                  {card.data.progress
                                    ? `${language === "th" ? "คืบหน้า" : "Progress"} ${card.data.progress}`
                                    : language === "th"
                                      ? "สมัครพาร์ทเนอร์"
                                      : "Partner onboarding"}
                                  {card.data.minutes
                                    ? ` · ~${card.data.minutes} ${language === "th" ? "นาที" : "min"}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            {card.data.open_path ? (
                              <button
                                type="button"
                                onClick={() => navigate(card.data.open_path!)}
                                className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-[#2C2419] flex items-center justify-center gap-1.5"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#F5E6A8,#D4AF37)",
                                }}
                              >
                                {language === "th" ? "ไปทำต่อ" : "Continue"}
                                <ArrowRight size={16} />
                              </button>
                            ) : null}
                          </div>
                        );
                      }
                      const isService = card.type === "service_card";
                      return (
                        <div
                          key={`${m.id}-card-${idx}`}
                          className="w-full text-left rounded-xl border p-3 flex gap-3"
                          style={{
                            background: dark ? "#1E1712" : "#FFF",
                            borderColor: border,
                          }}
                        >
                          {(card.data.image || card.data.imageUrl) && (
                            <img
                              src={card.data.image || card.data.imageUrl}
                              alt=""
                              className="w-14 h-14 rounded-lg object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="text-left w-full"
                              onClick={() => {
                                if (isService) {
                                  navigate(card.data.open_path || "/jobs");
                                } else {
                                  openProduct(card);
                                }
                              }}
                            >
                              <p className="text-sm font-bold truncate">
                                {card.data.title}
                              </p>
                              {card.data.description ? (
                                <p
                                  className="text-[11px] line-clamp-2"
                                  style={{ color: muted }}
                                >
                                  {card.data.description}
                                </p>
                              ) : null}
                              {card.data.rating != null ? (
                                <p className="text-[11px] mt-0.5" style={{ color: gold }}>
                                  ★ {card.data.rating}
                                  {card.data.location
                                    ? ` · ${card.data.location}`
                                    : ""}
                                </p>
                              ) : null}
                              {card.data.price != null && card.data.price !== "" ? (
                                <p
                                  className="text-sm font-semibold mt-0.5"
                                  style={{ color: gold }}
                                >
                                  {typeof card.data.price === "number"
                                    ? `฿${Number(card.data.price).toLocaleString("th-TH")}`
                                    : String(card.data.price)}
                                </p>
                              ) : null}
                            </button>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {!isService ? (
                                <>
                                  <button
                                    type="button"
                                    className="text-[11px] font-bold px-2 py-1 rounded-lg border"
                                    style={{ borderColor: border, color: gold }}
                                    onClick={() => {
                                      if (!card.data.id || !card.data.title) return;
                                      setFavProducts(
                                        toggleFavoriteProduct({
                                          id: String(card.data.id),
                                          title: String(card.data.title),
                                          price:
                                            typeof card.data.price === "number"
                                              ? card.data.price
                                              : undefined,
                                          image:
                                            card.data.image || card.data.imageUrl,
                                          open_path: card.data.open_path,
                                        }),
                                      );
                                    }}
                                  >
                                    ⭐ {copy.fav}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[11px] font-bold px-2 py-1 rounded-lg"
                                    style={{ background: gold, color: "#2C2419" }}
                                    onClick={() => {
                                      if (!card.data.id || !card.data.title) return;
                                      setCart(
                                        addToCart({
                                          id: String(card.data.id),
                                          title: String(card.data.title),
                                          price: Number(card.data.price || 0),
                                          image:
                                            card.data.image || card.data.imageUrl,
                                          open_path: card.data.open_path,
                                        }),
                                      );
                                      setCartOpen(true);
                                    }}
                                  >
                                    + {copy.cart}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg"
                                  style={{ background: gold, color: "#2C2419" }}
                                  onClick={() =>
                                    navigate(card.data.open_path || "/jobs")
                                  }
                                >
                                  {copy.contact}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {m.searchPath ? (
                      <button
                        type="button"
                        onClick={() => {
                          const p = m.searchPath!;
                          if (p.startsWith("/storefront") || p.startsWith("/")) {
                            navigate(p);
                          } else {
                            navigate(p);
                          }
                        }}
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-[#2C2419]"
                        style={{
                          background: "linear-gradient(90deg,#F5E6A8,#D4AF37)",
                        }}
                      >
                        {m.cards?.[0]?.type === "service_card"
                          ? language === "th"
                            ? "เปิดรายการช่าง / บริการทั้งหมด"
                            : "Open all technicians / services"
                          : copy.openAll}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {m.consent ? (
                  <div
                    className="mr-auto max-w-[92%] rounded-xl border p-3"
                    style={{
                      background: dark ? "#1E1712" : "#FFF",
                      borderColor: "#E11D48",
                    }}
                  >
                    <p className="text-sm font-bold" style={{ color: text }}>
                      {m.consent.title}
                    </p>
                    <div className="mt-2 space-y-1">
                      {m.consent.summary.map((row, i) => (
                        <div
                          key={`${m.id}-consent-${i}`}
                          className="flex items-start gap-2 text-[12px]"
                        >
                          <span className="shrink-0" style={{ color: muted }}>
                            {row.label}:
                          </span>
                          <span
                            className="font-semibold break-all"
                            style={{ color: text }}
                          >
                            {row.value}
                            {row.sensitive ? " 🔒" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: muted }}>
                      {m.consent.warning}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => void handleConsent(m.consent!, "approve")}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#2C2419]"
                        style={{
                          background: "linear-gradient(90deg,#F5E6A8,#D4AF37)",
                        }}
                      >
                        {m.consent.confirmLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConsent(m.consent!, "reject")}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold border"
                        style={{ borderColor: border, color: muted }}
                      >
                        {m.consent.cancelLabel}
                      </button>
                    </div>
                  </div>
                ) : null}
                {m.consentResolved ? (
                  <div
                    className="mr-auto max-w-[92%] text-[11px] font-semibold px-1"
                    style={{
                      color: m.consentResolved === "approved" ? "#059669" : muted,
                    }}
                  >
                    {m.consentResolved === "approved"
                      ? language === "th"
                        ? "✓ ยืนยันแล้ว"
                        : "✓ Confirmed"
                      : language === "th"
                        ? "ยกเลิกแล้ว"
                        : "Cancelled"}
                  </div>
                ) : null}
              </div>
            ))}
            {isTyping ? (
              <div
                className="mr-auto max-w-[60%] rounded-2xl px-3.5 py-2.5 text-sm"
                style={{
                  background: dark ? "#241C14" : "#FFF",
                  border: `1px solid ${border}`,
                  color: muted,
                }}
              >
                {copy.typing}
              </div>
            ) : null}
          </div>

          <div
            className="shrink-0 border-t p-3 flex items-end gap-2"
            style={{ background: surface, borderColor: border }}
          >
            <button
              type="button"
              className="w-11 h-11 rounded-full flex items-center justify-center border shrink-0"
              style={{ borderColor: border, background: dark ? "#2A2218" : "#F5F0E8", color: gold }}
              aria-label="Attach"
            >
              <Paperclip size={18} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={copy.placeholder}
              disabled={isTyping}
              className="flex-1 resize-none rounded-2xl border px-3 py-2.5 text-sm outline-none max-h-28 disabled:opacity-60"
              style={{ borderColor: border, background: bg, color: text }}
            />
            {sttSupported ? (
              <button
                type="button"
                onClick={toggleMic}
                disabled={isTyping}
                className="w-11 h-11 rounded-full flex items-center justify-center border shrink-0 disabled:opacity-50"
                style={{
                  borderColor: listening ? "#E11D48" : border,
                  background: listening
                    ? "#E11D48"
                    : dark
                      ? "#2A2218"
                      : "#F5F0E8",
                  color: listening ? "#FFF" : gold,
                }}
                aria-label={listening ? "Stop voice input" : "Voice input"}
                title={
                  listening
                    ? language === "th"
                      ? "หยุดพูด"
                      : "Stop"
                    : language === "th"
                      ? "พูดกับ Hermes"
                      : "Speak to Hermes"
                }
              >
                {listening ? <Square size={16} /> : <Mic size={18} />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void send()}
              disabled={isTyping || !input.trim()}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white disabled:opacity-50"
              style={{ background: gold }}
              aria-label="Send"
            >
              <Send size={18} />
            </button>
          </div>
        </main>
      </div>

      <AqondSuperProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        dark={dark}
      />
      <AqondCartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        dark={dark}
        onClear={() => setCart(clearCart())}
      />
    </div>
  );
};

export default AqondOsChat;
