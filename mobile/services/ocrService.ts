/**
 * OCR Service - Thai National ID & Driver License Reader
 * 
 * DEVELOPMENT MODE:
 * - Uses mock OCR with pattern matching
 * - Simulates reading text from images
 * - Returns structured data from ID cards
 * 
 * PRODUCTION TODO:
 * - Replace with Google Cloud Vision API
 * - Or AWS Textract
 * - Or Azure Computer Vision
 * - Add real image processing
 */

import { createLogger } from '../utils/tracing';

const logger = createLogger('OCRService');

/**
 * OCR Result for Thai National ID
 */
export interface ThaiIDOCRResult {
  success: boolean;
  confidence: number; // 0-100
  data?: {
    national_id: string;
    title_th: string; // นาย, นาง, นางสาว
    first_name_th: string;
    last_name_th: string;
    title_en?: string; // Mr., Mrs., Miss
    first_name_en?: string;
    last_name_en?: string;
    date_of_birth: string; // YYYY-MM-DD
    address: string;
    issue_date?: string;
    expiry_date?: string;
    religion?: string;
  };
  errors?: string[];
  processing_time_ms: number;
}

/**
 * OCR Result for Driver License
 */
export interface DriverLicenseOCRResult {
  success: boolean;
  confidence: number; // 0-100
  data?: {
    license_number: string;
    national_id: string;
    title_th: string;
    first_name_th: string;
    last_name_th: string;
    date_of_birth: string;
    issue_date: string;
    expiry_date: string;
    license_type: string[]; // ['รถจักรยานยนต์', 'รถยนต์ส่วนบุคคล']
  };
  errors?: string[];
  processing_time_ms: number;
}

/**
 * Mock OCR - Simulates reading Thai National ID from image
 * 
 * In development, it:
 * 1. Simulates processing delay
 * 2. Generates realistic Thai data
 * 3. Returns high confidence score
 * 
 * @param imageUrl - URL or base64 of ID card image
 * @param side - 'front' or 'back'
 */
export async function readThaiNationalID(
  imageUrl: string,
  side: 'front' | 'back'
): Promise<ThaiIDOCRResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting OCR for Thai National ID', { side });

    // Simulate processing delay (500ms - 2s)
    const delay = 500 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Mock OCR - Generate realistic data
    if (side === 'front') {
      const mockData = {
        national_id: '1234567890123',
        title_th: 'นาย',
        first_name_th: 'สมชาย',
        last_name_th: 'ใจดี',
        title_en: 'Mr.',
        first_name_en: 'Somchai',
        last_name_en: 'Jaidee',
        date_of_birth: '1990-05-15',
        religion: 'พุทธ',
        address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
        issue_date: '2020-05-15',
        expiry_date: '2027-05-14'
      };

      const confidence = 85 + Math.random() * 15; // 85-100%

      logger.info('OCR completed successfully', { 
        side, 
        confidence: confidence.toFixed(2) 
      });

      return {
        success: true,
        confidence: parseFloat(confidence.toFixed(2)),
        data: mockData,
        processing_time_ms: Date.now() - startTime
      };
    } else {
      // Back side - usually just has issue/expiry dates and signature
      logger.info('OCR completed for back side', { side });

      return {
        success: true,
        confidence: 90,
        data: {
          national_id: '1234567890123',
          title_th: '',
          first_name_th: '',
          last_name_th: '',
          date_of_birth: '',
          address: '',
          issue_date: '2020-05-15',
          expiry_date: '2027-05-14'
        },
        processing_time_ms: Date.now() - startTime
      };
    }
  } catch (error: any) {
    logger.error('OCR failed', { error: error.message });

    return {
      success: false,
      confidence: 0,
      errors: ['Failed to process image: ' + error.message],
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Mock OCR - Simulates reading Driver License from image
 */
export async function readDriverLicense(
  imageUrl: string
): Promise<DriverLicenseOCRResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting OCR for Driver License');

    // Simulate processing delay
    const delay = 500 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delay));

    const mockData = {
      license_number: '12345678',
      national_id: '1234567890123',
      title_th: 'นาย',
      first_name_th: 'สมชาย',
      last_name_th: 'ใจดี',
      date_of_birth: '1990-05-15',
      issue_date: '2020-06-01',
      expiry_date: '2025-05-31',
      license_type: ['รถจักรยานยนต์', 'รถยนต์ส่วนบุคคล']
    };

    const confidence = 85 + Math.random() * 15;

    logger.info('Driver License OCR completed', { 
      confidence: confidence.toFixed(2) 
    });

    return {
      success: true,
      confidence: parseFloat(confidence.toFixed(2)),
      data: mockData,
      processing_time_ms: Date.now() - startTime
    };
  } catch (error: any) {
    logger.error('Driver License OCR failed', { error: error.message });

    return {
      success: false,
      confidence: 0,
      errors: ['Failed to process image: ' + error.message],
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Validate OCR results against user input
 * Returns validation errors if data doesn't match
 */
export function validateOCRResults(
  ocrData: ThaiIDOCRResult['data'],
  userInput: {
    national_id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!ocrData) {
    return { valid: false, errors: ['No OCR data available'] };
  }

  // Compare National ID
  if (ocrData.national_id !== userInput.national_id) {
    errors.push('เลขบัตรประชาชนไม่ตรงกับข้อมูลที่กรอก');
  }

  // Compare name (Thai)
  if (ocrData.first_name_th !== userInput.first_name) {
    errors.push('ชื่อไม่ตรงกับบัตรประชาชน');
  }

  if (ocrData.last_name_th !== userInput.last_name) {
    errors.push('นามสกุลไม่ตรงกับบัตรประชาชน');
  }

  // Compare date of birth
  if (ocrData.date_of_birth !== userInput.date_of_birth) {
    errors.push('วันเกิดไม่ตรงกับบัตรประชาชน');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate overall OCR confidence score
 */
export function calculateOCRConfidence(
  idFrontResult: ThaiIDOCRResult,
  idBackResult: ThaiIDOCRResult
): number {
  if (!idFrontResult.success || !idBackResult.success) {
    return 0;
  }

  // Weighted average (front is more important)
  const frontWeight = 0.7;
  const backWeight = 0.3;

  return (
    idFrontResult.confidence * frontWeight +
    idBackResult.confidence * backWeight
  );
}

/**
 * Production TODO:
 * 
 * 1. Google Cloud Vision API Integration:
 *    - Setup: gcloud auth + API key
 *    - Use TEXT_DETECTION or DOCUMENT_TEXT_DETECTION
 *    - Parse text with Thai language support
 * 
 * 2. Text Parsing:
 *    - Regex patterns for Thai ID format
 *    - Date parsing (Buddhist calendar -> Gregorian)
 *    - Address extraction
 *    - Name/Title extraction
 * 
 * 3. Confidence Scoring:
 *    - Based on text clarity
 *    - Based on image quality
 *    - Based on field completeness
 * 
 * 4. Error Handling:
 *    - Invalid image format
 *    - Poor image quality
 *    - Missing required fields
 *    - API rate limits
 */
