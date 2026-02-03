# 🚀 Phase 0 & Phase 1 - Quick Start Guide

**Ready to Test:** Phase 0 (Foundation Lock) + Phase 1 (Authentication & OTP)

---

## ⚡ Quick Setup (5 Minutes)

### 1. **Install Dependencies**

```bash
cd G:\meerak

# Install required packages
npm install uuid jsonwebtoken
npm install --save-dev @types/uuid @types/jsonwebtoken

# Verify installation
npm list uuid jsonwebtoken
```

### 2. **Check Firebase Connection**

Open browser console (`F12`) and run:

```javascript
// Check if Firebase is connected
import { db } from './services/firebase';
console.log('Firebase connected:', db ? '✅' : '❌');
```

### 3. **Quick Test - Run in Browser Console**

#### Test 1: Generate Reference Number

```javascript
// Import function
const { generateBillNo } = await import('./utils/referenceNumbers.js');

// Generate bill number
const billNo = await generateBillNo();
console.log('Bill Number:', billNo);
// Expected: BL-20260127-0001
```

#### Test 2: Request OTP

```javascript
// Import functions
const { requestOTP } = await import('./services/otpService.js');
const { createRequestContext } = await import('./utils/tracing.js');

// Setup
const phone = '+66812345678';
const deviceId = 'test_' + Date.now();
const context = createRequestContext('web');

// Request OTP
const result = await requestOTP(phone, 'login', deviceId, context);
console.log('OTP Result:', result);

// Look for OTP code in console:
// 📱 SMS OTP to +66812345678: 123456
```

#### Test 3: Verify OTP

```javascript
// Import function
const { verifyOTP } = await import('./services/otpService.js');

// Get OTP ID from previous test
const otpId = result.id;
const code = '123456'; // From console output

// Verify
const verification = await verifyOTP(otpId, code, context);
console.log('Verification:', verification);
// Expected: { success: true, phone: '+66812345678' }
```

#### Test 4: Generate JWT Tokens

```javascript
// Import function
const { generateTokens } = await import('./services/jwtService.js');

// Generate tokens
const tokens = await generateTokens(
  'user_123',
  'PROVIDER',
  deviceId,
  context
);

console.log('Access Token:', tokens.access_token.substring(0, 50) + '...');
console.log('Expires in:', tokens.expires_in, 'seconds');
// Expected: Token starting with 'eyJhbGciOiJI...'
```

---

## 🧪 Full Authentication Flow Test (1-Click)

Copy and paste this into browser console:

