// backend/src/middleware/admin.ts
import { Request, Response, NextFunction } from 'express';

export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ใช้ร่วมกับ authenticate (mock)
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // DEV MODE: mock ให้ user เป็น admin
  // ภายหลังค่อยเช็ค role จริงจาก DB / JWT
  if (req.user.role && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }

  next();
};
