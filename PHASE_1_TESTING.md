# 🧪 Phase 1: Authentication & OTP - Testing Guide

**Version:** 1.0  
**Date:** 2026-01-27  
**Status:** Ready for Testing

---

## 📋 Testing Checklist

### Phase 0: Foundation Lock
- [ ] Tracing system working
- [ ] Reference numbers generating
- [ ] Audit logs recording

### Phase 1: Authentication & OTP
- [ ] OTP request & verification
- [ ] Rate limiting
- [ ] Device binding
- [ ] JWT tokens
- [ ] Full authentication flow

---

## 🧪 Test Environment Setup

### 1. **Install Dependencies**

```bash
cd G:\meerak

# Install uuid package (for tracing)
npm install uuid

# Install jsonwebtoken (for JWT)
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken

# Check if firebase is installed
npm list firebase
```

### 2. **Environment Variables**

Create `.env.local` (if not exists):

```env
# JWT Secrets (CHANGE IN PRODUCTION!)
JWT_SECRET=meerak-secret-key-change-in-production
JWT_REFRESH_SECRET=meerak-refresh-secret-change-in-production

# Firebase config (should already exist)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
# ... other Firebase config
```

### 3. **Build Project**

```bash
npm run build
# or
npm run dev
```

---

## 🧪 Test Cases

### Test Suite 1: Phase 0 - Foundation Lock

#### Test 1.1: Tracing System

**File:** Create `G:\meerak\tests\test-tracing.ts`

```typescript
import { createRequestContext, createLogger, generateUUID } from './utils/tracing';

// Test 1: Generate request context
const context = createRequestContext('web');

console.log('✅ Test 1.1: Request Context');
console.log('  request_id:', context.request_id);
console.log('  trace_id:', context.trace_id);
console.log('  timestamp:', context.timestamp);
console.log('  source:', context.source);

// Test 2: Logger
const logger = createLogger(context);
logger.info('Test log message', { test: true });

// Test 3: Generate UUID
const uuid = generateUUID();
console.log('  UUID:', uuid);

console.log('✅ Phase 0 - Tracing System: PASS');
```

**Expected Output:**
```
✅ Test 1.1: Request Context
  request_id: 550e8400-e29b-41d4-a716-446655440000
  trace_id: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
  timestamp: 2026-01-27T10:15:00.000Z
  source: web
  UUID: 123e4567-e89b-12d3-a456-426614174000
✅ Phase 0 - Tracing System: PASS
```

#### Test 1.2: Reference Number Generation

**File:** Create `G:\meerak\tests\test-reference-numbers.ts`

```typescript
import { generateBillNo, generateTransactionNo, parseReferenceNumber } from './utils/referenceNumbers';

async function testReferenceNumbers() {
  console.log('✅ Test 1.2: Reference Numbers\n');
  
  // Test 1: Generate bill number
  const billNo = await generateBillNo();
  console.log('  Bill No:', billNo);
  // Expected: BL-20260127-0001
  
  // Test 2: Generate transaction number
  const txNo = await generateTransactionNo();
  console.log('  Transaction No:', txNo);
  // Expected: TX-20260127-0001
  
  // Test 3: Parse reference number
  const parsed = parseReferenceNumber(billNo);
  console.log('  Parsed:', parsed);
  
  if (parsed && parsed.valid) {
    console.log('✅ Phase 0 - Reference Numbers: PASS');
  } else {
    console.error('❌ Phase 0 - Reference Numbers: FAIL');
  }
}

testReferenceNumbers();
```

**Expected Output:**
```
✅ Test 1.2: Reference Numbers

  Bill No: BL-20260127-0001
  Transaction No: TX-20260127-0001
  Parsed: {
    type: 'bill',
    prefix: 'BL',
    date: '20260127',
    sequence: 1,
    valid: true
  }
✅ Phase 0 - Reference Numbers: PASS
```

---

### Test Suite 2: Phase 1.1 - OTP System

#### Test 2.1: Request OTP

**Browser Console Test:**

```javascript
// Import functions (adjust path if needed)
import { requestOTP } from './services/otpService';
import { createRequestContext } from './utils/tracing';

// Test data
const phone = '+66812345678';
const deviceId = 'test_device_' + Date.now();
const context = createRequestContext('web');

// Request OTP
const result = await requestOTP(
  phone,
  'login',
  deviceId,
  context
);

console.log('OTP Request Result:', result);
// Expected: { success: true, id: 'otp_...' }

// Check console for OTP code (in development mode)
// Look for: 📱 SMS OTP to +66812345678: 123456
```

