/**
 * Face Matching Service - Compare Selfie with ID Card Photo
 * 
 * DEVELOPMENT MODE:
 * - Uses mock face matching with randomized scores
 * - Simulates ML processing delay
 * - Returns confidence scores
 * 
 * PRODUCTION TODO:
 * - Replace with AWS Rekognition CompareFaces
 * - Or Face++ API
 * - Or Azure Face API
 * - Add real facial recognition
 */

import { createLogger } from '../utils/tracing';

const logger = createLogger('FaceMatchService');

/**
 * Face Match Result
 */
export interface FaceMatchResult {
  success: boolean;
  confidence: number; // 0-100 (similarity score)
  match: boolean; // true if faces match above threshold
  threshold: number; // threshold used for matching
  details?: {
    face_detected_selfie: boolean;
    face_detected_id: boolean;
    quality_score_selfie?: number; // 0-100
    quality_score_id?: number; // 0-100
    similarity_score: number; // 0-100
  };
  errors?: string[];
  processing_time_ms: number;
}

/**
 * Face Match Configuration
 */
const FACE_MATCH_CONFIG = {
  MATCH_THRESHOLD: 80, // Minimum confidence to consider a match
  MIN_QUALITY_SCORE: 60, // Minimum image quality
  PROCESSING_TIMEOUT_MS: 5000
};

/**
 * Mock Face Matching - Simulates comparing two face images
 * 
 * In development:
 * 1. Simulates ML processing delay
 * 2. Generates realistic confidence scores
 * 3. Returns detailed face detection results
 * 
 * @param selfieUrl - URL or base64 of user selfie
 * @param idPhotoUrl - URL or base64 of ID card photo
 */
