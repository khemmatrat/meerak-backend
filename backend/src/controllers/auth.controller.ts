// backend/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { verifyFirebaseToken, getFirebaseUser } from '../services/firebase.service';
import { pool } from '../index';

const userService = new UserService(pool);

export const authController = {
  /**
   * POST /api/auth/register
   * สมัครสมาชิกใหม่ (สร้าง user ใน PostgreSQL จาก Firebase UID)
   */
  register: async (req: Request, res: Response) => {
    try {
      const { idToken, phone, fullName, role } = req.body;

      if (!idToken) {
        return res.status(400).json({ 
          error: 'Missing idToken',
          message: 'Firebase ID token is required' 
        });
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email || '';

      // ตรวจสอบว่ามี user อยู่แล้วหรือไม่
      const existingUser = await userService.getUserProfile(firebaseUid);

      if (existingUser) {
        return res.status(409).json({ 
          error: 'User already exists',
          user: existingUser 
        });
      }

      // สร้าง user ใหม่
      const newUser = await userService.createUserFromFirebase(
        firebaseUid,
        email,
        {
          phone,
          fullName,
          role: role || 'user',
        }
      );

      res.status(201).json({
        success: true,
        user: newUser,
        message: 'Registration successful',
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * POST /api/auth/login
   * เข้าสู่ระบบ (verify Firebase token และ return user data)
   */
  login: async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({ 
          error: 'Missing idToken',
          message: 'Firebase ID token is required' 
        });
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      const firebaseUid = decodedToken.uid;

      // ดึงข้อมูล user จาก database
      let user = await userService.getUserProfile(firebaseUid);

      // ถ้ายังไม่มี user ใน database ให้สร้างใหม่
      if (!user) {
        const firebaseUser = await getFirebaseUser(firebaseUid);

        user = await userService.createUserFromFirebase(
          firebaseUid,
          firebaseUser.email || decodedToken.email || '',
          {
            phone: firebaseUser.phoneNumber || undefined,
            fullName: firebaseUser.displayName || undefined,
          }
        );
      }

      res.json({
        success: true,
        user,
        message: 'Login successful',
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({ 
        error: 'Login failed',
        message: error instanceof Error ? error.message : 'Invalid token'
      });
    }
  },

  /**
   * POST /api/auth/verify
   * Verify Firebase token และ return user data
   */
  verify: async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Missing authorization header' 
        });
      }

      const idToken = authHeader.split('Bearer ')[1];

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      const firebaseUid = decodedToken.uid;

      // ดึงข้อมูล user จาก database
      const user = await userService.getUserProfile(firebaseUid);

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found',
          message: 'Please register first' 
        });
      }

      res.json({
        success: true,
        user,
        token: decodedToken,
      });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(401).json({ 
        error: 'Verification failed',
        message: error instanceof Error ? error.message : 'Invalid token'
      });
    }
  },

  /**
   * GET /api/auth/me
   * ดึงข้อมูล user ที่ login อยู่ (ต้องผ่าน authenticate middleware)
   */
  me: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await userService.getUserProfile(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch user data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
};