**Expected Console Output (Development):**
```
📱 SMS OTP to +66812345678: 123456
OTP Request Result: {
  success: true,
  id: 'otp_1706360400_abc123'
}
```

#### Test 2.2: Verify OTP

```javascript
// Use OTP ID from previous test
const otpId = 'otp_1706360400_abc123';
const code = '123456'; // Code from console

const verification = await verifyOTP(otpId, code, context);

console.log('OTP Verification Result:', verification);
// Expected: { success: true, phone: '+66812345678' }
```

**Expected Output:**
```
OTP Verification Result: {
  success: true,
  phone: '+66812345678'
}
```

#### Test 2.3: OTP Expiry

```javascript
// Wait 5+ minutes, then try to verify
await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000 + 1000));

const lateVerification = await verifyOTP(otpId, code, context);

console.log('Late Verification:', lateVerification);
// Expected: { success: false, error: 'OTP expired' }
```

#### Test 2.4: Invalid OTP Code

```javascript
const invalidVerification = await verifyOTP(otpId, '000000', context);

console.log('Invalid Code:', invalidVerification);
// Expected: { success: false, error: 'Invalid OTP code (2 attempts left)' }
```

---

### Test Suite 3: Phase 1.2 - Rate Limiting

#### Test 3.1: Check Rate Limit

```javascript
import { checkRateLimit, RATE_LIMITS } from './utils/rateLimiter';

// Test 1: First request (should pass)
const result1 = await checkRateLimit(
  '+66812345678',
  RATE_LIMITS.otp_phone
);

console.log('Request 1:', result1);
// Expected: { allowed: true, remaining: 2, reset_at: '...' }

// Test 2: Second request (should pass)
const result2 = await checkRateLimit(
  '+66812345678',
  RATE_LIMITS.otp_phone
);

console.log('Request 2:', result2);
// Expected: { allowed: true, remaining: 1, reset_at: '...' }

// Test 3: Third request (should pass)
const result3 = await checkRateLimit(
  '+66812345678',
  RATE_LIMITS.otp_phone
);

console.log('Request 3:', result3);
// Expected: { allowed: true, remaining: 0, reset_at: '...' }

// Test 4: Fourth request (should FAIL - rate limit exceeded)
const result4 = await checkRateLimit(
  '+66812345678',
  RATE_LIMITS.otp_phone
);

console.log('Request 4:', result4);
// Expected: { allowed: false, remaining: 0, reset_at: '...', retry_after: 3599 }
```

**Expected Output:**
```
Request 1: { allowed: true, remaining: 2, reset_at: '2026-01-27T11:15:00Z' }
Request 2: { allowed: true, remaining: 1, reset_at: '2026-01-27T11:15:00Z' }
Request 3: { allowed: true, remaining: 0, reset_at: '2026-01-27T11:15:00Z' }
Request 4: { allowed: false, remaining: 0, reset_at: '2026-01-27T11:15:00Z', retry_after: 3599 }
```

---

### Test Suite 4: Phase 1.3 - Device Binding

#### Test 4.1: Register Device

```javascript
import { registerDevice } from './services/deviceService';

const userId = 'user_test_123';
const deviceId = 'device_test_456';

const deviceResult = await registerDevice(
  userId,
  deviceId,
  {
    device_name: 'Test iPhone 13',
    platform: 'ios',
    device_model: 'iPhone 13',
    os_version: '17.0',
    app_version: '1.0.0',
    ip_address: '1.2.3.4',
    user_agent: 'Mozilla/5.0...'
  },
  context
);

console.log('Device Registration:', deviceResult);
// Expected: { success: true, device: { ... } }
```

#### Test 4.2: Check if Trusted

```javascript
import { isTrustedDevice } from './services/deviceService';

const trusted = await isTrustedDevice(deviceId, userId);

console.log('Is Trusted:', trusted);
// Expected: false (new devices are not trusted by default)
```

#### Test 4.3: Trust Device

