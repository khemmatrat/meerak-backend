// Party Vibe Picker — FLIP layout, GPS, API quick match, local ambient + fade, matching pulse
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from "framer-motion";
import {
  PartyPopper,
  Wine,
  Mic2,
  Camera,
  ChevronRight,
  Users,
  X,
  UserCircle,
  Sparkles,
  SlidersHorizontal,
  MapPin,
  Volume2,
  VolumeX,
  Loader2,
  Navigation,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { MockApi } from "../services/mockApi";
import { recordQuickMatchSuccess } from "../lib/premiumWalletStorage";

const AMBIENT_MUTE_KEY = "party_vibe_ambient_muted";

export interface PartyVibeOption {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  prefillTitle: string;
  prefillDescription: string;
  gradient: string;
  iconBg: string;
}

type TalentAvatar = { id: string; name: string; avatarUrl?: string; rating?: number };

type ScoredTalent = TalentAvatar & {
  distance: string;
  matchPct: number;
  distanceKm?: number | null;
  reasonTag?: string;
};

/** Local loops under /public/party-vibe/ — replace with branded assets anytime */
const LOCAL_AMBIENT: Record<string, string> = {
  party_monster: "/party-vibe/party.mp3",
  fine_dining: "/party-vibe/business.mp3",
  karaoke: "/party-vibe/karaoke.mp3",
  cafe_hopping: "/party-vibe/cafe.mp3",
};

const PULSE_THEME: Record<string, { ring: string; glow: string; center: string }> = {
  party_monster: {
    ring: "border-fuchsia-500/60",
    glow: "shadow-[0_0_80px_rgba(217,70,239,0.45)]",
    center: "from-fuchsia-500 via-purple-600 to-violet-700",
  },
  fine_dining: {
    ring: "border-amber-500/60",
    glow: "shadow-[0_0_70px_rgba(245,158,11,0.35)]",
    center: "from-amber-500 via-amber-600 to-yellow-800",
  },
  karaoke: {
    ring: "border-pink-500/60",
    glow: "shadow-[0_0_75px_rgba(236,72,153,0.38)]",
    center: "from-rose-500 via-pink-600 to-fuchsia-800",
  },
  cafe_hopping: {
    ring: "border-cyan-400/55",
    glow: "shadow-[0_0_70px_rgba(34,211,238,0.32)]",
    center: "from-teal-500 via-cyan-500 to-sky-700",
  },
};

function pulseVibrate() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([12, 6, 14]);
    }
  } catch {
    /* ignore */
  }
}

function vibrateMatchSuccess() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([18, 50, 22, 40, 28]);
    }
  } catch {
    /* ignore */
  }
}

function fadeInAudio(audio: HTMLAudioElement | null, targetVol: number, ms: number, onDone?: () => void) {
  if (!audio) {
    onDone?.();
    return;
  }
  if (ms <= 0) {
    audio.volume = targetVol;
    onDone?.();
    return;
  }
  audio.volume = 0;
  const steps = 24;
  const stepMs = ms / steps;
  let step = 0;
  const id = window.setInterval(() => {
    step++;
    audio.volume = Math.min(targetVol, targetVol * (step / steps));
    if (step >= steps) {
      window.clearInterval(id);
      audio.volume = targetVol;
      onDone?.();
    }
  }, stepMs);
}

function fadeOutAudio(audio: HTMLAudioElement | null, ms: number, onDone: () => void) {
  if (!audio) {
    onDone();
    return;
  }
  if (ms <= 0) {
    audio.pause();
    audio.currentTime = 0;
    onDone();
    return;
  }
  const startVol = audio.volume;
  if (startVol <= 0.001) {
    audio.pause();
    onDone();
    return;
  }
  const steps = 24;
  const stepMs = ms / steps;
  let step = 0;
  const id = window.setInterval(() => {
    step++;
    audio.volume = Math.max(0, startVol * (1 - step / steps));
    if (step >= steps) {
      window.clearInterval(id);
      audio.pause();
      audio.currentTime = 0;
      audio.volume = startVol;
      onDone();
    }
  }, stepMs);
}

