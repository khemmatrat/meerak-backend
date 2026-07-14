"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = void 0;
// functions/src/callable/job/createjob.ts
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
exports.createJob = functions.https.onCall(async (request) => {
    // ใน v2 ข้อมูลอยู่ใน request.data และ auth อยู่ใน request.auth
    const { data } = request;
    // ตรวจสอบ authentication
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = request.auth.uid;
    try {
        // 1. ตรวจสอบข้อมูล
        const required = ['title', 'description', 'category', 'price', 'location'];
        for (const field of required) {
            if (!data[field]) {
                throw new functions.https.HttpsError('invalid-argument', `Missing field: ${field}`);
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
    }
    catch (error) {
        console.error('Error in createJob:', error);
        throw new functions.https.HttpsError('internal', 'Job creation failed', error.message);
    }
});
// เพิ่มฟังก์ชัน matching
async function matchAndNotifyProviders(jobData) {
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
    }
    catch (error) {
        console.error('Error in matchAndNotifyProviders:', error);
    }
}
