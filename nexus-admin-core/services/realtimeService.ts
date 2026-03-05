// ✅ Connect to Real Meerak Backend
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, getDoc } from 'firebase/firestore';
import { MOCK_USERS, MOCK_ANALYTICS, MOCK_LOGS, INITIAL_SYSTEM_CONFIG } from '../constants';
import { MobileUser, AnalyticsData, SystemLog } from '../types';

const USE_FIREBASE = INITIAL_SYSTEM_CONFIG.useFirebase && !!db;

export const DataService = {
  getUsers: async (): Promise<MobileUser[]> => {
    // ✅ Use Real Firebase
    if (USE_FIREBASE && db) {
      try {
        console.log('📡 Fetching users from Firebase...');
        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        
        const users = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            username: data.name || 'Unknown',
            email: data.email || 'No email',
            role: data.role || 'user',
            status: data.is_banned ? 'offline' : 'online',
            lastSeen: data.updated_at || data.created_at,
            platform: 'Mobile',
            version: '2.0.0',
            lastIp: data.last_ip || 'N/A',
            deviceId: doc.id.substring(0, 8),
            // Meerak specific fields
            wallet_balance: data.wallet_balance || 0,
            kyc_level: data.kyc_level || 'none',
            phone: data.phone || 'N/A'
          } as MobileUser;
        });
        
        console.log(`✅ Fetched ${users.length} users from Firebase`);
        return users;
      } catch (error) {
        console.error("❌ Error fetching users from Firebase:", error);
        return MOCK_USERS; // Fallback
      }
    }
    
    // Fallback: Mock Data
    return new Promise(resolve => setTimeout(() => resolve(MOCK_USERS), 500));
  },

  getAnalytics: async (): Promise<AnalyticsData[]> => {
    if (USE_FIREBASE && db) {
      try {
        // Get real analytics from jobs collection
        const jobsRef = collection(db, "jobs");
        const jobsSnap = await getDocs(jobsRef);
        const jobs = jobsSnap.docs.map(d => d.data());
        
        // Calculate real stats
        const activeUsers = new Set(jobs.map(j => j.created_by)).size;
        const totalJobs = jobs.length;
        const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
        
        return [
          { name: 'Active Users', value: activeUsers },
          { name: 'Total Jobs', value: totalJobs },
          { name: 'Completed', value: completedJobs },
          { name: 'Revenue (THB)', value: jobs.reduce((sum, j) => sum + (j.price || 0), 0) }
        ];
      } catch (error) {
        console.error("Error fetching analytics:", error);
      }
    }
    return MOCK_ANALYTICS;
  },

  getSystemLogs: async (): Promise<SystemLog[]> => {
    if (USE_FIREBASE && db) {
      try {
        // Get admin logs from Firebase
        const logsRef = collection(db, "admin_logs");
        const q = query(logsRef, orderBy('created_at', 'desc'), limit(50));
        const logsSnap = await getDocs(q);
        
        return logsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            timestamp: data.created_at,
            level: 'info',
            message: `${data.action}: ${data.details}`,
            source: data.admin_email || 'system'
          } as SystemLog;
        });
      } catch (error) {
        console.error("Error fetching logs:", error);
      }
    }
    return MOCK_LOGS;
  },

  // ✅ User Management Functions
  updateUserRole: async (userId: string, newRole: 'USER' | 'PROVIDER'): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updated_at: new Date().toISOString()
      });
      console.log(`✅ Updated user ${userId} to role: ${newRole}`);
    } catch (error) {
      console.error('❌ Failed to update user role:', error);
      throw error;
    }
  },

  banUser: async (userId: string, isBanned: boolean): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        is_banned: isBanned,
        updated_at: new Date().toISOString()
      });
      console.log(`✅ ${isBanned ? 'Banned' : 'Unbanned'} user ${userId}`);
    } catch (error) {
      console.error('❌ Failed to ban/unban user:', error);
      throw error;
    }
  },

  updateUserBalance: async (userId: string, newBalance: number): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        wallet_balance: newBalance,
        updated_at: new Date().toISOString()
      });
      console.log(`✅ Updated user ${userId} balance to ${newBalance}`);
    } catch (error) {
      console.error('❌ Failed to update user balance:', error);
      throw error;
    }
  },

  getUserDetails: async (userId: string): Promise<any> => {
    if (!db) throw new Error('Firebase not initialized');
    
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      return { id: userSnap.id, ...userSnap.data() };
    } catch (error) {
      console.error('❌ Failed to get user details:', error);
      throw error;
    }
  }
};
