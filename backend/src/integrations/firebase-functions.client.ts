// backend/src/integrations/firebase-functions.client.ts
// Integration layer สำหรับเรียก Firebase Functions

import axios, { AxiosInstance } from 'axios';

export interface FirebaseFunctionsConfig {
  functionsUrl?: string;
  projectId?: string;
  region?: string;
}

export interface KYCSubmissionResult {
  success: boolean;
  message: string;
  steps: string[];
  ai_verification?: {
    passed: boolean;
    score: number;
    status: string;
  };
  background_check?: {
    passed: boolean;
    risk_level: string;
  };
  postgres_saved: boolean;
  postgres_id?: string;
  next_step: string;
  estimated_time: string;
}

export interface KYCStatusResult {
  firestore: {
    kyc_status: string;
    kyc_level: string;
    submitted_at: string | null;
    steps_completed: number;
    is_verified: boolean;
    ai_score: number;
    background_check: any;
  };
  postgresql: {
    id: string;
    kyc_status: string;
    kyc_level: string;
    ai_score: number;
    submitted_at: Date;
    background_check_passed: boolean;
    background_check_risk_level: string;
  } | null;
  sync_status: {
    has_postgres_data: boolean;
    databases_synced: boolean;
    timestamp: string;
  };
}

export class FirebaseFunctionsClient {
  private httpClient: AxiosInstance;
  private functionsUrl: string;
  private projectId: string;

  constructor(config?: FirebaseFunctionsConfig) {
    this.projectId = config?.projectId || process.env.FIREBASE_PROJECT_ID || 'meerak-b43ac';
    const region = config?.region || process.env.FIREBASE_FUNCTIONS_REGION || 'asia-southeast1';
    
    // สำหรับ production ใช้ deployed URL
    // สำหรับ development ใช้ emulator หรือ deployed URL
    this.functionsUrl = config?.functionsUrl || 
      process.env.FIREBASE_FUNCTIONS_URL ||
      `https://${region}-${this.projectId}.cloudfunctions.net`;

    this.httpClient = axios.create({
      baseURL: this.functionsUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * เรียก Firebase Callable Function
   * สำหรับ callable functions ต้องใช้ Firebase SDK ใน frontend
   * แต่เราสามารถเรียกผ่าน HTTP endpoint ได้ถ้า Functions expose HTTP endpoint
   */
  private async callCallableFunction(
    functionName: string,
    data: any,
    idToken?: string
  ): Promise<any> {
    try {
      // ถ้า Functions expose HTTP endpoint
      const response = await this.httpClient.post(
        `/api/callable/${functionName}`,
        { data },
        {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Firebase Functions callable error (${functionName}):`, error);
      throw new Error(
        `Failed to call Firebase Function ${functionName}: ${error.message}`
      );
    }
  }

  /**
   * Submit KYC Documents
   * เรียก submitKYC callable function
   */
  async submitKYC(
    idToken: string,
    kycData: {
      fullName: string;
      birthDate: string;
      idCardNumber: string;
      idCardFront?: string;
      idCardBack?: string;
      selfiePhoto?: string;
      drivingLicenseFront?: string;
      drivingLicenseBack?: string;
    }
  ): Promise<KYCSubmissionResult> {
    try {
      // เรียกผ่าน HTTP endpoint ถ้ามี หรือใช้ callable
      const response = await this.httpClient.post(
        '/api/kyc/submit',
        kycData,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Submit KYC error:', error);
      throw new Error(`Failed to submit KYC: ${error.message}`);
    }
  }

  /**
   * Check KYC Status
   * เรียก checkKYCStatus callable function
   */
  async checkKYCStatus(idToken: string): Promise<KYCStatusResult> {
    try {
      const response = await this.httpClient.get('/api/kyc/status', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return response.data;
    } catch (error: any) {
      console.error('Check KYC status error:', error);
      throw new Error(`Failed to check KYC status: ${error.message}`);
    }
  }

  /**
   * Verify KYC with AI
   * เรียก verifyKYCWithAI callable function
   */
  async verifyKYCWithAI(idToken: string): Promise<{
    success: boolean;
    ai_result: any;
    new_status: string;
    message: string;
    postgres_updated: boolean;
  }> {
    try {
      const response = await this.httpClient.post(
        '/api/kyc/verify/ai',
        {},
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Verify KYC with AI error:', error);
      throw new Error(`Failed to verify KYC with AI: ${error.message}`);
    }
  }

  /**
   * Get PostgreSQL Health Check
   */
  async getPostgresHealth(idToken: string): Promise<{
    database: string;
    status: string;
    latency_ms: number;
    timestamp: string;
  }> {
    try {
      const response = await this.httpClient.get('/api/postgres/health', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return response.data;
    } catch (error: any) {
      console.error('PostgreSQL health check error:', error);
      throw new Error(`Failed to check PostgreSQL health: ${error.message}`);
    }
  }

  /**
   * Sync User Data to PostgreSQL
   */
  async syncUserToPostgres(idToken: string): Promise<{
    success: boolean;
    message: string;
    postgresId: string;
    firebaseUid: string;
  }> {
    try {
      const response = await this.httpClient.post(
        '/api/postgres/sync-user',
        {},
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Sync user to PostgreSQL error:', error);
      throw new Error(`Failed to sync user to PostgreSQL: ${error.message}`);
    }
  }

  /**
   * Get User Data from PostgreSQL
   */
  async getUserDataFromPostgres(idToken: string): Promise<{
    success: boolean;
    data: any;
  }> {
    try {
      const response = await this.httpClient.get('/api/postgres/user-data', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return response.data;
    } catch (error: any) {
      console.error('Get user data from PostgreSQL error:', error);
      throw new Error(`Failed to get user data from PostgreSQL: ${error.message}`);
    }
  }

  /**
   * Create Transaction (via Functions)
   */
  async createTransaction(
    idToken: string,
    transactionData: {
      amount: number;
      type: 'deposit' | 'withdraw' | 'transfer' | 'payment';
      description?: string;
    }
  ): Promise<{
    success: boolean;
    transaction_id: string;
    amount: number;
    type: string;
    timestamp: string;
  }> {
    try {
      const response = await this.httpClient.post(
        '/api/transactions/create',
        transactionData,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Create transaction error:', error);
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }
}

// Singleton instance
let functionsClient: FirebaseFunctionsClient | null = null;

export function getFirebaseFunctionsClient(): FirebaseFunctionsClient {
  if (!functionsClient) {
    functionsClient = new FirebaseFunctionsClient();
  }
  return functionsClient;
}

export default FirebaseFunctionsClient;
