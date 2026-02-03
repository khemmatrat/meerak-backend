import * as functions from "firebase-functions/v2";
import { PostgresService } from "../../services/postgres.service";
import { FirestoreService } from "../../services/firestore.service";
import { KYCService } from "../../services/kyc.service";

const postgresService = new PostgresService();
const firestoreService = new FirestoreService();
const kycService = new KYCService();

// Interface ที่ต้องตรงกับ PostgresService
interface KYCStatusResponse {
  status: string;
  level: string;
  submitted: boolean;
  message?: string;
  submittedAt?: Date;
  aiScore?: number;
  backgroundCheck?: {
    passed: boolean;
    riskLevel: string;
  };
  documents?: Record<string, string> | string[];
  isVerified?: boolean;
  canTransact?: boolean;
  nextAction?: string;
}

export const checkKYCStatus = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", 
      "User must be logged in"
    );
  }

  const userId = request.auth.uid;

  try {
    // Phase 1: อ่านจาก PostgreSQL ก่อน (new system)
    let kycData = null;
    
    try {
      // เรียกใช้ getKYCStatus จาก PostgresService
      kycData = await postgresService.getKYCStatus(userId);
    } catch (postgresError) {
      console.warn("PostgreSQL not available, falling back to Firestore:", postgresError);
      
      // Phase 2: Fallback ไป Firestore ถ้า PostgreSQL ล่ม
      // ต้องเพิ่ม method getKYCStatus ใน FirestoreService ก่อน
      if (firestoreService.getKYCStatus) {
        kycData = await firestoreService.getKYCStatus(userId);
      } else {
        // ถ้าไม่มี method ให้ลองอ่านจาก collection users
        try {
          kycData = await firestoreService.getDocument("users", userId);
          // แปลงข้อมูลให้ตรงกับ KYCSubmission
          if (kycData) {
            kycData = {
              kycStatus: kycData.kyc_status || kycData.status,
              kycLevel: kycData.kyc_level || kycData.level || "level_1",
              submittedAt: kycData.kyc_submitted_at || kycData.submitted_at,
              aiScore: kycData.kyc_ai_score || kycData.ai_score,
              backgroundCheckPassed: kycData.kyc_background_check?.passed || kycData.background_check_passed,
              backgroundCheckRiskLevel: kycData.kyc_background_check?.risk_level || kycData.background_check_risk_level || "low",
              documentUrls: kycData.kyc_documents || kycData.document_urls || {}
            };
          }
        } catch (firestoreError) {
          console.error("Firestore fallback also failed:", firestoreError);
          kycData = null;
        }
      }
    }

    // ถ้าไม่มีข้อมูล KYC
    if (!kycData) {
      const response: KYCStatusResponse = {
        status: "not_submitted",
        level: "level_1",
        submitted: false,
        message: "ยังไม่ได้ส่งข้อมูล KYC",
        nextAction: "submit_kyc"
      };
      return response;
    }

    // ใช้ kycStatus จาก PostgresService (ตาม interface KYCSubmission)
    const status = kycData.kycStatus || kycData.status || "not_submitted";
    const level = kycData.kycLevel || kycData.level || "level_1";
    
    // ตรวจสอบสถานะและส่งข้อมูลที่จำเป็น
    const isVerified = status === "ai_verified" || status === "verified" || status === "admin_approved";
    const canTransact = ["ai_verified", "verified", "admin_approved"].includes(status);
    
    // เรียกใช้ getNextAction จาก KYCService
    const nextAction = kycService.getNextAction(status);

    const response: KYCStatusResponse = {
      status: status,
      level: level,
      submitted: true,
      submittedAt: kycData.submittedAt || kycData.submitted_at,
      aiScore: kycData.aiScore || kycData.ai_score || 0,
      backgroundCheck: {
        passed: kycData.backgroundCheckPassed || kycData.background_check_passed || false,
        riskLevel: kycData.backgroundCheckRiskLevel || 
                  kycData.background_check_risk_level || 
                  "low"
      },
      documents: kycData.documentUrls || kycData.document_urls || {},
      isVerified: isVerified,
      canTransact: canTransact,
      nextAction: nextAction
    };

    return response;

  } catch (error: any) {
    console.error("checkKYCStatus error:", error);
    
    // ส่ง error ที่ user-friendly กลับไป
    let errorMessage = "Internal server error";
    if (error.code === '42P01') {
      errorMessage = "Database table not found. Please check database setup.";
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = "Database connection failed. Please try again later.";
    }
    
    throw new functions.https.HttpsError(
      "internal", 
      errorMessage,
      { originalError: error.message }
    );
  }
});