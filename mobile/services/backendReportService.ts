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
    const params = typeof filters === 'object' && filters !== null ? filters : { dateRange: filters };
    const { dateRange, userId, role } = params;
    const timeRange = dateRange === 'all' ? 'month' : (dateRange || 'today');
    const userRole = role === 'owner' ? 'client' : (role === 'provider' ? 'provider' : 'client');
    const response = await api.get('/reports/job-stats', {
      params: { userId, userRole, timeRange }
    });
    const data = response.data;
    const stats = data?.statistics || [];
    const summary = data?.summary || {};
    const getCount = (status: string) =>
      Number(stats.find((s: any) => String(s.status).toLowerCase() === status.toLowerCase())?.count || 0);
    return {
      totalJobs: Number(summary.totalJobs) || 0,
      activeJobs: getCount('in_progress') + getCount('accepted') + getCount('open'),
      completedJobs: getCount('completed'),
      cancelledJobs: getCount('cancelled'),
      totalRevenue: Number(summary.totalValue) || 0,
      avgCompletionTime: 0, // Backend does not provide completion time; use 0 as placeholder
      popularCategories: data?.popularCategories || [],
      weeklyTrend: data?.weeklyTrend || [],
      topEmployers: data?.topEmployers || [],
      topProviders: data?.topProviders || [],
    };
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