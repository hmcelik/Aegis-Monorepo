import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api';
import { LoadingCard, ErrorCard } from './UXComponents';

const AuditLog = ({ groupId, groupTitle }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exportLoading, setExportLoading] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    userId: '',
    type: '', // Changed from actionType to type
    startDate: '',
    endDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({});

  const actionTypes = ['AUTO', 'MANUAL-STRIKE-ADD', 'MANUAL-STRIKE-REMOVE', 'MANUAL-STRIKE-SET'];

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const options = {
        page: currentPage,
        limit: pageSize,
        ...appliedFilters,
      };

      const response = await apiService.audit.getLogs(groupId, options);

      console.log('Audit logs response:', response); // Debug log

      if (response?.data) {
        // Handle different response formats:
        // Backend format: { data: { success: true, data: [...], pagination: {} } }
        let logsData = [];
        let paginationData = null;

        if (response.data.data && Array.isArray(response.data.data)) {
          // Backend format: response.data.data contains the logs array
          logsData = response.data.data;
          paginationData = response.data.pagination || null;
          console.log('✅ Extracted logs from response.data.data:', logsData.length, 'entries');
        } else if (response.data && Array.isArray(response.data)) {
          // Direct array format
          logsData = response.data;
          paginationData = response.pagination || null;
          console.log('✅ Extracted logs from response.data:', logsData.length, 'entries');
        } else if (response.logs && response.logs.data) {
          // Legacy format: Nested under logs property
          logsData = Array.isArray(response.logs.data) ? response.logs.data : [];
          paginationData = response.logs.pagination || null;
          console.log('✅ Extracted logs from response.logs.data:', logsData.length, 'entries');
        } else {
          console.warn('⚠️ Unexpected response format:', response);
          logsData = [];
        }

        console.log('Processed logs data:', logsData); // Debug log
        console.log('Processed pagination:', paginationData); // Debug log

        setLogs(logsData);
        setPagination(paginationData);

        const filterCount = Object.keys(appliedFilters).filter(key => appliedFilters[key]).length;
        if (filterCount > 0) {
          toast.success(`Loaded ${logsData.length} audit entries with ${filterCount} filter(s)`);
        } else {
          toast.success(`Loaded ${logsData.length} audit entries`);
        }
      } else {
        console.warn('No data in audit logs response:', response);
        setLogs([]);
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);

      // Check for specific backend database errors
      if (
        error.response?.status === 500 &&
        error.response?.data?.error?.code === 'DATABASE_ERROR'
      ) {
        console.warn(
          '📊 Backend database issue detected, audit logs may be temporarily unavailable'
        );
        toast.error(
          'Audit logs are temporarily unavailable due to a database issue. Please try again later.'
        );
        setError('Database temporarily unavailable. The backend team has been notified.');
      } else {
        toast.error(`Failed to load audit logs: ${error.message}`);
        setError(error.message);
      }

      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, currentPage, pageSize, appliedFilters]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const applyFilters = () => {
    // Clean up empty filters
    const cleanFilters = Object.keys(filters).reduce((acc, key) => {
      if (filters[key]?.trim()) {
        acc[key] = filters[key].trim();
      }
      return acc;
    }, {});

    setAppliedFilters(cleanFilters);
    setCurrentPage(1); // Reset to first page when applying filters

    const filterCount = Object.keys(cleanFilters).length;
    toast.info(`Applied ${filterCount} filter(s)`);
  };

  const clearFilters = () => {
    setFilters({
      userId: '',
      type: '',
      startDate: '',
      endDate: '',
    });
    setAppliedFilters({});
    setCurrentPage(1);
    toast.info('Filters cleared');
  };

  const handlePageChange = newPage => {
    if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
      setCurrentPage(newPage);
    }
  };

  const exportLogs = async format => {
    setExportLoading(true);
    try {
      const response = await apiService.audit.export(groupId, format, appliedFilters);

      // Check if we're in Telegram WebApp context
      const isWebApp = window.Telegram?.WebApp?.initData;

      if (format === 'csv' && response?.data instanceof Blob) {
        // Handle CSV download
        const filename =
          response.headers?.['content-disposition']?.match(/filename="([^"]+)"/)?.[1] ||
          `audit_log_${groupId}_${new Date().toISOString().split('T')[0]}.csv`;

        if (isWebApp) {
          // For Telegram WebApp, convert blob to text and copy to clipboard
          const text = await response.data.text();
          await navigator.clipboard.writeText(text);
          toast.success(
            '� CSV data copied to clipboard! You can paste it into a spreadsheet application.'
          );
        } else {
          // Regular web browser download
          const url = window.URL.createObjectURL(response.data);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          toast.success('📁 CSV export downloaded successfully');
        }
      } else if (format === 'json' && response?.data) {
        // Handle JSON download
        const jsonData = JSON.stringify(response.data, null, 2);
        const filename = `audit_log_${groupId}_${new Date().toISOString().split('T')[0]}.json`;

        if (isWebApp) {
          // For Telegram WebApp, copy JSON data to clipboard
          await navigator.clipboard.writeText(jsonData);
          toast.success('� JSON data copied to clipboard! You can paste it into a text editor.');
        } else {
          // Regular web browser download
          const blob = new Blob([jsonData], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          toast.success('📁 JSON export downloaded successfully');
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export logs: ${error.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  const formatTimestamp = timestamp => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionIcon = action => {
    const iconMap = {
      AUTO: '🤖',
      'MANUAL-STRIKE-ADD': '➕',
      'MANUAL-STRIKE-REMOVE': '➖',
      'MANUAL-STRIKE-SET': '📝',
    };
    return iconMap[action] || '📋';
  };

  const getActionColor = action => {
    const colorMap = {
      AUTO: '#17a2b8',
      'MANUAL-STRIKE-ADD': '#dc3545',
      'MANUAL-STRIKE-REMOVE': '#28a745',
      'MANUAL-STRIKE-SET': '#007bff',
    };
    return colorMap[action] || '#6c757d';
  };

  const formatActionName = action => {
    const nameMap = {
      AUTO: 'Automatic Action',
      'MANUAL-STRIKE-ADD': 'Manual Strike Added',
      'MANUAL-STRIKE-REMOVE': 'Manual Strike Removed',
      'MANUAL-STRIKE-SET': 'Manual Strike Set',
    };
    return nameMap[action] || action;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <h3 className="text-2xl font-bold text-slate-900 mb-2 flex items-center gap-2">
          📋 <span>Audit Log</span>
        </h3>
        <p className="text-slate-600 text-lg">
          View moderation actions and system events for{' '}
          <strong className="text-slate-900">{groupTitle}</strong>
        </p>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <h4 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          🔍 <span>Filters</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <label htmlFor="userId" className="block text-sm font-semibold text-slate-700">
              User ID:
            </label>
            <input
              type="text"
              id="userId"
              value={filters.userId}
              onChange={e => handleFilterChange('userId', e.target.value)}
              placeholder="Filter by user ID"
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="type" className="block text-sm font-semibold text-slate-700">
              Action Type:
            </label>
            <select
              id="type"
              value={filters.type}
              onChange={e => handleFilterChange('type', e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            >
              <option value="" className="bg-white">
                All Actions
              </option>
              {actionTypes.map(action => (
                <option key={action} value={action} className="bg-white">
                  {getActionIcon(action)} {formatActionName(action)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label htmlFor="startDate" className="block text-sm font-semibold text-slate-700">
              Start Date:
            </label>
            <input
              type="datetime-local"
              id="startDate"
              value={filters.startDate}
              onChange={e => handleFilterChange('startDate', e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="endDate" className="block text-sm font-semibold text-slate-700">
              End Date:
            </label>
            <input
              type="datetime-local"
              id="endDate"
              value={filters.endDate}
              onChange={e => handleFilterChange('endDate', e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-8 pt-6 border-t border-slate-200">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={applyFilters}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              🔍 Apply Filters
            </button>

            <button
              onClick={clearFilters}
              disabled={loading}
              className="px-6 py-3 bg-slate-500 text-white font-semibold rounded-xl shadow-md hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              🗑️ Clear Filters
            </button>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <label htmlFor="pageSize" className="text-sm font-semibold text-slate-700">
              Per page:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={e => setPageSize(parseInt(e.target.value))}
              disabled={loading}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            >
              <option value={10} className="bg-white">
                10
              </option>
              <option value={20} className="bg-white">
                20
              </option>
              <option value={50} className="bg-white">
                50
              </option>
              <option value={100} className="bg-white">
                100
              </option>
              <option value={200} className="bg-white">
                200
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <h4 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          📤 <span>Export Logs</span>
        </h4>
        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={() => exportLogs('csv')}
            disabled={exportLoading || loading}
            className="px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {exportLoading
              ? '⏳ Exporting...'
              : window.Telegram?.WebApp?.initData
                ? '📋 Copy CSV'
                : '📊 Export CSV'}
          </button>

          <button
            onClick={() => exportLogs('json')}
            disabled={exportLoading || loading}
            className="px-8 py-3.5 bg-green-600 text-white font-semibold rounded-xl shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {exportLoading
              ? '⏳ Exporting...'
              : window.Telegram?.WebApp?.initData
                ? '📋 Copy JSON'
                : '📋 Export JSON'}
          </button>
        </div>
        <p className="text-sm text-slate-600">
          {window.Telegram?.WebApp?.initData
            ? 'Export data will be copied to clipboard for pasting into apps.'
            : 'Export includes current filters. Max 10,000 entries per export.'}
        </p>
      </div>

      {/* Logs Display */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        {loading ? (
          <div className="p-8">
            <LoadingCard title="Loading audit logs..." />
          </div>
        ) : logs.length > 0 ? (
          <>
            <div className="bg-slate-50 px-8 py-4 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-bold text-slate-900">Audit Entries</h4>
                {pagination && (
                  <span className="text-sm text-slate-600">
                    Showing {(currentPage - 1) * pageSize + 1}-
                    {Math.min(currentPage * pageSize, pagination.total)}
                    of {pagination.total} entries
                  </span>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {logs.map(log => (
                <div key={log.id} className="p-8 hover:bg-slate-50 transition-colors duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <span
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm w-fit"
                      style={{
                        backgroundColor:
                          getActionColor(log.type) === '#ef4444'
                            ? '#fee2e2'
                            : getActionColor(log.type) === '#f59e0b'
                              ? '#fef3c7'
                              : getActionColor(log.type) === '#10b981'
                                ? '#d1fae5'
                                : '#dbeafe',
                        color:
                          getActionColor(log.type) === '#ef4444'
                            ? '#dc2626'
                            : getActionColor(log.type) === '#f59e0b'
                              ? '#d97706'
                              : getActionColor(log.type) === '#10b981'
                                ? '#059669'
                                : '#2563eb',
                      }}
                    >
                      {getActionIcon(log.type)} {formatActionName(log.type)}
                    </span>
                    <span className="text-sm text-slate-600 bg-slate-100 px-3 py-1 rounded-lg font-medium">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="text-sm font-medium text-slate-600 mb-1">User</div>
                        <div className="font-semibold text-slate-900">ID {log.userId}</div>
                        <div className="text-xs text-slate-500">({log.type})</div>
                      </div>

                      {log.chatId && (
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                          <div className="text-sm font-medium text-slate-600 mb-1">Chat</div>
                          <div className="font-semibold text-slate-900">{log.chatId}</div>
                        </div>
                      )}

                      {log.details?.adminId && (
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                          <div className="text-sm font-medium text-slate-600 mb-1">Admin</div>
                          <div className="font-semibold text-slate-900">
                            {log.details.adminName || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500">({log.details.adminId})</div>
                        </div>
                      )}
                    </div>

                    {(log.details?.reason || log.reason) && (
                      <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                        <div className="text-sm font-medium text-orange-700 mb-1">Reason</div>
                        <div className="text-slate-900">{log.details?.reason || log.reason}</div>
                      </div>
                    )}

                    {log.details?.violationType && (
                      <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                        <div className="text-sm font-medium text-red-700 mb-1">Violation Type</div>
                        <div className="text-slate-900">{log.details.violationType}</div>
                      </div>
                    )}

                    {log.details?.classificationScore && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div className="text-sm font-medium text-green-700 mb-1">
                          Classification Score
                        </div>
                        <div className="text-slate-900 font-mono">
                          {(log.details.classificationScore * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}

                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="text-sm font-medium text-slate-700 mb-2">
                          Additional Details
                        </div>
                        <div className="space-y-1">
                          {Object.entries(log.details)
                            .filter(
                              ([key]) =>
                                ![
                                  'reason',
                                  'violationType',
                                  'classificationScore',
                                  'adminId',
                                  'adminName',
                                ].includes(key)
                            )
                            .map(([key, value]) => (
                              <div key={key} className="flex items-center gap-2 text-sm">
                                <span className="text-slate-600 capitalize">{key}:</span>
                                <span className="text-slate-900 font-mono">
                                  {typeof value === 'object' ? JSON.stringify(value) : value}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="bg-slate-50 px-8 py-4 border-t border-slate-200">
                <div className="flex items-center justify-center gap-3">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="px-4 py-2 bg-white text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-slate-300 font-medium"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const pageNum =
                        Math.max(1, Math.min(pagination.totalPages - 4, currentPage - 2)) + i;

                      if (pageNum <= pagination.totalPages) {
                        return (
                          <button
                            key={pageNum}
                            className={`px-3 py-2 rounded-lg border border-white/20 transition-all duration-200 ${
                              currentPage === pageNum
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                            onClick={() => handlePageChange(pageNum)}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    disabled={currentPage >= pagination.totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/20"
                  >
                    Next ➡️
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-lg text-gray-300 mb-2">No audit entries found</p>
            {Object.keys(appliedFilters).length > 0 && (
              <p className="text-sm text-gray-400">
                Try adjusting your filters or clearing them to see more results.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
