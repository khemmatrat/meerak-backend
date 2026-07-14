import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {

  CheckCircle2,

  ChevronDown,

  ChevronRight,

  Download,

  Lock,

  NotebookPen,

  PlayCircle,

  Sparkles,

} from "lucide-react";

import QuizComponent from "../components/Quiz";

import CourseCompletionModal from "../components/courseMarketplace/CourseCompletionModal";

import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";

import CourseLessonPlayer, { type PlaybackSpeed } from "../components/courseMarketplace/CourseLessonPlayer";

import CourseQaPanel from "../components/courseMarketplace/CourseQaPanel";

import { useNotification } from "../context/NotificationContext";

import { useAuth } from "../context/AuthContext";

import { certificateService } from "../services/certificateService";

import {

  getCourseCertificate,

  getCourseProgress,

  getLessonPlayback,

  getLessonQuiz,

  getMarketplaceCourse,

  saveCourseProgress,

  saveLessonNote,

  submitLessonQuiz,

  syncCourseWatchProgress,

  type CourseLesson,

  type CourseProgressState,

  type CourseSection,

  type MarketplaceCourse,

} from "../services/courseMarketplaceService";

import { trackCourseFunnel } from "../utils/courseFunnelAnalytics";

import type { Quiz } from "../types";



function flattenLessons(sections: CourseSection[] = [], fallback: CourseLesson[] = []) {

  if (sections.length) return sections.flatMap((s) => s.lessons || []);

  return fallback;

}



