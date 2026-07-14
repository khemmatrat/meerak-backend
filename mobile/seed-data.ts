/**
 * Seed script to populate localStorage with sample courses, demo user, and test certificates
 */
import { SAMPLE_COURSES } from './services/trainingService';
import { Certificate } from './types';

function seedLocalStorage() {
  try {
    const demoUserId = 'user-demo-1';
    const demoUser = { id: demoUserId, email: 'demo@example.com', name: 'Demo User', role: 'user' };
    const demoCredentials = { id: demoUserId, email: 'demo@example.com', password: 'demo1234', name: 'Demo User' };

    // Seed sample courses
   localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));

    // Seed authenticated user
    localStorage.setItem('app_user', JSON.stringify(demoUser));

    // Seed credentials (dev only)
    localStorage.setItem('training_demo_credentials', JSON.stringify(demoCredentials));

    // Seed sample progress (user completed first course)
    const sampleProgress = [
      {
        courseId: 'course-1',
        lessonId: 'lesson-1',
        bestScore: 92,
        completed: true,
        attempts: 2,
        lastAttemptAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      },
    ];
    localStorage.setItem(`training_progress_v1:${demoUserId}`, JSON.stringify(sampleProgress));

    // Seed sample certificate
    const sampleCert: Certificate = {
      id: 'cert-example-1',
      userId: demoUserId,
      courseId: 'course-1',
      courseName: 'ตัวอย่างคอร์ส: พื้นฐานการฝึกอบรม',
      issuedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 358 * 24 * 60 * 60 * 1000).toISOString(),
      pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK...', // mock data URL
      badge: 'star',
    };
    localStorage.setItem(`certificates_v1:${demoUserId}`, JSON.stringify([sampleCert]));

    console.info('✅ Seed complete!');
    console.info('Demo User:', demoUser.email);
    console.info('Password: demo1234');
    console.info('Sample progress & certificate loaded.');
    return true;
  } catch (err) {
    console.error('❌ seedLocalStorage error', err);
    return false;
  }
}

// Auto-run when imported in browser
(typeof window !== 'undefined') && seedLocalStorage();

export { seedLocalStorage };