function formatKmLabel(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "2 km";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function matchPctFromRow(rating: number, distanceKm: number | null | undefined): number {
  const r = rating || 4.5;
  const d = distanceKm == null || !Number.isFinite(distanceKm) ? 5 : distanceKm;
  return Math.min(98, Math.max(72, Math.round(58 + r * 8 + Math.max(0, 18 - d * 2.2))));
}

function assignReasonTags(picks: ScoredTalent[], hasGps: boolean, t: (key: string) => string): ScoredTalent[] {
  if (picks.length === 0) return [];
  if (!hasGps) {
    const pool = [t("party_vibe.tag_estimated_fit"), t("party_vibe.tag_top_rated"), t("party_vibe.tag_quick")];
    return picks.map((p, i) => ({ ...p, reasonTag: pool[Math.min(i, pool.length - 1)] }));
  }
  const ratings = picks.map((p) => p.rating ?? 0);
  const maxR = Math.max(...ratings);
  const topIdx = picks.findIndex((p) => (p.rating ?? 0) === maxR);
  const withKm = picks
    .map((p, i) => ({ p, i, km: p.distanceKm }))
    .filter((x) => x.km != null && Number.isFinite(x.km as number));
  let closestIdx = -1;
  if (withKm.length) {
    const minKm = Math.min(...withKm.map((x) => x.km as number));
    closestIdx = withKm.find((x) => (x.km as number) === minKm)!.i;
  }

  return picks.map((p, i) => {
    const kmStr = formatKmLabel(p.distanceKm);
    if (closestIdx < 0) {
      return { ...p, reasonTag: i === topIdx ? t("party_vibe.tag_top_rated") : t("party_vibe.tag_quick") };
    }
    if (i === closestIdx && i === topIdx) {
      return { ...p, reasonTag: t("party_vibe.tag_closest_and_rated").replace("{km}", kmStr) };
    }
    if (i === closestIdx) {
      return { ...p, reasonTag: t("party_vibe.tag_closest").replace("{km}", kmStr) };
    }
    if (i === topIdx) {
      return { ...p, reasonTag: t("party_vibe.tag_top_rated") };
    }
    return { ...p, reasonTag: t("party_vibe.tag_quick") };
  });
}

const SCENE_THEMES: Record<
  string,
  {
    overlayTint: string;
    heroBar: string;
    sheetRing: string;
    glow: string;
    accent: string;
    primaryBtn: string;
    glassList: string;
  }
> = {
  party_monster: {
    overlayTint: "from-violet-950/85 via-fuchsia-950/75 to-black/92",
    heroBar: "from-violet-500 via-fuchsia-500 to-purple-600",
    sheetRing: "border-fuchsia-400/25",
    glow: "shadow-[0_0_100px_rgba(192,38,211,0.28)]",
    accent: "text-fuchsia-200",
    primaryBtn:
      "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-violet-600 hover:brightness-110 shadow-lg shadow-fuchsia-500/30",
    glassList: "bg-[#0c0d12]/75 backdrop-blur-2xl border border-white/[0.08] shadow-inner shadow-black/40",
  },
  fine_dining: {
    overlayTint: "from-amber-950/88 via-stone-950/82 to-black/92",
    heroBar: "from-amber-500 via-amber-600 to-yellow-800",
    sheetRing: "border-amber-400/30",
    glow: "shadow-[0_0_90px_rgba(245,158,11,0.22)]",
    accent: "text-amber-200",
    primaryBtn:
      "bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:brightness-110 shadow-lg shadow-amber-600/25",
    glassList: "bg-[#0c0d12]/75 backdrop-blur-2xl border border-amber-500/10 shadow-inner shadow-black/40",
  },
  karaoke: {
    overlayTint: "from-rose-950/85 via-pink-950/78 to-black/92",
    heroBar: "from-rose-500 via-pink-500 to-purple-700",
    sheetRing: "border-pink-400/25",
    glow: "shadow-[0_0_95px_rgba(236,72,153,0.25)]",
    accent: "text-pink-200",
    primaryBtn:
      "bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-600 hover:brightness-110 shadow-lg shadow-pink-500/28",
    glassList: "bg-[#0c0d12]/75 backdrop-blur-2xl border border-pink-500/10 shadow-inner shadow-black/40",
  },
  cafe_hopping: {
    overlayTint: "from-teal-950/85 via-cyan-950/80 to-black/92",
    heroBar: "from-teal-400 via-cyan-500 to-sky-700",
    sheetRing: "border-cyan-400/25",
    glow: "shadow-[0_0_85px_rgba(34,211,238,0.22)]",
    accent: "text-cyan-200",
    primaryBtn:
      "bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-500 hover:brightness-110 shadow-lg shadow-cyan-500/22",
    glassList: "bg-[#0c0d12]/75 backdrop-blur-2xl border border-cyan-500/10 shadow-inner shadow-black/40",
  },
};

const CARD_SELECTION_GLOW: Record<string, string> = {
  party_monster: "ring-2 ring-fuchsia-400/60 shadow-[0_0_36px_rgba(217,70,239,0.42)]",
  fine_dining: "ring-2 ring-amber-400/55 shadow-[0_0_30px_rgba(245,158,11,0.33)]",
  karaoke: "ring-2 ring-pink-400/55 shadow-[0_0_34px_rgba(236,72,153,0.36)]",
  cafe_hopping: "ring-2 ring-cyan-400/50 shadow-[0_0_32px_rgba(34,211,238,0.30)]",
};

async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 14000, maximumAge: 60000 },
    );
  });
}