```javascript
// === COMPLETE AUTHENTICATION FLOW TEST ===
(async function testAuth() {
  console.log('🧪 Starting Authentication Flow Test\n');
  
  try {
    // Import all needed functions
    const { requestOTP, verifyOTP } = await import('./services/otpService.js');
    const { registerDevice, trustDevice } = await import('./services/deviceService.js');
    const { generateTokens, verifyAccessToken } = await import('./services/jwtService.js');
    const { createRequestContext } = await import('./utils/tracing.js');
    
    // Setup
    const phone = '+66' + Math.floor(Math.random() * 1000000000);
    const userId = 'user_test_' + Date.now();
    const deviceId = 'device_test_' + Date.now();
    const context = createRequestContext('web');
    
    console.log('📱 Phone:', phone);
    console.log('👤 User ID:', userId);
    console.log('📱 Device ID:', deviceId);
    console.log('');
    
    // Step 1: Request OTP
    console.log('Step 1: Requesting OTP...');
    const otpResult = await requestOTP(phone, 'login', deviceId, context);
    
    if (!otpResult.success) {
      throw new Error('OTP request failed: ' + otpResult.error);
    }
    
    console.log('✅ OTP sent (ID:', otpResult.id, ')');
    console.log('📱 Check console for OTP code\n');
    
    // Extract OTP code from console logs
    // Look for the line: 📱 SMS OTP to +66... : 123456
    const otpCode = prompt('Enter OTP code from console:');
    
    if (!otpCode) {
      throw new Error('OTP code required');
    }
    
    // Step 2: Verify OTP
    console.log('Step 2: Verifying OTP...');
    const verification = await verifyOTP(otpResult.id, otpCode, context);
    
    if (!verification.success) {
      throw new Error('OTP verification failed: ' + verification.error);
    }
    
    console.log('✅ OTP verified\n');
    
    // Step 3: Register device
    console.log('Step 3: Registering device...');
    const deviceResult = await registerDevice(
      userId,
      deviceId,
      {
        device_name: 'Test Browser',
        platform: 'web',
        app_version: '1.0.0',
        ip_address: '127.0.0.1',
        user_agent: navigator.userAgent
      },
      context
    );
    
    if (!deviceResult.success) {
      throw new Error('Device registration failed: ' + deviceResult.error);
    }
    
    console.log('✅ Device registered\n');
    
    // Step 4: Generate tokens
    console.log('Step 4: Generating JWT tokens...');
    const tokens = await generateTokens(
      userId,
      'PROVIDER',
      deviceId,
      context,
      { ip_address: '127.0.0.1' }
    );
    
    console.log('✅ Tokens generated');
    console.log('   Access Token:', tokens.access_token.substring(0, 50) + '...');
    console.log('   Refresh Token:', tokens.refresh_token.substring(0, 50) + '...');
    console.log('   Expires in:', tokens.expires_in, 'seconds\n');
    
    // Step 5: Verify access token
    console.log('Step 5: Verifying access token...');
    const payload = verifyAccessToken(tokens.access_token);
    
    if (!payload) {
      throw new Error('Token verification failed');
    }
    
    console.log('✅ Token verified');
    console.log('   User ID:', payload.user_id);
    console.log('   Role:', payload.user_role);
    console.log('   Device ID:', payload.device_id);
    console.log('   Session ID:', payload.session_id);
    console.log('');
    
    // Step 6: Trust device (optional)
    const shouldTrust = confirm('🔒 Trust this device? (Skip OTP next time)');
    
    if (shouldTrust) {
      console.log('Step 6: Trusting device...');
      const trustResult = await trustDevice(deviceId, userId, 30, context);
      
      if (trustResult.success) {
        console.log('✅ Device trusted for 30 days\n');
      }
    }
    
    // Final Summary
    console.log('');
    console.log('═════════════════════════════════════');
    console.log('🎉 AUTHENTICATION FLOW: SUCCESS!');
    console.log('═════════════════════════════════════');
    console.log('');
    console.log('✅ All steps completed:');
    console.log('  1. ✅ OTP requested');
    console.log('  2. ✅ OTP verified');
    console.log('  3. ✅ Device registered');
    console.log('  4. ✅ Tokens generated');
    console.log('  5. ✅ Token verified');
    if (shouldTrust) {
      console.log('  6. ✅ Device trusted');
    }
    console.log('');
    console.log('📦 Test Data:');
    console.log('  Phone:', phone);
    console.log('  User ID:', userId);
    console.log('  Device ID:', deviceId);
    console.log('');
    console.log('🎯 Next Steps:');
    console.log('  - Check Firestore collections (otp_records, devices, sessions)');
    console.log('  - Test rate limiting (try 4+ OTP requests)');
    console.log('  - Test token refresh');
    console.log('');
    
    return {
      phone,
      userId,
      deviceId,
      tokens
    };
    
  } catch (error) {
    console.error('');
    console.error('═════════════════════════════════════');
    console.error('❌ AUTHENTICATION FLOW: FAILED!');
    console.error('═════════════════════════════════════');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    console.error('');
    
    throw error;
  }
})();
```

**Expected Result:**
```
🧪 Starting Authentication Flow Test

📱 Phone: +66123456789
👤 User ID: user_test_1706360400000
📱 Device ID: device_test_1706360400000

Step 1: Requesting OTP...
✅ OTP sent (ID: otp_1706360400_abc123)
📱 Check console for OTP code

[User enters code from console]

Step 2: Verifying OTP...
✅ OTP verified

Step 3: Registering device...
✅ Device registered

Step 4: Generating JWT tokens...
✅ Tokens generated
   Access Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Refresh Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Expires in: 900 seconds

Step 5: Verifying access token...
✅ Token verified
   User ID: user_test_1706360400000
   Role: PROVIDER
   Device ID: device_test_1706360400000
   Session ID: session_1706360400_xyz789

═════════════════════════════════════
🎉 AUTHENTICATION FLOW: SUCCESS!
═════════════════════════════════════

✅ All steps completed:
  1. ✅ OTP requested
  2. ✅ OTP verified
  3. ✅ Device registered
  4. ✅ Tokens generated
  5. ✅ Token verified
  6. ✅ Device trusted

📦 Test Data:
  Phone: +66123456789
  User ID: user_test_1706360400000
  Device ID: device_test_1706360400000

🎯 Next Steps:
  - Check Firestore collections
  - Test rate limiting
  - Test token refresh
```

---

## 🔍 Verify in Firebase Console

### Check Firestore Collections

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to Firestore Database
4. Check these collections:

#### ✅ `otp_records`
```
Document ID: otp_1706360400_abc123
Fields:
  - phone: "+66123456789"
  - code: "123456"
  - type: "login"
  - status: "verified"
  - expires_at: "2026-01-27T10:20:00Z"
  - created_at: "2026-01-27T10:15:00Z"
```

#### ✅ `devices`
```
Document ID: device_test_1706360400000
Fields:
  - user_id: "user_test_1706360400000"
  - device_name: "Test Browser"
  - platform: "web"
  - is_trusted: true
  - first_login: "2026-01-27T10:15:00Z"
  - last_login: "2026-01-27T10:15:00Z"
```

