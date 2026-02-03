// src/components/JobCounter.tsx
import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  BarChart3,
  Calendar,
  MapPin,
  Activity
} from 'lucide-react';
import { JobStatistics, JobStatus } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { MockApi } from '../services/mockApi';

interface JobCounterProps {
  refreshInterval?: number; // in seconds
  showCharts?: boolean;
  compact?: boolean;
}

const JobCounter: React.FC<JobCounterProps> = ({
  refreshInterval = 30,
  showCharts = true,
  compact = false
}) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<JobStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Fetch statistics
  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await MockApi.getJobStatistics(timeRange);
      setStats(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Failed to fetch job statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [timeRange]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchStats, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, timeRange]);

  if (loading && !stats) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <AlertTriangle className="text-yellow-500 mx-auto mb-4" size={48} />
        <p className="text-gray-900 font-bold mb-2">No Statistics Available</p>
        <p className="text-gray-600">Failed to load job statistics</p>
      </div>
    );
  }

  // Stat cards data
  const statCards = [
    {
      title: 'Total Jobs',
      value: stats.totalJobs,
      icon: <Briefcase className="text-blue-500" size={20} />,
      color: 'bg-blue-50 border-blue-100',
      textColor: 'text-blue-700',
      change: '+12%',
      trend: 'up'
    },
    {
      title: 'Active Jobs',
      value: stats.activeJobs,
      icon: <Activity className="text-green-500" size={20} />,
      color: 'bg-green-50 border-green-100',
      textColor: 'text-green-700',
      change: '+5%',
      trend: 'up'
    },
    {
      title: 'Completed Jobs',
      value: stats.completedJobs,
      icon: <CheckCircle className="text-emerald-500" size={20} />,
      color: 'bg-emerald-50 border-emerald-100',
      textColor: 'text-emerald-700',
      change: '+8%',
      trend: 'up'
    },
    {
      title: 'Cancelled Jobs',
      value: stats.cancelledJobs,
      icon: <XCircle className="text-red-500" size={20} />,
      color: 'bg-red-50 border-red-100',
      textColor: 'text-red-700',
      change: '-3%',
      trend: 'down'
    },
    {
      title: 'Total Revenue',
      value: `฿${stats.totalRevenue.toLocaleString()}`,
      icon: <DollarSign className="text-purple-500" size={20} />,
      color: 'bg-purple-50 border-purple-100',
      textColor: 'text-purple-700',
      change: '+15%',
      trend: 'up'
    },
    {
      title: 'Avg Completion',
      value: `${stats.avgCompletionTime.toFixed(1)}h`,
      icon: <Clock className="text-amber-500" size={20} />,
      color: 'bg-amber-50 border-amber-100',
      textColor: 'text-amber-700',
      change: '-10%',
      trend: 'down'
    }
  ];

  // Calculate completion rate
  const completionRate = stats.totalJobs > 0 
    ? ((stats.completedJobs / stats.totalJobs) * 100).toFixed(1)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <BarChart3 size={20} className="mr-2 text-emerald-600" />
              Job Statistics Dashboard
            </h3>
            <p className="text-sm text-gray-500">
              Real-time monitoring of job activities
              {lastUpdated && (
                <span className="ml-2 text-xs text-gray-400">
                  Updated: {lastUpdated}
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 px-3 py-2"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
            
            <button
              onClick={fetchStats}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg hover:bg-emerald-100 text-sm font-medium flex items-center"
            >
              <Clock size={14} className="mr-1" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        {/* Stat Cards Grid */}
        <div className={`grid ${compact ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4 mb-6`}>
          {statCards.map((card, index) => (
            <div
              key={index}
              className={`${card.color} border rounded-xl p-4 hover:shadow-md transition-shadow`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-lg ${card.color.replace('bg-', 'bg-').replace(' border-', ' ')}`}>
                  {card.icon}
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  card.trend === 'up' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {card.change}
                </span>
              </div>
              <div className="mb-1">
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className={`text-2xl font-bold ${card.textColor}`}>
                  {card.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Completion Rate */}
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-bold text-gray-900">Job Completion Rate</h4>
              <p className="text-sm text-gray-600">Successful completion percentage</p>
            </div>
            <span className="text-2xl font-bold text-emerald-700">{completionRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {showCharts && !compact && (
          <div className="space-y-6">
            {/* Popular Categories */}
            {stats.popularCategories.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                  <MapPin size={18} className="mr-2 text-blue-500" />
                  Popular Job Categories
                </h4>
                <div className="space-y-3">
                  {stats.popularCategories.slice(0, 5).map((category, index) => {
                    const percentage = (category.count / stats.totalJobs) * 100;
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{category.category}</span>
                          <span className="text-gray-600">{category.count} jobs ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Employers & Providers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                    <Users size={18} className="mr-2 text-purple-500" />
                    Top Employers
                  </h4>
                  <div className="space-y-3">
                    {stats.topEmployers.slice(0, 5).map((employer, index) => (
                      <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs font-bold mr-3">
                            {employer.name.charAt(0)}
                          </div>
                          <span className="font-medium">{employer.name}</span>
                        </div>
                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">
                          {employer.jobCount} jobs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Providers */}
              {stats.topProviders.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                    <CheckCircle size={18} className="mr-2 text-green-500" />
                    Top Service Providers
                  </h4>
                  <div className="space-y-3">
                    {stats.topProviders.slice(0, 5).map((provider, index) => (
                      <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white flex items-center justify-center text-xs font-bold mr-3">
                            {provider.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-xs text-gray-500">{provider.completedJobs} completed</div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Star size={14} className="text-yellow-400 fill-current" />
                          <span className="ml-1 text-sm font-bold">5.0</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weekly Trend */}
            {stats.weeklyTrend.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                  <TrendingUp size={18} className="mr-2 text-amber-500" />
                  Weekly Job Trend
                </h4>
                <div className="flex items-end h-40 space-x-2">
                  {stats.weeklyTrend.map((day, index) => {
                    const maxCount = Math.max(...stats.weeklyTrend.map(d => d.count));
                    const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                    
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div 
                          className="w-full bg-gradient-to-t from-amber-500 to-yellow-300 rounded-t-lg transition-all duration-300 hover:opacity-90"
                          style={{ height: `${height}%` }}
                          title={`${day.date}: ${day.count} jobs`}
                        ></div>
                        <div className="text-xs text-gray-500 mt-2">
                          {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                        </div>
                        <div className="text-sm font-bold">{day.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary Stats */}
        {!showCharts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Most Active Day</div>
              <div className="font-bold">Friday</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Peak Hour</div>
              <div className="font-bold">2:00 PM</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Avg Job Price</div>
              <div className="font-bold">฿{Math.round(stats.totalRevenue / stats.totalJobs)}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Response Time</div>
              <div className="font-bold">12min</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50 p-3">
        <div className="flex justify-between items-center text-sm text-gray-500">
          <div className="flex items-center">
            <Activity size={14} className="mr-1" />
            <span>Real-time monitoring • Auto-refresh: {refreshInterval}s</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>
              <span>Active</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-blue-500 mr-1"></div>
              <span>Pending</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div>
              <span>Cancelled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Star component for ratings
const Star = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export default JobCounter;