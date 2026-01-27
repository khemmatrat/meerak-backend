// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken } from '../services/firebase.service';
import { UserService } from '../services/user.service';
import { pool } from '../index';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        firebase_uid: string;
        email: string;
        role: 'user' | 'provider' | 'admin';
      };
    }
  }
}

const userService = new UserService(pool);

/**
 * Firebase Authentication Middleware
 * Verify Firebase ID Token และดึงข้อมูล user จาก database
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // ดึง token จาก header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // สำหรับ development: ถ้าไม่มี token ให้ใช้ mock user
      if (process.env.NODE_ENV === 'development' && !authHeader) {
        req.user = {
          id: 'RwCdeFaFMmtjP16BFuZy',
          firebase_uid: 'dev-user-id',
          email: 'test@example.com',
          role: 'user',
        };
        return next();
      }
      
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header' 
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(idToken);

    // ดึงข้อมูล user จาก database
    const user = await userService.getUserProfile(decodedToken.uid);

    if (!user) {
      // ถ้ายังไม่มี user ใน database ให้สร้างใหม่
      const firebaseUser = await import('firebase-admin').then(m => 
        m.default.auth().getUser(decodedToken.uid)
      );

      const newUser = await userService.createUserFromFirebase(
        decodedToken.uid,
        firebaseUser.email || decodedToken.email || '',
        {
          phone: firebaseUser.phoneNumber || undefined,
          fullName: firebaseUser.displayName || undefined,
        }
      );

      req.user = {
        id: newUser.id,
        firebase_uid: newUser.firebase_uid,
        email: newUser.email,
        role: newUser.role,
      };
    } else {
      req.user = {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        role: user.role,
      };
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    // สำหรับ development: fallback to mock user
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: 'RwCdeFaFMmtjP16BFuZy',
        firebase_uid: 'dev-user-id',
        email: 'test@example.com',
        role: 'user',
      };
      return next();
    }

    return res.status(401).json({ 
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Authentication failed' 
    });
  }
};

/**
 * Admin Authentication Middleware
 */
export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ใช้ authenticate ก่อน
  await authenticate(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Admin access only' 
      });
    }
    next();
  });
};

/**
 * Optional Authentication Middleware
 * ไม่บังคับให้ authenticate แต่ถ้ามี token จะ verify
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // ไม่มี token ก็ผ่าน
  }

  // ถ้ามี token ให้ verify
  try {
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyFirebaseToken(idToken);
    const user = await userService.getUserProfile(decodedToken.uid);
    
    if (user) {
      req.user = {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        role: user.role,
      };
    }
  } catch (error) {
    // ถ้า verify ไม่ผ่านก็ไม่เป็นไร (optional)
    console.warn('Optional auth failed:', error);
  }

  next();
};

export const authMiddleware = authenticate;