export async function compareFaces(
  selfieUrl: string,
  idPhotoUrl: string
): Promise<FaceMatchResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting face matching', { 
      hasSelfie: !!selfieUrl, 
      hasIdPhoto: !!idPhotoUrl 
    });

    // Validate inputs
    if (!selfieUrl || !idPhotoUrl) {
      return {
        success: false,
        confidence: 0,
        match: false,
        threshold: FACE_MATCH_CONFIG.MATCH_THRESHOLD,
        errors: ['Missing required images'],
        processing_time_ms: Date.now() - startTime
      };
    }

    // Simulate ML processing delay (1-3 seconds)
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Mock face detection & quality check
    const faceDetectedSelfie = true; // In dev, always detect
    const faceDetectedId = true;
    const qualityScoreSelfie = 70 + Math.random() * 30; // 70-100
    const qualityScoreId = 65 + Math.random() * 35; // 65-100

    // Mock similarity calculation
    // In dev, generate high confidence (80-98%) to simulate good match
    const similarityScore = 80 + Math.random() * 18;
    const confidence = parseFloat(similarityScore.toFixed(2));

    // Determine if faces match
    const match = confidence >= FACE_MATCH_CONFIG.MATCH_THRESHOLD;

    logger.info('Face matching completed', { 
      confidence, 
      match,
      qualityScoreSelfie: qualityScoreSelfie.toFixed(2),
      qualityScoreId: qualityScoreId.toFixed(2)
    });

    return {
      success: true,
      confidence,
      match,
      threshold: FACE_MATCH_CONFIG.MATCH_THRESHOLD,
      details: {
        face_detected_selfie: faceDetectedSelfie,
        face_detected_id: faceDetectedId,
        quality_score_selfie: parseFloat(qualityScoreSelfie.toFixed(2)),
        quality_score_id: parseFloat(qualityScoreId.toFixed(2)),
        similarity_score: confidence
      },
      processing_time_ms: Date.now() - startTime
    };
  } catch (error: any) {
    logger.error('Face matching failed', { error: error.message });

    return {
      success: false,
      confidence: 0,
      match: false,
      threshold: FACE_MATCH_CONFIG.MATCH_THRESHOLD,
      errors: ['Failed to compare faces: ' + error.message],
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Verify face quality before matching
 * Checks if image is suitable for face recognition
 */
export async function verifyFaceQuality(
  imageUrl: string
): Promise<{
  success: boolean;
  quality_score: number;
  face_detected: boolean;
  issues?: string[];
}> {
  try {
    logger.info('Verifying face quality');

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock quality check
    const qualityScore = 70 + Math.random() * 30;
    const faceDetected = true;
    const issues: string[] = [];

    if (qualityScore < FACE_MATCH_CONFIG.MIN_QUALITY_SCORE) {
      issues.push('Image quality too low');
    }

    logger.info('Face quality verified', { 
      qualityScore: qualityScore.toFixed(2),
      faceDetected 
    });

    return {
      success: faceDetected && qualityScore >= FACE_MATCH_CONFIG.MIN_QUALITY_SCORE,
      quality_score: parseFloat(qualityScore.toFixed(2)),
      face_detected: faceDetected,
      issues: issues.length > 0 ? issues : undefined
    };
  } catch (error: any) {
    logger.error('Face quality verification failed', { error: error.message });

    return {
      success: false,
      quality_score: 0,
      face_detected: false,
      issues: ['Failed to verify image: ' + error.message]
    };
  }
}

/**
 * Batch face matching - compare selfie with multiple ID photos
 * Useful when user has both ID card and driver license
 */
export async function batchCompareFaces(
  selfieUrl: string,
  idPhotoUrls: string[]
): Promise<{
  success: boolean;
  best_match: FaceMatchResult;
  all_results: FaceMatchResult[];
}> {
  try {
    logger.info('Starting batch face matching', { 
      photoCount: idPhotoUrls.length 
    });

    const results: FaceMatchResult[] = [];

    // Compare with each ID photo
    for (const idPhotoUrl of idPhotoUrls) {
      const result = await compareFaces(selfieUrl, idPhotoUrl);
      results.push(result);
    }

    // Find best match
    const bestMatch = results.reduce((best, current) => {
      return current.confidence > best.confidence ? current : best;
    });

    logger.info('Batch face matching completed', { 
      bestConfidence: bestMatch.confidence 
    });

    return {
      success: bestMatch.success,
      best_match: bestMatch,
      all_results: results
    };
  } catch (error: any) {
    logger.error('Batch face matching failed', { error: error.message });

    throw error;
  }
}

/**
 * Get face match verdict with human-readable message
 */
export function getFaceMatchVerdict(result: FaceMatchResult): {
  status: 'approved' | 'review' | 'rejected';
  message: string;
  reason?: string;
} {
  if (!result.success) {
    return {
      status: 'rejected',
      message: 'ไม่สามารถตรวจสอบใบหน้าได้',
      reason: result.errors?.join(', ')
    };
  }

  if (!result.details?.face_detected_selfie) {
    return {
      status: 'rejected',
      message: 'ไม่พบใบหน้าในรูปถ่าย selfie',
      reason: 'No face detected in selfie'
    };
  }

  if (!result.details?.face_detected_id) {
    return {
      status: 'rejected',
      message: 'ไม่พบใบหน้าในรูปบัตรประชาชน',
      reason: 'No face detected in ID card'
    };
  }

  // Check quality scores
  if (result.details.quality_score_selfie && 
      result.details.quality_score_selfie < FACE_MATCH_CONFIG.MIN_QUALITY_SCORE) {
    return {
      status: 'review',
      message: 'คุณภาพรูป selfie ไม่เพียงพอ ต้องตรวจสอบด้วยตนเอง',
      reason: 'Low selfie quality'
    };
  }

  if (result.details.quality_score_id && 
      result.details.quality_score_id < FACE_MATCH_CONFIG.MIN_QUALITY_SCORE) {
    return {
      status: 'review',
      message: 'คุณภาพรูปบัตรไม่เพียงพอ ต้องตรวจสอบด้วยตนเอง',
      reason: 'Low ID photo quality'
    };
  }

  // Check confidence
  if (result.confidence >= 95) {
    return {
      status: 'approved',
      message: 'ใบหน้าตรงกับบัตรประชาชน (ความมั่นใจสูงมาก)',
      reason: `Confidence: ${result.confidence}%`
    };
  } else if (result.confidence >= FACE_MATCH_CONFIG.MATCH_THRESHOLD) {
    return {
      status: 'approved',
      message: 'ใบหน้าตรงกับบัตรประชาชน',
      reason: `Confidence: ${result.confidence}%`
    };
  } else if (result.confidence >= 70) {
    return {
      status: 'review',
      message: 'ความคล้ายคลึงปานกลาง ต้องตรวจสอบด้วยตนเอง',
      reason: `Confidence: ${result.confidence}% (below threshold)`
    };
  } else {
    return {
      status: 'rejected',
      message: 'ใบหน้าไม่ตรงกับบัตรประชาชน',
      reason: `Confidence: ${result.confidence}% (too low)`
    };
  }
}

/**
 * Export configuration for external use
 */
export const FaceMatchConfig = FACE_MATCH_CONFIG;

/**
 * Production TODO:
 * 
 * 1. AWS Rekognition Integration:
 *    ```typescript
 *    import AWS from 'aws-sdk';
 *    const rekognition = new AWS.Rekognition();
 *    
 *    const params = {
 *      SourceImage: { Bytes: selfieBuffer },
 *      TargetImage: { Bytes: idPhotoBuffer },
 *      SimilarityThreshold: 80
 *    };
 *    
 *    const result = await rekognition.compareFaces(params).promise();
 *    const similarity = result.FaceMatches[0]?.Similarity || 0;
 *    ```
 * 
 * 2. Face++ API Integration:
 *    - POST to https://api-us.faceplusplus.com/facepp/v3/compare
 *    - Parameters: image_url1, image_url2, or image_base641, image_base642
 *    - Returns confidence score (0-100)
 * 
 * 3. Azure Face API:
 *    - Detect faces: POST /face/v1.0/detect
 *    - Verify faces: POST /face/v1.0/verify
 *    - Get confidence and isIdentical boolean
 * 
 * 4. Security Considerations:
 *    - Store temporary images in secure S3 bucket
 *    - Delete after processing
 *    - Log all face matching attempts (audit)
 *    - Rate limit per user
 *    - Encrypt results
 */
