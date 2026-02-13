import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTraining } from '../context/TrainingContext';
import { trainingService } from '../services/trainingService';
import { Course, Lesson } from '../types';
import { useAuth } from '../context/AuthContext';

export default function TrainingCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [manualUnlock, setManualUnlock] = useState(false);
  const { recordWatch, progress } = useTraining();
  const navigate = useNavigate();
  const { user } = useAuth();
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);

  // ตรวจสอบว่า lesson ถูกมาร์กว่า watched ใน progress
  const isLessonWatched = useMemo(() => {
    if (!courseId || !lesson) return false;
    const p = progress || [];
    return p.some((e: any) => e.courseId === courseId && e.lessonId === lesson.id && !!e.watched);
  }, [courseId, lesson, progress]);

  // ตรวจสอบว่า quiz มีคำถามหรือไม่
  const hasQuizQuestions = useMemo(() => {
    return !!lesson?.quiz && Array.isArray(lesson.quiz.questions) && lesson.quiz.questions.length > 0;
  }, [lesson]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!courseId) throw new Error('courseId missing');
        const c = await trainingService.getCourse(courseId);
        if (!c) throw new Error('Course not found');
        const l = c.lessons?.[0] ?? null;
        if (!l) throw new Error('Lesson not found');
        if (!mounted) return;
        setCourse(c);
        setLesson(l);
      } catch (err: any) {
        console.error('TrainingCourse load error', err);
        if (mounted) setError(err?.message ?? 'Failed to load course');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  // ถ้า progress บอกว่า watched แล้ว ให้ตั้ง videoEnded เพื่อปลดล็อกปุ่ม
  useEffect(() => {
    if (isLessonWatched) {
      setVideoEnded(true);
    }
  }, [isLessonWatched]);

  // ถูกเรียกเมื่อตรวจพบวิดีโอจบ (สำหรับ <video> หรือ player ที่มี onEnded)
  const handleEnded = async () => {
    setVideoEnded(true);
    try {
      const userId = user?.id ?? 'anonymous';
      // บันทึกการดู (context/trainingService อาจมีฟังก์ชันที่เหมาะสม)
      if (recordWatch) {
        try { 
          await recordWatch(courseId!, lesson!.id); 
        } catch (_) { 
          console.warn('recordWatch failed, trying localStorage fallback');
        }
      }
      // persist minimal flag
      const key = `training_progress_v1:${userId}`;
      const raw = localStorage.getItem(key);
      const progressArr = raw ? JSON.parse(raw) : [];
      const found = progressArr.find((p: any) => p.courseId === courseId && p.lessonId === lesson!.id);
      if (found) {
        found.watched = true;
      } else {
        progressArr.push({ 
          courseId, 
          lessonId: lesson!.id, 
          watched: true,
          completed: false,
          attempts: 0,
          lastAttemptAt: new Date().toISOString()
        });
      }
      localStorage.setItem(key, JSON.stringify(progressArr));
    } catch (err) {
      console.warn('handleEnded persist failed', err);
    }
  };

  // ปลดล็อกด้วยมือ (fallback)
  const handleManualUnlock = async () => {
    setManualUnlock(true);
    await handleEnded();
    alert('✅ ปลดล็อกแบบทดสอบเรียบร้อยแล้ว!');
  };

  const goToQuiz = () => {
    if (!hasQuizQuestions) {
      alert('แบบทดสอบยังไม่มีคำถาม โปรดติดต่อผู้ดูแลระบบ');
      return;
    }
    if (!(videoEnded || manualUnlock || isLessonWatched)) {
      alert('กรุณาดูวิดีโอให้จบหรือกด "ปลดล็อกแบบทดสอบ" ก่อนเริ่มทำแบบทดสอบ');
      return;
    }
    navigate(`/training/course/${courseId}/quiz`);
  };

  if (loading) return <div className="p-6">กำลังโหลดคอร์ส...</div>;
  if (error) return <div className="p-6 text-red-600">เกิดข้อผิดพลาด: {error}</div>;
  if (!course || !lesson) return <div className="p-6">ไม่พบบทเรียน</div>;

  // สร้าง YouTube URL จาก youtubeId
  const youtubeUrl = `https://www.youtube.com/embed/${lesson.youtubeId}?rel=0`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-semibold mb-2">{course.title}</h2>
      <h3 className="text-xl text-gray-700 mb-6">{lesson.title}</h3>

      {/* Video Player Section */}
      <div className="mb-8 bg-white rounded-lg shadow p-4">
        {/* YouTube iframe: onEnded not reliable without IFrame API → provide manual unlock */}
        <iframe
          title="lesson-video"
          width="100%"
          height="480"
          src={youtubeUrl}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="rounded-lg"
        />
        
        {/* Manual Unlock Section */}
        {!videoEnded && !manualUnlock && !isLessonWatched && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-yellow-800 mb-3">
              ⚠️ หากระบบไม่ตรวจจับว่าวิดีโอจบแล้ว คุณสามารถปลดล็อกแบบทดสอบได้ด้วยตนเอง
            </p>
            <button 
              onClick={handleManualUnlock} 
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
            >
              ฉันดูวิดีโอจบแล้ว - ปลดล็อกแบบทดสอบ
            </button>
          </div>
        )}

        {/* Video Status */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {(videoEnded || manualUnlock || isLessonWatched) ? (
              <span className="text-green-600 flex items-center">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                วิดีโอเสร็จสิ้น
              </span>
            ) : (
              <span className="text-gray-500">กำลังดูวิดีโอ...</span>
            )}
          </div>
          
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            เลื่อนขึ้นบน ↑
          </button>
        </div>
      </div>

      {/* Quiz Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">แบบทดสอบ</h3>
        
        {!hasQuizQuestions ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700">
              ⚠️ Quiz นี้ยังไม่มีคำถาม กรุณาติดต่อผู้ดูแลระบบ
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-gray-600 mb-2">
                จำนวนคำถาม: <span className="font-semibold">{lesson.quiz.questions.length}</span> ข้อ
              </p>
              <p className="text-gray-600">
                ต้องได้คะแนน: <span className="font-semibold">{lesson.quiz.passThreshold || 85}%</span> ขึ้นไป
              </p>
            </div>

            {/* Start Quiz Button */}
            <div className="flex items-center space-x-4">
              <button
                onClick={goToQuiz}
                disabled={!hasQuizQuestions || !(videoEnded || isLessonWatched || manualUnlock)}
                className={`px-6 py-3 rounded-lg font-medium transition ${
                  hasQuizQuestions && (videoEnded || isLessonWatched || manualUnlock)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {(videoEnded || isLessonWatched || manualUnlock) ? 'เริ่มทำแบบทดสอบ →' : 'รอให้วิดีโอจบ...'}
              </button>

              {!(videoEnded || isLessonWatched || manualUnlock) && (
                <div className="text-sm text-gray-600">
                  <p>• ต้องดูวิดีโอให้จบก่อน</p>
                  <p>• หรือกดปุ่ม "ฉันดูวิดีโอจบแล้ว" ด้านบน</p>
                </div>
              )}
            </div>

            {/* Manual Unlock Alternative */}
            {!(videoEnded || isLessonWatched || manualUnlock) && (
              <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded">
                <p className="text-gray-700 mb-3">
                  หากปุ่มไม่ทำงานหรือวิดีโอไม่แสดงผล:
                </p>
                <button
                  onClick={handleManualUnlock}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                >
                  ปลดล็อกแบบทดสอบด้วยตนเอง
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Progress Info */}
      <div className="mt-8 text-sm text-gray-500">
        <p>📌 เคล็ดลับ: หาก YouTube มีปัญหา ลองรีเฟรชหน้าหรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</p>
      </div>
    </div>
  );
}