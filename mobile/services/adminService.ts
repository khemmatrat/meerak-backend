
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    addDoc, 
    setDoc,
    query, 
    where, 
    Timestamp,
    orderBy,
    limit,
    arrayUnion,
    arrayRemove,
    deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, Transaction, Dispute, Voucher, SystemConfig, Job, JobStatus, CompanyLedgerItem, AdminLog, AdminRole, AdminUser, SystemBanner, ChatMessage } from '../types';
import { Course, Lesson, Quiz, Progress, Certificate } from '../types';
import { SAMPLE_COURSES, trainingService } from './trainingService';
import { certificateService } from './certificateService';
// Helper to sanitize
const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj));
// ...existing code...
{ /* existing AdminService object definition */ }
// ...existing code...
// Add alias export for compatibility with existing imports


export const AdminService = {
    // --- ADMIN AUTHENTICATION & MANAGEMENT ---
    loginAdmin: async (email: string, password: string): Promise<AdminUser | null> => {
        // 1. Check DB
        const q = query(collection(db, 'admin_users'), where('email', '==', email));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const adminDoc = snap.docs[0];
            const adminData = adminDoc.data() as AdminUser;
            
            // SECURITY CHECK: Locked Account?
            if (adminData.is_active === false) {
                throw new Error("Account is locked due to suspicious activity.");
            }

            // In real app, use bcrypt.compare here
            if (adminData.password_hash === password) {
                // Success: Reset attempts & Update last login
                await updateDoc(doc(db, 'admin_users', adminDoc.id), { 
                    last_login: new Date().toISOString(),
                    failed_attempts: 0 // Reset counter
                });
                
                // Alert if it's a new device (Mock logic)
                if (Math.random() > 0.8) {
                    AdminService.sendSecurityAlert(email, "New device login detected.");
                }

                return { ...adminData, id: adminDoc.id };
            } else {
                // Failed Attempt Logic
                const currentFailures = (adminData as any).failed_attempts || 0;
                const newFailures = currentFailures + 1;
                
                await updateDoc(doc(db, 'admin_users', adminDoc.id), { failed_attempts: newFailures });

                if (newFailures >= 3) {
                    await AdminService.sendSecurityAlert(email, "Critical: 3 failed login attempts. Account locked.");
                    // Optional: Lock account automatically
                    // await updateDoc(doc(db, 'admin_users', adminDoc.id), { is_active: false });
                }

                return null;
            }
        }

        // 2. Fallback for hardcoded Super Admin (First time setup)
        if (email === 'admin@meerak.app' && password === 'admin123') {
            return {
                id: 'super-admin-001',
                name: 'Root Administrator',
                email: 'admin@meerak.app',
                password_hash: 'hashed',
                role: 'super_admin',
                is_active: true,
                created_at: new Date().toISOString()
            };
        }

        return null;
    },

    changeOwnPassword: async (email: string, oldPass: string, newPass: string): Promise<void> => {
        const q = query(collection(db, 'admin_users'), where('email', '==', email));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            // Handle Hardcoded Admin Case
            if (email === 'admin@meerak.app' && oldPass === 'admin123') {
                // Create real doc for hardcoded admin to persist change
                await AdminService.createEmployee({
                    name: 'Root Administrator',
                    email: 'admin@meerak.app',
                    password_hash: newPass,
                    role: 'super_admin',
                    is_active: true
                });
                return;
            }
            throw new Error("Admin user not found");
        }

        const adminDoc = snap.docs[0];
        const adminData = adminDoc.data();

        if (adminData.password_hash !== oldPass) {
            throw new Error("Old password incorrect");
        }

        await updateDoc(doc(db, 'admin_users', adminDoc.id), { password_hash: newPass });
        await AdminService.logAdminAction(email, adminData.role, 'CHANGE_OWN_PASSWORD', 'Updated security credentials');
        await AdminService.sendSecurityAlert(email, "Your admin password was changed.");
    },

    sendSecurityAlert: async (email: string, message: string) => {
        // Mock sending SMS/Email
        console.log(`[SECURITY ALERT] To: ${email} | Msg: ${message}`);
        // In production: Call SendGrid / Twilio API
        
        // Log to Audit
        await AdminService.logAdminAction('SYSTEM', 'super_admin', 'SECURITY_ALERT', message);
    },

    getEmployees: async (): Promise<AdminUser[]> => {
        const snap = await getDocs(collection(db, 'admin_users'));
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as AdminUser));
    },

    createEmployee: async (data: Omit<AdminUser, 'id' | 'created_at' | 'last_login'>): Promise<void> => {
        // Check duplicate email
        const q = query(collection(db, 'admin_users'), where('email', '==', data.email));
        const snap = await getDocs(q);
        if (!snap.empty) throw new Error("Email already exists");

        const newAdmin = {
            ...data,
            is_active: true,
            created_at: new Date().toISOString(),
            failed_attempts: 0
        };
        await addDoc(collection(db, 'admin_users'), sanitize(newAdmin));
    },

    removeEmployee: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, 'admin_users', id));
    },

    resetEmployeePassword: async (id: string, newPassword: string): Promise<void> => {
        await updateDoc(doc(db, 'admin_users', id), { password_hash: newPassword });
    },

    toggleEmployeeStatus: async (id: string, isActive: boolean): Promise<void> => {
        await updateDoc(doc(db, 'admin_users', id), { is_active: isActive });
    },

    // --- AUDIT LOGS & SECURITY ---
    logAdminAction: async (adminEmail: string, role: AdminRole, action: string, details: string, targetId?: string) => {
        const log: AdminLog = {
            id: `log-${Date.now()}`,
            admin_email: adminEmail,
            role: role,
            action: action,
            details: details,
            target_id: targetId,
            ip_address: '127.0.0.1', // Mock IP
            created_at: new Date().toISOString()
        };
        await addDoc(collection(db, 'admin_logs'), sanitize(log));
    },

    getAdminLogs: async (): Promise<AdminLog[]> => {
        const q = query(collection(db, 'admin_logs'), orderBy('created_at', 'desc'), limit(100));
        try {
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ ...d.data(), id: d.id } as AdminLog));
        } catch (e) {
            // Fallback for mock env or missing index
            const snap = await getDocs(collection(db, 'admin_logs'));
            const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as AdminLog));
            return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
    },

    // --- STATISTICS & FINANCIALS ---
    getPlatformFinancialStats: async () => {
        // In a real backend, these would be aggregated queries or Cloud Functions
        const usersSnap = await getDocs(collection(db, 'users'));
        const jobsSnap = await getDocs(collection(db, 'jobs'));
        const txSnap = await getDocs(collection(db, 'transactions'));
        const ledgerSnap = await getDocs(collection(db, 'company_ledger'));

        const users = usersSnap.docs.map(d => d.data() as UserProfile);
        const jobs = jobsSnap.docs.map(d => d.data() as Job);
        const txs = txSnap.docs.map(d => d.data() as Transaction);
        const ledger = ledgerSnap.docs.map(d => d.data() as CompanyLedgerItem);

        // Calculate Platform Revenue (Gross)
        const totalVolume = txs
            .filter(t => t.type === 'payment' && t.status === 'completed')
            .reduce((sum, t) => sum + t.amount, 0);

        const providerPayouts = txs
            .filter(t => t.type === 'income' && t.status === 'completed')
            .reduce((sum, t) => sum + t.amount, 0);

        const grossRevenue = totalVolume - providerPayouts; // Platform Fee Income

        // Calculate Internal Expenses
        const totalExpenses = ledger
            .filter(l => l.type === 'expense')
            .reduce((sum, l) => sum + l.amount, 0);

        const ownerWithdrawals = ledger
            .filter(l => l.type === 'owner_withdrawal')
            .reduce((sum, l) => sum + l.amount, 0);

        const netProfit = grossRevenue - totalExpenses;
        const cashOnHand = netProfit - ownerWithdrawals;

        return {
            total_users: users.length,
            total_providers: users.filter(u => u.role === 'provider').length,
            total_jobs: jobs.length,
            active_jobs: jobs.filter(j => j.status === 'OPEN' || j.status === 'IN_PROGRESS').length,
            total_volume: totalVolume,
            gross_revenue: grossRevenue,
            total_expenses: totalExpenses,
            net_profit: netProfit,
            cash_on_hand: cashOnHand,
            pending_kyc: users.filter(u => u.kyc_level === 'pending_review').length,
            pending_withdrawals: txs.filter(t => t.type === 'withdrawal' && t.status === 'waiting_admin').length,
            active_disputes: jobs.filter(j => j.status === 'DISPUTE').length
        };
    },

    // --- INTERNAL ACCOUNTING ---
    getCompanyLedger: async (): Promise<CompanyLedgerItem[]> => {
        const q = query(collection(db, 'company_ledger'));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as CompanyLedgerItem));
        return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    recordCompanyTransaction: async (data: Omit<CompanyLedgerItem, 'id' | 'date'>): Promise<void> => {
        const item = {
            ...data,
            date: new Date().toISOString()
        };
        await addDoc(collection(db, 'company_ledger'), sanitize(item));
    },

    // --- KYC MANAGEMENT ---
    getPendingKYC: async (): Promise<UserProfile[]> => {
        const q = query(collection(db, 'users'), where('kyc_level', '==', 'pending_review'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile));
    },

    reviewKYC: async (userId: string, approved: boolean, reason?: string): Promise<void> => {
        const updates: Partial<UserProfile> = {
            kyc_level: approved ? 'level_2' : 'rejected',
        };
        if (reason && !approved) {
            updates.kyc_note = reason;
        }
        await updateDoc(doc(db, 'users', userId), updates);
    },

    // --- WITHDRAWAL MANAGEMENT (USER) ---
    getPendingWithdrawals: async (): Promise<Transaction[]> => {
        const q = query(collection(db, 'transactions'), where('status', '==', 'waiting_admin'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Transaction));
    },

    approveWithdrawal: async (txId: string): Promise<void> => {
        await updateDoc(doc(db, 'transactions', txId), { status: 'completed' });
    },

    // --- DISPUTE RESOLUTION ---
    getDisputes: async (): Promise<(Dispute & { jobTitle: string, reporterName: string })[]> => {
        const q = query(collection(db, 'disputes'), where('status', '==', 'pending'));
        const snap = await getDocs(q);
        
        const disputes = await Promise.all(snap.docs.map(async d => {
            const data = d.data() as Dispute;
            const jobSnap = await getDoc(doc(db, 'jobs', data.job_id));
            const userSnap = await getDoc(doc(db, 'users', data.reporter_id));
            
            return {
                ...data,
                id: d.id,
                jobTitle: jobSnap.exists() ? jobSnap.data().title : 'Unknown Job',
                reporterName: userSnap.exists() ? userSnap.data().name : 'Unknown User'
            };
        }));
        
        return disputes;
    },

    getJobChatLogs: async (jobId: string): Promise<ChatMessage[]> => {
        // Assuming room_id is the same as job_id
        const q = query(collection(db, 'chat_messages'), where('room_id', '==', jobId));
        const snap = await getDocs(q);
        const messages = snap.docs.map(d => ({ ...d.data(), id: d.id } as ChatMessage));
        return messages.sort((a, b) => new Date(a.created_at || a.timestamp).getTime() - new Date(b.created_at || b.timestamp).getTime());
    },

    resolveDispute: async (disputeId: string, jobId: string, decision: 'refund_user' | 'pay_provider'): Promise<void> => {
        // 1. Update Dispute Status
        await updateDoc(doc(db, 'disputes', disputeId), { status: 'resolved', admin_comment: decision });

        // 2. Update Job Status
        const newStatus = decision === 'refund_user' ? JobStatus.CANCELLED : JobStatus.COMPLETED;
        await updateDoc(doc(db, 'jobs', jobId), { status: newStatus });

        // 3. Handle Money Logic (Simulated)
        if (decision === 'refund_user') {
            const jobSnap = await getDoc(doc(db, 'jobs', jobId));
            const job = jobSnap.data() as Job;
            // Refund logic: Credit employer wallet
            const employerRef = doc(db, 'users', job.created_by);
            const employerSnap = await getDoc(employerRef);
            if (employerSnap.exists()) {
                const bal = employerSnap.data().wallet_balance || 0;
                await updateDoc(employerRef, { wallet_balance: bal + job.price });
            }
        }
    },

    // --- SYSTEM CONFIG ---
    createVoucher: async (voucher: Voucher): Promise<void> => {
        await addDoc(collection(db, 'vouchers'), sanitize(voucher));
    },

    getVouchers: async (): Promise<Voucher[]> => {
        const snap = await getDocs(collection(db, 'vouchers'));
        return snap.docs.map(d => d.data() as Voucher);
    },

    // --- SYSTEM BANNERS ---
    createBanner: async (banner: Omit<SystemBanner, 'id' | 'created_at'>): Promise<void> => {
        await addDoc(collection(db, 'banners'), sanitize({
            ...banner,
            created_at: new Date().toISOString()
        }));
    },

    getBanners: async (): Promise<SystemBanner[]> => {
        const snap = await getDocs(collection(db, 'banners'));
        return snap.docs.map(d => ({...d.data(), id: d.id} as SystemBanner));
    },

    deleteBanner: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, 'banners', id));
    },

    // --- JOB MANAGEMENT (CONTENT MODERATION) ---
    searchJobs: async (searchTerm: string): Promise<Job[]> => {
        const jobsRef = collection(db, 'jobs');
        const snap = await getDocs(jobsRef);
        let jobs = snap.docs.map(d => ({...d.data(), id: d.id} as Job));
        
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            jobs = jobs.filter(j => j.title.toLowerCase().includes(lower) || j.category.toLowerCase().includes(lower));
        }
        
        // Sort by newest
        return jobs.sort((a, b) => new Date(b.created_at || b.datetime).getTime() - new Date(a.created_at || a.datetime).getTime()).slice(0, 50);
    },

    deleteJob: async (jobId: string): Promise<void> => {
        await deleteDoc(doc(db, 'jobs', jobId));
    },

    // --- USER MANAGEMENT (CRM) ---
    searchUsers: async (searchTerm: string): Promise<UserProfile[]> => {
        const usersRef = collection(db, 'users');
        const snap = await getDocs(usersRef);
        const users = snap.docs.map(d => ({...d.data(), id: d.id} as UserProfile));
        
        if (!searchTerm) return users.slice(0, 20); // Return first 20 if no search

        const lower = searchTerm.toLowerCase();
        return users.filter(u => 
            u.name.toLowerCase().includes(lower) || 
            u.phone.includes(lower) ||
            u.email.toLowerCase().includes(lower)
        );
    },

    getUserDetails: async (userId: string): Promise<{ user: UserProfile, jobsPosted: Job[], jobsWorked: Job[], transactions: Transaction[] }> => {
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (!userSnap.exists()) throw new Error("User not found");
        const user = { ...userSnap.data(), id: userSnap.id } as UserProfile;

        // Fetch Jobs Posted
        const postedQ = query(collection(db, 'jobs'), where('created_by', '==', userId));
        const postedSnap = await getDocs(postedQ);
        const jobsPosted = postedSnap.docs.map(d => ({...d.data(), id: d.id} as Job));

        // Fetch Jobs Worked
        const workedQ = query(collection(db, 'jobs'), where('accepted_by', '==', userId));
        const workedSnap = await getDocs(workedQ);
        const jobsWorked = workedSnap.docs.map(d => ({...d.data(), id: d.id} as Job));

        // Fetch Transactions
        const txQ = query(collection(db, 'transactions'), where('user_id', '==', userId));
        const txSnap = await getDocs(txQ);
        const transactions = txSnap.docs.map(d => ({...d.data(), id: d.id} as Transaction));

        return { user, jobsPosted, jobsWorked, transactions };
    },

    banUser: async (userId: string, ban: boolean): Promise<void> => {
        await updateDoc(doc(db, 'users', userId), { is_banned: ban });
    },

    // 🔧 Update User Role (Fix for Anna issue)
    updateUserRole: async (userId: string, newRole: 'user' | 'PROVIDER' | 'USER'): Promise<void> => {
        const normalizedRole = newRole.toUpperCase();
        await updateDoc(doc(db, 'users', userId), { 
            role: normalizedRole,
            updated_at: new Date().toISOString()
        });
        console.log(`✅ Updated user ${userId} to role: ${normalizedRole}`);
    },

    // --- SYSTEM CATEGORIES (CMS) ---
    getCategories: async (): Promise<string[]> => {
        const docRef = doc(db, 'system_config', 'categories');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return snap.data().list || [];
        }
        // Default fallback if not set in DB yet
        return ['Cleaning', 'Driver', 'Dating', 'General'];
    },

    addCategory: async (category: string): Promise<void> => {
        const docRef = doc(db, 'system_config', 'categories');
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
            await setDoc(docRef, { list: [category] });
        } else {
            await updateDoc(docRef, { list: arrayUnion(category) });
        }
    },

    removeCategory: async (category: string): Promise<void> => {
        const docRef = doc(db, 'system_config', 'categories');
        await updateDoc(docRef, { list: arrayRemove(category) });
    },
    // ===== COURSES =====
  async listCourses(): Promise<Course[]> {
    try {
      return await trainingService.getCourses();
    } catch (err) {
      console.error('listCourses error', err);
      throw err;
    }
  },

  async getCourse(id: string): Promise<Course | undefined> {
    try {
      return await trainingService.getCourse(id);
    } catch (err) {
      console.error('getCourse error', err);
      throw err;
    }
  },

  async createCourse(course: Omit<Course, 'id'>): Promise<Course> {
    try {
      const id = `course-${Date.now()}`;
      const newCourse: Course = { ...course, id };
      SAMPLE_COURSES.push(newCourse);
      localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));
      return newCourse;
    } catch (err) {
      console.error('createCourse error', err);
      throw err;
    }
  },

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
    try {
      const idx = SAMPLE_COURSES.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Course not found');
      SAMPLE_COURSES[idx] = { ...SAMPLE_COURSES[idx], ...updates };
      localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));
      return SAMPLE_COURSES[idx];
    } catch (err) {
      console.error('updateCourse error', err);
      throw err;
    }
  },

  async deleteCourse(id: string): Promise<boolean> {
    try {
      const idx = SAMPLE_COURSES.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Course not found');
      SAMPLE_COURSES.splice(idx, 1);
      localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));
      return true;
    } catch (err) {
      console.error('deleteCourse error', err);
      throw err;
    }
  },

  // ===== LESSONS =====
  async createLesson(courseId: string, lesson: Omit<Lesson, 'id'>): Promise<Lesson> {
    try {
      const course = SAMPLE_COURSES.find((c) => c.id === courseId);
      if (!course) throw new Error('Course not found');
      const id = `lesson-${Date.now()}`;
      const newLesson: Lesson = { ...lesson, id };
      course.lessons.push(newLesson);
      localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));
      return newLesson;
    } catch (err) {
      console.error('createLesson error', err);
      throw err;
    }
  },

  async deleteLesson(courseId: string, lessonId: string): Promise<boolean> {
    try {
      const course = SAMPLE_COURSES.find((c) => c.id === courseId);
      if (!course) throw new Error('Course not found');
      const idx = course.lessons.findIndex((l) => l.id === lessonId);
      if (idx === -1) throw new Error('Lesson not found');
      course.lessons.splice(idx, 1);
      localStorage.setItem('training_courses', JSON.stringify(SAMPLE_COURSES));
      return true;
    } catch (err) {
      console.error('deleteLesson error', err);
      throw err;
    }
  },

  // ===== USER PROGRESS STATS =====
  async getUserProgressStats(userId: string): Promise<{ courseId: string; courseName: string; completed: number; total: number; percentage: number; bestScore: number }[]> {
    try {
      const progress = await trainingService.getProgress(userId);
      const courses = await trainingService.getCourses();
      return courses.map((c) => {
        const progressEntries = progress.filter((p) => p.courseId === c.id);
        const completed = progressEntries.filter((p) => p.completed).length;
        const total = c.lessons.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const bestScore = progressEntries.length > 0 ? Math.max(...progressEntries.map((p) => p.bestScore ?? 0)) : 0;
        return { courseId: c.id, courseName: c.title, completed, total, percentage, bestScore };
      });
    } catch (err) {
      console.error('getUserProgressStats error', err);
      throw err;
    }
  },

  async getAllUsersProgress(): Promise<{ userId: string; stats: any[]; certificateCount: number }[]> {
    try {
      const userKeys = Object.keys(localStorage).filter((k) => k.startsWith('training_progress_v1:'));
      const result = await Promise.all(
        userKeys.map(async (key) => {
          const userId = key.split(':')[1];
          const stats = await this.getUserProgressStats(userId);
          const certs = await certificateService.getCertificates(userId);
          return { userId, stats, certificateCount: certs.length };
        })
      );
      return result;
    } catch (err) {
      console.error('getAllUsersProgress error', err);
      throw err;
    }
  },

  async getUserCertificates(userId: string): Promise<Certificate[]> {
    try {
      return await certificateService.getCertificates(userId);
    } catch (err) {
      console.error('getUserCertificates error', err);
      throw err;
    }
  },

  // ===== DASHBOARD STATS =====
  async getDashboardStats(): Promise<{
    totalUsers: number;
    totalCourses: number;
    totalCertificatesIssued: number;
    averageCompletionRate: number;
  }> {
    try {
      const userKeys = Object.keys(localStorage).filter((k) => k.startsWith('training_progress_v1:'));
      const allUsersProgress = await this.getAllUsersProgress();

      const totalCertificatesIssued = allUsersProgress.reduce((sum, u) => sum + u.certificateCount, 0);
      const avgCompletion =
        allUsersProgress.length > 0
          ? Math.round(allUsersProgress.reduce((sum, u) => sum + (u.stats[0]?.percentage ?? 0), 0) / allUsersProgress.length)
          : 0;

      return {
        totalUsers: userKeys.length,
        totalCourses: SAMPLE_COURSES.length,
        totalCertificatesIssued,
        averageCompletionRate: avgCompletion,
      };
    } catch (err) {
      console.error('getDashboardStats error', err);
      throw err;
    }
  },
};
export const adminService = AdminService;