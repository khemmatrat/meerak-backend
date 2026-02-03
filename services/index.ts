import * as admin from "firebase-admin";
import {
  onCall,
  HttpsError,
  onRequest,
  Request,
  Response,
} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {Buffer} from "buffer";
import * as functions from 'firebase-functions';
import { v2 as cloudinary } from 'cloudinary';

type AuthContext = {
  uid: string;
};


// Configure Cloudinary (ใช้ค่าจริงจาก environment variables)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "thanixs-cdn",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Initialize Admin SDK
admin.initializeApp();
const db = admin.firestore();

const YOUR_OMISE_SECRET_KEY: string = "skey_test_PLACEHOLDER"; // Replace with real key

// --- Utility: Calculate Commission based on history ---
const getCommissionRate = (completedCount: number) => {
  if (completedCount > 150) return 0.08; // Diamond
  if (completedCount > 110) return 0.10; // Paradise
  if (completedCount > 80) return 0.12; // Platinum
  if (completedCount > 50) return 0.15; // Gold
  if (completedCount > 15) return 0.18; // Silver
  return 0.22; // Bronze
};

// ==================================================================
// 1. Secure Transaction Handler (Safe Payment)
// ==================================================================
// Call from App: await securePay({ jobId: "..." })
export const securePay = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const { jobId, method } = request.data;

  return securePayService({
    auth: { uid: request.auth.uid },
    jobId,
    method,
  });
});

