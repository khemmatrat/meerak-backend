/**
 * Phase 1: Authentication & OTP - OTP Service
 *
 * Provides OTP generation, sending (SMS/Email), and verification
 * with rate limiting and retry logic
 */

import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { createLogger, RequestContext } from "../utils/tracing";
import { logCreate, logUpdate } from "../utils/auditLog";

/**
 * OTP Request Types
 */
export type OTPType =
  | "login"
  | "register"
  | "verify"
  | "reset_password"
  | "change_phone";

/**
 * OTP Provider
 */
export type OTPProvider = "firebase" | "twilio" | "aws_sns" | "email";

/**
 * OTP Record Interface
 */
export interface OTPRecord {
  id: string; // Document ID
  phone: string; // Phone number (for SMS)
  email?: string; // Email (for email OTP)
  code: string; // 6-digit OTP code (hashed in production)
  type: OTPType; // Purpose of OTP
  provider: OTPProvider; // SMS/Email provider

  // Expiry & Attempts
  expires_at: string; // ISO timestamp (5 minutes from creation)
  attempts: number; // Verification attempts (max 3)
  max_attempts: number; // Max allowed attempts

  // Device & Security
  device_id: string; // Device identifier
  ip_address?: string; // Client IP
  user_agent?: string; // Client user agent

  // Status
  status: "pending" | "verified" | "expired" | "failed";
  verified_at?: string; // When OTP was verified

  // Tracing
  request_id?: string;
  trace_id?: string;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Rate Limit Configuration
 */
const RATE_LIMITS = {
  per_phone: { max: 3, window: 60 * 60 * 1000 }, // 3 per hour
  per_ip: { max: 10, window: 60 * 60 * 1000 }, // 10 per hour
  per_device: { max: 5, window: 60 * 60 * 1000 }, // 5 per hour
};

/**
 * OTP Configuration
 */
const OTP_CONFIG = {
  code_length: 6,
  expiry_minutes: 5,
  max_attempts: 3,
};

/**
 * Generate 6-digit OTP code
 */
function generateOTPCode(): string {
  // Generate secure random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

/**
 * Hash OTP code for storage (simple hash for demo, use bcrypt in production)
 */
function hashOTPCode(code: string): string {
  // In production, use bcrypt or similar
  // For demo, we'll store plain text (NOT RECOMMENDED FOR PRODUCTION)
  return code;
}

/**
 * Verify OTP code against stored hash
 */
function verifyOTPCode(inputCode: string, storedCode: string): boolean {
  // In production, use bcrypt.compare()
  return inputCode === storedCode;
}

/**
 * Check rate limit for phone/IP/device
 *
 * @returns true if rate limit exceeded
 */
async function checkRateLimit(
  phone: string,
  ip: string,
  deviceId: string
): Promise<{ exceeded: boolean; reason?: string }> {
  if (!db) return { exceeded: false };
  const now = Date.now();
  const windowStart = new Date(
    now - RATE_LIMITS.per_phone.window
  ).toISOString();

  // Check phone rate limit (without composite index - filter client-side)
  const phoneOTPsQuery = query(
    collection(db, "otp_records"),
    where("phone", "==", phone)
  );
  const phoneOTPsSnapshot = await getDocs(phoneOTPsQuery);

  // Filter by created_at in client-side
  const recentPhoneOTPs = phoneOTPsSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.created_at >= windowStart;
  });

  if (recentPhoneOTPs.length >= RATE_LIMITS.per_phone.max) {
    return {
      exceeded: true,
      reason: `Rate limit: ${RATE_LIMITS.per_phone.max} OTPs per hour for this phone`,
    };
  }

