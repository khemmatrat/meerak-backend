import { admin } from '../config/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// เพิ่ม interface สำหรับ User document
interface UserDocument {
  kyc_status?: string;
  kyc_level?: string;
  kyc_submitted_at?: Date;
  kyc_ai_score?: number;
  kyc_background_check?: {
    passed?: boolean;
    risk_level?: string;
  };
  kyc_documents?: Record<string, string>;
  // ... other fields
}

// Interface สำหรับ KYC Status ที่ return
interface KYCStatusResult {
  kycStatus?: string;
  kycLevel?: string;
  submittedAt?: Date;
  aiScore?: number;
  backgroundCheckPassed?: boolean;
  backgroundCheckRiskLevel?: string;
  documentUrls?: Record<string, string>;
}

export class FirestoreService {
  private db = admin.firestore();

  /**
   * เพิ่มหรืออัปเดตเอกสารใน Firestore
   */
  async setDocument(
    collectionPath: string,
    docId: string,
    data: any,
    merge: boolean = true
  ): Promise<void> {
    await this.db.collection(collectionPath).doc(docId).set(data, { merge });
  }

  /**
   * อ่านเอกสารจาก Firestore
   */
  async getDocument<T = any>(
    collectionPath: string,
    docId: string
  ): Promise<T | null> {
    const doc = await this.db.collection(collectionPath).doc(docId).get();
    return doc.exists ? (doc.data() as T) : null;
  }

  /**
   * ตรวจสอบว่ามีเอกสารหรือไม่
   */
  async documentExists(
    collectionPath: string,
    docId: string
  ): Promise<boolean> {
    const doc = await this.db.collection(collectionPath).doc(docId).get();
    return doc.exists;
  }

  /**
   * อัปเดตเฉพาะฟิลด์
   */
  async updateDocument(
    collectionPath: string,
    docId: string,
    data: any
  ): Promise<void> {
    await this.db.collection(collectionPath).doc(docId).update(data);
  }

  /**
   * ลบเอกสาร
   */
  async deleteDocument(collectionPath: string, docId: string): Promise<void> {
    await this.db.collection(collectionPath).doc(docId).delete();
  }

  /**
   * ตรวจสอบสถานะ KYC จาก Firestore
   */
  async getKYCStatus(userId: string): Promise<KYCStatusResult | null> {
    try {
      // อ่านจาก collection users พร้อมระบุ type
      const userDoc = await this.getDocument<UserDocument>("users", userId);
      
      if (!userDoc) {
        return null;
      }
      
      // แปลงข้อมูลให้ตรงกับ KYCSubmission format
      const result: KYCStatusResult = {
        kycStatus: userDoc.kyc_status,
        kycLevel: userDoc.kyc_level,
        submittedAt: userDoc.kyc_submitted_at,
        aiScore: userDoc.kyc_ai_score,
        backgroundCheckPassed: userDoc.kyc_background_check?.passed,
        backgroundCheckRiskLevel: userDoc.kyc_background_check?.risk_level,
        documentUrls: userDoc.kyc_documents
      };
      
      return result;
    } catch (error) {
      console.error("Error getting KYC status from Firestore:", error);
      throw error;
    }
  }

  /**
   * เพิ่ม timestamp
   */
  getTimestamp(): FieldValue {
    return FieldValue.serverTimestamp();
  }

  /**
   * ค้นหาด้วยเงื่อนไข
   */
  async queryDocuments<T>(
    collectionPath: string,
    field: string,
    operator: FirebaseFirestore.WhereFilterOp,
    value: any
  ): Promise<T[]> {
    const snapshot = await this.db
      .collection(collectionPath)
      .where(field, operator, value)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as T);
  }

  /**
   * ดึงข้อมูลทั้งหมดใน collection
   */
  async getAllDocuments<T>(collectionPath: string): Promise<T[]> {
    const snapshot = await this.db.collection(collectionPath).get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as T));
  }

  /**
   * ดึงข้อมูลด้วย pagination
   */
  async getDocumentsWithPagination<T>(
    collectionPath: string,
    limit: number = 10,
    startAfter?: string
  ): Promise<{ data: T[], lastDocId: string | null }> {
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
      } as T)),
      lastDocId: lastDoc ? lastDoc.id : null
    };
  }
}