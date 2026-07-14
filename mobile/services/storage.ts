
import { Job, UserProfile, Transaction, ChatMessage, JobStatus, UserRole, UserNotification } from '../types';

const KEYS = {
  USERS: 'meerak_sql_users',
  JOBS: 'meerak_sql_jobs',
  CHATS: 'meerak_sql_chats',
  TRANSACTIONS: 'meerak_sql_transactions',
  NOTIFICATIONS: 'meerak_sql_notifications',
  SAVED_JOBS: 'meerak_sql_saved_jobs',
};

// Seed Data (Simulating SQL Rows)
const SEED_USER: UserProfile = {
  id: 'user-1',
  name: 'Alex Dev',
  phone: '0812345678',
  email: 'alex@meerak.app',
  bio: 'Regular user looking for help.',
  role: UserRole.USER,
  kyc_level: 'level_1',
  avatar_url: 'https://picsum.photos/seed/alex/200',
  rating: 4.8,
  wallet_balance: 5000,
  created_at: new Date().toISOString()
};

const SEED_JOBS: Job[] = [
  {
    id: 'job-1',
    category: 'Cleaning',
    title: 'Condo Deep Clean',
    description: 'Need a full deep clean for a 35sqm condo. Includes balcony and bathroom.',
    price: 500,
    location: { lat: 13.7563, lng: 100.5018 },
    datetime: new Date(Date.now() + 86400000).toISOString(),
    status: JobStatus.OPEN,
    created_by: 'user-2', // Foreign Key
    duration_minutes: 120,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'job-2',
    category: 'Plumbing',
    title: 'Leaking Sink Repair',
    description: 'Kitchen sink is leaking water underneath the cabinet.',
    price: 800,
    location: { lat: 13.7463, lng: 100.5318 },
    datetime: new Date(Date.now() + 172800000).toISOString(),
    status: JobStatus.OPEN,
    created_by: 'user-3', // Foreign Key
    duration_minutes: 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'job-3',
    category: 'AC_Cleaning',
    title: 'Clean 2 AC Units',
    description: 'Wall mounted AC cleaning. Need it done this weekend.',
    price: 1200,
    location: { lat: 13.7200, lng: 100.5500 },
    datetime: new Date(Date.now() + 200000000).toISOString(),
    status: JobStatus.OPEN,
    created_by: 'user-2',
    duration_minutes: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'job-4',
    category: 'Fortune_Telling',
    title: 'Tarot Card Reading',
    description: 'Looking for a 1-hour tarot session for general life guidance.',
    price: 500,
    location: { lat: 13.7300, lng: 100.5600 },
    datetime: new Date(Date.now() + 300000000).toISOString(),
    status: JobStatus.OPEN,
    created_by: 'user-3',
    duration_minutes: 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'job-5',
    category: 'Photography',
    title: 'Graduation Photoshoot',
    description: 'Half-day photoshoot at Chulalongkorn University.',
    price: 3500,
    location: { lat: 13.7380, lng: 100.5300 },
    datetime: new Date(Date.now() + 400000000).toISOString(),
    status: JobStatus.OPEN,
    created_by: 'user-1',
    duration_minutes: 240,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Mock Users for FK reference
const MOCK_USERS_DB: UserProfile[] = [
    SEED_USER,
    {
        id: 'user-2',
        name: 'Sarah J.',
        phone: '0899999999',
        email: 'sarah@test.com',
        role: UserRole.USER,
        wallet_balance: 1000,
        created_at: new Date().toISOString()
    },
    {
        id: 'user-3',
        name: 'Mike T.',
        phone: '0888888888',
        email: 'mike@test.com',
        role: UserRole.USER,
        wallet_balance: 200,
        created_at: new Date().toISOString()
    }
];

export const StorageService = {
  // Generic SQL Table Simulation
  getTable: <T>(tableName: string, seedData: T[] = []): T[] => {
    const stored = localStorage.getItem(tableName);
    if (!stored) {
      localStorage.setItem(tableName, JSON.stringify(seedData));
      return seedData;
    }
    return JSON.parse(stored);
  },

  saveTable: <T>(tableName: string, data: T[]) => {
    localStorage.setItem(tableName, JSON.stringify(data));
  },

  // --- Users (SELECT * FROM users) ---
  getUsers: (): UserProfile[] => {
      return StorageService.getTable(KEYS.USERS, MOCK_USERS_DB);
  },
  
  saveUser: (user: UserProfile) => {
    const users = StorageService.getUsers();
    const index = users.findIndex(u => u.id === user.id);
    const timestamp = new Date().toISOString();
    
    if (index >= 0) {
        // UPDATE users SET ...
        users[index] = { ...users[index], ...user }; // Preserve other fields
    } else {
        // INSERT INTO users ...
        users.push({ ...user, created_at: timestamp });
    }
    StorageService.saveTable(KEYS.USERS, users);
  },

  findUserByPhone: (phone: string): UserProfile | undefined => {
    return StorageService.getUsers().find(u => u.phone === phone);
  },

  // --- Jobs (SELECT * FROM jobs) ---
  getJobs: (): Job[] => {
      return StorageService.getTable(KEYS.JOBS, SEED_JOBS);
  },
  
  saveJob: (job: Job) => {
    const jobs = StorageService.getJobs();
    const index = jobs.findIndex(j => j.id === job.id);
    const timestamp = new Date().toISOString();

    if (index >= 0) {
      jobs[index] = { ...job, updated_at: timestamp };
    } else {
      jobs.unshift({ ...job, created_at: timestamp, updated_at: timestamp });
    }
    StorageService.saveTable(KEYS.JOBS, jobs);
  },

  // --- Transactions ---
  getTransactions: (): Transaction[] => {
    return StorageService.getTable(KEYS.TRANSACTIONS, []);
  },

  addTransaction: (tx: Transaction) => {
    const txs = StorageService.getTransactions();
    // INSERT INTO transactions ...
    txs.unshift(tx); 
    StorageService.saveTable(KEYS.TRANSACTIONS, txs);
  },

  // --- Chats ---
  getMessages: (roomId: string): ChatMessage[] => {
    const allMessages = StorageService.getTable<ChatMessage>(KEYS.CHATS, []);
    return allMessages.filter(m => m.room_id === roomId);
  },

  addMessage: (roomId: string, msg: ChatMessage) => {
    const allMessages = StorageService.getTable<ChatMessage>(KEYS.CHATS, []);
    allMessages.push(msg);
    StorageService.saveTable(KEYS.CHATS, allMessages);
  },

  // --- Notifications ---
  getNotifications: (userId: string): UserNotification[] => {
      const all = StorageService.getTable<UserNotification>(KEYS.NOTIFICATIONS, []);
      return all.filter(n => n.user_id === userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  addNotification: (note: UserNotification) => {
      const all = StorageService.getTable<UserNotification>(KEYS.NOTIFICATIONS, []);
      all.unshift(note);
      StorageService.saveTable(KEYS.NOTIFICATIONS, all);
  },

  markNotificationRead: (id: string) => {
      const all = StorageService.getTable<UserNotification>(KEYS.NOTIFICATIONS, []);
      const index = all.findIndex(n => n.id === id);
      if (index >= 0) {
          all[index].is_read = true;
          StorageService.saveTable(KEYS.NOTIFICATIONS, all);
      }
  },
  // --- Saved Jobs (สำหรับผู้รับงาน) ---
  getSavedJobs: (userId: string): any[] => {
    const allSaved = StorageService.getTable<any>(KEYS.SAVED_JOBS, []);
    return allSaved.filter(job => job.userId === userId);
  },

  saveJobForUser: (userId: string, jobInfo: any) => {
    const allSaved = StorageService.getTable<any>(KEYS.SAVED_JOBS, []);
    
    // ตรวจสอบว่าเคยบันทึกแล้วหรือยัง
    const exists = allSaved.find(
      (j: any) => j.jobId === jobInfo.jobId && j.userId === userId
    );
    
    if (!exists) {
      allSaved.push({
        ...jobInfo,
        userId: userId,
        savedAt: new Date().toISOString()
      });
      StorageService.saveTable(KEYS.SAVED_JOBS, allSaved);
      return { success: true, message: 'บันทึกงานเรียบร้อยแล้ว' };
    } else {
      return { success: false, message: 'บันทึกงานนี้ไว้แล้ว' };
    }
  },

  removeSavedJob: (userId: string, jobId: string) => {
    const allSaved = StorageService.getTable<any>(KEYS.SAVED_JOBS, []);
    const filtered = allSaved.filter(
      (j: any) => !(j.userId === userId && j.jobId === jobId)
    );
    StorageService.saveTable(KEYS.SAVED_JOBS, filtered);
    return { success: true, message: 'ลบงานที่บันทึกแล้ว' };
  },

  // 📸 Phase 4: Upload Job Proof Photos
  uploadJobProof: async (
    jobId: string,
    file: File,
    type: 'before' | 'after'
  ): Promise<string> => {
    try {
      // สร้าง mock URL สำหรับ demo
      // ในการใช้งานจริง ควรใช้ Firebase Storage
      
      // Convert file to base64 for mock storage
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          
          // Mock URL (ในการใช้งานจริงควรอัปโหลดไป Firebase Storage)
          const mockUrl = base64String; // ใช้ base64 ชั่วคราว
          
          // TODO: Replace with actual Firebase Storage upload
          // const storage = getStorage();
          // const storageRef = ref(storage, `job_proofs/${jobId}/${type}_${Date.now()}.jpg`);
          // const snapshot = await uploadBytes(storageRef, file);
          // const url = await getDownloadURL(snapshot.ref);
          
          console.log(`✅ Mock upload ${type} photo for job ${jobId}`);
          resolve(mockUrl);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('❌ Error uploading job proof:', error);
      throw error;
    }
  }
};



