import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  PartyPopper,
  Car,
  Wrench,
  Briefcase,
  Zap,
  Sparkles,
  Users,
  QrCode,
  Wallet,
  Layers,
  ChevronLeft,
  ChevronRight,
  Video,
  Landmark,
  CalendarClock,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTutorial } from "../context/TutorialContext";
import { useTalentTutorial } from "../context/TalentTutorialContext";
import type { TourPillar } from "../context/TutorialContext";
import type { TalentTourPillar } from "../context/TalentTutorialContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getAcademyHub,
  getAcademyGlossary,
  type AcademyCard,
  type AcademyTopicId,
} from "../lib/academyContent";
import { loadAcademyState, saveAcademyState } from "../lib/academyStorage";

const TOPIC_ICONS: Record<AcademyTopicId, LucideIcon> = {
  financial_flow: Landmark,
  cleaning: Sparkles,
  party: PartyPopper,
  driver: Car,
  technical: Wrench,
  advance_jobs: Briefcase,
  match_job: Zap,
  video_portfolio: Video,
  advanced_booking: CalendarClock,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithGlossary(
  text: string,
  glossary: Record<string, string>
): React.ReactNode {
  const keys = Object.keys(glossary).sort((a, b) => b.length - a.length);
  if (!keys.length) return text;
  const re = new RegExp(`(${keys.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(re);
  const lowerMap = new Map(keys.map((k) => [k.toLowerCase(), glossary[k]!]));
  return parts.map((part, i) => {
    const def = lowerMap.get(part.toLowerCase());
    if (def) {
      return (
        <abbr
          key={`${i}-${part}`}
          title={def}
          className="cursor-help border-b border-dotted border-slate-500 text-slate-800 underline-offset-2"
        >
          {part}
        </abbr>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function EscrowPipelineVisual({ talent }: { talent: boolean }) {
  const steps = talent
    ? [
        "Client authorizes → Escrow holds funds",
        "You deliver + QR / check-in where required",
        "Settlement → Wallet (net of platform fees)",
      ]
    : [
        "You authorize payment → Escrow",
        "Work completes & verifies per policy",
        "Release to Professional / refunds per Legal",
      ];
  return (
    <div className="mt-5 rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-inner shadow-slate-200/50">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
        Escrow → Wallet pipeline
      </p>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-left text-xs leading-snug text-slate-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChecklistBlock({
  card,
  hub,
}: {
  card: AcademyCard;
  hub: ReturnType<typeof getAcademyHub>;
}) {
  const row = (label: string, items: string[]) =>
    items.length ? (
      <div className="text-left">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <ul className="space-y-1.5">
          {items.map((line, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm leading-relaxed text-slate-700 before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-emerald-500/70 before:content-['']"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
      {row(hub.labels_money, card.bullets.money)}
      {row(hub.labels_time, card.bullets.time)}
      {row(hub.labels_risk, card.bullets.risk)}
    </div>
  );
}

function AcademyCardView({
  card,
  hub,
  briefingMode,
  Icon,
  glossary,
  onPrimary,
  primaryLabel,
  isTalent,
}: {
  card: AcademyCard;
  hub: ReturnType<typeof getAcademyHub>;
  briefingMode: "summary" | "detailed";
  Icon: LucideIcon;
  glossary: Record<string, string>;
  onPrimary: () => void;
  primaryLabel: string;
  isTalent: boolean;
}) {
  const learnParts = card.learn_about.split("|").map((s) => s.trim());

  return (
    <div className="relative flex min-h-[min(72vh,620px)] flex-col rounded-[20px] border border-slate-200/90 bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.08)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.06),transparent)]" />
      <div className="relative flex flex-1 flex-col">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm">
            <Icon size={28} strokeWidth={1.5} />
          </div>
        </div>
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {card.subtitle}
        </p>
        <h2 className="mb-2 text-center text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
          {card.title}
        </h2>
        <p className="mb-3 text-center text-[11px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">{hub.in_this_section}: </span>
          <span className="text-slate-600">{hub.learn_about_prefix}: </span>
          <span className="text-slate-800">{learnParts.join(" · ")}</span>
        </p>
        <div className="mb-4 flex justify-center">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
            {briefingMode === "summary" ? hub.badge_30 : hub.badge_5}
          </span>
        </div>

        {briefingMode === "summary" ? (
          <ChecklistBlock card={card} hub={hub} />
        ) : (
          <div className="space-y-4 text-left">
            <p className="text-sm leading-relaxed text-slate-600">
              {renderWithGlossary(card.detail, glossary)}
            </p>
            {card.id === "financial_flow" ? <EscrowPipelineVisual talent={isTalent} /> : null}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {hub.pro_tips}
              </p>
              <ul className="space-y-1.5">
                {card.pro_tips.map((t, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    — {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {hub.policies_refs}
              </p>
              <div className="flex flex-wrap gap-2">
                {card.policy_links.map((l) => (
                  <Link
                    key={l.path + l.label}
                    to={l.path}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-medium text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    {l.label}
                    <ExternalLink size={10} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Quick links
          </p>
          <div className="flex flex-wrap gap-2">
            {card.footer_links.map((l) => (
              <Link
                key={l.path + l.label}
                to={l.path}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onPrimary}
          className="mt-6 w-full rounded-[14px] border border-slate-800/10 bg-slate-900 py-3.5 text-[15px] font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-[0.99]"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

export const TutorialHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useLanguage();
  const hub = useMemo(() => getAcademyHub(language), [language]);
  const glossary = useMemo(() => getAcademyGlossary(language), [language]);

  const persisted = useMemo(() => loadAcademyState(), []);
  const modeFromUrl = searchParams.get("mode");

  const [isTalentMode, setIsTalentMode] = useState(
    modeFromUrl === "talent" ? true : persisted.isTalentMode
  );
  const [briefingMode, setBriefingMode] = useState<"summary" | "detailed">(persisted.briefingMode);
  const [activeIndex, setActiveIndex] = useState(() => {
    const cards = modeFromUrl === "talent" ? hub.talent_cards : hub.employer_cards;
    const max = Math.max(0, cards.length - 1);
    return Math.min(persisted.activeIndex, max);
  });
  const [direction, setDirection] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setIsTalentMode(modeFromUrl === "talent");
  }, [modeFromUrl]);

  useEffect(() => {
    saveAcademyState({
      activeIndex,
      isTalentMode,
      briefingMode,
    });
  }, [activeIndex, isTalentMode, briefingMode]);

  const { startTour } = useTutorial();
  const { startTour: startTalentTour } = useTalentTutorial();

  const cards = isTalentMode ? hub.talent_cards : hub.employer_cards;
  const activeCard = cards[activeIndex];

  const IconCmp = activeCard ? TOPIC_ICONS[activeCard.id] : Layers;

  const handlePrimary = useCallback(() => {
    if (!activeCard) return;
    if (activeCard.guided_tour) {
      if (isTalentMode) {
        startTalentTour(activeCard.guided_tour as TalentTourPillar);
        navigate(activeCard.route, {
          state: { fromTalentTutorial: true, tourId: activeCard.guided_tour },
        });
      } else {
        startTour(activeCard.guided_tour as TourPillar);
        navigate(activeCard.route, {
          state: { fromTutorial: true, tourId: activeCard.guided_tour },
        });
      }
    } else {
      navigate(activeCard.route);
    }
  }, [activeCard, isTalentMode, navigate, startTalentTour, startTour]);

  const primaryLabel =
    activeCard?.guided_tour != null ? hub.cta : hub.cta_continue;

  const goNext = () => {
    if (activeIndex < cards.length - 1) {
      setDirection(1);
      setActiveIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (activeIndex > 0) {
      setDirection(-1);
      setActiveIndex((i) => i - 1);
    }
  };

  const setMode = (talent: boolean) => {
    setIsTalentMode(talent);
    setActiveIndex(0);
    setSearchParams(talent ? { mode: "talent" } : {});
  };

  const jumpTo = (i: number) => {
    setDirection(i > activeIndex ? 1 : -1);
    setActiveIndex(i);
    setDrawerOpen(false);
  };

  const glossaryChips = useMemo(
    () => Object.entries(glossary).slice(0, 6),
    [glossary]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-36 text-slate-800">
      <div className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 px-4 pb-3 pt-4 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-1 flex items-center gap-2">
              <Layers className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={1.5} />
              <h1 className="text-lg font-bold tracking-tight text-slate-900">{hub.page_title}</h1>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {isTalentMode ? hub.page_sub_talent : hub.page_sub_employer}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Menu size={16} />
              {hub.outline_open}
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              {hub.skip}
            </button>
          </div>
        </div>

        <div className="mx-auto mt-4 flex max-w-lg flex-col gap-3">
          <div className="flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => setMode(false)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
                !isTalentMode
                  ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Briefcase size={16} strokeWidth={1.5} />
              {hub.mode_employer}
            </button>
            <button
              type="button"
              onClick={() => setMode(true)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
                isTalentMode
                  ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Users size={16} strokeWidth={1.5} />
              {hub.mode_talent}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBriefingMode("summary")}
              className={`flex-1 rounded-xl border py-2 text-center text-xs font-semibold transition ${
                briefingMode === "summary"
                  ? "border-emerald-200 bg-white text-slate-900 shadow-sm"
                  : "border-transparent bg-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {hub.summary}
            </button>
            <button
              type="button"
              onClick={() => setBriefingMode("detailed")}
              className={`flex-1 rounded-xl border py-2 text-center text-xs font-semibold transition ${
                briefingMode === "detailed"
                  ? "border-emerald-200 bg-white text-slate-900 shadow-sm"
                  : "border-transparent bg-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {hub.detailed}
            </button>
          </div>
        </div>

        {/* Segmented progress */}
        <div className="mx-auto mt-4 max-w-lg overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          <div className="flex min-w-full gap-1.5 px-0.5">
            {cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => jumpTo(i)}
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-left transition ${
                  i === activeIndex
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  {i + 1}
                </span>
                <span className="block max-w-[120px] truncate text-[11px] font-semibold leading-tight">
                  {c.segment_label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isTalentMode && (
        <div className="mx-4 mt-4 flex max-w-lg items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:mx-auto">
          <QrCode size={18} className="mt-0.5 shrink-0 text-emerald-600" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">{hub.reminder_title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{hub.reminder_body}</p>
          </div>
          <Wallet size={16} className="shrink-0 text-slate-400" strokeWidth={1.5} />
        </div>
      )}

      <div className="relative mx-auto max-w-lg px-4 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {activeCard && (
            <motion.div
              key={`${isTalentMode ? "t" : "e"}-${activeIndex}-${briefingMode}`}
              initial={{ opacity: 0, y: direction === 0 ? 8 : direction > 0 ? 12 : -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction > 0 ? -8 : 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <AcademyCardView
                card={activeCard}
                hub={hub}
                briefingMode={briefingMode}
                Icon={IconCmp}
                glossary={glossary}
                onPrimary={handlePrimary}
                primaryLabel={primaryLabel}
                isTalent={isTalentMode}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto max-w-lg px-4">
        <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {hub.glossary_title}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {glossaryChips.map(([term, def]) => (
            <abbr
              key={term}
              title={def}
              className="cursor-help rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 shadow-sm"
            >
              {term}
            </abbr>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-lg items-center justify-center gap-6 px-4 text-sm text-slate-600">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIndex === 0}
          className="flex items-center gap-1 text-slate-700 disabled:opacity-25"
        >
          <ChevronLeft size={18} />
          {hub.prev}
        </button>
        <span className="tabular-nums text-slate-500">
          {activeIndex + 1} {hub.of} {cards.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={activeIndex === cards.length - 1}
          className="flex items-center gap-1 text-slate-700 disabled:opacity-25"
        >
          {hub.next}
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mx-auto mt-8 max-w-lg px-4 pb-6">
        <p className="border-t border-slate-200 pt-4 text-center text-[11px] leading-relaxed text-slate-500">
          {hub.credential}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md">
        <p className="mx-auto max-w-lg text-center text-[11px] leading-relaxed text-slate-600">
          {isTalentMode ? hub.footer_talent : hub.footer_employer}
        </p>
      </div>

      <AnimatePresence>
        {drawerOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={hub.outline_title}
          >
            <motion.button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative z-10 flex h-full w-[min(100%,360px)] flex-col border-l border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">{hub.outline_title}</p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-1">
                  {cards.map((c, i) => {
                    const Ico = TOPIC_ICONS[c.id];
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(i)}
                          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            i === activeIndex
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-emerald-800">
                            <Ico size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[10px] font-bold text-slate-500">
                              {i + 1}. {c.segment_label}
                            </span>
                            <span className="mt-0.5 block text-sm font-semibold leading-snug text-slate-900">
                              {c.title}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default TutorialHub;
