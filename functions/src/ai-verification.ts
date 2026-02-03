// functions/src/ai-verification.ts
import axios from 'axios';

export const verifyWithAI = async (documents: {
  idCardFrontUrl: string;
  selfiePhotoUrl: string;
  idCardNumber: string;
  fullName: string;
}) => {
  try {
    // ตัวอย่างการเรียก iApp API (ต้องมี API key จริง)
    const response = await axios.post('https://api.iapp.co.th/v1/kyc/verify', {
      api_key: process.env.IAPP_API_KEY,
      id_card_image: documents.idCardFrontUrl,
      selfie_image: documents.selfiePhotoUrl,
      id_card_number: documents.idCardNumber,
      full_name: documents.fullName,
      // iApp อาจต้องการพารามิเตอร์เพิ่มเติม
    });
    
    return {
      success: response.data.success,
      score: response.data.confidence_score,
      reasons: response.data.rejection_reasons,
      verification_id: response.data.verification_id
    };
    
  } catch (error) {
    console.error('iApp API Error:', error);
    throw new Error('AI verification failed');
  }
};