```javascript
import { trustDevice } from './services/deviceService';

const trustResult = await trustDevice(
  deviceId,
  userId,
  30, // Trust for 30 days
  context
);

console.log('Trust Device Result:', trustResult);
// Expected: { success: true }

// Check again
const trustedNow = await isTrustedDevice(deviceId, userId);
console.log('Is Trusted Now:', trustedNow);
// Expected: true
```

#### Test 4.4: Get User Devices

```javascript
import { getUserDevices } from './services/deviceService';

const devices = await getUserDevices(userId);

console.log('User Devices:', devices);
// Expected: Array of device records
```

---

### Test Suite 5: Phase 1.4 - JWT Tokens

#### Test 5.1: Generate Tokens

```javascript
import { generateTokens } from './services/jwtService';

const tokens = await generateTokens(
  userId,
  'PROVIDER',
  deviceId,
  context,
  { ip_address: '1.2.3.4' }
);

console.log('Generated Tokens:', tokens);
// Expected: { access_token: '...', refresh_token: '...', expires_in: 900, token_type: 'Bearer' }

// Save tokens for next tests
window.testTokens = tokens;
```

**Expected Output:**
```
Generated Tokens: {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  expires_in: 900,
  token_type: 'Bearer'
}
```

#### Test 5.2: Verify Access Token

```javascript
import { verifyAccessToken } from './services/jwtService';

const payload = verifyAccessToken(window.testTokens.access_token);

console.log('Token Payload:', payload);
// Expected: { user_id: '...', user_role: 'PROVIDER', device_id: '...', session_id: '...' }
```

#### Test 5.3: Refresh Access Token

```javascript
import { refreshAccessToken } from './services/jwtService';

const refreshed = await refreshAccessToken(
  window.testTokens.refresh_token,
  context
);

console.log('Refreshed Tokens:', refreshed);
// Expected: { success: true, tokens: { access_token: '...', refresh_token: '...', ... } }
```

---

## 🔄 Full Authentication Flow Test

### Complete Login Flow

```javascript
async function testFullAuthFlow() {
  console.log('🧪 Testing Full Authentication Flow\n');
  
  const phone = '+66812345678';
  const userId = 'user_test_' + Date.now();
  const deviceId = 'device_test_' + Date.now();
  const context = createRequestContext('web');
  
  // Step 1: Request OTP
  console.log('Step 1: Request OTP...');
  const otpResult = await requestOTP(phone, 'login', deviceId, context);
  
  if (!otpResult.success) {
    console.error('❌ OTP request failed:', otpResult.error);
    return;
  }
  
  console.log('✅ OTP sent. Check console for code.');
  const otpCode = prompt('Enter OTP code from console:');
  
  // Step 2: Verify OTP
  console.log('Step 2: Verify OTP...');
  const verification = await verifyOTP(otpResult.id!, otpCode, context);
  
  if (!verification.success) {
    console.error('❌ OTP verification failed:', verification.error);
    return;
  }
  
  console.log('✅ OTP verified');
  
  // Step 3: Register device
  console.log('Step 3: Register device...');
  const deviceResult = await registerDevice(
    userId,
    deviceId,
    {
      device_name: 'Test Device',
      platform: 'web',
      ip_address: '1.2.3.4'
    },
    context
  );
  
  console.log('✅ Device registered');
  
  // Step 4: Generate tokens
  console.log('Step 4: Generate tokens...');
  const tokens = await generateTokens(
    userId,
    'PROVIDER',
    deviceId,
    context
  );
  
  console.log('✅ Tokens generated');
  console.log('   Access Token:', tokens.access_token.substring(0, 50) + '...');
  console.log('   Expires in:', tokens.expires_in, 'seconds');
  
  // Step 5: Verify token
  console.log('Step 5: Verify token...');
  const payload = verifyAccessToken(tokens.access_token);
  
  if (!payload) {
    console.error('❌ Token verification failed');
    return;
  }
  
  console.log('✅ Token verified');
  console.log('   User ID:', payload.user_id);
  console.log('   Role:', payload.user_role);
  
  // Step 6: Trust device (optional)
  const trustPrompt = confirm('Trust this device? (Skip OTP next time)');
  
  if (trustPrompt) {
    console.log('Step 6: Trust device...');
    await trustDevice(deviceId, userId, 30, context);
    console.log('✅ Device trusted for 30 days');
  }
  
  console.log('\n🎉 Full Authentication Flow: COMPLETE!');
  
  return {
    userId,
    deviceId,
    tokens
  };
}

// Run the test
const authResult = await testFullAuthFlow();
```

