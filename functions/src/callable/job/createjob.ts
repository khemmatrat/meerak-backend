// functions/src/callable/job/createjob.ts
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { CallableRequest } from 'firebase-functions/v2/https';

// Interface สำหรับข้อมูล job
interface JobData {
  title: string;
  description: string;
  category: string;
  price: number;
  location: string;
  images?: string[];
  requirements?: string;
  deadline?: string;
  duration?: string;
  [key: string]: any;
}

export const createJob = functions.https.onCall(
  async (request: CallableRequest<JobData>) => {
    // ใน v2 ข้อมูลอยู่ใน request.data และ auth อยู่ใน request.auth
    const { data } = request;
    
    // ตรวจสอบ authentication
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = request.auth.uid;
    
    try {
      // 1. ตรวจสอบข้อมูล
      const required = ['title', 'description', 'category', 'price', 'location'];
      for (const field of required) {
        if (!data[field]) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Missing field: ${field}`
          );
        }
      }

      // 2. บันทึกลง Firestore
      const jobData = {
        ...data,
        created_by: userId,
        status: 'open',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        view_count: 0,
        applicant_count: 0,
        is_featured: false,
      };

      const docRef = await admin.firestore().collection('jobs').add(jobData);
      
      // 3. ส่ง notification ไปหา providers ที่ match
      await matchAndNotifyProviders({
        ...jobData,
        id: docRef.id
      });
      
      return {
        id: docRef.id,
        ...jobData,
        created_at: new Date().toISOString(),
      };
      
    } catch (error: any) {
      console.error('Error in createJob:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Job creation failed',
        error.message
      );
    }
  }
);

// เพิ่มฟังก์ชัน matching
async function matchAndNotifyProviders(jobData: any) {
  try {
    const providers = await admin.firestore()
      .collection('users')
      .where('role', '==', 'provider')
      .where('categories', 'array-contains', jobData.category)
      .where('is_available', '==', true)
      .limit(10)
      .get();
    
    // ส่ง push notification
    const tokens = providers.docs
      .map(doc => doc.data().fcm_token)
      .filter(Boolean);
    
    if (tokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: 'มีงานใหม่รอคุณอยู่!',
          body: `${jobData.title} - ${jobData.price}฿`,
        },
        data: {
          jobId: jobData.id || '',
          type: 'new_job',
        },
      });
    }
    
  } catch (error) {
    console.error('Error in matchAndNotifyProviders:', error);
  }
}