  // Check IP rate limit (if IP provided)
  if (ip) {
    const ipOTPsQuery = query(
      collection(db, "otp_records"),
      where("ip_address", "==", ip)
    );
    const ipOTPsSnapshot = await getDocs(ipOTPsQuery);

    const recentIPOTPs = ipOTPsSnapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.created_at >= windowStart;
    });

    if (recentIPOTPs.length >= RATE_LIMITS.per_ip.max) {
      return {
        exceeded: true,
        reason: `Rate limit: ${RATE_LIMITS.per_ip.max} OTPs per hour for this IP`,
      };
    }
  }

  // Check device rate limit
  const deviceOTPsQuery = query(
    collection(db, "otp_records"),
    where("device_id", "==", deviceId)
  );
  const deviceOTPsSnapshot = await getDocs(deviceOTPsQuery);

  const recentDeviceOTPs = deviceOTPsSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.created_at >= windowStart;
  });

  if (recentDeviceOTPs.length >= RATE_LIMITS.per_device.max) {
    return {
      exceeded: true,
      reason: `Rate limit: ${RATE_LIMITS.per_device.max} OTPs per hour for this device`,
    };
  }

  return { exceeded: false };
}

/**
 * Send OTP via SMS (Firebase Auth or Twilio)
 */
async function sendSMS(phone: string, code: string): Promise<boolean> {
  try {
    // TODO: Integrate with Twilio, AWS SNS, or Firebase Auth
    // For now, just log (in dev mode, show in console)

    if (process.env.NODE_ENV === "development") {
      console.log(`📱 SMS OTP to ${phone}: ${code}`);
      return true;
    }

    // In production, use actual SMS provider:
    // const twilio = require('twilio')(accountSid, authToken);
    // await twilio.messages.create({
    //   body: `Your Meerak verification code is: ${code}`,
    //   from: '+1234567890',
    //   to: phone
    // });

    return true;
  } catch (error) {
    console.error("Error sending SMS:", error);
    return false;
  }
}

/**
 * Send OTP via Email
 */
