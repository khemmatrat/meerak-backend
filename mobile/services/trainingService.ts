/**
 * Mock training service using localStorage.
 * คอร์ส nexus-professional-standards ส่งคะแนนไป backend (85% ผ่าน, ไม่ผ่านรอ 24 ชม.)
 */
import { Course, CourseCategory, Lesson, Progress, Quiz, Question, Option } from '../types';
import { getAllCourses, getCourseById } from './mockApi';
import { api } from './api';

export const NEXUS_PROFESSIONAL_COURSE_ID = 'nexus-professional-standards';

const STORAGE_KEY_PREFIX = 'training_progress_v1';

/**
 * แบรนด์คอร์สอบรม: ข้อความจาก DB/mock อาจยังเป็น "Nexus" — แสดงเป็น AQOND ให้สอดคล้องแพลตฟอร์ม
 */
export function brandCourseText(text: string | undefined | null): string {
  if (text == null || text === '') return '';
  return text
    .replace(/มาตรฐานการบริการและความปลอดภัยของ Nexus/g, 'มาตรฐานการบริการและความปลอดภัยของ AQOND')
    .replace(
      /เรียนรู้มาตรฐานการให้บริการและความปลอดภัยที่ Nexus กำหนด/g,
      'เรียนรู้มาตรฐานการให้บริการและความปลอดภัยที่ AQOND กำหนด',
    )
    .replace(/"Nexus Service Standards & Safety"/g, '"AQOND Service Standards & Safety"')
    .replace(/\bNexus\b/g, 'AQOND')
    .replace(/\bNEXUS\b/g, 'AQOND');
}

/** แปลงคำถามจากรูปแบบใน mock (question/text, options สตริงหรือ object) เป็นรูปแบบที่ Quiz component ใช้ */
function normalizeQuestions(raw: any[]): Question[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((q: any, index: number) => {
    const id = q.id ?? `q${index + 1}`;
    const text = brandCourseText(q.text ?? q.question ?? `คำถามที่ ${index + 1}`);
    const type = (q.type ?? 'mcq') as 'mcq' | 'multi' | 'short';
    let options: Option[] = [];
    if (Array.isArray(q.options)) {
      options = q.options.map((o: any, i: number) => {
        if (o && typeof o === 'object' && ('id' in o || 'text' in o)) {
          return { id: o.id ?? `opt-${i}`, text: brandCourseText(String(o.text ?? '')), isCorrect: !!o.isCorrect };
        }
        const correctIndex = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
        return { id: `opt-${i}`, text: brandCourseText(String(o)), isCorrect: i === correctIndex };
      });
    }
    return { id, text, type, options: options.length ? options : undefined };
  });
}

