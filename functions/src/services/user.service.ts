import { query } from '../db/config';
import { CreateUserDto, User } from '../models/user.model';
import bcrypt from 'bcryptjs';

export class UserService {
  async findByEmail(email: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  async findById(id: number): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(userData: CreateUserDto): Promise<User> {
    const { email, username, password } = userData;
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO users (email, username, password_hash) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, username, role, created_at`,
      [email, username, passwordHash]
    );
    
    return result.rows[0];
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async getAllUsers(): Promise<User[]> {
    const result = await query(
      'SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }
}