type MatchingRun = {
  vibe: PartyVibeOption;
  provider: ScoredTalent | null;
};

export const PartyVibePicker: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const reduceMotion = useReducedMotion();
  const [onlineCount] = useState(() => 18 + Math.floor(Math.random() * 12));
  const [mounted, setMounted] = useState(false);
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [activeTalents, setActiveTalents] = useState<TalentAvatar[]>([]);
  const [overlayVibe, setOverlayVibe] = useState<PartyVibeOption | null>(null);
  const [topPicks, setTopPicks] = useState<ScoredTalent[]>([]);
  const [overlayEnter, setOverlayEnter] = useState(false);
  const [topPicksLoading, setTopPicksLoading] = useState(false);
  const [quickMatchLoading, setQuickMatchLoading] = useState(false);
  const [ambientMuted, setAmbientMuted] = useState(false);
  const [matchingRun, setMatchingRun] = useState<MatchingRun | null>(null);
  const [matchingPhase, setMatchingPhase] = useState(0);
  const [cardPulseId, setCardPulseId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gpsToastShown = useRef(false);

  useEffect(() => {
    try {
      setAmbientMuted(sessionStorage.getItem(AMBIENT_MUTE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (userGeo && !gpsToastShown.current) {
      gpsToastShown.current = true;
      notify(t("party_vibe.gps_active_toast"), "info");
    }
  }, [userGeo, notify, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await getCurrentPosition();
      if (cancelled) return;
      if (!pos) {
        setGeoDenied(true);
        try {
          const list = await MockApi.getProviders("party_guest");
          const avatars: TalentAvatar[] = (list || []).slice(0, 24).map((p: any) => ({
            id: p.id,
            name: p.name || "Talent",
            avatarUrl: p.avatarUrl || p.avatar_url,
            rating: p.rating ?? 4.5,
          }));
          setActiveTalents(avatars.length ? avatars : []);
        } catch {
          setActiveTalents([]);
        }
        return;
      }
      setUserGeo(pos);
      setGeoDenied(false);
      try {
        const nearby = await MockApi.getNearbyProviders(24, {
          lat: pos.lat,
          lng: pos.lng,
          category: "party_guest",
        });
        if (cancelled) return;
        const avatars: TalentAvatar[] = nearby.map((n) => ({
          id: n.id,
          name: n.name,
          avatarUrl: n.avatarUrl,
          rating: n.rating,
        }));
        setActiveTalents(avatars.length ? avatars : []);
      } catch {
        const list = await MockApi.getProviders("party_guest").catch(() => []);
        if (cancelled) return;
        setActiveTalents(
          (list || []).slice(0, 24).map((p: any) => ({
            id: p.id,
            name: p.name || "Talent",
            avatarUrl: p.avatarUrl || p.avatar_url,
            rating: p.rating ?? 4.5,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!overlayVibe) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }
    const url = LOCAL_AMBIENT[overlayVibe.id] || LOCAL_AMBIENT.party_monster;
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.loop = true;
    } else {
      audioRef.current.src = url;
      audioRef.current.loop = true;
    }
    const a = audioRef.current;
    if (ambientMuted) {
      a.volume = 0;
      a.pause();
      return;
    }
    a.volume = 0;
    a.play().catch(() => {});
    fadeInAudio(a, 0.14, 500);
  }, [overlayVibe, ambientMuted]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayEnter(false);
    const a = audioRef.current;
    if (!a || ambientMuted) {
      window.setTimeout(() => setOverlayVibe(null), 280);
      return;
    }
    fadeOutAudio(a, 500, () => {
      window.setTimeout(() => setOverlayVibe(null), 120);
    });
  }, [ambientMuted]);

  useEffect(() => {
    if (!overlayVibe) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [overlayVibe, closeOverlay]);

  useEffect(() => {
    if (!overlayVibe) {
      setOverlayEnter(false);
      return;
    }
    const id = requestAnimationFrame(() => setOverlayEnter(true));
    return () => cancelAnimationFrame(id);
  }, [overlayVibe]);

  const goCreateJobRef = useCallback(
    (vibe: PartyVibeOption, extra?: { provider?: ScoredTalent; quick?: boolean }) => {
      const baseDesc = vibe.prefillDescription;
      const desc =
        extra?.provider && extra?.quick
          ? `${baseDesc}\n\n⚡ AI Quick Match → ${extra.provider.name} (${extra.provider.matchPct}% ${t("party_vibe.overlay_match")})`
          : baseDesc;
      navigate(
        extra?.provider
          ? `/create-job?providerId=${encodeURIComponent(extra.provider.id)}&providerName=${encodeURIComponent(extra.provider.name)}`
          : "/create-job",
        {
          state: {
            fromPartyVibe: true,
            vibe: {
              category: "Party_Guest",
              title: vibe.prefillTitle,
              description: desc,
            },
          },
          replace: false,
        },
      );
    },
    [navigate, t],
  );

  useEffect(() => {
    if (!matchingRun) return;
    const timer = window.setTimeout(() => {
      vibrateMatchSuccess();
      const { vibe, provider } = matchingRun;
      const amountThb = provider ? 500 : 250;
      recordQuickMatchSuccess(vibe.id, vibe.title, amountThb);
      notify(t("party_vibe.wallet_credit_toast").replace("{amount}", String(amountThb)), "success");
      setMatchingRun(null);
      setOverlayVibe(null);
      setOverlayEnter(false);
      if (provider) {
        goCreateJobRef(vibe, { provider, quick: true });
      } else {
        goCreateJobRef(vibe);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [matchingRun, goCreateJobRef, notify, t]);

  useEffect(() => {
    if (!matchingRun) {
      setMatchingPhase(0);
      return;
    }
    setMatchingPhase(0);
    const t1 = window.setTimeout(() => setMatchingPhase(1), 500);
    const t2 = window.setTimeout(() => setMatchingPhase(2), 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [matchingRun]);

  const vibes: PartyVibeOption[] = useMemo(
    () => [
      {
        id: "party_monster",
        icon: <PartyPopper size={28} strokeWidth={2.5} />,
        title: t("party_vibe.party_monster"),
        description: t("party_vibe.party_monster_desc"),
        prefillTitle: t("party_vibe.prefill_party_monster"),
        prefillDescription: t("party_vibe.prefill_party_monster_desc"),
        gradient: "from-violet-600 via-purple-600 to-fuchsia-600",
        iconBg: "bg-pink-400/90",
      },
      {
        id: "fine_dining",
        icon: <Wine size={28} strokeWidth={2.5} />,
        title: t("party_vibe.fine_dining"),
        description: t("party_vibe.fine_dining_desc"),
        prefillTitle: t("party_vibe.prefill_fine_dining"),
        prefillDescription: t("party_vibe.prefill_fine_dining_desc"),
        gradient: "from-amber-600 via-orange-600 to-rose-600",
        iconBg: "bg-amber-400/90",
      },
      {
        id: "karaoke",
        icon: <Mic2 size={28} strokeWidth={2.5} />,
        title: t("party_vibe.karaoke"),
        description: t("party_vibe.karaoke_desc"),
        prefillTitle: t("party_vibe.prefill_karaoke"),
        prefillDescription: t("party_vibe.prefill_karaoke_desc"),
        gradient: "from-rose-600 via-pink-600 to-purple-600",
        iconBg: "bg-rose-400/90",
      },
      {
        id: "cafe_hopping",
        icon: <Camera size={28} strokeWidth={2.5} />,
        title: t("party_vibe.cafe_hopping"),
        description: t("party_vibe.cafe_hopping_desc"),
        prefillTitle: t("party_vibe.prefill_cafe_hopping"),
        prefillDescription: t("party_vibe.prefill_cafe_hopping_desc"),
        gradient: "from-teal-600 via-cyan-600 to-sky-600",
        iconBg: "bg-cyan-400/90",
      },
    ],
    [t],
  );

  const isPartyMonsterHot = () => {
    const d = new Date();
    const day = d.getDay();
    const hour = d.getHours();
    return (day === 5 || day === 6) && hour >= 18;
  };

  const loadTopPicksForVibe = useCallback(
    async (_vibeId: string) => {
      setTopPicksLoading(true);
      try {
        const pos = userGeo || (await getCurrentPosition());
        const hasGps = !!pos;
        if (pos) {
          setUserGeo(pos);
          setGeoDenied(false);
          const nearby = await MockApi.getNearbyProviders(3, {
            lat: pos.lat,
            lng: pos.lng,
            category: "party_guest",
          });
          const picksRaw: ScoredTalent[] = nearby.map((n) => ({
            id: n.id,
            name: n.name,
            avatarUrl: n.avatarUrl,
            rating: n.rating,
            distance: n.distance,
            distanceKm: n.distanceKm ?? null,
            matchPct: matchPctFromRow(n.rating, n.distanceKm),
          }));
          setTopPicks(assignReasonTags(picksRaw, hasGps, t));
        } else {
          setGeoDenied(true);
          const list = await MockApi.getProviders("party_guest");
          const raw: ScoredTalent[] = (list || []).slice(0, 3).map((p: any, i: number) => ({
            id: p.id,
            name: p.name || "Talent",
            avatarUrl: p.avatarUrl || p.avatar_url,
            rating: p.rating ?? 4.5,
            distance: "—",
            distanceKm: null,
            matchPct: matchPctFromRow(p.rating ?? 4.5, 2 + i),
          }));
          setTopPicks(assignReasonTags(raw, false, t));
        }
      } catch {
        setTopPicks([]);
      } finally {
        setTopPicksLoading(false);
      }
    },
    [userGeo, t],
  );

  const openScene = (vibe: PartyVibeOption) => {
    pulseVibrate();
    setCardPulseId(vibe.id);
    window.setTimeout(() => setCardPulseId(null), 420);
    setOverlayVibe(vibe);
    loadTopPicksForVibe(vibe.id);
  };

  const handleQuickMatch = async () => {
    if (!overlayVibe) return;
    pulseVibrate();
    const pos = userGeo || (await getCurrentPosition());
    setQuickMatchLoading(true);
    try {
      if (!pos) {
        setGeoDenied(true);
        const p0 = topPicks[0];
        setMatchingRun({ vibe: overlayVibe, provider: p0 || null });
        return;
      }
      setUserGeo(pos);
      setGeoDenied(false);
      const res = await MockApi.partyVibeQuickMatch({
        lat: pos.lat,
        lng: pos.lng,
        vibeId: overlayVibe.id,
      });
      const best = res.top?.[0];
      let provider: ScoredTalent | null = null;
      if (best) {
        provider = {
          id: best.id,
          name: best.name,
          avatarUrl: best.avatarUrl,
          rating: best.rating,
          distance: best.distanceLabel,
          distanceKm: best.distanceKm ?? null,
          matchPct: best.matchPct,
        };
      } else if (topPicks[0]) {
        provider = topPicks[0];
      }
      setMatchingRun({ vibe: overlayVibe, provider });
    } finally {
      setQuickMatchLoading(false);
    }
  };

  const handleCustomize = () => {
    if (!overlayVibe) return;
    const vibe = overlayVibe;
    pulseVibrate();
    setOverlayEnter(false);
    fadeOutAudio(audioRef.current, ambientMuted ? 0 : 500, () => {
      setOverlayVibe(null);
      goCreateJobRef(vibe);
    });
  };

  const handleBrowseTalents = () => {
    navigate("/talents?category=party_guest&status=online");
  };

  const theme = overlayVibe ? SCENE_THEMES[overlayVibe.id] || SCENE_THEMES.party_monster : null;
  const pulseVisual = matchingRun ? PULSE_THEME[matchingRun.vibe.id] || PULSE_THEME.party_monster : null;

  useEffect(() => {
    if (!matchingRun) return;
    fadeOutAudio(audioRef.current, 500, () => {});
  }, [matchingRun]);

  return (
    <LayoutGroup id="party-vibe-layout">
      <>
        <div
          className={`min-h-screen bg-gradient-to-br from-[#07080c] via-purple-950/35 to-[#07080c] transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="relative px-4 pt-6 pb-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="absolute left-4 top-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
              aria-label="Back"
            >
              <X size={24} />
            </button>
            <h1 className="text-2xl font-bold text-center text-white pt-2 tracking-tight">{t("party_vibe.title")}</h1>
            <p className="text-center text-white/70 text-sm mt-1">{t("party_vibe.subtitle")}</p>
            {userGeo && (
              <div className="flex justify-center mt-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200/95 text-[11px] font-medium">
                  <Navigation size={12} className="shrink-0 opacity-90" />
                  {t("party_vibe.gps_active_toast")}
                </span>
              </div>
            )}
            {geoDenied && (
              <div className="mt-3 mx-auto max-w-md rounded-2xl border border-amber-500/35 bg-amber-950/40 px-4 py-3 text-center">
                <p className="text-amber-200 font-semibold text-sm">{t("party_vibe.estimated_mode_badge")}</p>
                <p className="text-amber-100/80 text-xs mt-1">{t("party_vibe.estimated_mode_hint")}</p>
              </div>
            )}
          </div>

          <div className="mx-4 mb-6 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500/15 to-pink-500/15 border border-amber-400/25 flex items-center justify-center gap-2">
            <Users size={18} className="text-amber-300" />
            <span className="text-sm font-medium text-amber-100/90">
              {t("party_vibe.online_count").replace("{count}", String(onlineCount))}
            </span>
          </div>

          <div className="px-4 space-y-4 pb-4" data-tour="party-vibe-selector">
            {vibes.map((vibe, index) => (
              <motion.button
                key={vibe.id}
                type="button"
                onClick={() => openScene(vibe)}
                data-tour={index === 0 ? "party-slot-booking" : undefined}
                className={`relative w-full text-left rounded-2xl overflow-hidden shadow-xl transition-shadow duration-300 ${
                  mounted ? "animate-slide-up" : "opacity-0"
                } ${overlayVibe?.id === vibe.id ? "pointer-events-none" : ""}`}
                style={{
                  animationDelay: `${index * 80}ms`,
                  animationFillMode: "both",
                  opacity: overlayVibe?.id === vibe.id ? 0 : 1,
                }}
                whileHover={reduceMotion ? undefined : { scale: 1.01 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              >
                {vibe.id === "party_monster" && isPartyMonsterHot() && (
                  <span className="absolute top-2 right-2 z-10 px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-bold shadow-lg flex items-center gap-1">
                    HOT 🔥
                  </span>
                )}
                <motion.div
                  layoutId={`party-vibe-hero-${vibe.id}`}
                  className={`rounded-2xl overflow-hidden will-change-transform transition-shadow duration-300 ${
                    cardPulseId === vibe.id ? CARD_SELECTION_GLOW[vibe.id] || CARD_SELECTION_GLOW.party_monster : ""
                  }`}
                  animate={
                    cardPulseId === vibe.id && !reduceMotion
                      ? { scale: [1, 1.035, 1] }
                      : { scale: 1 }
                  }
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                >
                  <div className={`bg-gradient-to-r ${vibe.gradient} p-5 flex items-center justify-between min-h-[88px]`}>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div
                        className={`${vibe.iconBg} w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg`}
                      >
                        {vibe.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-white text-lg truncate">{vibe.title}</h3>
                        <p className="text-white/90 text-sm truncate mt-0.5">{vibe.description}</p>
                      </div>
                    </div>
                    <ChevronRight size={24} className="text-white/90 shrink-0 ml-2" />
                  </div>
                </motion.div>
              </motion.button>
            ))}
          </div>

          {activeTalents.length > 0 && (
            <div className="px-4 pb-4">
              <p className="text-sm font-medium text-white/85 mb-3">
                {t("party_vibe.talents_nearby").replace("{count}", String(onlineCount))}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {activeTalents.map((talent) => (
                  <div key={talent.id} className="flex-shrink-0 flex flex-col items-center gap-1.5 group">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/20 ring-offset-2 ring-offset-[#07080c] shadow-lg bg-white/5 avatar-glow">
                        {talent.avatarUrl ? (
                          <img
                            src={talent.avatarUrl}
                            alt={talent.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://i.pravatar.cc/150?u=" + talent.id;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-purple-500/40 text-white">
                            <UserCircle size={28} />
                          </div>
                        )}
                      </div>
                      {talent.rating != null && talent.rating >= 4.8 && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                          ★ {talent.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-white/70 truncate max-w-[64px] text-center">{talent.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={handleBrowseTalents}
              className="w-full py-3.5 px-4 rounded-2xl border border-white/25 text-white/95 font-medium bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-2 backdrop-blur-sm"
            >
              <Users size={20} />
              {t("party_vibe.browse_talents")}
            </button>
          </div>

          <p className="text-center text-white/55 text-xs mb-8 px-4">{t("party_vibe.hint")}</p>
        </div>

        <AnimatePresence>
          {overlayVibe && theme && (
            <div
              className="fixed inset-0 z-[100] flex flex-col justify-end"
              role="dialog"
              aria-modal="true"
              aria-labelledby="party-scene-title"
            >
              <button
                type="button"
                className={`absolute inset-0 bg-gradient-to-b ${theme.overlayTint} backdrop-blur-xl transition-opacity duration-300 ${
                  overlayEnter ? "opacity-100" : "opacity-0"
                }`}
                onClick={closeOverlay}
                aria-label="Close"
              />

              <div className="absolute top-4 right-4 z-[110] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    pulseVibrate();
                    setAmbientMuted((m) => {
                      const next = !m;
                      try {
                        sessionStorage.setItem(AMBIENT_MUTE_KEY, next ? "1" : "0");
                      } catch {
                        /* ignore */
                      }
                      return next;
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 text-white shadow-lg hover:bg-black/65 transition-colors"
                  aria-label={ambientMuted ? t("party_vibe.overlay_audio_unmute") : t("party_vibe.overlay_audio_mute")}
                >
                  {ambientMuted ? <VolumeX size={20} className="text-white/90" /> : <Volume2 size={20} className="text-emerald-300" />}
                  <span className="text-xs font-semibold tracking-wide hidden sm:inline">
                    {ambientMuted ? t("party_vibe.overlay_audio_unmute") : t("party_vibe.overlay_audio_mute")}
                  </span>
                </button>
              </div>

              {userGeo && (
                <div className="absolute top-4 left-4 right-24 z-[110] sm:right-auto sm:max-w-[70%]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/10 text-white/85 text-[10px] sm:text-xs">
                    <Navigation size={12} className="text-emerald-400 shrink-0" />
                    {t("party_vibe.gps_active_toast")}
                  </span>
                </div>
              )}
              {geoDenied && (
                <div className="absolute top-14 left-4 right-4 z-[110] sm:top-16">
                  <p className="text-[11px] text-amber-200/95 bg-amber-950/50 border border-amber-500/30 rounded-xl px-3 py-2 backdrop-blur-md">
                    <span className="font-semibold">{t("party_vibe.estimated_mode_badge")}</span>
                    {" · "}
                    {t("party_vibe.estimated_mode_hint")}
                  </p>
                </div>
              )}

              <div
                className={`relative mx-auto w-full max-w-lg px-3 pb-safe pb-6 pt-2 transition-all duration-500 ease-out ${
                  overlayEnter ? "translate-y-0 opacity-100" : "translate-y-[110%] opacity-0"
                }`}
              >
                <div
                  className={`mx-2 mb-3 h-1.5 rounded-full bg-gradient-to-r ${theme.heroBar} ${theme.glow} transform transition-transform duration-500 ${
                    overlayEnter ? "scale-x-100" : "scale-x-0"
                  } origin-center`}
                />

                <div
                  className={`rounded-[1.35rem] border ${theme.sheetRing} ${theme.glow} overflow-hidden shadow-2xl bg-[#0a0b10]/90 backdrop-blur-2xl`}
                >
                  <motion.div
                    layoutId={`party-vibe-hero-${overlayVibe.id}`}
                    className="overflow-hidden"
                    transition={{ type: "spring", stiffness: 320, damping: 34 }}
                  >
                    <div className={`bg-gradient-to-r ${overlayVibe.gradient} px-5 py-4 flex items-start justify-between gap-3`}>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${theme.accent} opacity-90`}>
                          {t("party_vibe.overlay_enter")}
                        </p>
                        <h2 id="party-scene-title" className="text-xl font-bold text-white leading-snug mt-1">
                          {overlayVibe.title}
                        </h2>
                        <p className="text-white/85 text-sm mt-0.5 line-clamp-2">{overlayVibe.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeOverlay}
                        className="shrink-0 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors border border-white/10"
                        aria-label="Close"
                      >
                        <X size={22} />
                      </button>
                    </div>
                  </motion.div>

                  <div className="px-3 py-4 space-y-3 bg-gradient-to-b from-black/50 to-black/70">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="text-sm font-semibold text-white">{t("party_vibe.overlay_top_picks")}</p>
                      <span className="text-[10px] text-white/45 max-w-[48%] text-right leading-tight">
                        {t("party_vibe.overlay_ai_note")}
                      </span>
                    </div>

                    {topPicksLoading ? (
                      <div className={`flex items-center justify-center gap-2 py-10 rounded-2xl ${theme.glassList}`}>
                        <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
                        <span className="text-sm text-white/70">{t("party_vibe.overlay_loc_loading")}</span>
                      </div>
                    ) : (
                      <div className={`space-y-2 rounded-2xl p-2 ${theme.glassList}`}>
                        {topPicks.map((talent, idx) => (
                          <Link
                            key={talent.id}
                            to={`/talents/${talent.id}`}
                            onClick={() => pulseVibrate()}
                            className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 hover:bg-white/[0.07] transition-colors"
                            style={{
                              animation: `slide-up-panel 0.45s ease-out ${80 + idx * 90}ms both`,
                            }}
                          >
                            <div className="relative shrink-0">
                              <div className="w-14 h-14 rounded-2xl overflow-hidden ring-1 ring-white/15">
                                {talent.avatarUrl ? (
                                  <img
                                    src={talent.avatarUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = "https://i.pravatar.cc/150?u=" + talent.id;
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-white/10 text-white">
                                    <UserCircle size={28} />
                                  </div>
                                )}
                              </div>
                              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-emerald-500/95 text-white text-[10px] font-bold shadow-md">
                                {talent.matchPct}%
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white truncate">{talent.name}</p>
                              <div className="flex items-center gap-2 text-xs text-white/65 mt-0.5">
                                <span className="inline-flex items-center gap-0.5">★ {talent.rating?.toFixed(1) ?? "—"}</span>
                                <span className="text-white/30">·</span>
                                <span className="inline-flex items-center gap-0.5">
                                  <MapPin size={12} className="opacity-80" />
                                  {talent.distance}
                                </span>
                              </div>
                              {talent.reasonTag && (
                                <p className="mt-1.5 text-[10px] leading-snug text-white/55 line-clamp-2 border-l-2 border-white/20 pl-2">
                                  {talent.reasonTag}
                                </p>
                              )}
                            </div>
                            <ChevronRight size={18} className="text-white/35 shrink-0" />
                          </Link>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={quickMatchLoading || !!matchingRun}
                        onClick={handleQuickMatch}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-3.5 px-4 text-white font-bold ${theme.primaryBtn} transition-transform active:scale-[0.98] disabled:opacity-60`}
                      >
                        {quickMatchLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 size={20} className="animate-spin" />
                            {t("party_vibe.overlay_quick_loading")}
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-2">
                              <Sparkles size={20} />
                              {t("party_vibe.overlay_quick_match")}
                            </span>
                            <span className="text-[10px] font-medium text-white/90 opacity-90">
                              {t("party_vibe.overlay_quick_match_sub")}
                            </span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCustomize}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-3.5 px-4 text-white font-semibold border transition-transform active:scale-[0.98] backdrop-blur-md ${
                          geoDenied
                            ? "bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/25 ring-1 ring-amber-400/20"
                            : "bg-white/[0.06] border-white/15 hover:bg-white/10"
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <SlidersHorizontal size={18} />
                          {t("party_vibe.overlay_customize")}
                        </span>
                        <span className="text-[10px] font-medium text-white/60">{t("party_vibe.overlay_customize_sub")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {matchingRun && pulseVisual && (
            <motion.div
              className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 ${pulseVisual.ring} ${pulseVisual.glow}`}
                animate={
                  reduceMotion
                    ? { scale: 1, opacity: 1 }
                    : { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }
                }
                transition={{
                  duration: reduceMotion ? 0.2 : 1.2,
                  repeat: reduceMotion ? 0 : Infinity,
                  ease: "easeInOut",
                }}
              >
                <div
                  className={`absolute inset-2 rounded-full bg-gradient-to-br ${pulseVisual.center} flex flex-col items-center justify-center text-white shadow-inner`}
                >
                  <Sparkles className="w-9 h-9 mb-1 opacity-95" />
                  <span className="text-sm font-bold">{t("party_vibe.matching_pulse_title")}</span>
                </div>
              </motion.div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={matchingPhase}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="mt-8 text-center text-white/90 text-sm max-w-xs font-medium min-h-[1.5rem]"
                >
                  {matchingPhase === 0 && t("party_vibe.matching_phase_1")}
                  {matchingPhase === 1 && t("party_vibe.matching_phase_2")}
                  {matchingPhase === 2 && t("party_vibe.matching_phase_3")}
                </motion.p>
              </AnimatePresence>
              <p className="mt-2 text-center text-white/45 text-xs max-w-xs">{t("party_vibe.matching_pulse_sub")}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up-panel {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }
        .avatar-glow {
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.12), 0 0 24px rgba(168, 85, 247, 0.15);
        }
        .avatar-glow:hover {
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.18), 0 0 32px rgba(168, 85, 247, 0.22);
        }
        .pb-safe { padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 0px)); }
      `}</style>
      </>
    </LayoutGroup>
  );
};