function normalizeModuleToCourse(mod: any): Course {
  const quizObj = mod.quiz
    ? Array.isArray(mod.quiz)
      ? { id: `quiz-${mod.id}`, questions: mod.quiz, passThreshold: mod.passingScore ?? 85 }
      : mod.quiz
    : undefined;

  // Extract YouTube ID if videoUrl is a YouTube embed/watch URL
  let youtubeId: string | undefined = undefined;
  if (typeof mod.videoUrl === 'string') {
    const m1 = mod.videoUrl.match(/(?:youtube\.com\/.*v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (m1) youtubeId = m1[1];
  }
  if (!youtubeId) youtubeId = '';

  const courseTitle = brandCourseText(mod.name ?? mod.title ?? 'Course');
  const rawQuestions = quizObj?.questions;
  const questions = normalizeQuestions(rawQuestions ?? []);

  const lesson: Lesson = {
    id: `lesson-${mod.id}`,
    title: courseTitle,
    videoUrl: mod.videoUrl,
    duration: mod.duration ?? 0,
    youtubeId,
    quiz: questions.length > 0 && quizObj
      ? {
          id: quizObj.id,
          title: `${courseTitle} — แบบทดสอบ`,
          passThreshold: quizObj.passThreshold ?? 85,
          questions,
        }
      : ({ id: `quiz-${mod.id}`, title: `${courseTitle} — แบบทดสอบ`, passThreshold: 85, questions: [] } as Quiz),
  };

  return {
    id: mod.id,
    title: courseTitle,
    description: brandCourseText(mod.description),
    lessons: [lesson],
    category: (mod.category as CourseCategory) || CourseCategory.CLEANING,
  };
}

/** Seed/sample data used by UI (fallback when API unavailable) */
export const SAMPLE_COURSES: Course[] = getAllCourses().map(normalizeModuleToCourse);

function isOption(o: any): o is { id?: string; text?: string; isCorrect?: boolean } {
  return o !== null && typeof o === 'object' && ('isCorrect' in o || 'id' in o || 'text' in o);
}
function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

/** Transform API course to Course format (lessons with Video -> Read -> Quiz stepper) */
function apiCourseToCourse(api: {
  id: string;
  title: string;
  description?: string;
  category?: string;
  lessons?: Array<{ id: string; title: string; sortOrder: number; stepType: string; videoUrl?: string; textContent?: string; durationMin?: number; quizPassPercent?: number }>;
  questions?: Array<{ id: string; text: string; options: Array<{ id: string; text: string }>; correctOptionId: string }>;
  passPercent?: number;
}): Course {
  const title = brandCourseText(api.title);
  const description = brandCourseText(api.description ?? '');
  const lessons = api.lessons || [];
  const videoLesson = lessons.find((l) => l.stepType === 'video');
  const textLesson = lessons.find((l) => l.stepType === 'text');
  const quizLesson = lessons.find((l) => l.stepType === 'quiz');
  const passThreshold = api.passPercent ?? quizLesson?.quizPassPercent ?? 85;
  const questions = (api.questions || []).map((q) => ({
    id: q.id,
    text: brandCourseText(q.text),
    type: 'mcq' as const,
    options: (q.options || []).map((o: any, i: number) => ({
      id: o.id ?? `opt-${i}`,
      text: brandCourseText(o.text ?? String(o)),
      isCorrect: o.id === q.correctOptionId,
    })),
  }));
  const lesson: Lesson = {
    id: quizLesson?.id ?? `lesson-${api.id}`,
    title: title,
    videoUrl: videoLesson?.videoUrl ?? '',
    duration: videoLesson?.durationMin ?? 0,
    youtubeId: (() => {
      const url = videoLesson?.videoUrl ?? '';
      const m = url.match(/(?:youtube\.com\/.*v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
      return m ? m[1] : '';
    })(),
    textContent: textLesson?.textContent ? brandCourseText(textLesson.textContent) : textLesson?.textContent,
    quiz: questions.length > 0
      ? { id: `quiz-${api.id}`, title: `${title} — แบบทดสอบ`, passThreshold, questions }
      : undefined,
  };
  return {
    id: api.id,
    title,
    description: description || undefined,
    lessons: [lesson],
    category: (api.category as CourseCategory) || CourseCategory.CLEANING,
  };
}

export const trainingService = {
  async getCourses(): Promise<Course[]> {
    try {
      const res = await api.get<{ courses: any[] }>('/training/courses');
      const courses = res.data?.courses ?? [];
      if (courses.length > 0) {
        return courses.map(apiCourseToCourse);
      }
    } catch (err) {
      console.warn('trainingService.getCourses API fallback to mock:', err);
    }
    return SAMPLE_COURSES;
  },

  async getCourse(id: string): Promise<Course | undefined> {
    try {
      const res = await api.get<any>(`/training/courses/${id}`);
      const data = res.data;
      if (data) return apiCourseToCourse(data);
    } catch (err) {
      console.warn('trainingService.getCourse API fallback:', err);
    }
    return SAMPLE_COURSES.find((c) => c.id === id);
  },
  
  async getProgress(userId: string): Promise<Progress[]> {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return [];
      return JSON.parse(raw) as Progress[];
    } catch (err) {
      console.error('getProgress error', err);
      return [];
    }
  },

  async saveProgress(userId: string, progress: Progress[]) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(progress));
      return true;
    } catch (err) {
      console.error('saveProgress error', err);
      throw err;
    }
  },

  // แก้ไขฟังก์ชัน recordWatch: เพิ่ม field watched = true
  async recordWatch(userId: string, courseId: string, lessonId: string) {
    try {
      const p = await this.getProgress(userId);
      const idx = p.findIndex((x) => x.courseId === courseId && x.lessonId === lessonId);
      
      if (idx === -1) {
        // สร้างใหม่: watched = true, completed = false
        p.push({ 
          courseId, 
          lessonId, 
          watched: true,           // <-- เพิ่ม field นี้
          completed: false, 
          attempts: 0,
          lastAttemptAt: null
        });
      } else {
        // อัพเดต existing record: ตั้งค่า watched = true
        const existing = p[idx];
        p[idx] = {
          ...existing,
          watched: true,           // <-- เพิ่ม field นี้
          lastAttemptAt: existing.lastAttemptAt || new Date().toISOString()
        };
      }
      
      await this.saveProgress(userId, p);
      return true;
    } catch (err) {
      console.error('recordWatch error', err);
      throw err;
    }
  },
  

 async submitQuiz(userId: string, courseId: string, lessonId: string, answers: Record<string, any>): Promise<{ score: number; passed: boolean; attempts: number; nextRetryAt?: string }> {
    try {
      if (courseId === NEXUS_PROFESSIONAL_COURSE_ID) {
        try {
          const res = await api.post<{
            passed: boolean;
            score: number;
            nextRetryAt?: string;
            onboarding_status?: string;
            provider_status?: string;
            exam_results?: Array<{ module: number; passed: boolean }>;
          }>('/provider-onboarding/submit-exam', { userId, answers });
          const data = res.data;
          if (data.passed) {
            await this.markCompleted(userId, courseId, lessonId, data.score);
            const backendUserId = (res.data as any).backend_user_id;
            if (backendUserId && userId) {
              try {
                const key = 'meerak_provider_backend_id';
                const raw = localStorage.getItem(key);
                const map = raw ? JSON.parse(raw) : {};
                map[userId] = String(backendUserId);
                localStorage.setItem(key, JSON.stringify(map));
              } catch (_) {}
            }
            return {
              score: data.score,
              passed: true,
              attempts: 1,
              onboarding_status: data.onboarding_status,
              exam_results: data.exam_results,
              backend_user_id: backendUserId,
            };
          }
          return { score: data.score, passed: false, attempts: 1, nextRetryAt: (res.data as any).nextRetryAt };
        } catch (err: any) {
          if (err?.response?.status === 403 && err?.response?.data?.error === 'COOLDOWN') {
            const msg = err.response.data?.message || 'กรุณารอ 24 ชั่วโมงก่อนทำแบบทดสอบใหม่';
            const next = err.response.data?.nextRetryAt;
            const e = new Error(msg) as Error & { nextRetryAt?: string };
            e.nextRetryAt = next;
            throw e;
          }
          throw err;
        }
      }
      const course = SAMPLE_COURSES.find((c) => c.id === courseId);
      if (!course) throw new Error('course not found');
      const lesson = course.lessons.find((l) => l.id === lessonId);
      if (!lesson) throw new Error('lesson not found');
      const quiz: Quiz = lesson.quiz;
      const questions = quiz.questions;

      let totalWeight = 0;
      let earned = 0;

      for (const q of questions) {
        const w = q.weight ?? 1;
        totalWeight += w;
        const ans = answers[q.id];

        if (q.type === 'mcq') {
          // q.options may contain strings or option objects
          const opt = (q.options ?? []).find((o: any) => {
            if (isOption(o)) return (o.id ?? o.text) === ans || o === ans;
            return o === ans;
          });

          // safe-check: only objects can carry isCorrect flag
          if (isOption(opt) && opt.isCorrect) earned += w;
        } else if (q.type === 'multi') {
          const selected: string[] = Array.isArray(ans) ? ans : [];
          // collect correct ids from option objects; if options are strings we treat matching string-values as correct
          const correctIds = (q.options ?? [])
            .map((o: any) => (isOption(o) ? o : o))
            .filter((o: any) => (isOption(o) ? o.isCorrect : false))
            .map((o: any) => (isOption(o) ? o.id ?? o.text : o as string));

          const correctSelected = selected.filter((s) => correctIds.includes(s)).length;
          const incorrectSelected = selected.length - correctSelected;
          const raw = Math.max(0, correctSelected - incorrectSelected);
          const partial = correctIds.length > 0 ? (raw / correctIds.length) * w : 0;
          earned += partial;
        } else if (q.type === 'short') {
          const text = typeof ans === 'string' ? ans.trim().toLowerCase() : '';
          const ok = (q.acceptedAnswers ?? []).map((s: string) => s.toLowerCase().trim()).includes(text);
          if (ok) earned += w;
        }
      }

      const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 10000) / 100 : 0;
      const threshold = quiz.passThreshold ?? 85;
      const passed = score >= threshold;

      const progress = await this.getProgress(userId);
      const idx = progress.findIndex((x) => x.courseId === courseId && x.lessonId === lessonId);
      
      if (idx === -1) {
        // สร้างใหม่: watched = true (เพราะผ่าน quiz แสดงว่าต้องดูวิดีโอแล้ว)
        progress.push({ 
          courseId, 
          lessonId, 
          watched: true,           // <-- เพิ่ม field นี้
          attempts: 1, 
          bestScore: score, 
          completed: passed, 
          lastAttemptAt: new Date().toISOString() 
        });
        await this.saveProgress(userId, progress);
        return { score, passed, attempts: 1 };
      } else {
        const entry = progress[idx];
        entry.attempts = (entry.attempts ?? 0) + 1;
        entry.bestScore = Math.max(entry.bestScore ?? 0, score);
        entry.completed = passed ? true : false;
        entry.watched = true;      // <-- เพิ่ม field นี้ (ผ่าน quiz แสดงว่าต้องดูวิดีโอแล้ว)
        entry.lastAttemptAt = new Date().toISOString();
        progress[idx] = entry;
        await this.saveProgress(userId, progress);
        return { score, passed, attempts: entry.attempts ?? 1 };
      }
    } catch (err) {
      console.error('submitQuiz error', err);
      throw err;
    }
  },

  async markCompleted(userId: string, courseId: string, lessonId: string, score?: number) {
    try {
      const p = await this.getProgress(userId);
      const idx = p.findIndex((x) => x.courseId === courseId && x.lessonId === lessonId);
      const bestScore = score != null ? score : undefined;

      if (idx === -1) {
        p.push({
          courseId,
          lessonId,
          watched: true,
          completed: true,
          attempts: 1,
          bestScore,
          lastAttemptAt: new Date().toISOString(),
        });
      } else {
        p[idx].completed = true;
        p[idx].watched = true;
        p[idx].lastAttemptAt = new Date().toISOString();
        if (bestScore != null) p[idx].bestScore = Math.max(p[idx].bestScore ?? 0, bestScore);
      }

      await this.saveProgress(userId, p);
      return true;
    } catch (err) {
      console.error('markCompleted error', err);
      throw err;
    }
  },
  
};
