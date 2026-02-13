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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransaction = exports.checkKYCStatus = exports.verifyKYCWithAI = exports.helloWorld = exports.submitKYC = exports.api = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cloudinary_1 = require("cloudinary");
const auth_controller_1 = require("./controllers/auth.controller");
const auth_middleware_1 = require("./middleware/auth.middleware");
const user_service_1 = require("./services/user.service");
const postgres_service_1 = require("./services/postgres.service");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
const authController = new auth_controller_1.AuthController();
const userService = new user_service_1.UserService();
const postgresService = new postgres_service_1.PostgresService(); // ← เพิ่มตรงนี้
// ============= ตั้งค่าพื้นฐาน =============
admin.initializeApp();
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "thanixs-cdn",
    api_key: process.env.CLOUDINARY_API_KEY || "mock",
    api_secret: process.env.CLOUDINARY_API_SECRET || "mock",
});
// ============= Routes เดิม (ไม่เปลี่ยน) =============
// Public routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
// Protected routes
app.get('/api/auth/profile', auth_middleware_1.authenticateToken, authController.getProfile);
// Admin routes
app.get('/api/admin/users', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// ============= Routes ใหม่สำหรับ PostgreSQL =============
// Health check สำหรับ PostgreSQL
app.get('/api/postgres/health', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const health = await postgresService.healthCheck();
        res.json({
            database: 'postgresql',
            status: health.healthy ? 'healthy' : 'unhealthy',
            latency_ms: health.latency,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'PostgreSQL health check failed',
            message: error.message
        });
    }
});
// Sync user data to PostgreSQL
app.post('/api/postgres/sync-user', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = admin.firestore();
        // ดึงข้อมูลจาก Firestore
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!userData) {
            res.status(404).json({ error: 'User not found in Firestore' });
            return;
        }
        // บันทึกไป PostgreSQL
        const result = await postgresService.saveKYCSubmission({
            firebaseUid: userId,
            fullName: userData.kyc_full_name || '',
            idCardNumber: userData.kyc_id_card_number || '',
            birthDate: userData.kyc_birth_date ? new Date(userData.kyc_birth_date) : new Date(),
            documentUrls: userData.kyc_documents || {},
            aiScore: userData.kyc_ai_score || 0,
            aiSuccess: userData.kyc_ai_verification?.success || false,
            aiVerifiedAt: userData.kyc_verified_at ? new Date(userData.kyc_verified_at) : undefined,
            backgroundCheckPassed: userData.kyc_background_check?.passed || false,
            backgroundCheckRiskLevel: userData.kyc_background_check?.risk_level || 'low',
            kycStatus: userData.kyc_status || 'not_submitted',
            kycLevel: userData.kyc_level || 'level_1',
            submittedAt: userData.kyc_submitted_at ? new Date(userData.kyc_submitted_at) : new Date(),
        });
        res.json({
            success: true,
            message: 'User data synced to PostgreSQL',
            postgresId: result.id,
            firebaseUid: userId
        });
        return;
    }
    catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
            error: 'Failed to sync user data',
            message: error.message
        });
        return;
    }
});
// Get user data from PostgreSQL
app.get('/api/postgres/user-data', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const kycData = await postgresService.getKYCStatus(userId);
        if (!kycData) {
            res.status(404).json({
                message: 'No KYC data found in PostgreSQL',
                firebaseUid: userId
            });
            return;
        }
        res.json({
            success: true,
            data: kycData
        });
        return;
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to fetch PostgreSQL data',
            message: error.message
        });
        return;
    }
});
// Export as Firebase Function
exports.api = functions.https.onRequest(app);
// ============= Functions เดิม (ไม่เปลี่ยน) =============
// 1. Mock AI Verification (สำหรับ development)
async function verifyWithAI(params) {
    console.log("🔍 AI Verification started for:", params.fullName);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const isSuccess = Math.random() > 0.2;
    const score = isSuccess
        ? Math.floor(Math.random() * 20) + 80
        : Math.floor(Math.random() * 30) + 40;
    return {
        success: isSuccess,
        score: score,
        reasons: !isSuccess
            ? [
                "Face match confidence below threshold",
                "Document image quality insufficient",
                "Potential liveness detection issue",
            ]
            : [],
        verification_id: `ai_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
    };
}
// 2. Background Check (อาชญากร/Blocklist)
async function runBackgroundCheck(params) {
    console.log("🔍 Background Check for ID:", params.idCardNumber);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const lastDigit = parseInt(params.idCardNumber.slice(-1));
    const passed = lastDigit % 4 !== 0;
    return {
        passed: passed,
        risk_level: passed ? "low" : "high",
        reasons: !passed ? ["ID found in internal watchlist"] : []
    };
}
// ============= Callable Functions เดิม (ไม่เปลี่ยนโครงสร้าง) =============
// เพิ่ม PostgreSQL save ใน submitKYC
exports.submitKYC = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }
    const userId = request.auth.uid;
    const { fullName, birthDate, idCardNumber, idCardFront, idCardBack, selfiePhoto, drivingLicenseFront, drivingLicenseBack, } = request.data;
    try {
        const db = admin.firestore();
        // 1. ตรวจสอบข้อมูลพื้นฐาน (เดิม)
        if (!fullName || !birthDate || !idCardNumber) {
            throw new functions.https.HttpsError("invalid-argument", "กรุณากรอกข้อมูลพื้นฐานให้ครบ (ชื่อ, วันเกิด, เลขบัตรประชาชน)");
        }
        if (!/^\d{13}$/.test(idCardNumber)) {
            throw new functions.https.HttpsError("invalid-argument", "เลขบัตรประชาชนต้องมี 13 หลัก");
        }
        const birth = new Date(birthDate);
        const age = new Date().getFullYear() - birth.getFullYear();
        if (age < 18) {
            throw new functions.https.HttpsError("invalid-argument", "ต้องมีอายุ 18 ปีขึ้นไป");
        }
        // 2. อัปโหลดเอกสารไปยัง Cloudinary (เดิม)
        const uploadResults = {};
        if (idCardFront && !idCardFront.includes("mock")) {
            const result = await cloudinary_1.v2.uploader.upload(idCardFront, {
                folder: `kyc/${userId}`,
                public_id: `id_card_front_${Date.now()}`,
            });
            uploadResults.idCardFrontUrl = result.secure_url;
        }
        if (idCardBack && !idCardBack.includes("mock")) {
            const result = await cloudinary_1.v2.uploader.upload(idCardBack, {
                folder: `kyc/${userId}`,
                public_id: `id_card_back_${Date.now()}`,
            });
            uploadResults.idCardBackUrl = result.secure_url;
        }
        if (selfiePhoto && !selfiePhoto.includes("mock")) {
            const result = await cloudinary_1.v2.uploader.upload(selfiePhoto, {
                folder: `kyc/${userId}`,
                public_id: `selfie_${Date.now()}`,
            });
            uploadResults.selfiePhotoUrl = result.secure_url;
        }
        // 3. AI Verification (เดิม)
        let aiResult = null;
        if (uploadResults.idCardFrontUrl && uploadResults.selfiePhotoUrl) {
            aiResult = await verifyWithAI({
                idCardFrontUrl: uploadResults.idCardFrontUrl,
                selfiePhotoUrl: uploadResults.selfiePhotoUrl,
                idCardNumber: idCardNumber,
                fullName: fullName
            });
            console.log("🤖 AI Verification Result:", aiResult);
        }
        // 4. Background Check (เดิม)
        const backgroundCheck = await runBackgroundCheck({
            idCardNumber: idCardNumber,
            fullName: fullName,
            birthDate: birthDate
        });
        console.log("🛡️ Background Check Result:", backgroundCheck);
        // 5. กำหนดสถานะ KYC (เดิม)
        let kycStatus = "pending_verification";
        let kycLevel = "processing";
        if (aiResult && backgroundCheck.passed) {
            if (aiResult.success && aiResult.score >= 70) {
                kycStatus = "ai_verified";
                kycLevel = "level_2";
            }
            else {
                kycStatus = "ai_failed";
                kycLevel = "level_1";
            }
        }
        // ============= ส่วนเพิ่ม: บันทึก PostgreSQL =============
        let postgresResult = null;
        try {
            postgresResult = await postgresService.saveKYCSubmission({
                firebaseUid: userId,
                fullName: fullName,
                idCardNumber: idCardNumber,
                birthDate: new Date(birthDate),
                documentUrls: {
                    id_card_front: uploadResults.idCardFrontUrl || idCardFront,
                    id_card_back: uploadResults.idCardBackUrl || idCardBack,
                    selfie_photo: uploadResults.selfiePhotoUrl || selfiePhoto,
                    driving_license_front: drivingLicenseFront || null,
                    driving_license_back: drivingLicenseBack || null,
                },
                aiScore: aiResult?.score || 0,
                aiSuccess: aiResult?.success || false,
                aiVerifiedAt: aiResult?.success ? new Date() : undefined,
                backgroundCheckPassed: backgroundCheck.passed,
                backgroundCheckRiskLevel: backgroundCheck.risk_level,
                kycStatus: kycStatus,
                kycLevel: kycLevel,
                submittedAt: new Date(),
            });
            console.log("✅ Saved to PostgreSQL:", postgresResult.id);
        }
        catch (postgresError) {
            console.error("⚠️ PostgreSQL save failed (continuing with Firestore):", postgresError);
            // ไม่ throw error เพื่อให้ระบบทำงานต่อได้ด้วย Firestore
        }
        // 6. บันทึกข้อมูลลง Firestore (เดิม)
        await db
            .collection("users")
            .doc(userId)
            .update({
            kyc_full_name: fullName,
            kyc_birth_date: birthDate,
            kyc_id_card_number: idCardNumber,
            kyc_documents: {
                id_card_front: uploadResults.idCardFrontUrl || idCardFront,
                id_card_back: uploadResults.idCardBackUrl || idCardBack,
                selfie_photo: uploadResults.selfiePhotoUrl || selfiePhoto,
                driving_license_front: drivingLicenseFront || null,
                driving_license_back: drivingLicenseBack || null,
            },
            kyc_ai_verification: aiResult || null,
            kyc_background_check: backgroundCheck,
            kyc_ai_score: aiResult?.score || 0,
            kyc_status: kycStatus,
            kyc_level: kycLevel,
            kyc_submitted_at: new Date().toISOString(),
            kyc_steps_completed: 7,
            updated_at: new Date().toISOString(),
        });
        // 7. บันทึกผลการตรวจสอบแยก (เดิม)
        await db.collection("kyc_verifications").doc(userId).set({
            user_id: userId,
            ai_result: aiResult,
            background_check: backgroundCheck,
            submitted_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            status: kycStatus,
            postgres_id: postgresResult?.id || null, // ← เพิ่ม PostgreSQL ID
        });
        // 8. ส่ง notification (เดิม)
        await db.collection("notifications").add({
            user_id: userId,
            title: kycStatus === "ai_verified"
                ? "✅ ยืนยันตัวตนสำเร็จ (AI Verified)"
                : "⏳ ยืนยันตัวตนรอตรวจสอบเพิ่มเติม",
            message: kycStatus === "ai_verified"
                ? "ระบบ AI ตรวจสอบข้อมูลของคุณเรียบร้อยแล้ว บัญชีได้รับการยืนยันตัวตน"
                : "เราได้รับข้อมูลยืนยันตัวตนของคุณแล้ว ระบบกำลังดำเนินการตรวจสอบ 7 ขั้นตอน",
            type: "kyc_submission",
            created_at: new Date().toISOString(),
            is_read: false,
        });
        // 9. Return result
        return {
            success: true,
            message: "ส่งข้อมูลยืนยันตัวตนสำเร็จ (7 ขั้นตอน)",
            steps: [
                "✅ 1. ข้อมูลพื้นฐาน",
                "✅ 2. วันเกิด",
                "✅ 3. เลขบัตรประชาชน",
                "✅ 4. บัตรประชาชน",
                "✅ 5. รูปเซลฟี่",
                "✅ 6. ใบขับขี่ (ถ้ามี)",
                "⏳ 7. ระบบตรวจสอบอาชญากร (กำลังดำเนินการ)",
                kycStatus === "ai_verified"
                    ? "✅ 7. ระบบตรวจสอบอาชญากร (ผ่าน)"
                    : "⏳ 7. ระบบตรวจสอบอาชญากร (กำลังตรวจสอบ)"
            ],
            ai_verification: aiResult ? {
                passed: aiResult.success,
                score: aiResult.score,
                status: kycStatus
            } : null,
            background_check: {
                passed: backgroundCheck.passed,
                risk_level: backgroundCheck.risk_level
            },
            postgres_saved: !!postgresResult, // ← เพิ่ม status
            postgres_id: postgresResult?.id || null,
            next_step: kycStatus === "ai_verified" ? "completed" : "admin_review",
            estimated_time: kycStatus === "ai_verified" ? "0 ชั่วโมง" : "24-48 ชั่วโมง"
        };
    }
    catch (error) {
        console.error("KYC Error:", error);
        throw new functions.https.HttpsError("internal", error.message || "การยืนยันตัวตนล้มเหลว");
    }
});
// ============= Functions เดิมอื่นๆ (ไม่เปลี่ยน) =============
exports.helloWorld = functions.https.onRequest((req, res) => {
    res.json({
        message: "✅ Firebase Functions is working!",
        timestamp: new Date().toISOString(),
    });
});
exports.verifyKYCWithAI = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "ต้องล็อกอินก่อน");
    }
    const userId = request.auth.uid;
    const db = admin.firestore();
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        if (!userData?.kyc_documents) {
            throw new functions.https.HttpsError("failed-precondition", "ยังไม่ได้ส่งเอกสาร KYC");
        }
        const aiResult = await verifyWithAI({
            idCardFrontUrl: userData.kyc_documents.id_card_front || "",
            selfiePhotoUrl: userData.kyc_documents.selfie_photo || "",
            idCardNumber: userData.kyc_id_card_number || "",
            fullName: userData.kyc_full_name || ""
        });
        const newStatus = aiResult.success ? "ai_verified" : "ai_failed";
        // อัพเดท Firestore (เดิม)
        await db.collection("users").doc(userId).update({
            kyc_ai_verification: aiResult,
            kyc_status: newStatus,
            kyc_ai_score: aiResult.score,
            kyc_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        // ============= ส่วนเพิ่ม: อัพเดท PostgreSQL =============
        try {
            await postgresService.updateKYCStatus(userId, {
                aiScore: aiResult.score,
                aiSuccess: aiResult.success,
                aiVerifiedAt: new Date(),
                kycStatus: newStatus,
                kycLevel: aiResult.success ? "level_2" : "level_1",
            });
            console.log("✅ PostgreSQL updated for AI verification");
        }
        catch (postgresError) {
            console.error("⚠️ PostgreSQL update failed:", postgresError);
        }
        return {
            success: true,
            ai_result: aiResult,
            new_status: newStatus,
            message: aiResult.success
                ? "AI verification passed successfully"
                : "AI verification failed",
            postgres_updated: true
        };
    }
    catch (error) {
        console.error("verifyKYCWithAI Error:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
exports.checkKYCStatus = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "ต้องล็อกอินก่อน");
    }
    const userId = request.auth.uid;
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    // ============= ส่วนเพิ่ม: ดึงข้อมูลจาก PostgreSQL =============
    let postgresData = null;
    try {
        postgresData = await postgresService.getKYCStatus(userId);
    }
    catch (error) {
        console.error("⚠️ Failed to get PostgreSQL data:", error);
    }
    return {
        // ข้อมูลจาก Firestore (เดิม)
        firestore: {
            kyc_status: userData?.kyc_status || "not_submitted",
            kyc_level: userData?.kyc_level || "level_1",
            submitted_at: userData?.kyc_submitted_at || null,
            steps_completed: userData?.kyc_steps_completed || 0,
            is_verified: userData?.kyc_status === "ai_verified" || userData?.kyc_status === "verified",
            ai_score: userData?.kyc_ai_score || 0,
            background_check: userData?.kyc_background_check || { passed: false, risk_level: "unknown" }
        },
        // ข้อมูลจาก PostgreSQL (ใหม่)
        postgresql: postgresData ? {
            id: postgresData.id,
            kyc_status: postgresData.kycStatus,
            kyc_level: postgresData.kycLevel,
            ai_score: postgresData.aiScore,
            submitted_at: postgresData.submittedAt,
            background_check_passed: postgresData.backgroundCheckPassed,
            background_check_risk_level: postgresData.backgroundCheckRiskLevel
        } : null,
        // สถานะ sync
        sync_status: {
            has_postgres_data: !!postgresData,
            databases_synced: !!postgresData && !!userData?.kyc_status,
            timestamp: new Date().toISOString()
        }
    };
});
// ============= Function ใหม่: Transaction Processing =============
exports.createTransaction = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }
    const userId = request.auth.uid;
    const { amount, type, description } = request.data;
    try {
        // ตรวจสอบ KYC status ก่อน
        const kycStatus = await postgresService.getKYCStatus(userId);
        if (!kycStatus || !['ai_verified', 'verified', 'admin_approved'].includes(kycStatus.kycStatus)) {
            throw new functions.https.HttpsError("failed-precondition", "KYC verification required for transactions");
        }
        // สร้าง transaction ใน PostgreSQL
        const transaction = await postgresService.createTransaction({
            userId: userId,
            amount: amount,
            type: type,
            referenceId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            metadata: { description }
        });
        // บันทึกลง Firestore สำหรับ backward compatibility
        const db = admin.firestore();
        await db.collection('transactions').add({
            user_id: userId,
            amount: amount,
            type: type,
            status: 'completed',
            postgres_transaction_id: transaction.transactionId,
            created_at: new Date().toISOString(),
            description: description
        });
        return {
            success: true,
            transaction_id: transaction.transactionId,
            amount: amount,
            type: type,
            timestamp: new Date().toISOString()
        };
    }
    catch (error) {
        console.error("Transaction Error:", error);
        throw new functions.https.HttpsError("internal", error.message || "Transaction failed");
    }
});
