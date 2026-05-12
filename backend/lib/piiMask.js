/**
 * PII scrubbing ก่อนส่งข้อความไป LLM / เก็บใน log การเรียนรู้
 * ไม่แทนที่ข้อความที่เก็บในแชทจริงของลูกค้า — ใช้เฉพาะใน pipeline AI
 */

function maskPiiForLlm(text) {
  if (text == null || typeof text !== 'string') return '';
  let s = text;

  // บัตรเครดิต/เดบิต (ช่วง 13–19 หลัก มีช่องว่างหรือขีด)
  s = s.replace(/\b(?:\d[ \-]*?){13,19}\b/g, '[CARD_MASKED]');

  // เบอร์โทรไทย
  s = s.replace(/\b(?:\+66|0)[\s\-]?\d{1,2}[\s\-]?\d{3}[\s\-]?\d{4}\b/g, '[PHONE_MASKED]');
  s = s.replace(/\b0\d{9}\b/g, '[PHONE_MASKED]');

  // อีเมล
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_MASKED]');

  // รหัสผ่าน / OTP แบบ key=value
  s = s.replace(/(\b(?:password|passwd|รหัสผ่าน|otp|pin)\s*[:=]\s*)\S+/gi, '$1[REDACTED]');

  // เลขประจำตัว 13 หลัก (บัตรประชาชน)
  s = s.replace(/\b\d{1}[\s\-]?\d{4}[\s\-]?\d{5}[\s\-]?\d{2}[\s\-]?\d{1}\b/g, '[NID_MASKED]');

  return s;
}

function maskMessagesArrayForLlm(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({
    ...m,
    message: maskPiiForLlm(m?.message || ''),
  }));
}

export { maskPiiForLlm, maskMessagesArrayForLlm };