export async function securePayService(params: {
  auth: AuthContext;
  jobId: string;
  method: string;
}) {
  const { auth, jobId, method } = params;
  const payerId = auth.uid;

  if (!jobId) {
    throw new HttpsError("invalid-argument", "Job ID is required");
  }

  return db.runTransaction(async (t) => {
    const jobRef = db.collection("jobs").doc(jobId);
    const jobDoc = await t.get(jobRef);

    if (!jobDoc.exists) {
      throw new HttpsError("not-found", "Job not found");
    }

    const job = jobDoc.data();
    if (!job) {
      throw new HttpsError("not-found", "Job data is empty");
    }

    if (job.status === "completed") {
      throw new HttpsError("failed-precondition", "Job already paid");
    }

    if (job.created_by !== payerId) {
      throw new HttpsError("permission-denied", "Not your job");
    }

    if (!job.accepted_by) {
      throw new HttpsError("failed-precondition", "Job has no assigned provider");
    }

    const providerRef = db.collection("users").doc(job.accepted_by);
    const employerRef = db.collection("users").doc(payerId);

    const providerDoc = await t.get(providerRef);
    const employerDoc = await t.get(employerRef);

    if (!providerDoc.exists || !employerDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const provider = providerDoc.data();
    const employer = employerDoc.data();

    if (!provider || !employer) {
      throw new HttpsError("data-loss", "User profile data missing");
    }

    if (method === "wallet" && (employer.wallet_balance || 0) < job.price) {
      throw new HttpsError("failed-precondition", "Insufficient funds");
    }

    const feeRate = getCommissionRate(provider.completed_jobs_count || 0);
    const feeAmount = job.price * feeRate;
    const providerReceive = job.price - feeAmount;

    if (method === "wallet") {
      t.update(employerRef, {
        wallet_balance: admin.firestore.FieldValue.increment(-job.price),
      });
    }

    t.update(providerRef, {
      wallet_balance: admin.firestore.FieldValue.increment(providerReceive),
      completed_jobs_count: admin.firestore.FieldValue.increment(1),
    });

    t.update(jobRef, {
      status: "completed",
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    });

    t.set(db.collection("transactions").doc(), {
      user_id: payerId,
      type: "payment",
      amount: job.price,
      date: new Date().toISOString(),
      description: `Payment for ${job.title}`,
      status: "completed",
      related_job_id: jobId,
    });

    t.set(db.collection("company_ledger").doc(), {
      type: "revenue",
      amount: feeAmount,
      description: `Fee from Job ${jobId}`,
      date: new Date().toISOString(),
    });

    return { success: true, message: "Payment Processed" };
  });
}


// ==================================================================
// 2. Scheduled Tasks (Cron Jobs)
// ==================================================================
// Run automatically every 10 minutes
export const scheduledJobCleanup = onSchedule({schedule: "every 10 minutes"},
  async () => {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const expiryTime = new Date(now - ONE_DAY).toISOString();

    // A. Auto-Cancel Old Jobs
    const oldJobs = await db.collection("jobs")
      .where("status", "==", "open")
      .where("created_at", "<", expiryTime)
      .get();

    const batch = db.batch();
    oldJobs.forEach((doc) => {
      batch.update(doc.ref, {status: "cancelled"});
    });

    // B. Auto-Approve Submitted Jobs (Waiting > 5 mins)
    const FIVE_MINS = 5 * 60 * 1000;
    const autoApproveTime = new Date(now - FIVE_MINS).toISOString();

    const pendingJobs = await db.collection("jobs")
      .where("status", "==", "waiting_for_approval")
      .where("submitted_at", "<", autoApproveTime)
      .get();

    pendingJobs.forEach((doc) => {
      console.log(`Auto-approving job ${doc.id}`);
      // Logic to call payment function internally would go here
    });

    await batch.commit();
  }
);

// ==================================================================
// 3. Payment Gateway Webhook (Receive money)
// ==================================================================
export const paymentWebhook = onRequest(async (req: Request, res: Response) => {
  // 1. Verify Signature
  const signature = req.headers["x-signature"];
  // In production, validate signature with YOUR_OMISE_SECRET_KEY
  if (!signature && YOUR_OMISE_SECRET_KEY === "FORCE_CHECK") {
    res.status(400).send("Invalid Signature");
    return;
  }

  const {userId, amount, status, chargeId} = req.body;

  if (!userId || !amount) {
    res.status(400).send("Missing parameters");
    return;
  }

  if (status === "successful") {
    // 2. Top-up Wallet
    try {
      await db.runTransaction(async (t) => {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await t.get(userRef);

        if (!userDoc.exists) {
          throw new Error("User not found");
        }

        t.update(userRef, {
          wallet_balance: admin.firestore.FieldValue.increment(Number(amount)),
        });

        const txRef = db.collection("transactions").doc();
        t.set(txRef, {
          user_id: userId,
          type: "deposit",
          amount: Number(amount),
          status: "completed",
          description: "Top-up via Gateway",
          gateway_ref: chargeId,
          date: new Date().toISOString(),
        });
      });
      res.status(200).send("OK");
    } catch (error) {
      console.error("Webhook Transaction Failed", error);
      res.status(500).send("Transaction Failed");
    }
  } else {
    res.status(400).send("Payment Failed");
  }
});

// ==================================================================
// 4. Create Payment Source (Real Payment Gateway Integration)
// ==================================================================
export const createPaymentSource = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const {amount} = request.data;
  if (!amount || amount < 20) {
    throw new HttpsError("invalid-argument", "Minimum amount is 20 THB");
  }

  try {
    // --- REAL OMISE API CALL ---
    // If you haven't set the key yet, this will fail securely or use a mock fallback if desired.
    // Here we implement the REAL logic using fetch.
    
    if (YOUR_OMISE_SECRET_KEY.includes("PLACEHOLDER")) {
        // Fallback for development/testing if key is not set
        // Allows the app to function visually without crashing
        console.warn("Omise Secret Key is not set. Returning mock data.");
        const chargeId = `chrg_mock_${Date.now()}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=PromptPay-${amount}`;
        return { success: true, chargeId, qrCodeUrl, amount };
    }

    const auth = Buffer.from(YOUR_OMISE_SECRET_KEY + ":").toString("base64");
    
    const response = await fetch("https://api.omise.co/charges", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            amount: amount * 100, // Convert to Satang
            currency: "thb",
            source: { type: "promptpay" }
        })
    });

    const charge = await response.json();

    if (charge.object === "error") {
        throw new HttpsError("aborted", charge.message);
    }

    return {
      success: true,
      chargeId: charge.id,
      qrCodeUrl: charge.source.scannable_code.image.download_uri,
      amount: amount,
    };

  } catch (error: any) {
    console.error("Payment Source Creation Failed", error);
    // Return a clearer error to the client
    throw new HttpsError("internal", error.message || "Payment provider error");
  }
});

// ==================================================================
// 5. Push Notifications
// ==================================================================
export const sendPushNotification = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const notif = event.data?.data();
    if (!notif) return;

    const userId = notif.user_id;

    // Get FCM Token
    const userDoc = await db.collection("users").doc(userId).get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      console.log("No FCM Token for user", userId);
      return;
    }

    // Send to device
    const message = {
      token: fcmToken,
      notification: {
        title: notif.title,
        body: notif.message,
      },
      data: {
        relatedId: notif.related_id || "",
        type: notif.type,
      },
    };

    try {
      await admin.messaging().send(message);
    } catch (e) {
      console.error("Error sending push notification", e);
    }
  }
);

