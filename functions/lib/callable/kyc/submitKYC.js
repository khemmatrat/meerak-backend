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
exports.submitKYC = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const kyc_service_1 = require("../../services/kyc.service");
const postgres_service_1 = require("../../services/postgres.service");
const kycService = new kyc_service_1.KYCService();
const postgresService = new postgres_service_1.PostgresService();
exports.submitKYC = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }
    const userId = request.auth.uid;
    const kycData = request.data;
    try {
        // 1. Validate data
        const validationResult = await kycService.validateKYCData(kycData);
        if (!validationResult.valid) {
            throw new functions.https.HttpsError("invalid-argument", validationResult.error || "Validation failed");
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
    }
    catch (error) {
        console.error("submitKYC error:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
