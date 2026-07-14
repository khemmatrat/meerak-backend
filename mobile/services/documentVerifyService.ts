/**
 * Document Verification Service (Mock OCR)
 * Simulates KYC/OCR for Thai ID, Driving License, and Vehicle Registration.
 * In production: replace with real iApp API or Cloud Vision OCR + DOPA verification.
 * Images are processed as Base64; final storage should use S3/Cloudinary with PDPA-compliant access.
 *
 * SECURITY: Car Classification (Standard/Premium) MUST be done server-side or in a protected
 * business logic layer. Client sends only raw OCR data (vehicle_brand, vehicle_model, etc.);
 * backend computes vehicle_category. Never trust client-supplied vehicle_category.
 */

export type DocumentType = 'thai_id_front' | 'thai_id_back' | 'driver_license' | 'vehicle_registration';

export interface OCRResult {
  status: 'success' | 'document_unclear' | 'invalid';
  message?: string;
  data?: {
    national_id?: string;
    full_name?: string;
    date_of_birth?: string;
    expiry_date?: string;
    driver_license_number?: string;
    vehicle_license_plate?: string;
    vehicle_brand?: string;
    vehicle_model?: string;
    vehicle_year?: number;
  };
  /** @deprecated Do NOT use. Vehicle classification is server-side only. */
  vehicle_category?: never;
}

/**
 * Simulated quality check: very small or corrupted base64 = unclear
 */
function isImageQualityAcceptable(base64: string): boolean {
  if (!base64 || base64.length < 500) return false;
  // Remove data URL prefix to get raw base64 length
  const raw = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  return raw.length >= 1000;
}

/**
 * Mock OCR: simulates reading document data from image.
 * Returns success with sample data for valid images; "document_unclear" for poor quality.
 */
export async function verifyDocumentWithOCR(
  imageBase64: string,
  documentType: DocumentType
): Promise<OCRResult> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 600));

  if (!imageBase64) {
    return { status: 'invalid', message: 'ไม่มีรูปภาพ' };
  }

  if (!isImageQualityAcceptable(imageBase64)) {
    return {
      status: 'document_unclear',
      message: 'Document unclear. กรุณาถ่ายรูปใหม่อย่างชัดเจน หลีกเลี่ยงแสงสะท้อน',
    };
  }

  switch (documentType) {
    case 'thai_id_front':
    case 'thai_id_back': {
      // Simulate Thai ID 13-digit + name extraction
      const nationalId = '1234567890123'; // Mock; in production: OCR reads from image
      const fullName = 'สมชาย ใจดี'; // Mock
      const dob = '1990-01-15';
      const expiry = '2030-12-31';
      return {
        status: 'success',
        message: 'ตรวจสอบบัตรประชาชนสำเร็จ',
        data: {
          national_id: nationalId,
          full_name: fullName,
          date_of_birth: dob,
          expiry_date: expiry,
        },
      };
    }
    case 'driver_license': {
      const licenseNumber = '12345678';
      const expiry = '2028-06-30';
      return {
        status: 'success',
        message: 'ตรวจสอบใบขับขี่สำเร็จ',
        data: {
          driver_license_number: licenseNumber,
          expiry_date: expiry,
        },
      };
    }
    case 'vehicle_registration': {
      const plate = 'กก 1234 กรุงเทพมหานคร';
      const brand = 'Toyota';
      const model = 'Camry';
      const year = 2022;
      // vehicle_category is computed server-side from vehicle_brand; never returned from OCR
      return {
        status: 'success',
        message: 'ตรวจสอบเล่มทะเบียนรถสำเร็จ',
        data: {
          vehicle_license_plate: plate,
          vehicle_brand: brand,
          vehicle_model: model,
          vehicle_year: year,
        },
      };
    }
    default:
      return { status: 'invalid', message: 'Unknown document type' };
  }
}

/**
 * Convert File/Blob to Base64 for preview and OCR.
 * Use for immediate display; backend should receive multipart or secure signed upload.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