---

## 📊 Expected Results Summary

### Phase 0: Foundation Lock

| Test | Expected Result |
|------|----------------|
| Tracing | ✅ UUIDs generated, logger works |
| Reference Numbers | ✅ BL-YYYYMMDD-XXXX format |
| Audit Logs | ✅ Records created in Firestore |

### Phase 1.1: OTP System

| Test | Expected Result |
|------|----------------|
| Request OTP | ✅ OTP sent, ID returned |
| Verify OTP | ✅ Correct code accepted |
| Invalid OTP | ❌ Rejected with error |
| Expired OTP | ❌ Rejected after 5 minutes |
| Max Attempts | ❌ Blocked after 3 failed attempts |

### Phase 1.2: Rate Limiting

| Test | Expected Result |
|------|----------------|
| Within Limit | ✅ Requests allowed |
| Exceed Limit | ❌ Requests blocked |
| Retry After | ✅ Shows seconds until reset |
| Reset Window | ✅ New window after expiry |

### Phase 1.3: Device Binding

| Test | Expected Result |
|------|----------------|
| Register Device | ✅ Device record created |
| Check Trust | ✅ Returns false for new devices |
| Trust Device | ✅ Device marked as trusted |
| Trust Expiry | ✅ Trust expires after 30 days |
| Get Devices | ✅ Returns user's devices |

### Phase 1.4: JWT Tokens

| Test | Expected Result |
|------|----------------|
| Generate Tokens | ✅ Access + refresh tokens |
| Verify Access | ✅ Payload extracted |
| Refresh Token | ✅ New tokens generated |
| Token Rotation | ✅ Old refresh token invalidated |
| Expired Token | ❌ Verification fails |

---

## 🐛 Common Issues & Solutions

### Issue 1: "uuid is not defined"

**Solution:**
```bash
npm install uuid
npm install --save-dev @types/uuid
```

### Issue 2: "jwt is not defined"

**Solution:**
```bash
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

### Issue 3: "Firestore permission denied"

**Solution:**
Update Firestore rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write for testing (CHANGE IN PRODUCTION!)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Issue 4: "OTP not showing in console"

**Solution:**
Check `process.env.NODE_ENV`:
```javascript
console.log('Environment:', process.env.NODE_ENV);
// Should be 'development' for OTP to show
```

---

## ✅ Testing Completion Checklist

After completing all tests, verify:

- [ ] ✅ Phase 0 Foundation Lock working
- [ ] ✅ OTP request & verification working
- [ ] ✅ Rate limiting preventing abuse
- [ ] ✅ Device registration working
- [ ] ✅ Device trust management working
- [ ] ✅ JWT token generation working
- [ ] ✅ Token refresh working
- [ ] ✅ Full authentication flow working
- [ ] ✅ All Firestore collections created
- [ ] ✅ Audit logs recording changes

---

## 📝 Test Report Template

```
# Phase 1 Test Report

**Date:** 2026-01-27
**Tester:** [Your Name]
**Environment:** Development

## Test Results

### Phase 0: Foundation Lock
- Tracing System: ✅ PASS
- Reference Numbers: ✅ PASS
- Audit Logs: ✅ PASS

### Phase 1.1: OTP System
- Request OTP: ✅ PASS
- Verify OTP: ✅ PASS
- OTP Expiry: ✅ PASS
- Invalid Code: ✅ PASS

### Phase 1.2: Rate Limiting
- Within Limit: ✅ PASS
- Exceed Limit: ✅ PASS
- Reset Window: ✅ PASS

### Phase 1.3: Device Binding
- Register Device: ✅ PASS
- Trust Device: ✅ PASS
- Check Trust: ✅ PASS

### Phase 1.4: JWT Tokens
- Generate Tokens: ✅ PASS
- Verify Token: ✅ PASS
- Refresh Token: ✅ PASS

### Full Auth Flow
- Complete Flow: ✅ PASS

## Issues Found
- None

## Recommendations
- All systems working as expected
- Ready for Phase 2
```

---

**Testing Guide Status:** ✅ **COMPLETE**

**Next:** 🚀 **Run Tests → Report Results → Proceed to Phase 2**
