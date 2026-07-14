"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const config_1 = require("../db/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class UserService {
    async findByEmail(email) {
        const result = await (0, config_1.query)('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    }
    async findById(id) {
        const result = await (0, config_1.query)('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    }
    async create(userData) {
        const { email, username, password } = userData;
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const result = await (0, config_1.query)(`INSERT INTO users (email, username, password_hash) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, username, role, created_at`, [email, username, passwordHash]);
        return result.rows[0];
    }
    async validatePassword(password, hash) {
        return bcryptjs_1.default.compare(password, hash);
    }
    async getAllUsers() {
        const result = await (0, config_1.query)('SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC');
        return result.rows;
    }
}
exports.UserService = UserService;
