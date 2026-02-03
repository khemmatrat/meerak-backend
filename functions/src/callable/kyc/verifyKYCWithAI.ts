import * as functions from "firebase-functions/v2";
import { KYCService } from "../../services/kyc.service";
import { PostgresService } from "../../services/postgres.service";

const kycService = new KYCService();
const postgresService = new PostgresService();

export const verifyKYCWithAI = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", 
      "User must be logged in"
    );
  }

  const userId = request.auth.uid;
  const { forceRecheck = false } = request.data;

  try {
    // 1. ดึงข้อมูล KYC จาก PostgreSQL - เปลี่ยนเป็น getKYCStatus
    const kycData = await postgresService.getKYCStatus(userId);
    
    if (!kycData) {
      throw new functions.https.HttpsError(
        "failed-precondition", 
        "ยังไม่ได้ส่งข้อมูล KYC"
      );
    }

    // 2. ตรวจสอบว่าเคยทำ AI verification แล้วหรือยัง
    // เปลี่ยนจาก kycData.aiVerified เป็น kycData.aiVerifiedAt
    if (kycData.aiVerifiedAt && !forceRecheck) {
      return {
        success: true,
        message: "Already verified",
        score: kycData.aiScore,
        status: kycData.kycStatus,
        timestamp: kycData.aiVerifiedAt,
      };
    }

    // 3. เรียก AI Verification
    // ต้องตรวจสอบว่า documentUrls มีรูปแบบที่ถูกต้อง
    const documentUrls = kycData.documentUrls || {};
    const idCardFrontUrl = documentUrls.idCardFrontUrl || documentUrls.id_card_front;
    const selfiePhotoUrl = documentUrls.selfiePhotoUrl || documentUrls.selfie_photo;
    
    if (!idCardFrontUrl || !selfiePhotoUrl) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Missing required documents for AI verification"
      );
    }

    const aiResult = await kycService.verifyWithAI({
      idCardFrontUrl: idCardFrontUrl,
      selfiePhotoUrl: selfiePhotoUrl,
      idCardNumber: kycData.idCardNumber,
      fullName: kycData.fullName,
    });

    // 4. อัพเดทสถานะ
    const newStatus = aiResult.success ? "ai_verified" : "ai_failed";
    
    // 5. อัพเดททั้ง PostgreSQL และ Firestore
    await Promise.all([
      postgresService.updateKYCStatus(userId, {
        aiScore: aiResult.score,
        aiSuccess: aiResult.success,
        aiVerifiedAt: new Date(),
        kycStatus: newStatus,
        kycLevel: aiResult.success ? "level_2" : "level_1",
      }),
      
      kycService.updateFirestoreKYC(userId, {
        kyc_ai_verification: aiResult,
        kyc_status: newStatus,
        kyc_ai_score: aiResult.score,
        kyc_verified_at: new Date().toISOString(),
      })
    ]);

    // 6. ส่ง notification ถ้าผ่าน
    if (aiResult.success) {
      await kycService.sendNotification(userId, "ai_verified", {
        score: aiResult.score,
        verificationId: aiResult.verification_id,
      });
    }

    return {
      success: true,
      aiResult: {
        success: aiResult.success,
        score: aiResult.score,
        verificationId: aiResult.verification_id,
        reasons: aiResult.reasons,
      },
      newStatus: newStatus,
      message: aiResult.success 
        ? "AI verification passed successfully" 
        : "AI verification failed",
      transactionEligible: aiResult.success,
      levelUp: aiResult.success ? "level_1 → level_2" : null,
    };

  } catch (error: any) {
    console.error("verifyKYCWithAI error:", error);
    
    // ส่ง error message ที่อ่านง่าย
    const errorMessage = error.message || "AI verification failed";
    throw new functions.https.HttpsError("internal", errorMessage);
  }
});