import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import QuizComponent from '../components/Quiz';
import { useTraining } from '../context/TrainingContext';
import { useAuth } from '../context/AuthContext';
import { Course, Quiz } from '../types';
import { certificateService } from '../services/certificateService';

export default function TrainingQuizPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { submitQuiz, markCompleted } = useTraining();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!courseId) throw new Error('courseId missing');
        const c = await trainingService.getCourse(courseId);
        if (!c) throw new Error('Course not found');
        const l = c.lessons[0];
        if (!l) throw new Error('Lesson not found');
        if (mounted) {
          setCourse(c);
          setQuiz(l.quiz);
        }
      } catch (err: any) {
        console.error(err);
        if (mounted) setError(err?.message ?? 'Failed to load quiz');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  if (loading) return <div className="p-6">กำลังโหลดแบบทดสอบ...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!quiz || !course) return <div className="p-6">ไม่พบแบบทดสอบ</div>;

  const handleSubmit = async (answers: Record<string, any>) => {
    try {
      const res = await submitQuiz(course.id, course.lessons[0].id, answers);
      if (res.passed) {
        await markCompleted(course.id, course.lessons[0].id);

        // Generate and save certificate
        if (user?.id) {
          try {
            const cert = await certificateService.createCertificate(user.id, course.id, course.title, res.score);
            console.info('Certificate generated:', cert.id);
            alert(`ผ่าน 🎉 คะแนน ${res.score}%\nCertificate ได้รับเสร็จแล้ว!`);
          } catch (certErr) {
            console.error('Certificate generation failed:', certErr);
            alert(`ผ่าน 🎉 คะแนน ${res.score}%`);
          }
        }
        navigate('/training/dashboard');
      } else {
        alert(`ไม่ผ่าน คะแนน ${res.score}%. กรุณากลับไปดูวิดีโอแล้วลองใหม่`);
        navigate(`/training/course/${course.id}`);
      }
      return res;
    } catch (err: any) {
      console.error('handleSubmit error', err);
      throw err;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">{course.title} — แบบทดสอบ</h2>
      <QuizComponent quiz={quiz} onSubmit={handleSubmit} />
    </div>
  );
}