# ⚠️ JWT Service - Browser Compatibility Warning

## Problem

`jsonwebtoken` is a **Node.js library** that cannot run in browsers because it depends on Node.js built-in modules like:
- `util`
- `crypto` 
- `stream`
- `buffer`

## Error You'll See

```
Uncaught TypeError: util.inherits is not a function
```

## Solution

We created **TWO versions** of JWT service:

### 1. `services/jwtService.ts` (Node.js - Backend Only)
- Uses real `jsonwebtoken` library
- Cryptographically signs tokens with secret key
- **ONLY use on backend/server**
- For production API endpoints

### 2. `services/jwtService.browser.ts` (Browser - Frontend)
- Mock implementation using base64 encoding
- **NOT cryptographically secure** - for development/testing only!
- Can run in browsers
- Used by `Login.tsx` and other frontend components

## How It Works

### Frontend (Browser)
```typescript
// Login.tsx
import { generateTokens } from '../services/jwtService.browser';

// Creates mock tokens like:
// "mock_eyJ1c2VyX2lkIjoiMTIzIiwicm9sZSI6IlVTRVIifQ=="
```

### Backend (Node.js)
```typescript
// backend/src/controllers/auth.controller.ts
import { generateTokens } from '../services/jwtService';

// Creates real JWT tokens with signature:
// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIn0.signature"
```

## Security Notes

### Mock Tokens (Browser)
- ❌ **NOT secure** - anyone can decode and modify
- ✅ Only for development/testing
- ✅ Session still stored in Firestore for validation
- Format: `mock_<base64_payload>`

### Real JWT (Backend)
- ✅ Cryptographically signed with secret key
- ✅ Cannot be forged without the secret
- ✅ Use in production
- Format: `<header>.<payload>.<signature>`

## Production Recommendation

For production, you should:

1. **Generate JWT only on backend:**
   ```typescript
   // Backend API endpoint
   POST /api/auth/login
   {
     "phone": "+66812345678",
     "otp": "123456"
   }
   
   Response:
   {
     "access_token": "eyJhbGci...", // Real JWT
     "refresh_token": "eyJhbGci...", 
     "expires_in": 900
   }
   ```

2. **Frontend stores and uses tokens:**
   ```typescript
   // Frontend just stores the token
   localStorage.setItem('access_token', response.access_token);
   
   // And sends it with requests
   headers: {
     'Authorization': `Bearer ${access_token}`
   }
   ```

3. **Backend validates tokens:**
   ```typescript
   // Backend middleware
   import jwt from 'jsonwebtoken';
   
   const decoded = jwt.verify(token, SECRET_KEY);
   ```

## Current Setup (Development)

Right now for **Phase 1 testing**, we use:
- Frontend: `jwtService.browser.ts` (mock tokens)
- Backend: Not yet implemented

This allows us to test the authentication flow without a full backend setup.

## Next Steps

When implementing backend in Phase 2+:
1. Create backend API endpoints for:
   - `POST /api/auth/otp/request`
   - `POST /api/auth/otp/verify`
   - `POST /api/auth/refresh`
   - `POST /api/auth/logout`

2. Move JWT generation to backend

3. Frontend calls backend APIs instead of using mock tokens

4. Update `Login.tsx` to call backend APIs

## Files Reference

- ✅ `services/jwtService.browser.ts` - Browser-safe mock implementation
- ⚠️ `services/jwtService.ts` - Node.js real implementation (backend only)
- 📝 `pages/Login.tsx` - Uses `.browser` version
- 📝 `PHASE_1_COMPLETE.md` - Documentation

## Testing

You can test right now with:
```bash
npm run dev
```

Then:
1. Go to http://localhost:5173/login
2. Enter phone number
3. Check console for OTP code
4. Enter OTP
5. Login with mock tokens! ✅

The mock tokens work for development because:
- Session is validated in Firestore
- Token expiry is checked
- Refresh token rotation works
- Device binding works

## Summary

| Feature | Browser Mock | Backend Real |
|---------|-------------|--------------|
| Can run in browser | ✅ Yes | ❌ No |
| Cryptographic security | ❌ No | ✅ Yes |
| Base64 encoding | ✅ Yes | ✅ Yes |
| Signature verification | ❌ No | ✅ Yes |
| For development | ✅ Yes | ✅ Yes |
| For production | ❌ No | ✅ Yes |

---

**Remember:** Always use backend-generated JWT in production! 🔐
