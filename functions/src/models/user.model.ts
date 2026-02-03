export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: Date;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}