// firebase.ts
// @ts-ignore
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// @ts-ignore
import { getAnalytics } from "firebase/analytics";
import { getFunctions } from "firebase/functions";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Unsubscribe
} from "firebase/firestore";
import { ChatMessage, Job, JobStatus, UserNotification, MessageType } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyD9r0LoQTFCUAvH5RjIiLf6mLuLI4Sq22Y",
  authDomain: "meerak-b43ac.firebaseapp.com",
  databaseURL: "https://meerak-b43ac-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "meerak-b43ac",
  storageBucket: "meerak-b43ac.firebasestorage.app",
  messagingSenderId: "997123281842",
  appId: "1:997123281842:web:70e2193732b06ded89caab",
  measurementId: "G-7G7TGF11BG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app);

let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Firebase Analytics initialization failed", e);
}

// Helper to map Firestore doc
const mapDoc = <T>(docSnap: any): T => {
  const data = docSnap.data();
  const processed: any = { ...data, id: docSnap.id };
  Object.keys(processed).forEach((key) => {
    if (processed[key] && typeof processed[key].toDate === "function") {
      processed[key] = processed[key].toDate().toISOString();
    }
  });
  return processed as T;
};

// Firebase API functions
export const FirebaseApi = {
  // Subscribe to messages for a job
  subscribeToMessages: (
    jobId: string,
    callback: (msgs: ChatMessage[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "chat_messages"),
      where("room_id", "==", jobId),
      orderBy("timestamp", "asc")
    );
    
    const userId = localStorage.getItem("meerak_user_id");
    console.log("🔔 Subscribing to chat messages for job:", jobId, "user:", userId);
    
    return onSnapshot(q, (snapshot) => {
      console.log("📬 Chat snapshot received:", snapshot.docs.length, "messages");
      const msgs = snapshot.docs
        .map((doc) => {
          const data = mapDoc<ChatMessage>(doc);
          console.log("📨 Message:", {
            id: doc.id,
            sender: data.sender_id,
            text: data.text?.substring(0, 30),
            room: data.room_id
          });
          return data;
        })
        .sort(
          (a, b) =>
            new Date(a.created_at || a.timestamp).getTime() -
            new Date(b.created_at || b.timestamp).getTime()
        )
        .map((m) => ({ ...m, is_me: m.sender_id === userId }));
      console.log("✅ Processed", msgs.length, "messages for display");
      callback(msgs);
    }, (error) => {
      console.error("❌ Error subscribing to messages:", error);
    });
  },

  // Subscribe to job updates
  subscribeToJob: (
    jobId: string,
    callback: (job: Job | null) => void
  ): Unsubscribe => {
    return onSnapshot(
      doc(db, "jobs", jobId),
      (docSnap) => {
        if (docSnap.exists()) {
          callback(mapDoc<Job>(docSnap));
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error("Subscribe Job Error", error);
      }
    );
  },

  // Subscribe to user notifications
  subscribeToNotifications: (
    userId: string,
    callback: (notifications: UserNotification[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc")
    );
    
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => mapDoc<UserNotification>(doc));
      callback(notifications);
    }, (error) => {
      console.error("Error subscribing to notifications:", error);
    });
  },

  // Subscribe to recommended jobs
  subscribeToRecommendedJobs: (
    callback: (jobs: Job[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "jobs"),
      where("status", "==", JobStatus.OPEN),
      orderBy("created_at", "desc")
    );
    
    return onSnapshot(q, (snapshot) => {
      const jobs = snapshot.docs.map((doc) => mapDoc<Job>(doc));
      callback(jobs);
    }, (error) => {
      console.error("Error subscribing to recommended jobs:", error);
    });
  },

  // Send a chat message
  sendMessage: async (
    jobId: string,
    text?: string,
    type: MessageType = MessageType.TEXT
  ): Promise<void> => {
    const userId = localStorage.getItem("meerak_user_id");
    if (!userId) throw new Error("Not logged in");
    
    const msg = {
      room_id: jobId,
      sender_id: userId,
      type,
      text: text || "",
      media_url: type === MessageType.IMAGE ? text : undefined,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    
    console.log("📤 Sending message:", {
      room_id: jobId,
      sender_id: userId,
      text: text?.substring(0, 50),
      type
    });
    
    try {
      const docRef = await addDoc(collection(db, "chat_messages"), msg);
      console.log("✅ Message sent successfully! Doc ID:", docRef.id);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      throw error;
    }
  },

  // Get real-time job updates
  getJobUpdates: (
    jobId: string,
    callback: (job: Job) => void
  ): Unsubscribe => {
    return onSnapshot(
      doc(db, "jobs", jobId),
      (docSnap) => {
        if (docSnap.exists()) {
          const job = mapDoc<Job>(docSnap);
          callback(job);
        }
      },
      (error) => {
        console.error("Error getting job updates:", error);
      }
    );
  },

  // Subscribe to user profile updates
  subscribeToProfile: (
    userId: string,
    callback: (profile: any) => void
  ): Unsubscribe => {
    return onSnapshot(
      doc(db, "users", userId),
      (docSnap) => {
        if (docSnap.exists()) {
          callback(mapDoc<any>(docSnap));
        }
      },
      (error) => {
        console.error("Error subscribing to profile:", error);
      }
    );
  },

  // Get real-time transactions
  subscribeToTransactions: (
    userId: string,
    callback: (transactions: any[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "transactions"),
      where("user_id", "==", userId),
      orderBy("date", "desc")
    );
    
    return onSnapshot(q, (snapshot) => {
      const transactions = snapshot.docs.map((doc) => mapDoc<any>(doc));
      callback(transactions);
    }, (error) => {
      console.error("Error subscribing to transactions:", error);
    });
  },

  // Get active job count
  getActiveJobCount: (
    userId: string,
    callback: (count: number) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "jobs"),
      where("accepted_by", "==", userId),
      where("status", "in", [JobStatus.ACCEPTED, JobStatus.IN_PROGRESS, JobStatus.WAITING_FOR_APPROVAL])
    );
    
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.size);
    }, (error) => {
      console.error("Error getting active job count:", error);
    });
  },

  // Subscribe to wallet balance
  subscribeToWalletBalance: (
    userId: string,
    callback: (balance: number, pending: number) => void
  ): Unsubscribe => {
    return onSnapshot(
      doc(db, "users", userId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          callback(data.wallet_balance || 0, data.wallet_pending || 0);
        }
      },
      (error) => {
        console.error("Error subscribing to wallet balance:", error);
      }
    );
  },

  // Get real-time provider availability
  subscribeToProviderAvailability: (
    providerId: string,
    callback: (available: boolean) => void
  ): Unsubscribe => {
    return onSnapshot(
      doc(db, "users", providerId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const isOnJob = data.current_job_id && data.current_job_status === 'in_progress';
          callback(!isOnJob);
        }
      },
      (error) => {
        console.error("Error subscribing to provider availability:", error);
      }
    );
  },

  // Get real-time job queue
  subscribeToJobQueue: (
    category: string,
    callback: (jobs: Job[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "jobs"),
      where("status", "==", JobStatus.OPEN),
      where("category", "==", category),
      orderBy("created_at", "asc")
    );
    
    return onSnapshot(q, (snapshot) => {
      const jobs = snapshot.docs.map((doc) => mapDoc<Job>(doc));
      callback(jobs);
    }, (error) => {
      console.error("Error subscribing to job queue:", error);
    });
  },

  // Send push notification via Firebase
  sendPushNotification: async (notification: {
    userId: string;
    title: string;
    body: string;
    data?: any;
  }): Promise<void> => {
    try {
      // Call Firebase Cloud Function for push notifications
      const sendNotification = getFunctions().httpsCallable('sendPushNotification');
      await sendNotification(notification);
    } catch (error) {
      console.error("Error sending push notification:", error);
      // Fallback: store in Firestore for web notifications
      await doc(collection(db, "web_notifications"), Date.now().toString()).set({
        ...notification,
        created_at: new Date().toISOString(),
        read: false
      });
    }
  },

  // Get unread notification count
  subscribeToUnreadCount: (
    userId: string,
    callback: (count: number) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("is_read", "==", false)
    );
    
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.size);
    }, (error) => {
      console.error("Error subscribing to unread count:", error);
    });
  },

  // Cleanup all subscriptions
  cleanupSubscriptions: (subscriptions: Unsubscribe[]): void => {
    subscriptions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Error cleaning up subscription:", error);
      }
    });
  },

  // ✅ Phase 3: Confirm Provider Arrival
  confirmArrival: async (jobId: string, providerId: string): Promise<boolean> => {
    try {
      console.log('📍 Confirming arrival for job:', jobId, 'provider:', providerId);
      
      const jobRef = doc(db, 'jobs', jobId);
      const updateData = {
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await updateDoc(jobRef, updateData);
      
      console.log('✅ Arrival confirmed successfully!');
      return true;
    } catch (error) {
      console.error('❌ Error confirming arrival:', error);
      throw error;
    }
  }
};

// Export everything
export { app, db, analytics, functions };
export default FirebaseApi;