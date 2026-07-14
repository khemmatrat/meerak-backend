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
exports.mockVerifyKYC = exports.checkKYCStatusSimple = exports.onAuthUserCreatedV2 = exports.onUserCreated = exports.helloWorld = void 0;
// src/firebase-only.ts
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-functions/v2/firestore");
const auth_1 = require("firebase-functions/v2/auth");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// ✅ 1. Simple function (ฟรี)
exports.helloWorld = functions.https.onRequest((req, res) => {
    res.json({
        message: "✅ Firebase Functions is working!",
        timestamp: new Date().toISOString(),
    });
});
// ✅ 2. Firestore trigger (ฟรี) - v2 syntax
exports.onUserCreated = (0, firestore_1.onDocumentCreated)('users/{userId}', async (event) => {
    const userData = event.data?.data();
    console.log('New user created:', userData);
    // ส่ง welcome email (mock)
    await admin.firestore().collection('notifications').add({
        userId: event.params.userId,
        type: 'welcome',
        message: 'Welcome to our platform!',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
// ✅ 3. Auth trigger (ฟรี) - v2 syntax
exports.onAuthUserCreatedV2 = (0, auth_1.onUserCreated)(async (event) => {
    const user = event.data;
    console.log('New auth user:', user.uid);
    // สร้าง user document ใน Firestore
    await admin.firestore().collection('users').doc(user.uid).set({
        email: user.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
// ✅ 4. HTTP function สำหรับเช็ค status (ฟรี)
exports.checkKYCStatusSimple = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "ต้องล็อกอินก่อน");
    }
    const userId = request.auth.uid;
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    return {
        kyc_status: userData?.kyc_status || "not_submitted",
        kyc_level: userData?.kyc_level || "level_1",
        submitted_at: userData?.kyc_submitted_at || null,
        is_verified: userData?.kyc_status === "ai_verified" || userData?.kyc_status === "verified",
    };
});
// ✅ 5. Mock AI verification (ฟรีถ้าไม่เรียก external API)
exports.mockVerifyKYC = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "ต้องล็อกอินก่อน");
    }
    // Mock AI result
    await new Promise(resolve => setTimeout(resolve, 1000));
    const isSuccess = Math.random() > 0.3;
    const score = isSuccess ? 85 : 45;
    return {
        success: isSuccess,
        score: score,
        message: isSuccess ? "Verification passed" : "Verification failed",
        verification_id: `mock_${Date.now()}`
    };
});
