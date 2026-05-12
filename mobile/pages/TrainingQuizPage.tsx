import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trainingService, NEXUS_PROFESSIONAL_COURSE_ID } from '../services/trainingService';
import { getModule1Questions } from '../services/nexusExamService';
import { useLanguage } from '../context/LanguageContext';
import QuizComponent from '../components/Quiz';
import { useTraining } from '../context/TrainingContext';
import { useAuth } from '../context/AuthContext';
import { useVIPTheme } from '../context/VIPThemeContext';
import { Course, Quiz } from '../types';
import { certificateService } from '../services/certificateService';

export default function TrainingQuizPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { themeId } = useVIPTheme();
  const trainingTierClass = `training-container training-${themeId}`;
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

        // คอร์สแบบทดสอบบังคับ Provider: ดึงคำถามจริง 55 ข้อจาก backend (ไม่ใช้คำถามปลอมใน mock)
        if (courseId === NEXUS_PROFESSIONAL_COURSE_ID) {
          try {
            const { questions } = await getModule1Questions();
            if (mounted && questions.length > 0) {
              setCourse(c);
              setQuiz({
                id: l.quiz?.id ?? 'quiz-module1',
                title: `${c.title} ${t('training.quiz_title_suffix')}`,
                passThreshold: 85,
                questions,
              });
            } else if (mounted) {
              setCourse(c);
              setQuiz(l.quiz);
            }
          } catch (apiErr: any) {
            if (mounted) {
              const is404 = apiErr?.response?.status === 404;
              setError(
                is404
                  ? t('training.quiz_not_ready')
                  : apiErr?.response?.data?.error ?? apiErr?.message ?? t('training.load_failed')
              );
              setCourse(c);
            }
          }
        } else {
          if (mounted) {
            setCourse(c);
            setQuiz(l.quiz);
          }
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

  if (loading) return <div className="p-6">{t('training.loading_quiz')}</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!quiz || !course) return <div className="p-6">{t('training.quiz_not_found')}</div>;

  const handleSubmit = async (answers: Record<string, any>) => {
    try {
      const res = await submitQuiz(course.id, course.lessons[0].id, answers);
      if (res.passed) {
        await markCompleted(course.id, course.lessons[0].id);

        if (course.id === 'nexus-professional-standards') {
          const examResults = (res as any).exam_results ?? [];
          const onboardingStatus = (res as any).onboarding_status ?? 'MODULE1_PASSED';
          alert(t('training.passed_m1_alert').replace('{score}', String(res.score)));
          navigate('/training/dashboard', {
            state: { module1JustPassed: true, examResults, onboardingStatus },
            replace: false,
          });
          return res;
        }
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
        const nextRetry = (res as any).nextRetryAt;
        const msg = nextRetry
          ? t('training.failed_retry').replace('{score}', String(res.score)).replace('{date}', new Date(nextRetry).toLocaleString())
          : t('training.failed_retry_short').replace('{score}', String(res.score));
        alert(msg);
        navigate(`/training/course/${course.id}`);
      }
      return res;
    } catch (err: any) {
      if (err?.nextRetryAt) {
        const msg = `${err.message}\n${t('training.retry_after_date').replace('{date}', new Date(err.nextRetryAt).toLocaleString())}`;
        alert(msg);
        navigate(`/training/course/${course.id}`);
        return { score: 0, passed: false, attempts: 0 };
      }
      console.error('handleSubmit error', err);
      throw err;
    }
  };

  return (
    <div className={trainingTierClass}>
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-4">{course.title} {t('training.quiz_title_suffix')}</h2>
        <QuizComponent quiz={quiz} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}