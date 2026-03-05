// backend/src/routes/auth.routes.ts
import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify', authController.verify);

// Protected routes (require authentication)
router.get('/me', authenticate, authController.me);

export default router;
