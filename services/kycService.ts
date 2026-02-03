/**
 * Phase 2: KYC (Know Your Customer) Service
 * 
 * CRITICAL SECURITY:
 * - All PII (Personal Identifiable Information) is encrypted before storage
 * - Access is logged for audit trail
 * - Data masking applied based on user role
 * - Secure image storage with encryption
 */

import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { createLogger, RequestContext } from '../utils/tracing';
import { logCreate, logUpdate, logAudit } from '../utils/auditLog';
import { encryptField, decryptField, hashField, validateThaiID } from '../utils/encryption';
import { maskThaiID, applyMasking, MaskingLevel, getMaskingLevel } from '../utils/dataMasking';
import { 
  KYCRecord, 
  KYCLevel, 
  KYCStatus, 
  KYCDocument, 
  KYCDocumentType,
  KYC_LIMITS,
  KYCVerificationMethod
} from '../types';
import { readThaiNationalID, validateOCRResults, calculateOCRConfidence } from './ocrService';
import { compareFaces, getFaceMatchVerdict } from './faceMatchService';
import { checkPassiveLiveness, getLivenessVerdict } from './livenessService';

const logger = createLogger('KYCService');

/**
 * Submit KYC Lite (Level 1)
 * 
 * Requires:
 * - Thai National ID
 * - Full name
 * - Date of birth
 * - ID card photo
 */
