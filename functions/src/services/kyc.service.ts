import { v2 as cloudinary } from "cloudinary";
import * as admin from "firebase-admin";

export class KYCService {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async validateKYCData(data: any): Promise<{ valid: boolean; error?: string }> {
    // 1. ตรวจสอบข้อมูลพื้นฐาน
    if (!data.fullName || !data.birthDate || !data.idCardNumber) {
      return { valid: false, error: "กรุณากรอกข้อมูลพื้นฐานให้ครบ" };
    }

    // 2. ตรวจสอบรูปแบบเลขบัตรประชาชน
    if (!/^\d{13}$/.test(data.idCardNumber)) {
      return { valid: false, error: "เลขบัตรประชาชนต้องมี 13 หลัก" };
    }

    // 3. ตรวจสอบอายุ
    const birth = new Date(data.birthDate);
    const age = new Date().getFullYear() - birth.getFullYear();
    if (age < 18) {
      return { valid: false, error: "ต้องมีอายุ 18 ปีขึ้นไป" };
    }

    // 4. ตรวจสอบเอกสาร (ต้องมีอย่างน้อยบัตรประชาชนด้านหน้าและเซลฟี่)
    if (!data.idCardFront || !data.selfiePhoto) {
      return { valid: false, error: "กรุณาอัพโหลดบัตรประชาชนด้านหน้าและรูปเซลฟี่" };
    }

    return { valid: true };
  }

  async uploadDocuments(userId: string, documents: {
    idCardFront?: string;
    idCardBack?: string;
    selfiePhoto?: string;
    drivingLicenseFront?: string;
    drivingLicenseBack?: string;
  }): Promise<Record<string, string>> {
    const uploadResults: Record<string, string> = {};
    const folder = `kyc/${userId}`;

    const uploadPromises: Promise<void>[] = [];

    // อัพโหลดแต่ละไฟล์แบบ parallel
    if (documents.idCardFront && !documents.idCardFront.includes("mock")) {
      uploadPromises.push(
        cloudinary.uploader.upload(documents.idCardFront, {
          folder,
          public_id: `id_card_front_${Date.now()}`,
        }).then(result => {
          uploadResults.idCardFrontUrl = result.secure_url;
        })
      );
    }

    if (documents.idCardBack && !documents.idCardBack.includes("mock")) {
      uploadPromises.push(
        cloudinary.uploader.upload(documents.idCardBack, {
          folder,
          public_id: `id_card_back_${Date.now()}`,
        }).then(result => {
          uploadResults.idCardBackUrl = result.secure_url;
        })
      );
    }

    if (documents.selfiePhoto && !documents.selfiePhoto.includes("mock")) {
      uploadPromises.push(
        cloudinary.uploader.upload(documents.selfiePhoto, {
          folder,
          public_id: `selfie_${Date.now()}`,
        }).then(result => {
          uploadResults.selfiePhotoUrl = result.secure_url;
        })
      );
    }

    // รอให้ทุกการอัพโหลดเสร็จ
    await Promise.all(uploadPromises);

    return uploadResults;
  }

  async verifyWithAI(params: {
    idCardFrontUrl: string;
    selfiePhotoUrl: string;
    idCardNumber: string;
    fullName: string;
  }): Promise<{
    success: boolean;
    score: number;
    reasons: string[];
    verification_id: string;
  }> {
    console.log("🔍 AI Verification started for:", params.fullName);

    // TODO: เปลี่ยนเป็นเรียก API จริง (iApp หรือบริการอื่น)
    // สำหรับตอนนี้ใช้ mock ก่อน
    
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

  async runBackgroundCheck(params: {
    idCardNumber: string;
    fullName: string;
    birthDate: string;
  }): Promise<{
    passed: boolean;
    risk_level: "low" | "medium" | "high";
    reasons: string[];
  }> {
    console.log("🔍 Background Check for ID:", params.idCardNumber);
    
    // TODO: เรียก iApp API จริง
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock logic
    const lastDigit = parseInt(params.idCardNumber.slice(-1));
    const passed = lastDigit % 4 !== 0;
    
    return {
      passed: passed,
      risk_level: passed ? "low" : "high",
      reasons: !passed ? ["ID found in internal watchlist"] : []
    };
  }

  determineKYCStatus(
    aiResult: { success: boolean; score: number } | null,
    backgroundCheck: { passed: boolean }
  ): { status: string; level: string } {
    if (!aiResult || !backgroundCheck.passed) {
      return { status: "pending_verification", level: "processing" };
    }

    if (aiResult.success && aiResult.score >= 70) {
      return { status: "ai_verified", level: "level_2" };
    } else {
      return { status: "ai_failed", level: "level_1" };
    }
  }

  async saveToFirestore(userId: string, data: any): Promise<{ id: string }> {
    const userRef = this.db.collection("users").doc(userId);
    
    await userRef.set({
      kyc_full_name: data.fullName,
      kyc_birth_date: data.birthDate,
      kyc_id_card_number: data.idCardNumber,
      kyc_documents: data.documents,
      kyc_ai_verification: data.aiVerification,
      kyc_background_check: data.backgroundCheck,
      kyc_ai_score: data.aiVerification?.score || 0,
      kyc_status: data.status,
      kyc_level: data.level,
      kyc_submitted_at: new Date().toISOString(),
      kyc_steps_completed: 7,
      updated_at: new Date().toISOString(),
    }, { merge: true });

    // บันทึกแยกสำหรับ analytics
    await this.db.collection("kyc_verifications").doc(userId).set({
      user_id: userId,
      ai_result: data.aiVerification,
      background_check: data.backgroundCheck,
      submitted_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: data.status
    });

    return { id: userId };
  }

  async updateFirestoreKYC(userId: string, updates: any): Promise<void> {
    await this.db.collection("users").doc(userId).update({
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async sendNotification(userId: string, status: string, data?: any): Promise<void> {
    const notificationsRef = this.db.collection("notifications");
    
    let title = "";
    let message = "";

    switch (status) {
      case "ai_verified":
        title = "✅ ยืนยันตัวตนสำเร็จ (AI Verified)";
        message = `ระบบ AI ตรวจสอบข้อมูลของคุณเรียบร้อยแล้ว (คะแนน: ${data?.score})`;
        break;
      case "ai_failed":
        title = "⚠️ ต้องการการตรวจสอบเพิ่มเติม";
        message = "ระบบ AI ตรวจสอบพบว่าต้องการการยืนยันเพิ่มเติมจากเจ้าหน้าที่";
        break;
      case "submitted":
        title = "📨 ได้รับข้อมูล KYC ของคุณแล้ว";
        message = "เราได้รับข้อมูลยืนยันตัวตนของคุณแล้ว กำลังดำเนินการตรวจสอบ";
        break;
    }

    await notificationsRef.add({
      user_id: userId,
      title,
      message,
      type: "kyc_status_update",
      data: data || {},
      created_at: new Date().toISOString(),
      is_read: false,
    });
  }

  getNextAction(status: string): string {
    const actions: Record<string, string> = {
      "not_submitted": "submit_kyc",
      "pending_verification": "wait_for_verification",
      "ai_verified": "proceed_to_transaction",
      "ai_failed": "contact_support",
      "admin_approved": "proceed_to_transaction",
      "rejected": "resubmit_documents",
    };
    return actions[status] || "contact_support";
  }
}