export default function CourseLearn() {

  const { id } = useParams<{ id: string }>();

  const [searchParams] = useSearchParams();

  const navigate = useNavigate();

  const isPreview = searchParams.get("preview") === "1";

  const { notify } = useNotification();

  const { user } = useAuth();



  const [course, setCourse] = useState<MarketplaceCourse | null>(null);

  const [progress, setProgress] = useState<CourseProgressState | null>(null);

  const [activeLessonId, setActiveLessonId] = useState("");

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);

  const [watchedSeconds, setWatchedSeconds] = useState(0);

  const [noteDraft, setNoteDraft] = useState("");

  const [savingNote, setSavingNote] = useState(false);

  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const [showCompletion, setShowCompletion] = useState(false);

  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  const [playback, setPlayback] = useState<{

    embedUrl: string;

    provider: "youtube" | "direct" | "none";

    videoId?: string | null;

  } | null>(null);

  const [playbackLoading, setPlaybackLoading] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);

  const [learnerName, setLearnerName] = useState("");



  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completingRef = useRef(false);



  const sections = course?.sections || [];

  const lessons = useMemo(() => flattenLessons(sections, course?.lessons || []), [sections, course?.lessons]);

  const completedSet = useMemo(() => new Set(progress?.completedLessonIds || []), [progress?.completedLessonIds]);



  const activeLesson = useMemo<CourseLesson | undefined>(

    () => lessons.find((l) => l.id === activeLessonId) || lessons[0],

    [activeLessonId, lessons],

  );



  const progressPct = progress?.progressPct ?? course?.progressPct ?? 0;



  const isLessonLocked = useCallback(

    (lesson: CourseLesson) => {

      if (isPreview && lesson.isPreview) return false;

      if (!course?.enrolled && !lesson.isPreview) return true;

      if (!progress?.sequentialUnlock) return false;

      const idx = lessons.findIndex((l) => l.id === lesson.id);

      if (idx <= 0) return false;

      for (let i = 0; i < idx; i += 1) {

        const prev = lessons[i];

        if (prev.isPreview) continue;

        if (!completedSet.has(prev.id)) return true;

      }

      return false;

    },

    [course?.enrolled, progress?.sequentialUnlock, lessons, completedSet, isPreview],

  );



  const locked = !!activeLesson && isLessonLocked(activeLesson);



  const loadAll = useCallback(async () => {

    if (!id) return;

    setLoading(true);

    try {

      const detail = await getMarketplaceCourse(id);

      setCourse(detail.course);

      if (detail.course.enrolled && !isPreview) {

        const prog = await getCourseProgress(id);

        setProgress(prog);

        const resumeId = prog?.lastLessonId || detail.course.lessons?.[0]?.id || "";

        setActiveLessonId(resumeId);

      } else {

        const first =

          detail.course.lessons?.find((l) => (isPreview ? l.isPreview : true)) || detail.course.lessons?.[0];

        setActiveLessonId(first?.id || "");

      }

      const secOpen: Record<string, boolean> = {};

      (detail.course.sections || []).forEach((s, i) => {

        secOpen[String(s.id || i)] = i === 0;

      });

      setOpenSections(secOpen);

    } finally {

      setLoading(false);

    }

  }, [id, isPreview]);



  useEffect(() => {

    loadAll();

  }, [loadAll]);



  useEffect(() => {

    if (!activeLesson?.id || !progress?.lessonProgress) return;

    const lp = progress.lessonProgress[activeLesson.id];

    setWatchedSeconds(lp?.watchedSeconds || 0);

    setNoteDraft(progress.notes?.[activeLesson.id]?.body || "");

  }, [activeLesson?.id, progress]);



  useEffect(() => {

    let alive = true;

    (async () => {

      if (!id || !activeLesson?.id || locked || activeLesson.stepType === "quiz") {

        setPlayback(null);

        return;

      }

      const wantsVideo = activeLesson.hasVideo || activeLesson.stepType === "video";

      if (!wantsVideo) {

        setPlayback(null);

        return;

      }

      setPlaybackLoading(true);

      try {

        const grant = await getLessonPlayback(id, activeLesson.id);

        if (!alive) return;

        setPlayback({

          embedUrl: grant.embedUrl,

          provider: grant.provider,

          videoId: grant.videoId,

        });

      } catch (e: any) {

        if (!alive) return;

        setPlayback(null);

        notify(e?.response?.data?.error || "โหลดวิดีโอไม่สำเร็จ", "error");

      } finally {

        if (alive) setPlaybackLoading(false);

      }

    })();

    return () => {

      alive = false;

    };

  }, [id, activeLesson?.id, activeLesson?.stepType, activeLesson?.hasVideo, locked, notify]);



  useEffect(() => {

    let alive = true;

    (async () => {

      if (!id || !activeLesson?.id || activeLesson.stepType !== "quiz" || !course?.enrolled) {

        setQuiz(null);

        return;

      }

      try {

        const q = await getLessonQuiz(id, activeLesson.id);

        if (alive) setQuiz(q as Quiz);

      } catch {

        if (alive) setQuiz(null);

      }

    })();

    return () => {

      alive = false;

    };

  }, [id, activeLesson?.id, activeLesson?.stepType, course?.enrolled]);



  const refreshProgress = async () => {

    if (!id) return;

    const prog = await getCourseProgress(id);

    setProgress(prog);

    return prog;

  };



  const scheduleWatchSync = useCallback(

    (seconds: number) => {

      setWatchedSeconds(seconds);

      if (!course?.enrolled || !id || !activeLesson?.id) return;

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

      syncTimerRef.current = setTimeout(() => {

        syncCourseWatchProgress(id, activeLesson.id, seconds).catch(() => undefined);

      }, 2500);

    },

    [course?.enrolled, id, activeLesson?.id],

  );



  const goNextLesson = useCallback(() => {

    if (!activeLesson) return;

    const idx = lessons.findIndex((l) => l.id === activeLesson.id);

    for (let i = idx + 1; i < lessons.length; i += 1) {

      if (!isLessonLocked(lessons[i])) {

        setActiveLessonId(lessons[i].id);

        return;

      }

    }

  }, [activeLesson, lessons, isLessonLocked]);



  const markComplete = useCallback(

    async (opts?: { autoAdvance?: boolean; silent?: boolean }) => {

      if (!course || !activeLesson || !id) return;

      if (completingRef.current) return;

      if (!course.enrolled) {

        notify("ซื้อคอร์สก่อนจึงจะบันทึก progress ได้", "warning");

        return;

      }

      completingRef.current = true;

      try {

        const result = await saveCourseProgress(course.id, activeLesson.id, watchedSeconds, true);

        const prog = await refreshProgress();

        if (!opts?.silent) notify(`บันทึกแล้ว (${result.progressPct}%)`, "success");

        if (result.newlyCompleted || (prog?.progressPct ?? 0) >= 100) {

          setShowCompletion(true);

          trackCourseFunnel(course.id, "course_completed", { progressPct: result.progressPct });

        } else if (opts?.autoAdvance !== false) {

          goNextLesson();

        }

      } catch (e: any) {

        notify(e?.response?.data?.error || "บันทึก progress ไม่สำเร็จ", "error");

      } finally {

        completingRef.current = false;

      }

    },

    [course, activeLesson, id, watchedSeconds, notify, goNextLesson],

  );



  const handleVideoEnded = useCallback(() => {

    if (course?.enrolled && !locked) {

      markComplete({ autoAdvance: true, silent: true });

    }

  }, [course?.enrolled, locked, markComplete]);



  const handleQuizSubmit = async (answers: Record<string, unknown>) => {

    if (!id || !activeLesson) throw new Error("missing lesson");

    const result = await submitLessonQuiz(id, activeLesson.id, answers);

    if (result.passed) {

      await refreshProgress();

      if (result.progress?.newlyCompleted || (result.progress?.progressPct ?? 0) >= 100) {

        setShowCompletion(true);

        trackCourseFunnel(id, "course_completed", { progressPct: result.progress?.progressPct });

      } else {

        goNextLesson();

      }

    }

    return { score: result.score, passed: result.passed, attempts: result.attempts };

  };



  const handleSaveNote = async () => {

    if (!id || !activeLesson) return;

    setSavingNote(true);

    try {

      await saveLessonNote(id, activeLesson.id, noteDraft);

      await refreshProgress();

      notify("บันทึกโน้ตแล้ว", "success");

    } catch {

      notify("บันทึกโน้ตไม่สำเร็จ", "error");

    } finally {

      setSavingNote(false);

    }

  };



  const handleDownloadCertificate = async () => {

    if (!course || !id) return;

    setPdfLoading(true);

    try {

      const cert = await getCourseCertificate(id);

      setLearnerName(cert.learnerName);

      const { dataUrl, filename } = await certificateService.generateMarketplaceCertificatePDF({

        learnerName: cert.learnerName,

        courseName: cert.courseTitle,

        verifyCode: cert.verifyCode,

        issuedAt: cert.issuedAt,

      });

      await certificateService.downloadCertificatePDF(dataUrl, filename);

      notify("ดาวน์โหลดใบรับรองแล้ว", "success");

    } catch {

      notify("สร้าง PDF ไม่สำเร็จ", "error");

    } finally {

      setPdfLoading(false);

    }

  };



  if (loading || !course) {

    return (

      <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24">

        <div className="luxury-card rounded-3xl h-96 animate-pulse" />

      </div>

    );

  }



  const isQuizLesson = activeLesson?.stepType === "quiz";



  const renderLessonButton = (lesson: CourseLesson) => {

    const lessonLocked = isLessonLocked(lesson);

    const done = completedSet.has(lesson.id);

    return (

      <button

        key={lesson.id}

        type="button"

        onClick={() => !lessonLocked && setActiveLessonId(lesson.id)}

        className={`w-full text-left p-3 rounded-xl border flex items-center justify-between ${

          activeLesson?.id === lesson.id ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700 bg-slate-800/50"

        } ${lessonLocked ? "opacity-60" : ""}`}

      >

        <span className="inline-flex items-center gap-2 text-slate-200 text-sm">

          {done ? <CheckCircle2 size={16} className="text-emerald-300" /> : lessonLocked ? <Lock size={16} /> : <PlayCircle size={16} />}

          {lesson.title}

        </span>

        {lesson.isPreview ? <span className="text-xs text-emerald-300">Preview</span> : null}

        {lesson.stepType === "quiz" ? <span className="text-xs text-indigo-300">Quiz</span> : null}

      </button>

    );

  };



  return (

    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 space-y-4">

      <CourseFlowHeader title={course.title} backTo={`/courses/${course.id}`} backLabel="รายละเอียดคอร์ส" />



      <section className="luxury-card rounded-3xl p-4">

        <div className="flex items-center justify-between gap-3 text-sm">

          <span className="text-slate-300 font-medium">ความคืบหน้า {progressPct.toFixed(0)}%</span>

          {progress?.learningStreakDays ? (

            <span className="inline-flex items-center gap-1 text-amber-300 text-xs">

              <Sparkles size={14} /> streak {progress.learningStreakDays} วัน

            </span>

          ) : null}

        </div>

        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">

          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, progressPct)}%` }} />

        </div>

      </section>



      <section className="course-flow-dark rounded-3xl overflow-hidden bg-slate-950 border border-slate-800">

        {!isQuizLesson ? (

          <div className="aspect-video bg-black grid place-items-center relative">

            {locked ? (

              <div className="text-center text-slate-300 p-6">

                <Lock className="mx-auto mb-2" size={36} />

                <p className="font-bold">บทเรียนนี้ยังไม่ปลดล็อก</p>

                <p className="text-sm text-slate-400 mt-1">เรียนบทก่อนหน้าให้จบก่อน หรือซื้อคอร์สเพื่อเรียนต่อ</p>

                {!course.enrolled ? (

                  <Link to={`/courses/${course.id}`} className="mt-3 inline-flex px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">

                    กลับไปซื้อคอร์ส

                  </Link>

                ) : null}

              </div>

            ) : playbackLoading ? (

              <div className="text-slate-400 animate-pulse">กำลังโหลดวิดีโอ...</div>

            ) : playback?.embedUrl ? (

              <CourseLessonPlayer

                embedUrl={playback.embedUrl}

                provider={playback.provider}

                videoId={playback.videoId}

                title={activeLesson?.title || "บทเรียน"}

                playbackSpeed={playbackSpeed}

                onSpeedChange={setPlaybackSpeed}

                initialWatchedSeconds={watchedSeconds}

                onWatchProgress={scheduleWatchSync}

                onEnded={handleVideoEnded}

              />

            ) : (

              <div className="text-center text-slate-300 p-6">

                <PlayCircle className="mx-auto mb-2" size={42} />

                <p>{activeLesson?.title}</p>

              </div>

            )}

          </div>

        ) : null}



        <div className="p-5 space-y-3">

          <p className="text-sm text-emerald-300">{course.title}</p>

          <h1 className="text-2xl font-black text-white">{activeLesson?.title || "บทเรียน"}</h1>



          {activeLesson?.textContent && !isQuizLesson ? (

            <div className="prose prose-invert max-w-none text-slate-300 whitespace-pre-wrap">{activeLesson.textContent}</div>

          ) : null}



          {activeLesson?.resourceUrls?.length ? (

            <div className="rounded-2xl bg-slate-900/70 border border-slate-700 p-3 text-sm">

              <p className="text-slate-400 mb-2">ไฟล์ประกอบ</p>

              <ul className="space-y-1">

                {activeLesson.resourceUrls.map((url) => (

                  <li key={url}>

                    <a href={url} target="_blank" rel="noreferrer" className="text-emerald-300 underline break-all">

                      {url}

                    </a>

                  </li>

                ))}

              </ul>

            </div>

          ) : null}



          {isQuizLesson && course.enrolled && !locked && quiz ? (

            <div className="rounded-2xl bg-white text-slate-900 p-2">

              <QuizComponent quiz={quiz} onSubmit={handleQuizSubmit} />

            </div>

          ) : null}



          {!isQuizLesson && course.enrolled && !locked ? (

            <div className="flex flex-wrap items-center gap-2">

              <button

                type="button"

                onClick={() => markComplete({ autoAdvance: true })}

                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"

              >

                ทำเครื่องหมายว่าเรียนจบ

              </button>

              <span className="text-xs text-slate-400">ดูแล้ว {Math.floor(watchedSeconds / 60)} นาที</span>

            </div>

          ) : null}



          {course.enrolled && !locked ? (

            <div className="rounded-2xl border border-slate-700 p-3 space-y-2">

              <p className="text-sm text-slate-300 inline-flex items-center gap-2 font-semibold">

                <NotebookPen size={16} /> โน้ตของฉัน

              </p>

              <textarea

                value={noteDraft}

                onChange={(e) => setNoteDraft(e.target.value)}

                rows={3}

                placeholder="จดประเด็นสำคัญ..."

                className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white px-3 py-2 text-sm"

              />

              <button

                type="button"

                disabled={savingNote}

                onClick={handleSaveNote}

                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-sm font-bold disabled:opacity-50"

              >

                {savingNote ? "กำลังบันทึก..." : "บันทึกโน้ต"}

              </button>

            </div>

          ) : null}

        </div>

      </section>



      {activeLesson?.id ? (
        <CourseQaPanel
          courseId={course.id}
          lessonId={activeLesson.id}
          lessonTitle={activeLesson.title}
          canPost={!!course.enrolled}
          instructorUserId={course.instructorUserId}
          currentUserId={user?.id || null}
        />
      ) : null}



      <section className="luxury-card rounded-3xl p-4 space-y-3">

        <h2 className="font-bold text-slate-100">หลักสูตร</h2>

        {sections.length ? (

          sections.map((section, si) => {

            const key = String(section.id || si);

            const open = openSections[key] ?? si === 0;

            return (

              <div key={key} className="rounded-2xl border border-slate-700 overflow-hidden">

                <button

                  type="button"

                  onClick={() => setOpenSections((p) => ({ ...p, [key]: !open }))}

                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 text-left"

                >

                  <span className="font-semibold text-slate-100">{section.title}</span>

                  {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}

                </button>

                {open ? (

                  <div className="p-2 space-y-1">

                    {(section.lessons || []).map((lesson) => renderLessonButton(lesson))}

                  </div>

                ) : null}

              </div>

            );

          })

        ) : (

          <div className="space-y-2">{lessons.map((lesson) => renderLessonButton(lesson))}</div>

        )}

      </section>



      {progress?.certificate || progressPct >= 100 ? (

        <section className="luxury-card rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">

          <div>

            <p className="font-bold text-emerald-300">ใบรับรองการเรียนจบ</p>

            <p className="text-xs text-slate-400">{progress?.certificate?.verifyCode || "พร้อมแล้ว"}</p>

            {progress?.certificate?.verifyCode ? (

              <Link

                to={`/courses/certificates/verify/${progress.certificate.verifyCode}`}

                className="text-xs text-emerald-400 underline mt-1 inline-block"

              >

                ตรวจสอบใบรับรองสาธารณะ

              </Link>

            ) : null}

          </div>

          <div className="flex gap-2">

            <button

              type="button"

              disabled={pdfLoading}

              onClick={handleDownloadCertificate}

              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm border border-slate-600 disabled:opacity-50"

            >

              <Download size={16} /> {pdfLoading ? "กำลังสร้าง..." : "PDF"}

            </button>

            <button

              type="button"

              onClick={() => setShowCompletion(true)}

              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm"

            >

              ดูใบรับรอง

            </button>

          </div>

        </section>

      ) : null}



      <CourseCompletionModal

        open={showCompletion}

        courseId={course.id}

        courseTitle={course.title}

        verifyCode={progress?.certificate?.verifyCode}

        learnerName={learnerName}

        onDownloadPdf={handleDownloadCertificate}

        pdfLoading={pdfLoading}

        onClose={() => {

          setShowCompletion(false);

          navigate(`/courses/${course.id}`);

        }}

      />

    </div>

  );

}


