import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { KYCService } from "../../services/kyc.service";
import { PostgresService } from "../../services/postgres.service";

const kycService = new KYCService();
const postgresService = new PostgresService();

export const submitKYC = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
  }

  const userId = request.auth.uid;
  const kycData = request.data;

  try {
    // 1. Validate data
    const validationResult = await kycService.validateKYCData(kycData);
    if (!validationResult.valid) {
      throw new functions.https.HttpsError("invalid-argument", validationResult.error|| "Validation failed" );
    }

    // 2. Upload documents to Cloudinary
    const uploadedDocs = await kycService.uploadDocuments(userId, {
      idCardFront: kycData.idCardFront,
      idCardBack: kycData.idCardBack,
      selfiePhoto: kycData.selfiePhoto,
      drivingLicenseFront: kycData.drivingLicenseFront,
      drivingLicenseBack: kycData.drivingLicenseBack,
    });

    // 3. AI Verification
    const aiResult = await kycService.verifyWithAI({
      idCardFrontUrl: uploadedDocs.idCardFrontUrl,
      selfiePhotoUrl: uploadedDocs.selfiePhotoUrl,
      idCardNumber: kycData.idCardNumber,
      fullName: kycData.fullName,
    });

    // 4. Background Check
    const backgroundCheck = await kycService.runBackgroundCheck({
      idCardNumber: kycData.idCardNumber,
      fullName: kycData.fullName,
      birthDate: kycData.birthDate,
    });

    // 5. Determine KYC Status
    const kycStatus = kycService.determineKYCStatus(aiResult, backgroundCheck);
    
    // 6. Save to Firestore (existing system)
    const firestoreResult = await kycService.saveToFirestore(userId, {
      ...kycData,
      documents: uploadedDocs,
      aiVerification: aiResult,
      backgroundCheck,
      status: kycStatus.status,
      level: kycStatus.level,
    });

    // 7. Save to PostgreSQL (new system - DUAL WRITE)
    const postgresResult = await postgresService.saveKYCSubmission({
      firebaseUid: userId,
      fullName: kycData.fullName,
      idCardNumber: kycData.idCardNumber,
      birthDate: kycData.birthDate,
      documentUrls: uploadedDocs,
      aiScore: aiResult.score,
      aiSuccess: aiResult.success,
      backgroundCheckPassed: backgroundCheck.passed,
      backgroundCheckRiskLevel: backgroundCheck.risk_level,
      kycStatus: kycStatus.status,
      kycLevel: kycStatus.level,
      submittedAt: new Date(),
    });

    // 8. Send notification
    await kycService.sendNotification(userId, kycStatus.status);

    return {
      success: true,
      message: "KYC submission successful",
      kycId: postgresResult.id, // ใช้ ID จาก PostgreSQL เป็น primary
      firestoreId: firestoreResult.id,
      status: kycStatus.status,
      level: kycStatus.level,
      aiScore: aiResult.score,
      backgroundCheck: backgroundCheck.passed ? "passed" : "failed",
      nextSteps: kycStatus.status === "ai_verified" ? "complete" : "admin_review",
    };

  } catch (error: any) {
    console.error("submitKYC error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});