import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Course } from '../../types';

/**
 * Admin dashboard: CRUD courses + view progress stats + certificates
 */
export default function AdminTrainingDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'courses' | 'stats' | 'dashboard'>('dashboard');
  const [dashStats, setDashStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, d] = await Promise.all([adminService.listCourses(), adminService.getDashboardStats()]);
        setCourses(c);
        setDashStats(d);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete course?')) return;
    try {
      await adminService.deleteCourse(id);
      setCourses((c) => c.filter((x) => x.id !== id));
    } catch (err: any) {
      setError(err?.message);
    }
  };

  if (loading) return <div className="p-6">Loading admin dashboard...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Admin Training Dashboard</h2>

      <div className="flex space-x-4 mb-4 overflow-x-auto">
        <button
          onClick={() => setTab('dashboard')}
          className={`px-4 py-2 rounded whitespace-nowrap ${tab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setTab('courses')}
          className={`px-4 py-2 rounded whitespace-nowrap ${tab === 'courses' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Courses
        </button>
        <button
          onClick={() => setTab('stats')}
          className={`px-4 py-2 rounded whitespace-nowrap ${tab === 'stats' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          User Progress
        </button>
      </div>

      {error && <div className="text-red-600 mb-4 p-3 bg-red-50 rounded">{error}</div>}

      {tab === 'dashboard' && dashStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded border">
            <div className="text-sm text-gray-600">Total Users</div>
            <div className="text-3xl font-bold">{dashStats.totalUsers}</div>
          </div>
          <div className="p-4 bg-green-50 rounded border">
            <div className="text-sm text-gray-600">Total Courses</div>
            <div className="text-3xl font-bold">{dashStats.totalCourses}</div>
          </div>
          <div className="p-4 bg-yellow-50 rounded border">
            <div className="text-sm text-gray-600">Certificates Issued</div>
            <div className="text-3xl font-bold">{dashStats.totalCertificatesIssued}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded border">
            <div className="text-sm text-gray-600">Avg Completion</div>
            <div className="text-3xl font-bold">{dashStats.averageCompletionRate}%</div>
          </div>
        </div>
      )}

      {tab === 'courses' && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Manage Courses</h3>
          <button className="mb-4 px-4 py-2 bg-green-600 text-white rounded">+ Create Course</button>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">ID</th>
                  <th className="border p-2 text-left">Title</th>
                  <th className="border p-2 text-center">Lessons</th>
                  <th className="border p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="border p-2 text-sm">{c.id}</td>
                    <td className="border p-2">{c.title}</td>
                    <td className="border p-2 text-center">{c.lessons.length}</td>
                    <td className="border p-2 text-center space-x-2">
                      <button className="text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'stats' && <AdminProgressStatsView />}
    </div>
  );
}

function AdminProgressStatsView() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await adminService.getAllUsersProgress();
        setStats(s);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div>Loading user statistics...</div>;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">User Progress Statistics</h3>
      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.userId} className="p-4 border rounded bg-gray-50">
            <div className="flex justify-between items-start mb-2">
              <div className="font-bold">{s.userId}</div>
              <div className="text-sm text-gray-600">{s.certificateCount} certificate(s)</div>
            </div>
            <div className="space-y-1">
              {s.stats.map((stat: any) => (
                <div key={stat.courseId} className="text-sm">
                  <div className="flex justify-between">
                    <span>{stat.courseName}</span>
                    <span>{stat.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-blue-600 h-2 rounded" style={{ width: `${stat.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}