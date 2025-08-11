import React, { useState } from 'react';
import { RefreshCw, TrendingUp, Shield, AlertTriangle, Trash2, Calendar, Clock } from 'lucide-react';
import { LoadingCard, EmptyState } from './UXComponents';

const GroupStats = ({ stats = {}, loading, onRefresh, onPeriodChange }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Handle period change
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setShowCustomDates(period === 'custom');
    
    if (period !== 'custom' && onPeriodChange) {
      onPeriodChange(period);
    }
  };

  // Handle custom date range submission
  const handleCustomDatesSubmit = () => {
    if (startDate && endDate && onPeriodChange) {
      onPeriodChange('custom', startDate, endDate);
      setShowCustomDates(false);
    }
  };

  // Ensure stats is always a valid object to prevent Object.keys errors
  const safeStats = stats && typeof stats === 'object' ? stats : {};
  
  // Debug log to see exactly what stats data we're receiving
  console.log('🔍 GroupStats received stats:', stats);
  console.log('🔍 GroupStats stats type:', typeof stats);
  console.log('🔍 GroupStats safe stats keys:', Object.keys(safeStats));
  
  // Detect data format for debugging - Updated for new API formats
  const isEnhancedWebAppFormat = safeStats.flaggedMessages && 
    typeof safeStats.flaggedMessages === 'object' && 
    safeStats.flaggedMessages.total !== undefined;
  const isBasicWebAppFormat = safeStats.totalMessages !== undefined && !isEnhancedWebAppFormat;
  const isLegacyJWTFormat = safeStats.totalMessagesProcessed !== undefined || safeStats.violationsDetected !== undefined;
  
  console.log('🔍 Data format detected:', { 
    isEnhancedWebAppFormat, 
    isBasicWebAppFormat, 
    isLegacyJWTFormat,
    hasQualityMetrics: !!safeStats.qualityMetrics,
    hasPenalties: !!safeStats.penalties
  });
  
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-1">📊 Statistics</h3>
            <p className="text-slate-600">Loading performance metrics</p>
          </div>
          <button 
            onClick={onRefresh} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-sm font-medium cursor-not-allowed"
            disabled
          >
            <RefreshCw size={16} className="animate-spin" />
            <span className="hidden sm:inline">Loading</span>
          </button>
        </div>
        <div className="space-y-6">
          <LoadingCard 
            title="Loading statistics..." 
            subtitle="Fetching moderation data"
            size="small"
          />
        </div>
      </div>
    );
  }

  // Check if stats is empty or invalid  
  const isStatsEmpty = !safeStats || Object.keys(safeStats).length === 0;

  if (isStatsEmpty) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-1">📊 Statistics</h3>
            <p className="text-slate-600">No data available yet</p>
          </div>
          <button 
            onClick={onRefresh} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors duration-200 text-sm font-medium"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        <div className="space-y-6">
          <EmptyState
            icon="📊"
            title="No Statistics Available"
            description="Statistics will appear once the bot starts processing messages in this group."
            action={onRefresh}
            actionText="🔄 Refresh"
          />
        </div>
      </div>
    );
  }

  // Helper function to extract values from both basic and enhanced formats
  const getStatValue = (field, subField = null) => {
    if (subField && safeStats[field] && typeof safeStats[field] === 'object') {
      // Enhanced format: e.g., flaggedMessages.total
      return safeStats[field][subField] || 0;
    }
    // Basic format: direct value
    return safeStats[field] || 0;
  };

  const statItems = [
    {
      key: 'totalMessages',
      label: 'Messages Processed',
      value: getStatValue('totalMessages'),
      icon: <TrendingUp size={20} />,
      color: 'blue'
    },
    {
      key: 'flaggedMessages',
      label: 'Violations Detected',
      value: isEnhancedWebAppFormat 
        ? getStatValue('flaggedMessages', 'total')
        : getStatValue('flaggedMessages'),
      icon: <AlertTriangle size={20} />,
      color: 'orange'
    },
    {
      key: 'actionsTaken',
      label: 'Actions Taken',
      value: isEnhancedWebAppFormat
        ? getStatValue('penalties', 'totalUsersActioned')
        : (getStatValue('mutedUsers') + getStatValue('kickedUsers') + getStatValue('bannedUsers')),
      icon: <Shield size={20} />,
      color: 'green'
    },
    {
      key: 'deletedMessages',
      label: 'Deleted Messages',
      value: getStatValue('deletedMessages'),
      icon: <Trash2 size={20} />,
      color: 'red'
    }
  ];

  // Enhanced stats display for new WebApp analytics format
  const enhancedStatsItems = isEnhancedWebAppFormat ? [
    {
      key: 'spamDetected', 
      label: 'Spam Messages',
      value: getStatValue('flaggedMessages', 'spam'),
      icon: <AlertTriangle size={20} />,
      color: 'orange'
    },
    {
      key: 'profanityDetected',
      label: 'Profanity Detected', 
      value: getStatValue('flaggedMessages', 'profanity'),
      icon: <Shield size={20} />,
      color: 'red'
    },
    {
      key: 'averageSpamScore',
      label: 'Avg Spam Score',
      value: `${((getStatValue('qualityMetrics', 'averageSpamScore') || 0) * 100).toFixed(1)}%`,
      icon: <TrendingUp size={20} />,
      color: 'blue'
    },
    {
      key: 'flaggedRate',
      label: 'Flagged Rate',
      value: `${(getStatValue('qualityMetrics', 'flaggedRate') || 0).toFixed(2)}%`,
      icon: <AlertTriangle size={20} />,
      color: 'yellow'
    }
  ] : [];

  // Calculate additional metrics using correct property names based on actual JSON structure
  const totalMessages = safeStats?.totalMessages || 0;
  const violations = safeStats?.flaggedMessages?.total || safeStats?.flaggedMessages || 0;
  const actions = (safeStats?.penalties?.mutedUsers || 0) + 
                 (safeStats?.penalties?.kickedUsers || 0) + 
                 (safeStats?.penalties?.bannedUsers || 0);
  
  const violationRate = totalMessages > 0 
    ? ((violations / totalMessages) * 100).toFixed(1)
    : '0';

  const actionEfficiency = violations > 0
    ? ((actions / violations) * 100).toFixed(1)
    : '0';

  // Debug logging for performance metrics
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Performance Metrics Debug:', {
      totalMessages,
      violations,
      actions,
      violationRate: `${violationRate}%`,
      actionEfficiency: `${actionEfficiency}%`,
      calculation: `${violations}/${totalMessages} = ${((violations / totalMessages) * 100).toFixed(1)}%`
    });
  }

  // Helper function to format complex values
  const formatComplexValue = (key, value) => {
    if (typeof value !== 'object' || value === null) {
      return String(value);
    }

    // Handle specific known object types with custom formatting
    switch (key) {
      case 'penalties':
        return (
          <div className="space-y-1 text-sm">
            <div>Muted: {value.mutedUsers || 0}</div>
            <div>Kicked: {value.kickedUsers || 0}</div>
            <div>Banned: {value.bannedUsers || 0}</div>
            <div>Total Actioned: {value.totalUsersActioned || 0}</div>
          </div>
        );
      
      case 'qualityMetrics':
        return (
          <div className="space-y-1 text-sm">
            <div>Avg Spam Score: {((value.averageSpamScore || 0) * 100).toFixed(1)}%</div>
            <div>Flagged Rate: {(value.flaggedRate || 0).toFixed(1)}%</div>
            {value.moderationEfficiency && (
              <div className="mt-2 pl-2 border-l-2 border-gray-300 space-y-1">
                <div>Messages Scanned: {value.moderationEfficiency.messagesScanned || 0}</div>
                <div>Violations Detected: {value.moderationEfficiency.violationsDetected || 0}</div>
                <div>Users Actioned: {value.moderationEfficiency.usersActioned || 0}</div>
              </div>
            )}
          </div>
        );
      
      case 'topViolationTypes':
        return (
          <div className="space-y-1 text-sm">
            {Array.isArray(value) ? value.map((violation, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{violation.type}:</span>
                <span className="font-medium">{violation.count} cases</span>
              </div>
            )) : 'No violations recorded'}
          </div>
        );
      
      default:
        // For unknown objects, create a clean key-value display
        if (Array.isArray(value)) {
          return value.length > 0 ? `${value.length} items` : 'No items';
        }
        
        const entries = Object.entries(value);
        if (entries.length === 0) {
          return 'No data';
        }
        
        return (
          <div className="space-y-1 text-sm">
            {entries.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-600">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                <span className="font-medium">{typeof v === 'object' ? 'object' : String(v)}</span>
              </div>
            ))}
          </div>
        );
    }
  };

  // Debug log for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 GroupStats calculations:', {
      totalMessages,
      violations,
      actions,
      violationRate,
      actionEfficiency,
      safeStatsKeys: Object.keys(safeStats || {})
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">📊 Moderation Statistics</h3>
          <p className="text-slate-600">Real-time performance metrics</p>
        </div>
        <button 
          onClick={onRefresh} 
          className="!inline-flex !items-center !gap-2 !px-4 !py-2 !bg-slate-100 hover:!bg-slate-200 !text-slate-700 !rounded-xl !transition-colors !duration-200 !text-sm !font-medium !border-none !outline-none !cursor-pointer" 
          title="Refresh statistics"
          type="button"
        >
          <RefreshCw size={16} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Period Selector - Fixed Visibility and Alignment */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold text-slate-700 mb-4">📅 Select Time Period</h4>
        <div className="flex flex-wrap justify-center sm:justify-start gap-3">
          <button 
            className={`!px-5 !py-3 !rounded-lg !text-sm !font-semibold !transition-all !duration-200 !inline-flex !items-center !gap-2 !border-2 !border-none !outline-none !cursor-pointer ${
              selectedPeriod === 'day' 
                ? '!bg-blue-600 !text-white !border-blue-600 !shadow-lg !shadow-blue-200' 
                : '!bg-gray-100 !text-gray-800 !border-gray-300 hover:!bg-gray-200 hover:!border-gray-400 hover:!shadow-md'
            }`}
            onClick={() => handlePeriodChange('day')}
            type="button"
          >
            <Clock size={16} />
            <span>Today</span>
          </button>
          <button 
            className={`!px-5 !py-3 !rounded-lg !text-sm !font-semibold !transition-all !duration-200 !border-2 !border-none !outline-none !cursor-pointer ${
              selectedPeriod === 'week' 
                ? '!bg-blue-600 !text-white !border-blue-600 !shadow-lg !shadow-blue-200' 
                : '!bg-gray-100 !text-gray-800 !border-gray-300 hover:!bg-gray-200 hover:!border-gray-400 hover:!shadow-md'
            }`}
            onClick={() => handlePeriodChange('week')}
            type="button"
          >
            📅 This Week
          </button>
          <button 
            className={`!px-5 !py-3 !rounded-lg !text-sm !font-semibold !transition-all !duration-200 !border-2 !border-none !outline-none !cursor-pointer ${
              selectedPeriod === 'month' 
                ? '!bg-blue-600 !text-white !border-blue-600 !shadow-lg !shadow-blue-200' 
                : '!bg-gray-100 !text-gray-800 !border-gray-300 hover:!bg-gray-200 hover:!border-gray-400 hover:!shadow-md'
            }`}
            onClick={() => handlePeriodChange('month')}
            type="button"
          >
            📆 This Month
          </button>
          <button 
            className={`!px-5 !py-3 !rounded-lg !text-sm !font-semibold !transition-all !duration-200 !border-2 !border-none !outline-none !cursor-pointer ${
              selectedPeriod === 'year' 
                ? '!bg-blue-600 !text-white !border-blue-600 !shadow-lg !shadow-blue-200' 
                : '!bg-gray-100 !text-gray-800 !border-gray-300 hover:!bg-gray-200 hover:!border-gray-400 hover:!shadow-md'
            }`}
            onClick={() => handlePeriodChange('year')}
            type="button"
          >
            🗓️ This Year
          </button>
          <button 
            className={`!px-5 !py-3 !rounded-lg !text-sm !font-semibold !transition-all !duration-200 !inline-flex !items-center !gap-2 !border-2 !border-none !outline-none !cursor-pointer ${
              selectedPeriod === 'custom' 
                ? '!bg-blue-600 !text-white !border-blue-600 !shadow-lg !shadow-blue-200' 
                : '!bg-gray-100 !text-gray-800 !border-gray-300 hover:!bg-gray-200 hover:!border-gray-400 hover:!shadow-md'
            }`}
            onClick={() => handlePeriodChange('custom')}
            type="button"
          >
            <Calendar size={16} />
            <span>Custom Range</span>
          </button>
        </div>
        
        {/* Custom Date Range */}
        {showCustomDates && (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-3">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-3">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900"
                />
              </div>
              <button 
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors duration-200 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-500"
                onClick={handleCustomDatesSubmit}
                disabled={!startDate || !endDate}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statItems.map((item) => (
          <div key={item.key} className="group relative bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all duration-300">
            <div className="flex flex-col items-center text-center gap-3">
              <div className={`p-3 rounded-xl shadow-sm ${
                item.color === 'blue' ? 'bg-blue-100 text-blue-600 shadow-blue-100' :
                item.color === 'green' ? 'bg-emerald-100 text-emerald-600 shadow-emerald-100' :
                item.color === 'orange' ? 'bg-orange-100 text-orange-600 shadow-orange-100' :
                item.color === 'red' ? 'bg-red-100 text-red-600 shadow-red-100' :
                item.color === 'yellow' ? 'bg-amber-100 text-amber-600 shadow-amber-100' :
                'bg-slate-100 text-slate-600 shadow-slate-100'
              }`}>
                {item.icon}
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-1">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</div>
              <div className="text-sm text-slate-600 font-medium">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Enhanced Analytics Stats (only for WebApp analytics endpoint) */}
      {enhancedStatsItems.length > 0 && (
        <div className="mb-8">
          <h4 className="text-xl font-bold text-slate-900 mb-6">🔍 Advanced Analytics</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {enhancedStatsItems.map((item) => (
              <div key={item.key} className="group relative bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl shadow-sm ${
                    item.color === 'blue' ? 'bg-blue-100 text-blue-600 shadow-blue-100' :
                    item.color === 'green' ? 'bg-emerald-100 text-emerald-600 shadow-emerald-100' :
                    item.color === 'orange' ? 'bg-orange-100 text-orange-600 shadow-orange-100' :
                    item.color === 'red' ? 'bg-red-100 text-red-600 shadow-red-100' :
                    item.color === 'yellow' ? 'bg-amber-100 text-amber-600 shadow-amber-100' :
                    'bg-slate-100 text-slate-600 shadow-slate-100'
                  }`}>
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-3xl font-bold text-slate-900 mb-1">{item.value}</div>
                    <div className="text-sm text-slate-600 font-medium">{item.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violation Types Breakdown */}
      {safeStats.topViolationTypes && safeStats.topViolationTypes.length > 0 && (
        <div className="mb-8">
          <h4 className="text-xl font-bold text-slate-900 mb-6">🎯 Top Violation Types</h4>
          <div className="space-y-3">
            {safeStats.topViolationTypes.map((violation, index) => (
              <div key={violation.type} className="flex items-center justify-between bg-gradient-to-r from-slate-50 to-white rounded-2xl p-4 border border-slate-200 hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-4">
                  <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full min-w-[2.5rem] text-center">#{index + 1}</span>
                  <span className="font-semibold text-slate-900">{violation.type}</span>
                </div>
                <span className="text-sm text-slate-600 font-medium">{violation.count} cases</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-8 mb-8 border border-slate-200">
        <h4 className="text-xl font-bold text-slate-900 mb-6">📈 Performance Metrics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">Violation Rate:</span>
            <span className="font-bold text-slate-900 text-lg">{violationRate}%</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">Action Efficiency:</span>
            <span className="font-bold text-slate-900 text-lg">{actionEfficiency}%</span>
          </div>
        </div>
      </div>

          {/* Additional stats if available */}
      {safeStats && Object.keys(safeStats).length > 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 mb-8">
          <h4 className="text-xl font-bold text-slate-900 mb-6">📋 Additional Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(safeStats)
              .filter(([key]) => !statItems.some(item => item.key === key))
              .filter(([key]) => key !== 'recentActivities') // Exclude recentActivities from additional stats
              .filter(([key]) => key !== 'topViolationTypes') // Exclude topViolationTypes as it has its own section
              .map(([key, value]) => {
                // Map specific keys to appropriate icons
                const getIconForKey = (key) => {
                  const keyLower = key.toLowerCase();
                  if (keyLower.includes('message') || keyLower.includes('processed')) return '💬';
                  if (keyLower.includes('violation') || keyLower.includes('flagged')) return '⚠️';
                  if (keyLower.includes('delete') || keyLower.includes('removal')) return '🗑️';
                  if (keyLower.includes('action') || keyLower.includes('moderation')) return '⚡';
                  if (keyLower.includes('user') || keyLower.includes('active')) return '👤';
                  if (keyLower.includes('block') || keyLower.includes('ban')) return '🚫';
                  if (keyLower.includes('score') || keyLower.includes('rate')) return '📊';
                  if (keyLower.includes('penalty') || keyLower.includes('punishment')) return '⚖️';
                  if (keyLower.includes('quality') || keyLower.includes('metric')) return '📈';
                  return '📋'; // Default icon
                };
                
                return (
                  <div key={key} className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-6 border border-slate-200 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">
                          {getIconForKey(key)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-semibold text-slate-700 mb-2">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </h5>
                        <div className="text-slate-900 font-medium">
                          {formatComplexValue(key, value)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Activities Section */}
      {stats?.recentActivities && Array.isArray(stats.recentActivities) && stats.recentActivities.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 mb-8">
          <h4 className="text-xl font-bold text-slate-900 mb-6">🕒 Recent Activities</h4>
          <div className="space-y-4">
            {stats.recentActivities.slice(0, 3).map((activity, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors duration-200">
                <span className="text-2xl">{activity.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{activity.description}</p>
                  <p className="text-xs text-slate-600 mt-1">{activity.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center text-sm text-slate-500 pt-6 border-t border-slate-200">
        <p>
          🕒 Showing {selectedPeriod === 'day' ? 'today\'s' : 
                     selectedPeriod === 'week' ? 'this week\'s' : 
                     selectedPeriod === 'month' ? 'this month\'s' :
                     selectedPeriod === 'year' ? 'this year\'s' :
                     'custom period'} statistics • Updates in real-time
        </p>
      </div>
    </div>
  );
};

export default GroupStats;
