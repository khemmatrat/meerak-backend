"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreService = void 0;
const firebase_admin_1 = require("../config/firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
class FirestoreService {
    constructor() {
        this.db = firebase_admin_1.admin.firestore();
    }
    /**
     * เพิ่มหรืออัปเดตเอกสารใน Firestore
     */
    async setDocument(collectionPath, docId, data, merge = true) {
        await this.db.collection(collectionPath).doc(docId).set(data, { merge });
    }
    /**
     * อ่านเอกสารจาก Firestore
     */
    async getDocument(collectionPath, docId) {
        const doc = await this.db.collection(collectionPath).doc(docId).get();
        return doc.exists ? doc.data() : null;
    }
    /**
     * ตรวจสอบว่ามีเอกสารหรือไม่
     */
    async documentExists(collectionPath, docId) {
        const doc = await this.db.collection(collectionPath).doc(docId).get();
        return doc.exists;
    }
    /**
     * อัปเดตเฉพาะฟิลด์
     */
    async updateDocument(collectionPath, docId, data) {
        await this.db.collection(collectionPath).doc(docId).update(data);
    }
    /**
     * ลบเอกสาร
     */
    async deleteDocument(collectionPath, docId) {
        await this.db.collection(collectionPath).doc(docId).delete();
    }
    /**
     * ตรวจสอบสถานะ KYC จาก Firestore
     */
    async getKYCStatus(userId) {
        try {
            // อ่านจาก collection users พร้อมระบุ type
            const userDoc = await this.getDocument("users", userId);
            if (!userDoc) {
                return null;
            }
            // แปลงข้อมูลให้ตรงกับ KYCSubmission format
            const result = {
                kycStatus: userDoc.kyc_status,
                kycLevel: userDoc.kyc_level,
                submittedAt: userDoc.kyc_submitted_at,
                aiScore: userDoc.kyc_ai_score,
                backgroundCheckPassed: userDoc.kyc_background_check?.passed,
                backgroundCheckRiskLevel: userDoc.kyc_background_check?.risk_level,
                documentUrls: userDoc.kyc_documents
            };
            return result;
        }
        catch (error) {
            console.error("Error getting KYC status from Firestore:", error);
            throw error;
        }
    }
    /**
     * เพิ่ม timestamp
     */
    getTimestamp() {
        return firestore_1.FieldValue.serverTimestamp();
    }
    /**
     * ค้นหาด้วยเงื่อนไข
     */
    async queryDocuments(collectionPath, field, operator, value) {
        const snapshot = await this.db
            .collection(collectionPath)
            .where(field, operator, value)
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
    /**
     * ดึงข้อมูลทั้งหมดใน collection
     */
    async getAllDocuments(collectionPath) {
        const snapshot = await this.db.collection(collectionPath).get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }
    /**
     * ดึงข้อมูลด้วย pagination
     */
    async getDocumentsWithPagination(collectionPath, limit = 10, startAfter) {
        let query = this.db.collection(collectionPath).limit(limit);
        if (startAfter) {
            const lastDoc = await this.db.collection(collectionPath).doc(startAfter).get();
            query = query.startAfter(lastDoc);
        }
        const snapshot = await query.get();
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        return {
            data: snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })),
            lastDocId: lastDoc ? lastDoc.id : null
        };
    }
}
exports.FirestoreService = FirestoreService;
