"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWithAI = void 0;
// functions/src/ai-verification.ts
const axios_1 = __importDefault(require("axios"));
const verifyWithAI = async (documents) => {
    try {
        // ตัวอย่างการเรียก iApp API (ต้องมี API key จริง)
        const response = await axios_1.default.post('https://api.iapp.co.th/v1/kyc/verify', {
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
    }
    catch (error) {
        console.error('iApp API Error:', error);
        throw new Error('AI verification failed');
    }
};
exports.verifyWithAI = verifyWithAI;