export async function submitKYCLite(
  userId: string,
  data: {
    national_id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;  // YYYY-MM-DD
    address: string;
    id_card_photo_url: string;
  },
  context: RequestContext
): Promise<{ success: boolean; kyc_id?: string; error?: string }> {
  try {
    logger.info('Submitting KYC Lite', { userId }, context);
    
    // 1. Validate Thai National ID
    if (!validateThaiID(data.national_id)) {
      return { success: false, error: 'Invalid Thai National ID format' };
    }
    
    // 2. Check if KYC already exists
    const existingKYC = await getKYCRecord(userId);
    
    if (existingKYC && existingKYC.kyc_status === KYCStatus.PENDING) {
      return { success: false, error: 'KYC already submitted and pending review' };
    }
    
    if (existingKYC && existingKYC.kyc_status === KYCStatus.APPROVED) {
      return { success: false, error: 'KYC already approved' };
    }
    
    // 3. Encrypt sensitive data
    const national_id_encrypted = await encryptField(data.national_id);
    const national_id_hash = await hashField(data.national_id);
    const first_name_encrypted = await encryptField(data.first_name);
    const last_name_encrypted = await encryptField(data.last_name);
    const date_of_birth_encrypted = await encryptField(data.date_of_birth);
    const address_encrypted = await encryptField(data.address);
    
    // 4. Create KYC record
    const kycId = `kyc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const kycRecord: KYCRecord = {
      id: kycId,
      user_id: userId,
      kyc_level: KYCLevel.LITE,
      kyc_status: KYCStatus.PENDING,
      
      // Encrypted PII
      national_id_encrypted,
      national_id_hash,
      first_name_encrypted,
      last_name_encrypted,
      date_of_birth_encrypted,
      address_encrypted,
      
      // Documents
      documents: [{
        id: `doc_${Date.now()}`,
        type: KYCDocumentType.THAI_ID_CARD,
        url: data.id_card_photo_url,
        uploaded_at: new Date().toISOString()
      }],
      
      // Limits (will be applied after approval)
      daily_transaction_limit: KYC_LIMITS[KYCLevel.LITE].daily_transaction_limit,
      daily_withdrawal_limit: KYC_LIMITS[KYCLevel.LITE].daily_withdrawal_limit,
      
      // Metadata
      submitted_at: new Date().toISOString(),
      ip_address: context.ip_address,
      user_agent: context.user_agent,
      request_id: context.request_id,
      trace_id: context.trace_id,
      
      // Audit
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId
    };
    
    // Remove undefined fields
    const cleanedRecord = Object.fromEntries(
      Object.entries(kycRecord).filter(([_, v]) => v !== undefined)
    );
    
    // 5. Save to Firestore
    await setDoc(doc(db, 'kyc_records', kycId), cleanedRecord);
    
    // 6. Log audit (with encrypted data redacted)
    await logCreate('kyc_records', kycId, {
      user_id: userId,
      kyc_level: KYCLevel.LITE,
      kyc_status: KYCStatus.PENDING,
      national_id: maskThaiID(data.national_id), // Masked for audit log
      submitted_at: kycRecord.submitted_at
    }, context, {
      user_id: userId,
      action_type: 'kyc_lite_submit'
    });
    
    logger.info('✅ KYC Lite submitted successfully', { kycId, userId }, context);
    
    return { success: true, kyc_id: kycId };
    
  } catch (error: any) {
    logger.error('Failed to submit KYC Lite', error, context);
    return { success: false, error: error.message };
  }
}

/**
 * Get KYC record (with decryption and masking)
 */
export async function getKYCRecord(
  userId: string,
  requestingUserId?: string,
  requestingUserRole?: string
): Promise<KYCRecord | null> {
  try {
    // Find KYC record by user_id
    const q = query(collection(db, 'kyc_records'), where('user_id', '==', userId));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const kycDoc = snapshot.docs[0];
    const kycData = kycDoc.data() as KYCRecord;
    
    // Determine masking level
    const isOwner = requestingUserId === userId;
    const maskingLevel = requestingUserId && requestingUserRole 
      ? getMaskingLevel(requestingUserRole, isOwner)
      : 'full';
    
    // Decrypt if owner or admin
    if (maskingLevel === 'none' || maskingLevel === 'partial') {
      try {
        // Decrypt sensitive fields
        if (kycData.national_id_encrypted) {
          const decrypted = await decryptField(kycData.national_id_encrypted);
          (kycData as any).national_id = maskingLevel === 'none' 
            ? decrypted 
            : maskThaiID(decrypted);
        }
        
        if (kycData.first_name_encrypted) {
          (kycData as any).first_name = await decryptField(kycData.first_name_encrypted);
        }
        
        if (kycData.last_name_encrypted) {
          (kycData as any).last_name = await decryptField(kycData.last_name_encrypted);
        }
        
        if (kycData.date_of_birth_encrypted) {
          (kycData as any).date_of_birth = await decryptField(kycData.date_of_birth_encrypted);
        }
        
        if (kycData.address_encrypted) {
          (kycData as any).address = await decryptField(kycData.address_encrypted);
        }
      } catch (error) {
        console.error('Failed to decrypt KYC data:', error);
      }
    } else {
      // Full masking - don't decrypt, just show masked
      (kycData as any).national_id = 'x-xxxx-xxxxx-xx-x';
      (kycData as any).first_name = '***';
      (kycData as any).last_name = '***';
      (kycData as any).date_of_birth = '****-**-**';
      (kycData as any).address = '***';
    }
    
    return kycData;
    
  } catch (error) {
    console.error('Error getting KYC record:', error);
    return null;
  }
}

/**
 * Get KYC status for user
 */
export async function getKYCStatus(userId: string): Promise<{
  kyc_level: KYCLevel;
  kyc_status: KYCStatus;
  daily_transaction_limit: number;
  daily_withdrawal_limit: number;
}> {
  try {
    const kycRecord = await getKYCRecord(userId);
    
    if (!kycRecord) {
      return {
        kyc_level: KYCLevel.NONE,
        kyc_status: KYCStatus.NOT_STARTED,
        daily_transaction_limit: KYC_LIMITS[KYCLevel.NONE].daily_transaction_limit,
        daily_withdrawal_limit: KYC_LIMITS[KYCLevel.NONE].daily_withdrawal_limit
      };
    }
    
    return {
      kyc_level: kycRecord.kyc_level,
      kyc_status: kycRecord.kyc_status,
      daily_transaction_limit: kycRecord.daily_transaction_limit,
      daily_withdrawal_limit: kycRecord.daily_withdrawal_limit
    };
    
  } catch (error) {
    console.error('Error getting KYC status:', error);
    return {
      kyc_level: KYCLevel.NONE,
      kyc_status: KYCStatus.NOT_STARTED,
      daily_transaction_limit: KYC_LIMITS[KYCLevel.NONE].daily_transaction_limit,
      daily_withdrawal_limit: KYC_LIMITS[KYCLevel.NONE].daily_withdrawal_limit
    };
  }
}

/**
 * Check if transaction amount exceeds KYC limits
 */
export async function checkKYCLimit(
  userId: string,
  amount: number,
  type: 'transaction' | 'withdrawal'
): Promise<{ allowed: boolean; reason?: string; current_limit?: number }> {
  try {
    const kycStatus = await getKYCStatus(userId);
    
    const limit = type === 'transaction' 
      ? kycStatus.daily_transaction_limit 
      : kycStatus.daily_withdrawal_limit;
    
    if (amount > limit) {
      return {
        allowed: false,
        reason: `Amount exceeds daily ${type} limit for KYC Level ${kycStatus.kyc_level}`,
        current_limit: limit
      };
    }
    
    return { allowed: true };
    
  } catch (error) {
    console.error('Error checking KYC limit:', error);
    return { allowed: false, reason: 'Failed to check KYC limit' };
  }
}

/**
 * Admin: Approve KYC
 */
export async function approveKYC(
  kycId: string,
  adminId: string,
  context: RequestContext
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Approving KYC', { kycId, adminId }, context);
    
    const kycRef = doc(db, 'kyc_records', kycId);
    const kycDoc = await getDoc(kycRef);
    
    if (!kycDoc.exists()) {
      return { success: false, error: 'KYC record not found' };
    }
    
    const kycData = kycDoc.data() as KYCRecord;
    
    if (kycData.kyc_status !== KYCStatus.PENDING) {
      return { success: false, error: 'KYC is not pending review' };
    }
    
    // Update status
    await updateDoc(kycRef, {
      kyc_status: KYCStatus.APPROVED,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
      updated_at: new Date().toISOString(),
      updated_by: adminId
    });
    
    // Log audit
    await logUpdate('kyc_records', kycId, {
      kyc_status: KYCStatus.PENDING
    }, {
      kyc_status: KYCStatus.APPROVED,
      reviewed_by: adminId
    }, context, {
      user_id: adminId,
      action_type: 'kyc_approve'
    });
    
    logger.info('✅ KYC approved', { kycId, adminId }, context);
    
    return { success: true };
    
  } catch (error: any) {
    logger.error('Failed to approve KYC', error, context);
    return { success: false, error: error.message };
  }
}

/**
 * Admin: Reject KYC
 */
export async function rejectKYC(
  kycId: string,
  adminId: string,
  reason: string,
  context: RequestContext
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Rejecting KYC', { kycId, adminId, reason }, context);
    
    const kycRef = doc(db, 'kyc_records', kycId);
    const kycDoc = await getDoc(kycRef);
    
    if (!kycDoc.exists()) {
      return { success: false, error: 'KYC record not found' };
    }
    
    const kycData = kycDoc.data() as KYCRecord;
    
    if (kycData.kyc_status !== KYCStatus.PENDING) {
      return { success: false, error: 'KYC is not pending review' };
    }
    
    // Update status
    await updateDoc(kycRef, {
      kyc_status: KYCStatus.REJECTED,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
      updated_by: adminId
    });
    
    // Log audit
    await logUpdate('kyc_records', kycId, {
      kyc_status: KYCStatus.PENDING
    }, {
      kyc_status: KYCStatus.REJECTED,
      reviewed_by: adminId,
      rejection_reason: reason
    }, context, {
      user_id: adminId,
      action_type: 'kyc_reject'
    });
    
    logger.info('✅ KYC rejected', { kycId, adminId }, context);
    
    return { success: true };
    
  } catch (error: any) {
    logger.error('Failed to reject KYC', error, context);
    return { success: false, error: error.message };
  }
}

/**
 * Get all pending KYC records (Admin only)
 */
export async function getPendingKYCs(): Promise<KYCRecord[]> {
  try {
    const q = query(
      collection(db, 'kyc_records'),
      where('kyc_status', '==', KYCStatus.PENDING)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => doc.data() as KYCRecord);
    
  } catch (error) {
    console.error('Error getting pending KYCs:', error);
    return [];
  }
}

/**
 * Submit KYC Full (Level 2) - AI Auto-Approval
 * 
 * Process:
 * 1. OCR: Read National ID card (front + back)
 * 2. Face Matching: Compare selfie with ID photo
 * 3. Liveness: Verify real person (anti-spoofing)
 * 4. Validation: Check OCR data matches user input
 * 5. Auto-approve if all checks pass with high confidence
 * 
 * Requires:
 * - Thai National ID
 * - Full name
 * - Date of birth
 * - ID card photos (front + back)
 * - Selfie photo
 */
export async function submitKYCFull(
  userId: string,
  data: {
    national_id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;  // YYYY-MM-DD
    address: string;
    id_card_front_url: string;
    id_card_back_url: string;
    selfie_url: string;
  },
  context: RequestContext
): Promise<{ 
  success: boolean; 
  kyc_id?: string; 
  auto_approved?: boolean;
  error?: string;
  ai_results?: any;
}> {
  try {
    logger.info('Submitting KYC Full (AI verification)', { userId }, context);

    // Step 1: Validate Thai National ID
    if (!validateThaiID(data.national_id)) {
      return { success: false, error: 'Invalid Thai National ID format' };
    }

    // Step 2: OCR - Read ID card
    logger.info('Running OCR on ID card images', { userId }, context);
    
    const [ocrFront, ocrBack] = await Promise.all([
      readThaiNationalID(data.id_card_front_url, 'front'),
      readThaiNationalID(data.id_card_back_url, 'back')
    ]);

    if (!ocrFront.success || !ocrBack.success) {
      logger.warn('OCR failed', { 
        frontSuccess: ocrFront.success, 
        backSuccess: ocrBack.success 
      }, context);
      return { 
        success: false, 
        error: 'Failed to read ID card. Please ensure images are clear and well-lit.' 
      };
    }

    // Step 3: Validate OCR results against user input
    logger.info('Validating OCR results', { userId }, context);
    
    const validation = validateOCRResults(ocrFront.data!, {
      national_id: data.national_id,
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth
    });

    if (!validation.valid) {
      logger.warn('OCR validation failed', { errors: validation.errors }, context);
      return { 
        success: false, 
        error: 'Data mismatch: ' + validation.errors.join(', ') 
      };
    }

    // Step 4: Face Matching - Compare selfie with ID photo
    logger.info('Running face matching', { userId }, context);
    
    // In mock mode, we use the ID card front URL as the "ID photo"
    // In production, OCR would extract the face region from ID card
    const faceMatchResult = await compareFaces(
      data.selfie_url,
      data.id_card_front_url
    );

    if (!faceMatchResult.success) {
      logger.warn('Face matching failed', { error: faceMatchResult.errors }, context);
      return { 
        success: false, 
        error: 'Face matching failed: ' + (faceMatchResult.errors?.join(', ') || 'Unknown error')
      };
    }

    const faceVerdict = getFaceMatchVerdict(faceMatchResult);
    logger.info('Face match verdict', { verdict: faceVerdict.status, confidence: faceMatchResult.confidence }, context);

    // Step 5: Liveness Detection - Verify real person
    logger.info('Running liveness detection', { userId }, context);
    
    const livenessResult = await checkPassiveLiveness(data.selfie_url);

    if (!livenessResult.success) {
      logger.warn('Liveness detection failed', { error: livenessResult.errors }, context);
      return { 
        success: false, 
        error: 'Liveness check failed: ' + (livenessResult.errors?.join(', ') || 'Unknown error')
      };
    }

    const livenessVerdict = getLivenessVerdict(livenessResult);
    logger.info('Liveness verdict', { verdict: livenessVerdict.status, confidence: livenessResult.confidence }, context);

    // Step 6: Calculate overall AI confidence
    const ocrConfidence = calculateOCRConfidence(ocrFront, ocrBack);
    const faceConfidence = faceMatchResult.confidence;
    const livenessConfidence = livenessResult.confidence;

    // Weighted average: OCR 30%, Face 40%, Liveness 30%
    const overallConfidence = (
      ocrConfidence * 0.3 +
      faceConfidence * 0.4 +
      livenessConfidence * 0.3
    );

    logger.info('Overall AI confidence', { 
      ocr: ocrConfidence.toFixed(2),
      face: faceConfidence.toFixed(2),
      liveness: livenessConfidence.toFixed(2),
      overall: overallConfidence.toFixed(2)
    }, context);

    // Step 7: Determine auto-approval
    const AUTO_APPROVE_THRESHOLD = 85; // 85% overall confidence
    const autoApproved = 
      overallConfidence >= AUTO_APPROVE_THRESHOLD &&
      faceVerdict.status === 'approved' &&
      livenessVerdict.status === 'approved' &&
      !livenessResult.spoof_detected;

    logger.info('Auto-approval decision', { 
      autoApproved, 
      threshold: AUTO_APPROVE_THRESHOLD,
      overallConfidence: overallConfidence.toFixed(2)
    }, context);

    // Step 8: Encrypt sensitive data
    const national_id_encrypted = await encryptField(data.national_id);
    const national_id_hash = await hashField(data.national_id);
    const first_name_encrypted = await encryptField(data.first_name);
    const last_name_encrypted = await encryptField(data.last_name);
    const date_of_birth_encrypted = await encryptField(data.date_of_birth);
    const address_encrypted = await encryptField(data.address);

    // Step 9: Create KYC record
    const kycId = `kyc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    const kycRecord: KYCRecord = {
      id: kycId,
      user_id: userId,
      kyc_level: autoApproved ? KYCLevel.FULL : KYCLevel.LITE,
      kyc_status: autoApproved ? KYCStatus.APPROVED : KYCStatus.PENDING,
      verification_method: KYCVerificationMethod.AI_AUTO,

      // Encrypted PII
      national_id_encrypted,
      national_id_hash,
      first_name_encrypted,
      last_name_encrypted,
      date_of_birth_encrypted,
      address_encrypted,

      // Documents
      documents: [
        {
          id: `doc_${Date.now()}_1`,
          type: KYCDocumentType.THAI_ID_CARD,
          url: data.id_card_front_url,
          uploaded_at: now
        },
        {
          id: `doc_${Date.now()}_2`,
          type: KYCDocumentType.THAI_ID_CARD,
          url: data.id_card_back_url,
          uploaded_at: now
        },
        {
          id: `doc_${Date.now()}_3`,
          type: KYCDocumentType.SELFIE,
          url: data.selfie_url,
          uploaded_at: now
        }
      ],

      // AI Verification Results
      ai_verification: {
        ocr_results: {
          id_front_confidence: ocrFront.confidence,
          id_back_confidence: ocrBack.confidence,
          overall_confidence: ocrConfidence,
          data_extracted: true,
          validated: validation.valid
        },
        face_match_results: {
          confidence: faceMatchResult.confidence,
          match: faceMatchResult.match,
          quality_score: faceMatchResult.details?.quality_score_selfie || 0
        },
        liveness_results: {
          confidence: livenessResult.confidence,
          is_live: livenessResult.is_live,
          spoof_detected: livenessResult.spoof_detected
        },
        auto_approved: autoApproved,
        ai_confidence_score: parseFloat(overallConfidence.toFixed(2)),
        processed_at: now
      },

      // Limits
      daily_transaction_limit: autoApproved 
        ? KYC_LIMITS[KYCLevel.FULL].daily_transaction_limit
        : KYC_LIMITS[KYCLevel.LITE].daily_transaction_limit,
      daily_withdrawal_limit: autoApproved
        ? KYC_LIMITS[KYCLevel.FULL].daily_withdrawal_limit
        : KYC_LIMITS[KYCLevel.LITE].daily_withdrawal_limit,

      // Metadata
      submitted_at: now,
      reviewed_at: autoApproved ? now : undefined,
      reviewed_by: autoApproved ? 'system_ai' : undefined,

      // Tracing
      request_id: context.request_id,
      trace_id: context.trace_id,
      created_at: now,
      updated_at: now,
      created_by: userId
    };

    // Remove undefined fields
    const cleanedRecord = Object.fromEntries(
      Object.entries(kycRecord).filter(([_, v]) => v !== undefined)
    );

    // Step 10: Save to Firestore
    await setDoc(doc(db, 'kyc_records', kycId), cleanedRecord);

    // Step 11: Log audit (with masked data)
    await logCreate(
      'kyc_records',
      kycId,
      {
        user_id: userId,
        kyc_level: autoApproved ? 'FULL' : 'LITE',
        kyc_status: autoApproved ? 'APPROVED' : 'PENDING',
        verification_method: 'AI_AUTO',
        national_id: maskThaiID(data.national_id),
        auto_approved: autoApproved,
        ai_confidence: overallConfidence.toFixed(2)
      },
      context,
      { action_type: 'kyc_full_submit' }
    );

    logger.info('KYC Full submitted successfully', { 
      kycId, 
      autoApproved,
      level: autoApproved ? 'FULL' : 'LITE'
    }, context);

    return {
      success: true,
      kyc_id: kycId,
      auto_approved: autoApproved,
      ai_results: {
        overall_confidence: overallConfidence.toFixed(2),
        ocr_confidence: ocrConfidence.toFixed(2),
        face_confidence: faceConfidence.toFixed(2),
        liveness_confidence: livenessConfidence.toFixed(2),
        face_verdict: faceVerdict,
        liveness_verdict: livenessVerdict
      }
    };

  } catch (error: any) {
    logger.error('Error submitting KYC Full', { error: error.message }, context);
    return { success: false, error: error.message };
  }
}

export default {
  submitKYCLite,
  submitKYCFull,
  getKYCRecord,
  getKYCStatus,
  checkKYCLimit,
  approveKYC,
  rejectKYC,
  getPendingKYCs
};
