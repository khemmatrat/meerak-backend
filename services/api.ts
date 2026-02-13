// Simple API service — ใช้ backend URL ชุดเดียวกับ platform (Bob/Anna เห็นงานเดียวกัน)
import axios from 'axios';

const getBackendBase = () =>
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_BACKEND_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) ||
  "http://localhost:3001";

const api = axios.create({
  baseURL: `${getBackendBase()}/api`,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('meerak_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Centralized 429 (Rate Limit) handling — attach retry_after for Smart Retry UI
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('meerak_token');
      window.location.href = '/login';
    }
    if (error.response?.status === 429) {
      const data = error.response?.data || {};
      const retryAfter = data.retry_after ?? error.response?.headers?.['retry-after'];
      (error as any).retry_after = Math.max(1, Math.ceil(Number(retryAfter) || 60));
      (error as any).isRateLimit = true;
      (error as any).message = data.message || `Too many attempts. Try again in ${(error as any).retry_after} seconds.`;
    }
    return Promise.reject(error);
  }
);

export { api };
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/meerak-project/us-central1/api';

// Types
export interface User {
  id: number;
  email: string;
  username: string;
  name?: string;
  phone?: string;
  role: string;
  created_at?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export class ApiService {
  private static async request<T>(
    endpoint: string, 
    method: string = 'GET', 
    data?: any
  ): Promise<T> {
    const token = localStorage.getItem('meerak_token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    console.log(`API ${method} ${endpoint}`, data);

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error ${response.status}:`, errorText);
      
      if (response.status === 401) {
        localStorage.removeItem('meerak_token');
        localStorage.removeItem('meerak_user_id');
        window.location.href = '/login';
      }
      
      let errorMessage = 'Request failed';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth endpoints
  static async login(email: string, password: string): Promise<AuthResponse> {
    return this.request('/auth/login', 'POST', { email, password });
  }

  static async register(
    email: string, 
    username: string, 
    password: string, 
    name?: string, 
    phone?: string
  ): Promise<AuthResponse> {
    return this.request('/auth/register', 'POST', { 
      email, 
      username, 
      password, 
      name, 
      phone 
    });
  }

  static async getProfile(): Promise<User> {
    return this.request('/auth/profile');
  }

  static async logout() {
    localStorage.removeItem('meerak_token');
    localStorage.removeItem('meerak_user_id');
  }

  // Admin endpoints
  static async getAllUsers(): Promise<User[]> {
    return this.request('/admin/users');
  }
}

// For backward compatibility
export const authAPI = {
  login: ApiService.login,
  register: ApiService.register,
  getProfile: ApiService.getProfile,
  logout: ApiService.logout,
};

export default ApiService;