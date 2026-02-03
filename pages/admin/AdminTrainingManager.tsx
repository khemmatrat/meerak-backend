import React, { useEffect, useState } from 'react';
import { trainingService } from '../../services/trainingService';
import { Course, CourseCategory, COURSE_CATEGORY_LABELS, Lesson, Quiz, Question } from '../../types';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function AdminTrainingManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: CourseCategory.CLEANING as CourseCategory,
    videoUrl: '',
    quizJson: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const c = await trainingService.getCourses();
        setCourses(c);
      } catch (err) {
        console.error('Failed to load courses', err);
      }
    })();
  }, []);

  const extractYoutubeId = (url: string): string | undefined => {
    const match = url.match(/(?:youtube\.com\/.*v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return match ? match[1] : undefined;
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('Please enter course title');
      return;
    }
    if (!formData.videoUrl.trim()) {
      alert('Please enter video URL');
      return;
    }

    let quizQuestions: Question[] = [];
    if (formData.quizJson.trim()) {
      try {
        quizQuestions = JSON.parse(formData.quizJson);
        // Validate quiz format
        if (!Array.isArray(quizQuestions)) {
          alert('Quiz must be a JSON array');
          return;
        }
      } catch (e) {
        alert(`Invalid JSON format: ${(e as Error).message}`);
        return;
      }
    }

    const newLesson: Lesson = {
      id: `lesson-${Date.now()}`,
      title: formData.title,
      videoUrl: formData.videoUrl,
      youtubeId: extractYoutubeId(formData.videoUrl),
      duration: 0,
      quiz: quizQuestions.length > 0
        ? {
            id: `quiz-${Date.now()}`,
            title: `${formData.title} Quiz`,
            passThreshold: 85,
            questions: quizQuestions,
          }
        : { id: '', title: '', questions: [], passThreshold: 85 },
    };

    const newCourse: Course = {
      id: `course-${Date.now()}`,
      title: formData.title,
      description: formData.description,
      category: formData.category,
      lessons: [newLesson],
    };

    console.log('Creating course:', newCourse);
    
    // TODO: ส่งไป backend/localStorage
    setCourses([...courses, newCourse]);
    alert(`✅ Course "${formData.title}" created successfully!`);
    
    setShowForm(false);
    setFormData({
      title: '',
      description: '',
      category: CourseCategory.CLEANING,
      videoUrl: '',
      quizJson: '',
    });
  };

  const handleDelete = (courseId: string) => {
    if (confirm('Are you sure you want to delete this course?')) {
      setCourses(courses.filter(c => c.id !== courseId));
      alert('Course deleted');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Training Courses Manager</h1>
          <p className="text-gray-600 mt-1">Create and manage training courses with video + quiz</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-emerald-700 shadow-md transition"
        >
          <Plus size={20} /> New Course
        </button>
      </div>

      {/* Create Course Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-8 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create New Course</h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Course Title *</label>
              <input
                type="text"
                placeholder="e.g., Advanced Cleaning Techniques"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
              <textarea
                placeholder="Describe what students will learn..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as CourseCategory })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">Select Category</option>
                {Object.entries(COURSE_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Video URL */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Video URL *</label>
              <input
                type="url"
                placeholder="https://www.youtube.com/embed/dQw4w9WgXcQ or direct video URL"
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Supports YouTube embed links or direct video URLs</p>
            </div>

            {/* Quiz Questions (JSON) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Quiz Questions (JSON - Optional)</label>
              <textarea
                placeholder={'[\n  {\n    "id": "q1",\n    "text": "What is the first step?",\n    "type": "mcq",\n    "options": [\n      { "text": "Option A", "isCorrect": true },\n      { "text": "Option B", "isCorrect": false }\n    ],\n    "weight": 1\n  }\n]'}
                value={formData.quizJson}
                onChange={(e) => setFormData({ ...formData, quizJson: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Enter a valid JSON array of question objects. Leave empty to create course without quiz.</p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={handleSave}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 transition shadow-md"
            >
              <Save size={20} /> Save Course
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Courses List */}
      <div className="grid gap-6">
        {courses.length > 0 ? (
          courses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{course.title}</h3>
                    <p className="text-sm text-emerald-600 font-semibold mt-1">
                      📚 {COURSE_CATEGORY_LABELS[course.category]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => handleDelete(course.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>

                {course.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                )}

                <div className="flex gap-4 text-sm text-gray-600">
                  <span>📹 {course.lessons.length} lesson(s)</span>
                  {course.lessons[0]?.quiz?.questions && course.lessons[0].quiz.questions.length > 0 && (
                    <span>✓ {course.lessons[0].quiz.questions.length} quiz question(s)</span>
                  )}
                </div>

                {course.lessons[0]?.videoUrl && (
                  <div className="mt-4 text-xs text-gray-500">
                    🔗 {course.lessons[0].videoUrl.substring(0, 50)}...
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-lg mb-4">No courses created yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
            >
              Create Your First Course
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-12 grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <p className="text-blue-600 font-semibold">Total Courses</p>
          <p className="text-3xl font-bold text-blue-900">{courses.length}</p>
        </div>
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <p className="text-green-600 font-semibold">Courses with Quiz</p>
          <p className="text-3xl font-bold text-green-900">
            {courses.filter(c => c.lessons[0]?.quiz?.questions?.length > 0).length}
          </p>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <p className="text-purple-600 font-semibold">Total Lessons</p>
          <p className="text-3xl font-bold text-purple-900">
            {courses.reduce((sum, c) => sum + c.lessons.length, 0)}
          </p>
        </div>
      </div>
    </div>
  );
}