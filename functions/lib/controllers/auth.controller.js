"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_service_1 = require("../services/user.service");
const userService = new user_service_1.UserService();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
class AuthController {
    async register(req, res) {
        try {
            const { email, username, password } = req.body;
            // ตรวจสอบว่ามีผู้ใช้อยู่แล้วหรือไม่
            const existingUser = await userService.findByEmail(email);
            if (existingUser) {
                res.status(400).json({ error: 'User already exists' });
                return;
            }
            // สร้างผู้ใช้ใหม่
            const user = await userService.create({ email, username, password });
            // สร้าง JWT token
            const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.status(201).json({
                message: 'User registered successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role
                },
                token
            });
            return;
        }
        catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Registration failed' });
            return;
        }
    }
    async login(req, res) {
        try {
            const { email, password } = req.body;
            // หาผู้ใช้จาก email
            const user = await userService.findByEmail(email);
            if (!user) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }
            // ตรวจสอบรหัสผ่าน
            const isValidPassword = await userService.validatePassword(password, user.password_hash);
            if (!isValidPassword) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }
            // สร้าง JWT token
            const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({
                message: 'Login successful',
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role
                },
                token
            });
            return;
        }
        catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
            return;
        }
    }
    async getProfile(req, res) {
        try {
            // ดึง userId จาก middleware authentication
            const userId = req.user.userId;
            const user = await userService.findById(userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                created_at: user.created_at
            });
            return;
        }
        catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ error: 'Failed to get profile' });
            return;
        }
    }
}
exports.AuthController = AuthController;
