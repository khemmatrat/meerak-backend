// backend/src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { WalletService } from '../services/wallet.service';
import { SkillService } from '../services/skill.service';
import { pool } from '../index';

const userService = new UserService(pool);
const walletService = new WalletService(pool);
const skillService = new SkillService(pool);

export const userController = {
  /**
   * GET /api/users/profile/:id
   * ดึง user profile โดย ID หรือ Firebase UID
   */
  getProfile: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = await userService.getUserProfile(id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch profile',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * GET /api/users/profile
   * ดึง profile ของ user ที่ login อยู่
   */
  getMyProfile: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await userService.getUserProfile(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Get my profile error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch profile',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * PATCH /api/users/profile
   * อัพเดท profile ของ user
   */
  updateProfile: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { full_name, phone, avatar_url, location } = req.body;

      const updatedUser = await userService.updateUserProfile(req.user.id, {
        full_name,
        phone,
        avatar_url,
        location,
      });

      res.json({
        success: true,
        user: updatedUser,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ 
        error: 'Failed to update profile',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * GET /api/users/wallet/summary
   * ดึง wallet summary
   */
  getWalletSummary: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const summary = await walletService.getWalletSummary(req.user.id);
      res.json(summary);
    } catch (error) {
      console.error('Get wallet summary error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch wallet summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * POST /api/users/wallet/deposit
   * เพิ่มเงินเข้า wallet
   */
  deposit: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { amount, description, metadata } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const transaction = await walletService.deposit(
        req.user.id,
        amount,
        description || 'Deposit',
        metadata
      );

      res.json({
        success: true,
        transaction,
        message: 'Deposit successful',
      });
    } catch (error) {
      console.error('Deposit error:', error);
      res.status(500).json({ 
        error: 'Failed to process deposit',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * POST /api/users/wallet/withdraw
   * ถอนเงินจาก wallet
   */
  withdraw: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { amount, description, metadata } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const transaction = await walletService.withdraw(
        req.user.id,
        amount,
        description || 'Withdrawal',
        metadata
      );

      res.json({
        success: true,
        transaction,
        message: 'Withdrawal successful',
      });
    } catch (error) {
      console.error('Withdraw error:', error);
      res.status(500).json({ 
        error: 'Failed to process withdrawal',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * GET /api/users/wallet/transactions
   * ดึง transaction history
   */
  getTransactions: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const transactions = await walletService.getTransactionHistory(
        req.user.id,
        limit,
        offset
      );

      res.json(transactions);
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch transactions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * GET /api/users/skills
   * ดึง skills ของ user
   */
  getSkills: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const skills = await skillService.getUserSkills(req.user.id);
      res.json(skills);
    } catch (error) {
      console.error('Get skills error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch skills',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * POST /api/users/skills
   * เพิ่ม skill
   */
  addSkill: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { skill_name, skill_category, certification_id } = req.body;

      if (!skill_name || !skill_category) {
        return res.status(400).json({ 
          error: 'Missing required fields: skill_name, skill_category' 
        });
      }

      const skill = await skillService.addSkill(
        req.user.id,
        skill_name,
        skill_category,
        certification_id
      );

      res.json({
        success: true,
        skill,
        message: 'Skill added successfully',
      });
    } catch (error) {
      console.error('Add skill error:', error);
      res.status(500).json({ 
        error: 'Failed to add skill',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * PUT /api/users/skills/:skillId
   * อัพเดท skill
   */
  updateSkill: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { skillId } = req.params;
      const updates = req.body;

      const skill = await skillService.updateSkill(skillId, req.user.id, updates);

      res.json({
        success: true,
        skill,
        message: 'Skill updated successfully',
      });
    } catch (error) {
      console.error('Update skill error:', error);
      res.status(500).json({ 
        error: 'Failed to update skill',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * DELETE /api/users/skills/:skillId
   * ลบ skill
   */
  removeSkill: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { skillId } = req.params;

      await skillService.removeSkill(skillId, req.user.id);

      res.json({
        success: true,
        message: 'Skill removed successfully',
      });
    } catch (error) {
      console.error('Remove skill error:', error);
      res.status(500).json({ 
        error: 'Failed to remove skill',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * GET /api/users/certifications
   * ดึง certifications ของ user
   */
  getCertifications: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const certifications = await skillService.getUserCertifications(req.user.id);
      res.json(certifications);
    } catch (error) {
      console.error('Get certifications error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch certifications',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * POST /api/users/certifications
   * เพิ่ม certification
   */
  addCertification: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const {
        certification_name,
        certification_type,
        issuer,
        certificate_url,
        issued_date,
        expiry_date,
      } = req.body;

      if (!certification_name || !certification_type || !issuer) {
        return res.status(400).json({ 
          error: 'Missing required fields: certification_name, certification_type, issuer' 
        });
      }

      const certification = await skillService.addCertification(
        req.user.id,
        certification_name,
        certification_type,
        issuer,
        certificate_url,
        issued_date ? new Date(issued_date) : undefined,
        expiry_date ? new Date(expiry_date) : undefined
      );

      res.json({
        success: true,
        certification,
        message: 'Certification added successfully',
      });
    } catch (error) {
      console.error('Add certification error:', error);
      res.status(500).json({ 
        error: 'Failed to add certification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * DELETE /api/users/certifications/:certificationId
   * ลบ certification
   */
  removeCertification: async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { certificationId } = req.params;

      await skillService.removeCertification(certificationId, req.user.id);

      res.json({
        success: true,
        message: 'Certification removed successfully',
      });
    } catch (error) {
      console.error('Remove certification error:', error);
      res.status(500).json({ 
        error: 'Failed to remove certification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
};
