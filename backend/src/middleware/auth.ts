// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // สำหรับ development ให้ mock authentication
  // ใน production ควรใช้ JWT หรือ session
  req.user = { 
    id: 'RwCdeFaFMmtjP16BFuZy', // Mock user ID
    email: 'test@example.com' 
  };
  next();
};