#### ✅ `sessions`
```
Document ID: session_1706360400_xyz789
Fields:
  - user_id: "user_test_1706360400000"
  - device_id: "device_test_1706360400000"
  - is_active: true
  - expires_at: "2026-02-26T10:15:00Z"
```

#### ✅ `rate_limits`
```
Document ID: otp_phone:+66123456789
Fields:
  - count: 1
  - window_start: "2026-01-27T10:00:00Z"
  - last_request: "2026-01-27T10:15:00Z"
```

#### ✅ `audit_logs`
```
Multiple documents with operations:
  - CREATE otp_records
  - UPDATE otp_records (verification)
  - CREATE devices
  - UPDATE devices (trust)
  - CREATE sessions
```

---

## 📊 Quick Health Check

Run this to check all systems:

```javascript
(async function healthCheck() {
  console.log('🏥 System Health Check\n');
  
  const results = {
    firebase: false,
    tracing: false,
    referenceNumbers: false,
    otp: false,
    rateLimiting: false,
    devices: false,
    jwt: false
  };
  
  try {
    // Check Firebase
    const { db } = await import('./services/firebase.js');
    results.firebase = !!db;
    console.log('Firebase:', results.firebase ? '✅' : '❌');
    
    // Check Tracing
    const { generateUUID } = await import('./utils/tracing.js');
    const uuid = generateUUID();
    results.tracing = uuid && uuid.length > 0;
    console.log('Tracing:', results.tracing ? '✅' : '❌');
    
    // Check Reference Numbers
    const { generateBillNo } = await import('./utils/referenceNumbers.js');
    const billNo = await generateBillNo();
    results.referenceNumbers = billNo && billNo.startsWith('BL-');
    console.log('Reference Numbers:', results.referenceNumbers ? '✅' : '❌');
    
    // Check OTP Service
    const { requestOTP } = await import('./services/otpService.js');
    results.otp = typeof requestOTP === 'function';
    console.log('OTP Service:', results.otp ? '✅' : '❌');
    
    // Check Rate Limiting
    const { checkRateLimit } = await import('./utils/rateLimiter.js');
    results.rateLimiting = typeof checkRateLimit === 'function';
    console.log('Rate Limiting:', results.rateLimiting ? '✅' : '❌');
    
    // Check Device Service
    const { registerDevice } = await import('./services/deviceService.js');
    results.devices = typeof registerDevice === 'function';
    console.log('Device Service:', results.devices ? '✅' : '❌');
    
    // Check JWT Service
    const { generateTokens } = await import('./services/jwtService.js');
    results.jwt = typeof generateTokens === 'function';
    console.log('JWT Service:', results.jwt ? '✅' : '❌');
    
    console.log('\n═══════════════════════════════════');
    const allGood = Object.values(results).every(r => r);
    console.log(allGood ? '🎉 ALL SYSTEMS GO!' : '⚠️ SOME SYSTEMS DOWN');
    console.log('═══════════════════════════════════\n');
    
    return results;
    
  } catch (error) {
    console.error('❌ Health Check Failed:', error);
    return results;
  }
})();
```

---

## 🐛 Troubleshooting

### Issue: "Module not found"

**Fix:**
```bash
# Make sure all dependencies are installed
npm install

# Check if modules exist
ls utils/
ls services/
```

### Issue: "Firebase not initialized"

**Fix:**
Check `.env.local` has Firebase config:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
# ... other Firebase config
```

### Issue: "OTP code not showing"

**Fix:**
```javascript
// Check environment
console.log('Environment:', process.env.NODE_ENV);

// Should be 'development' for OTP to show in console
```

### Issue: "jwt is not defined"

**Fix:**
```bash
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

---

## ✅ Quick Success Checklist

After running the quick test:

- [ ] ✅ Firebase connected
- [ ] ✅ Bill number generated (BL-YYYYMMDD-XXXX)
- [ ] ✅ OTP sent (code in console)
- [ ] ✅ OTP verified successfully
- [ ] ✅ Device registered
- [ ] ✅ Tokens generated
- [ ] ✅ Token verified
- [ ] ✅ Firestore collections created

**If all checked:** 🎉 **Phase 0 & 1 are working!**

---

## 📝 Quick Report

```
Phase 0 & 1 - Test Report
Date: 2026-01-27
Status: ✅ PASS

✅ Foundation Lock (Phase 0)
  - Tracing System: Working
  - Reference Numbers: Working
  - Audit Logs: Working

✅ Authentication & OTP (Phase 1)
  - OTP System: Working
  - Rate Limiting: Working
  - Device Binding: Working
  - JWT Tokens: Working

Ready for: Phase 2 (KYC System)
```

---

**Next Steps:**
1. ✅ Run Quick Test (5 minutes)
2. ✅ Verify in Firebase Console
3. ✅ Run Health Check
4. 🚀 **Ready for Phase 2!**
