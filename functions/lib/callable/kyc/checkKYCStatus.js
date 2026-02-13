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
exports.checkKYCStatus = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const postgres_service_1 = require("../../services/postgres.service");
const firestore_service_1 = require("../../services/firestore.service");
const kyc_service_1 = require("../../services/kyc.service");
const postgresService = new postgres_service_1.PostgresService();
const firestoreService = new firestore_service_1.FirestoreService();
const kycService = new kyc_service_1.KYCService();
exports.checkKYCStatus = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }
    const userId = request.auth.uid;
    try {
        // Phase 1: อ่านจาก PostgreSQL ก่อน (new system)
        let kycData = null;
        try {
            // เรียกใช้ getKYCStatus จาก PostgresService
            kycData = await postgresService.getKYCStatus(userId);
        }
        catch (postgresError) {
            console.warn("PostgreSQL not available, falling back to Firestore:", postgresError);
            // Phase 2: Fallback ไป Firestore ถ้า PostgreSQL ล่ม
            // ต้องเพิ่ม method getKYCStatus ใน FirestoreService ก่อน
            if (firestoreService.getKYCStatus) {
                kycData = await firestoreService.getKYCStatus(userId);
            }
            else {
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
                }
                catch (firestoreError) {
                    console.error("Firestore fallback also failed:", firestoreError);
                    kycData = null;
                }
            }
        }
        // ถ้าไม่มีข้อมูล KYC
        if (!kycData) {
            const response = {
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
        const response = {
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
    }
    catch (error) {
        console.error("checkKYCStatus error:", error);
        // ส่ง error ที่ user-friendly กลับไป
        let errorMessage = "Internal server error";
        if (error.code === '42P01') {
            errorMessage = "Database table not found. Please check database setup.";
        }
        else if (error.code === 'ECONNREFUSED') {
            errorMessage = "Database connection failed. Please try again later.";
        }
        throw new functions.https.HttpsError("internal", errorMessage, { originalError: error.message });
    }
});
