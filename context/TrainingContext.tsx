import React, { createContext, useContext, useEffect, useState } from 'react';
import { Progress } from '../types';
import { trainingService } from '../services/trainingService';
import { useAuth } from './AuthContext'; // assumes existing AuthContext provides useAuth()

type TrainingContextValue = {
  progress: Progress[];
  loading: boolean;
  error?: string | null;
  refresh: () => Promise<void>;
  recordWatch: (courseId: string, lessonId: string) => Promise<void>;
  submitQuiz: (courseId: string, lessonId: string, answers: Record<string, any>) => Promise<{ score: number; passed: boolean; attempts: number }>;
  markCompleted: (courseId: string, lessonId: string) => Promise<void>;
};

const TrainingContext = createContext<TrainingContextValue | undefined>(undefined);

export const TrainingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!user?.id) {
      setProgress([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await trainingService.getProgress(user.id);
      setProgress(p);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load progress');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const recordWatch = async (courseId: string, lessonId: string) => {
    if (!user?.id) return;
    try {
      await trainingService.recordWatch(user.id, courseId, lessonId);
      await refresh();
    } catch (err) {
      console.error('recordWatch failed', err);
    }
  };

  const submitQuiz = async (courseId: string, lessonId: string, answers: Record<string, any>) => {
    if (!user?.id) throw new Error('not authenticated');
    try {
      const res = await trainingService.submitQuiz(user.id, courseId, lessonId, answers);
      await refresh();
      return res;
    } catch (err: any) {
      console.error('submitQuiz failed', err);
      throw err;
    }
  };

  const markCompleted = async (courseId: string, lessonId: string) => {
    if (!user?.id) return;
    try {
      await trainingService.markCompleted(user.id, courseId, lessonId);
      await refresh();
    } catch (err) {
      console.error('markCompleted failed', err);
    }
  };

  return (
    <TrainingContext.Provider value={{ progress, loading, error, refresh, recordWatch, submitQuiz, markCompleted }}>
      {children}
    </TrainingContext.Provider>
  );
};

export const useTraining = () => {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used within TrainingProvider');
  return ctx;
};