import React, { useEffect, useState } from 'react';
import { trainingService } from '../services/trainingService';
import { Course } from '../types';
import { Link } from 'react-router-dom';

export default function TrainingCatalog() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const c = await trainingService.getCourses();
        if (mounted) setCourses(c);
      } catch (err: any) {
        console.error(err);
        setError('ไม่สามารถโหลดคอร์สได้');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="p-6">กำลังโหลดรายการคอร์ส...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Training Catalog</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {courses.map((c) => (
          <div key={c.id} className="p-4 border rounded bg-white">
            <h3 className="font-bold">{c.title}</h3>
            <p className="text-sm text-gray-600">{c.description}</p>
            <Link to={`/training/course/${c.id}`} className="mt-3 inline-block text-blue-600">
              ดูรายละเอียด / เริ่มเรียน
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}