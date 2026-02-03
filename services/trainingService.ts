/**
 * Mock training service using localStorage.
 * All methods return Promises and include basic error handling.
 */
import { Course, Lesson, Progress, Quiz } from '../types';
import { getAllCourses, getCourseById } from './mockApi';

const STORAGE_KEY_PREFIX = 'training_progress_v1';
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

  const lesson: Lesson = {
    id: `lesson-${mod.id}`,
    title: mod.name,
    videoUrl: mod.videoUrl,
    duration: mod.duration ?? 0,
    youtubeId, // <-- เพิ่มค่า (optional)
    quiz: quizObj ? { id: quizObj.id, title: `${mod.name} Quiz`, passThreshold: quizObj.passThreshold, questions: quizObj.questions } : undefined,
  };

  return {
    id: mod.id,
    title: mod.name,
    description: mod.description,
    lessons: [lesson],
  } as Course;
}

/** Seed/sample data used by UI (also by seed-data.ts) */
export const SAMPLE_COURSES: Course[] = getAllCourses().map(normalizeModuleToCourse);

function isOption(o: any): o is { id?: string; text?: string; isCorrect?: boolean } {
  return o !== null && typeof o === 'object' && ('isCorrect' in o || 'id' in o || 'text' in o);
}
function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export const trainingService = {
     async getCourses(): Promise<Course[]> {
    const raw = getAllCourses();try {
      console.log('trainingService.getCourses called');
      console.log('SAMPLE_COURSES:', SAMPLE_COURSES);
      return SAMPLE_COURSES;
    } catch (err) {
      console.error('trainingService.getCourses error', err);
      throw err;
    }
    // map raw -> Course type used by UI
   // return raw.map(r => ({
    //  id: r.id,
   //   title: r.name,
   //   description: r.description,
   //   lessons: [{
  //      id: `lesson-${r.id}`,
  //      title: r.name,
   //     videoUrl: r.videoUrl,
    //    quiz: r.quiz ? { id: `quiz-${r.id}`, passThreshold: r.passingScore, questions: r.quiz } : undefined,
 //     }],
  //  }));
   // return SAMPLE_COURSES;
  },

  async getCourse(id: string): Promise<Course | undefined> {
    //const raw = getCourseById(id);
  //  if (!raw) return undefined;
   // return (await this.getCourses()).find(c => c.id === id);
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
  

 async submitQuiz(userId: string, courseId: string, lessonId: string, answers: Record<string, any>): Promise<{ score: number; passed: boolean; attempts: number }> {
    try {
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

  async markCompleted(userId: string, courseId: string, lessonId: string) {
    try {
      const p = await this.getProgress(userId);
      const idx = p.findIndex((x) => x.courseId === courseId && x.lessonId === lessonId);
      
      if (idx === -1) {
        // สร้างใหม่: watched = true (เมื่อ marked completed)
        p.push({ 
          courseId, 
          lessonId, 
          watched: true,           // <-- เพิ่ม field นี้
          completed: true, 
          attempts: 0, 
          lastAttemptAt: new Date().toISOString() 
        });
      } else {
        // อัพเดต existing record
        p[idx].completed = true;
        p[idx].watched = true;     // <-- เพิ่ม field นี้
        p[idx].lastAttemptAt = new Date().toISOString();
      }
      
      await this.saveProgress(userId, p);
      return true;
    } catch (err) {
      console.error('markCompleted error', err);
      throw err;
    }
  },
  
};
