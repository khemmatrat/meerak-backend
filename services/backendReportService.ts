// services/backendReportService.ts
import { api } from './api';

export const BackendReportService = {
  getEarningsReport: async (period: 'daily' | 'weekly' | 'monthly', userId?: string) => {
    const response = await api.get('/reports/earnings', {
      params: { period, userId }
    });
    return response.data;
  },

  getJobStatistics: async (filters: any) => {
    const response = await api.get('/reports/jobs', {
      params: filters
    });
    return response.data;
  },

  getUserActivity: async (userId: string, startDate: string, endDate: string) => {
    const response = await api.get('/reports/user-activity', {
      params: { userId, startDate, endDate }
    });
    return response.data;
  },

 getFinancialSummary: async (userId?: string) => {
    // ต้องส่ง userId ไปด้วย
    const params: any = {};
    if (userId) {
      params.userId = userId;
    }
    
    console.log('📊 Fetching financial summary for user:', userId || 'current');
    
    const response = await api.get('/reports/financial-summary', {
      params
    });
    return response.data;
  },

  getDisputeReports: async (status?: string) => {
    const response = await api.get('/reports/disputes', {
      params: { status }
    });
    return response.data;
  },

  exportReport: async (reportType: string, format: 'csv' | 'pdf' | 'excel') => {
    const response = await api.get('/reports/export', {
      params: { reportType, format },
      responseType: 'blob'
    });
    return response.data;
  }
};