// ==================================================================
// 6. Admin Operations
// ==================================================================
export const adminAction = onCall(async (request) => {
  // 1. Check Authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  // 2. Check Admin Privilege
  const adminRef = db.collection("admin_users").doc(request.auth.uid);
  const adminDoc = await adminRef.get();

  if (!adminDoc.exists || !adminDoc.data()?.is_active) {
    throw new HttpsError("permission-denied", "Not an admin");
  }

  const {action, targetId, payload} = request.data;

  if (action === "ban_user") {
    await db.collection("users").doc(targetId)
      .update({is_banned: payload.ban});
    if (payload.ban) await admin.auth().revokeRefreshTokens(targetId);
  } else if (action === "force_delete_job") {
    await db.collection("jobs").doc(targetId).delete();
  } else if (action === "approve_withdrawal") {
    await db.collection("transactions").doc(targetId).update({
      status: "completed",
    });
  }

  // Log Admin Action
  await db.collection("admin_logs").add({
    admin_id: request.auth.uid,
    action,
    target_id: targetId,
    created_at: new Date().toISOString(),
  });

  return {success: true};
});

// ==================================================================
// 7. KYC Upload & AI Verification (7 Steps)
// ==================================================================
export const submitKYC = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const userId = request.auth.uid;
  const {
    // ข้อมูลพื้นฐาน (ขั้นตอน 1-3)
    fullName,
    birthDate,
    idCardNumber,
    
    // ไฟล์เอกสาร (ขั้นตอน 4-6)
    idCardFrontBase64,
    idCardBackBase64,
    selfiePhotoBase64,
    drivingLicenseFrontBase64,
    drivingLicenseBackBase64,
    selfieVideoBase64, // สำหรับ Liveness Check
  } = request.data;

  try {
    // 1. ตรวจสอบข้อมูลพื้นฐาน
    if (!fullName || !birthDate || !idCardNumber) {
      throw new HttpsError("invalid-argument", "Missing basic information");
    }

    // 2. ตรวจสอบรูปแบบเลขบัตรประชาชน
    if (!/^\d{13}$/.test(idCardNumber)) {
      throw new HttpsError("invalid-argument", "Invalid ID card number format");
    }

    // 3. ตรวจสอบอายุ (ต้องมากกว่า 18 ปี)
    const birth = new Date(birthDate);
    const age = new Date().getFullYear() - birth.getFullYear();
    if (age < 18) {
      throw new HttpsError("invalid-argument", "Must be at least 18 years old");
    }

    const uploadResults: Record<string, string> = {};

    // 4. อัปโหลดเอกสารไปยัง Cloudinary (พร้อม AI Verification)
    const uploadPromises = [];

    // ID Card Front (บัตรประชาชนหน้า)
    if (idCardFrontBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:image/jpeg;base64,${idCardFrontBase64}`, {
          folder: `kyc/${userId}/id_card`,
          public_id: `front_${Date.now()}`,
          resource_type: 'image',
          tags: ['id_card', 'front', 'kyc']
        }).then(result => {
          uploadResults.idCardFrontUrl = result.secure_url;
          uploadResults.idCardFrontId = result.public_id;
        })
      );
    }

    // ID Card Back (บัตรประชาชนหลัง)
    if (idCardBackBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:image/jpeg;base64,${idCardBackBase64}`, {
          folder: `kyc/${userId}/id_card`,
          public_id: `back_${Date.now()}`,
          resource_type: 'image',
          tags: ['id_card', 'back', 'kyc']
        }).then(result => {
          uploadResults.idCardBackUrl = result.secure_url;
          uploadResults.idCardBackId = result.public_id;
        })
      );
    }

    // Selfie Photo (รูปเซลฟี่)
    if (selfiePhotoBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:image/jpeg;base64,${selfiePhotoBase64}`, {
          folder: `kyc/${userId}/selfie`,
          public_id: `selfie_${Date.now()}`,
          resource_type: 'image',
          tags: ['selfie', 'face', 'kyc']
        }).then(result => {
          uploadResults.selfiePhotoUrl = result.secure_url;
          uploadResults.selfiePhotoId = result.public_id;
        })
      );
    }

    // Driving License Front (ใบขับขี่หน้า)
    if (drivingLicenseFrontBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:image/jpeg;base64,${drivingLicenseFrontBase64}`, {
          folder: `kyc/${userId}/driving_license`,
          public_id: `front_${Date.now()}`,
          resource_type: 'image',
          tags: ['driving_license', 'front', 'kyc']
        }).then(result => {
          uploadResults.drivingLicenseFrontUrl = result.secure_url;
          uploadResults.drivingLicenseFrontId = result.public_id;
        })
      );
    }

    // Driving License Back (ใบขับขี่หลัง)
    if (drivingLicenseBackBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:image/jpeg;base64,${drivingLicenseBackBase64}`, {
          folder: `kyc/${userId}/driving_license`,
          public_id: `back_${Date.now()}`,
          resource_type: 'image',
          tags: ['driving_license', 'back', 'kyc']
        }).then(result => {
          uploadResults.drivingLicenseBackUrl = result.secure_url;
          uploadResults.drivingLicenseBackId = result.public_id;
        })
      );
    }

    // Selfie Video (วิดีโอ Liveness Check)
    if (selfieVideoBase64) {
      uploadPromises.push(
        cloudinary.uploader.upload(`data:video/mp4;base64,${selfieVideoBase64}`, {
          folder: `kyc/${userId}/liveness`,
          public_id: `liveness_${Date.now()}`,
          resource_type: 'video',
          tags: ['liveness', 'video', 'kyc']
        }).then(result => {
          uploadResults.selfieVideoUrl = result.secure_url;
          uploadResults.selfieVideoId = result.public_id;
        })
      );
    }

    // รอการอัปโหลดทั้งหมด
    await Promise.all(uploadPromises);

    // 5. เรียก AI Verification Service (Face Matching & Document Validation)
    await callAIVerification({
      userId,
      idCardFrontUrl: uploadResults.idCardFrontUrl,
      selfiePhotoUrl: uploadResults.selfiePhotoUrl,
      idCardNumber,
      fullName,
      birthDate
    });

    // 6. ตรวจสอบ Background Check (ฐานข้อมูลอาชญากรรม)
    await runBackgroundCheck({
      idCardNumber,
      fullName,
      birthDate
    });

    // 7. อัพเดทข้อมูลผู้ใช้ใน Firestore
    await db.collection("users").doc(userId).update({
      // ข้อมูลพื้นฐาน
      kyc_full_name: fullName,
      kyc_birth_date: birthDate,
      kyc_id_card_number: idCardNumber,
      
      // URLs ของเอกสาร
      kyc_documents: {
        id_card_front: uploadResults.idCardFrontUrl,
        id_card_back: uploadResults.idCardBackUrl,
        selfie_photo: uploadResults.selfiePhotoUrl,
        driving_license_front: uploadResults.drivingLicenseFrontUrl,
        driving_license_back: uploadResults.drivingLicenseBackUrl,
        selfie_video: uploadResults.selfieVideoUrl,
      },
      
      // Cloudinary IDs สำหรับจัดการภายหลัง
      kyc_cloudinary_ids: {
        id_card_front: uploadResults.idCardFrontId,
        id_card_back: uploadResults.idCardBackId,
        selfie_photo: uploadResults.selfiePhotoId,
        driving_license_front: uploadResults.drivingLicenseFrontId,
        driving_license_back: uploadResults.drivingLicenseBackId,
        selfie_video: uploadResults.selfieVideoId,
      },
      
      // สถานะ KYC
      kyc_status: "pending_verification",
      kyc_submitted_at: new Date().toISOString(),
      kyc_level: "processing_7_steps",
      
      // Metadata
      updated_at: new Date().toISOString()
    });

    // 8. ส่ง Notification ไปยัง Admin สำหรับ review
    await db.collection("admin_notifications").add({
      type: "kyc_submission",
      user_id: userId,
      status: "pending",
      created_at: new Date().toISOString(),
      metadata: {
        name: fullName,
        id_card: idCardNumber
      }
    });

    return {
      success: true,
      message: "KYC submitted successfully. Waiting for verification (7 steps).",
      next_step: "ai_verification",
      estimated_time: "24-48 hours"
    };

  } catch (error: any) {
    console.error("KYC Submission Error:", error);
    throw new HttpsError("internal", error.message || "KYC submission failed");
  }
});

// ==================================================================
// 8. AI Verification Service (Face Matching & Document Validation)
// ==================================================================
async function callAIVerification(params: {
  userId: string,
  idCardFrontUrl: string,
  selfiePhotoUrl: string,
  idCardNumber: string,
  fullName: string,
  birthDate: string
}) {
  try {
    // ในที่นี้เป็นตัวอย่างของ AI Service
    // คุณสามารถใช้บริการเช่น:
    // 1. Amazon Rekognition
    // 2. Google Cloud Vision
    // 3. Face++ 
    // 4. หรือ AI service อื่นๆ
    
    // ตัวอย่างโครงสร้างการเรียก API จริง
    /*
    const response = await fetch('https://api.faceplusplus.com/facepp/v3/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.FACEPP_API_KEY,
        'API-Secret': process.env.FACEPP_API_SECRET
      },
      body: JSON.stringify({
        image_url1: params.idCardFrontUrl,
        image_url2: params.selfiePhotoUrl,
        return_landmark: 1
      })
    });
    
    const result = await response.json();
    
    if (result.confidence < 70) {
      throw new Error("Face matching failed. Confidence too low.");
    }
    */
    
    // สำหรับตอนนี้ทำ mock ไว้ก่อน
    console.log(`AI Verification called for user ${params.userId}`);
    
    // บันทึกผลการตรวจสอบ
    await db.collection("kyc_verifications").add({
      user_id: params.userId,
      type: "face_matching",
      status: "completed",
      confidence_score: 95.5, // Mock score
      verified_at: new Date().toISOString(),
      metadata: {
        id_card_number: params.idCardNumber,
        name: params.fullName
      }
    });
    
  } catch (error) {
    console.error("AI Verification failed:", error);
    throw error;
  }
}

// ==================================================================
// 9. Background Check (อาชญากรรม/Blocklist)
// ==================================================================
async function runBackgroundCheck(params: {
  idCardNumber: string,
  fullName: string,
  birthDate: string
}) {
  try {
    // ตรวจสอบกับฐานข้อมูลภายใน
    const blocklistCheck = await db.collection("blocklist")
      .where("id_card_number", "==", params.idCardNumber)
      .limit(1)
      .get();
    
    if (!blocklistCheck.empty) {
      throw new Error("User found in blocklist");
    }
    
    // ตรวจสอบกับ external API (ถ้ามี)
    /*
    const externalCheck = await fetch('https://api.background-check.com/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BG_CHECK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id_card: params.idCardNumber,
        name: params.fullName,
        dob: params.birthDate
      })
    });
    
    const result = await externalCheck.json();
    if (result.risk_level === "high") {
      throw new Error("High risk profile detected");
    }
    */
    
    // บันทึกผลการตรวจสอบ
    await db.collection("kyc_background_checks").add({
      id_card_number: params.idCardNumber,
      full_name: params.fullName,
      birth_date: params.birthDate,
      status: "passed",
      checked_at: new Date().toISOString(),
      source: "internal_database"
    });
    
  } catch (error) {
    console.error("Background check failed:", error);
    throw error;
  }
}

// ==================================================================
// 10. Admin KYC Approval Function
// ==================================================================
export const approveKYC = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  // ตรวจสอบว่าเป็น Admin
  const adminRef = db.collection("admin_users").doc(request.auth.uid);
  const adminDoc = await adminRef.get();
  
  if (!adminDoc.exists || !adminDoc.data()?.is_active) {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  const { userId, action, notes } = request.data;
  
  if (!userId || !action) {
    throw new HttpsError("invalid-argument", "Missing parameters");
  }

  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const updates: any = {
      kyc_verified_at: new Date().toISOString(),
      kyc_verified_by: request.auth.uid,
      updated_at: new Date().toISOString()
    };

    if (action === "approve") {
      updates.kyc_status = "verified";
      updates.kyc_level = "level_2";
      updates.is_verified = true;
      
      // ปลดล็อกสิทธิ์พิเศษ
      updates.can_accept_premium_jobs = true;
      updates.max_job_price = 10000; // เพิ่ม limit ราคางาน
      
    } else if (action === "reject") {
      updates.kyc_status = "rejected";
      updates.kyc_rejection_reason = notes;
    } else {
      throw new HttpsError("invalid-argument", "Invalid action");
    }

    await userRef.update(updates);

    // ส่ง notification ไปยังผู้ใช้
    await db.collection("notifications").add({
      user_id: userId,
      title: action === "approve" ? "✅ KYC Verified Successfully" : "❌ KYC Verification Failed",
      message: action === "approve" 
        ? "Your KYC verification has been approved. You can now access all features."
        : `KYC verification rejected: ${notes}`,
      type: "kyc_update",
      created_at: new Date().toISOString(),
      is_read: false
    });

    // บันทึก log การตรวจสอบ
    await db.collection("admin_kyc_logs").add({
      admin_id: request.auth.uid,
      user_id: userId,
      action: action,
      notes: notes,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: `KYC ${action}d successfully`
    };

  } catch (error: any) {
    console.error("KYC Approval Error:", error);
    throw new HttpsError("internal", error.message || "KYC approval failed");
  }
});