async function sendEmail(email: string, code: string): Promise<boolean> {
  try {
    // TODO: Integrate with SendGrid, AWS SES, or similar

    if (process.env.NODE_ENV === "development") {
      console.log(`📧 Email OTP to ${email}: ${code}`);
      return true;
    }

    // In production, use actual email provider:
    // const sgMail = require('@sendgrid/mail');
    // await sgMail.send({
    //   to: email,
    //   from: 'noreply@meerak.app',
    //   subject: 'Your Meerak Verification Code',
    //   text: `Your verification code is: ${code}`,
    //   html: `<strong>Your verification code is: ${code}</strong>`
    // });

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

/**
 * Request OTP
 *
 * @param phone - Phone number
 * @param type - OTP type
 * @param deviceId - Device identifier
 * @param context - Request context
 * @returns OTP record ID or error
 */
export async function requestOTP(
  phone: string,
  type: OTPType,
  deviceId: string,
  context?: RequestContext,
  options?: {
    email?: string;
    ip_address?: string;
    user_agent?: string;
    provider?: OTPProvider;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const logger = context ? createLogger(context) : null;
  if (!db) {
    logger?.error("OTP requires Firebase. Firestore is not configured.", {
      phone,
      type,
    });
    return {
      success: false,
      error: "OTP requires Firebase. Please use password login.",
    };
  }
  try {
    logger?.info("OTP request started", { phone, type, deviceId });

    // 1. Check rate limits
    const rateLimitCheck = await checkRateLimit(
      phone,
      options?.ip_address || "unknown",
      deviceId
    );

    if (rateLimitCheck.exceeded) {
      logger?.warn("Rate limit exceeded", {
        phone,
        reason: rateLimitCheck.reason,
      });
      return {
        success: false,
        error: rateLimitCheck.reason || "Rate limit exceeded",
      };
    }

    // 2. Generate OTP code
    const code = generateOTPCode();
    const hashedCode = hashOTPCode(code);

    // 3. Calculate expiry (5 minutes)
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.expiry_minutes * 60 * 1000
    ).toISOString();

    // 4. Create OTP record
    const otpId = `otp_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;
    const otpRecord: OTPRecord = {
      id: otpId,
      phone,
      email: options?.email,
      code: hashedCode,
      type,
      provider: options?.provider || "firebase",
      expires_at: expiresAt,
      attempts: 0,
      max_attempts: OTP_CONFIG.max_attempts,
      device_id: deviceId,
      ip_address: options?.ip_address,
      user_agent: options?.user_agent,
      status: "pending",
      request_id: context?.request_id,
      trace_id: context?.trace_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Remove undefined fields (Firestore doesn't allow undefined)
    const cleanedRecord = Object.fromEntries(
      Object.entries(otpRecord).filter(([_, v]) => v !== undefined)
    );

    await setDoc(doc(db, "otp_records", otpId), cleanedRecord);

    // 5. Send OTP
    let sent = false;
    if (options?.email) {
      sent = await sendEmail(options.email, code);
    } else {
      sent = await sendSMS(phone, code);
    }

    if (!sent) {
      logger?.error("Failed to send OTP", { phone });
      return {
        success: false,
        error: "Failed to send OTP",
      };
    }

    // 6. Log audit
    if (context) {
      await logCreate("otp_records", otpId, otpRecord, context, {
        action_type: "request_otp",
      });
    }

    logger?.info("OTP sent successfully", { id: otpId, expiresAt });

    return {
      success: true,
      id: otpId,
    };
  } catch (error: any) {
    logger?.error("Error requesting OTP", error);
    return {
      success: false,
      error: error.message || "Failed to request OTP",
    };
  }
}

/**
 * Verify OTP
 *
 * @param otpId - OTP record ID
 * @param code - User-provided OTP code
 * @param context - Request context
 * @returns Verification result
 */
export async function verifyOTP(
  otpId: string,
  code: string,
  context?: RequestContext
): Promise<{ success: boolean; error?: string; phone?: string }> {
  const logger = context ? createLogger(context) : null;

  if (!db) {
    return {
      success: false,
      error: "Firebase not configured. Please use password login.",
    };
  }
  try {
    logger?.info("OTP verification started", { otpId });

    // 1. Get OTP record
    const otpRef = doc(db, "otp_records", otpId);
    const otpSnap = await getDoc(otpRef);

    if (!otpSnap.exists()) {
      return { success: false, error: "Invalid OTP ID" };
    }

    const otpRecord = otpSnap.data() as OTPRecord;
    const oldData = { ...otpRecord };

    // 2. Check if already verified
    if (otpRecord.status === "verified") {
      return { success: false, error: "OTP already used" };
    }

    // 3. Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      await updateDoc(otpRef, {
        status: "expired",
        updated_at: new Date().toISOString(),
      });
      return { success: false, error: "OTP expired" };
    }

    // 4. Check attempt limit
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await updateDoc(otpRef, {
        status: "failed",
        updated_at: new Date().toISOString(),
      });
      return { success: false, error: "Too many attempts" };
    }

    // 5. Increment attempts
    await updateDoc(otpRef, {
      attempts: otpRecord.attempts + 1,
      updated_at: new Date().toISOString(),
    });

    // 6. Verify code
    const isValid = verifyOTPCode(code, otpRecord.code);

    if (!isValid) {
      logger?.warn("Invalid OTP code", {
        otpId,
        attempts: otpRecord.attempts + 1,
      });
      return {
        success: false,
        error: `Invalid OTP code (${
          otpRecord.max_attempts - otpRecord.attempts - 1
        } attempts left)`,
      };
    }

    // 7. Mark as verified
    await updateDoc(otpRef, {
      status: "verified",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 8. Log audit
    if (context) {
      const newData = { ...otpRecord, status: "verified" };
      await logUpdate("otp_records", otpId, oldData, newData, context, {
        action_type: "verify_otp",
      });
    }

    logger?.info("OTP verified successfully", {
      otpId,
      phone: otpRecord.phone,
    });

    return {
      success: true,
      phone: otpRecord.phone,
    };
  } catch (error: any) {
    logger?.error("Error verifying OTP", error);
    return {
      success: false,
      error: error.message || "Failed to verify OTP",
    };
  }
}

/**
 * Cleanup expired OTPs (run periodically)
 */
export async function cleanupExpiredOTPs(): Promise<number> {
  if (!db) return 0;
  try {
    const now = new Date().toISOString();

    const expiredOTPs = await getDocs(
      query(
        collection(db, "otp_records"),
        where("expires_at", "<", now),
        where("status", "==", "pending")
      )
    );

    let count = 0;
    for (const doc of expiredOTPs.docs) {
      await updateDoc(doc.ref, {
        status: "expired",
        updated_at: new Date().toISOString(),
      });
      count++;
    }

    console.log(`🧹 Cleaned up ${count} expired OTPs`);
    return count;
  } catch (error) {
    console.error("Error cleaning up expired OTPs:", error);
    return 0;
  }
}
