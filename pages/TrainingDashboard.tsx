import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import { trainingService } from '../services/trainingService';
import { Course, Progress } from '../types';
import CertificateView from '../components/CertificateView';
import { BookOpen, Play, Lock, CheckCircle, BarChart3, Trophy, Video } from 'lucide-react';

/**
 * User training progress dashboard with certificate view
 */
export default function TrainingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'courses' | 'progress' | 'certificates'>('overview');

  console.log('TrainingDashboard mounted', { user, loading, coursesCount: courses.length });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await trainingService.getCourses();
        setCourses(c);
        
        if (user?.id) {
          const p = await trainingService.getProgress(user.id);
          setProgress(p);
          
          const s = await adminService.getUserProgressStats(user.id);
          setStats(s);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  if (loading) return (
    <div className="p-6 text-center">
      <div className="inline-block animate-spin">⏳</div> Loading dashboard...
    </div>
  );

  const completedCount = progress.filter((p) => p.completed).length;
  const avgScore = progress.length > 0 ? Math.round(progress.reduce((s, p) => s + (p.bestScore ?? 0), 0) / progress.length) : 0;

  // Helper: get course progress
  const getCourseProgress = (courseId: string) => {
    return progress.find(p => p.courseId === courseId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <BookOpen className="text-indigo-600" size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Training Dashboard</h1>
              <p className="text-gray-600 text-sm mt-1">Learn new skills and earn certificates</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-4">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'courses', label: 'Courses', icon: Video },
            { id: 'progress', label: 'Progress', icon: Play },
            { id: 'certificates', label: 'Certificates', icon: Trophy },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                  tab === t.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">Total Courses</p>
                    <p className="text-3xl font-bold text-gray-900">{courses.length}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <BookOpen className="text-blue-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">Completed</p>
                    <p className="text-3xl font-bold text-green-600">{completedCount}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="text-green-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">Average Score</p>
                    <p className="text-3xl font-bold text-yellow-600">{avgScore}%</p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <BarChart3 className="text-yellow-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">Completion Rate</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {courses.length > 0 ? Math.round((completedCount / courses.length) * 100) : 0}%
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Trophy className="text-purple-600" size={24} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
              <button
                onClick={() => setTab('courses')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition shadow-md"
              >
                👉 Start Learning Now
              </button>
            </div>
          </div>
        )}

        {/* Courses Tab — แสดง Course Cards */}
        {tab === 'courses' && (
          <div>
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Available Courses</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => {
                const prog = getCourseProgress(course.id);
                const isCompleted = prog?.completed;
                const hasQuiz = course.lessons?.[0]?.quiz?.questions?.length > 0;

                return (
                  <div
                    key={course.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer"
                    onClick={() => navigate(`/training/course/${course.id}`)}
                  >
                    {/* Course Header */}
                    <div className="h-40 bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 text-white flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <Video size={32} />
                        {isCompleted ? (
                          <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                            ✓ Completed
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-600 text-white text-xs font-bold rounded-full">
                            {prog?.watched ? '⏳ In Progress' : '🔒 Not Started'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold">{course.title}</h3>
                    </div>

                    {/* Course Body */}
                    <div className="p-6">
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>

                      {/* Progress Bar */}
                      {prog && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-semibold text-gray-700">Progress</span>
                            <span className="text-xs font-bold text-indigo-600">{Math.round(prog.bestScore || 0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all"
                              style={{ width: `${prog.bestScore || 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Course Meta */}
                      <div className="space-y-2 mb-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Video size={16} />
                          <span>{hasQuiz ? `Video + ${course.lessons?.[0]?.quiz?.questions?.length || 0} Quiz Questions` : 'Video Only'}</span>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <button
                        className={`w-full py-2 rounded-lg font-semibold transition ${
                          isCompleted
                            ? 'bg-gray-100 text-gray-600 cursor-default'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/training/course/${course.id}`);
                        }}
                      >
                        {isCompleted ? '✓ View Certificate' : prog?.watched ? '▶ Continue' : '▶ Start Course'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {courses.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No courses available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Progress Tab */}
        {tab === 'progress' && (
          <div>
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Your Progress</h3>
            <div className="space-y-4">
              {stats.length > 0 ? (
                stats.map((stat) => (
                  <div key={stat.courseId} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-lg font-bold text-gray-900">{stat.courseName}</h4>
                      <span className="text-sm font-semibold text-indigo-600">{stat.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          stat.percentage === 100 ? 'bg-green-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{stat.completed}/{stat.total} lessons completed</span>
                      <span>Best Score: <strong>{stat.bestScore}%</strong></span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <p className="text-gray-500">No progress yet. Start a course to see your progress here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Certificates Tab */}
        {tab === 'certificates' && <CertificateView />}
      </div>
    </div>
  );
}