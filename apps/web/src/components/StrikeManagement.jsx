import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api';
import { LoadingCard, ErrorCard } from './UXComponents';
import './StrikeManagement.css';

const StrikeManagement = ({ groupId, groupTitle }) => {
  const [userId, setUserId] = useState('');
  const [strikesCount, setStrikesCount] = useState(1);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState('add'); // add, remove, set
  const [loading, setLoading] = useState(false);
  const [strikeHistory, setStrikeHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState(null);

  const handleStrikeAction = async () => {
    if (!userId.trim()) {
      toast.error('Please enter a valid User ID');
      return;
    }

    if (
      strikesCount < 1 ||
      (action !== 'set' && strikesCount > 100) ||
      (action === 'set' && strikesCount > 1000)
    ) {
      const maxStikes = action === 'set' ? 1000 : 100;
      toast.error(`Strikes count must be between 1 and ${maxStikes}`);
      return;
    }

    setLoading(true);
    try {
      let response;

      switch (action) {
        case 'add':
          response = await apiService.strikes.add(
            groupId,
            userId.trim(),
            strikesCount,
            reason.trim()
          );
          toast.success(`✅ Added ${strikesCount} strike(s) to user ${userId}`);
          break;
        case 'remove':
          response = await apiService.strikes.remove(
            groupId,
            userId.trim(),
            strikesCount,
            reason.trim()
          );
          toast.success(`✅ Removed ${strikesCount} strike(s) from user ${userId}`);
          break;
        case 'set':
          response = await apiService.strikes.set(
            groupId,
            userId.trim(),
            strikesCount,
            reason.trim()
          );
          toast.success(`✅ Set strikes to ${strikesCount} for user ${userId}`);
          break;
        default:
          toast.error('Invalid action selected');
          return;
      }

      console.log('Strike action response:', response);

      // Clear form after successful action
      setUserId('');
      setStrikesCount(1);
      setReason('');

      // Refresh history if currently viewing this user
      if (showHistory && selectedUserId === userId.trim()) {
        loadStrikeHistory(selectedUserId);
      }
    } catch (error) {
      console.error('Strike action error:', error);
      toast.error(`Failed to ${action} strikes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadStrikeHistory = async (targetUserId, page = 1) => {
    if (!targetUserId.trim()) {
      toast.error('Please enter a valid User ID to view history');
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await apiService.strikes.getHistory(groupId, targetUserId.trim(), page, 10);

      if (response?.data) {
        setStrikeHistory(response.data.history || []);
        setHistoryPagination(response.data.pagination || null);
        setSelectedUserId(targetUserId.trim());
        setShowHistory(true);
        setHistoryPage(page);

        if (response.data.history?.length > 0) {
          toast.success(`Loaded strike history for user ${targetUserId}`);
        } else {
          toast.info(`No strike history found for user ${targetUserId}`);
        }
      }
    } catch (error) {
      console.error('Error loading strike history:', error);
      toast.error(`Failed to load strike history: ${error.message}`);
      setStrikeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryPageChange = newPage => {
    if (selectedUserId && newPage !== historyPage) {
      loadStrikeHistory(selectedUserId, newPage);
    }
  };

  const formatTimestamp = timestamp => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionIcon = actionType => {
    switch (actionType) {
      case 'add':
        return '➕';
      case 'remove':
        return '➖';
      case 'set':
        return '📝';
      default:
        return '❓';
    }
  };

  const getActionColor = actionType => {
    switch (actionType) {
      case 'add':
        return '#ff6b6b';
      case 'remove':
        return '#51cf66';
      case 'set':
        return '#339af0';
      default:
        return '#868e96';
    }
  };

  return (
    <div className="strike-management">
      <div className="strike-management-header">
        <h3>⚡ Strike Management</h3>
        <p>
          Manage user strikes for <strong>{groupTitle}</strong>
        </p>
      </div>

      {/* Strike Action Form */}
      <div className="strike-action-form">
        <h4>Strike Actions</h4>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="userId">User ID:</label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="Enter Telegram User ID"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="action">Action:</label>
            <select
              id="action"
              value={action}
              onChange={e => setAction(e.target.value)}
              disabled={loading}
            >
              <option value="add">➕ Add Strikes</option>
              <option value="remove">➖ Remove Strikes</option>
              <option value="set">📝 Set Strike Count</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="strikesCount">Strikes ({action === 'set' ? '0-1000' : '1-100'}):</label>
            <input
              type="number"
              id="strikesCount"
              value={strikesCount}
              onChange={e => setStrikesCount(parseInt(e.target.value) || 1)}
              min={action === 'set' ? 0 : 1}
              max={action === 'set' ? 1000 : 100}
              disabled={loading}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="reason">Reason (optional):</label>
          <input
            type="text"
            id="reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Enter reason for this action"
            disabled={loading}
          />
        </div>

        <button
          className="strike-action-btn"
          onClick={handleStrikeAction}
          disabled={loading || !userId.trim()}
        >
          {loading ? (
            <>⏳ Processing...</>
          ) : (
            <>
              {getActionIcon(action)}{' '}
              {action === 'add' ? 'Add' : action === 'remove' ? 'Remove' : 'Set'} {strikesCount}{' '}
              Strike{strikesCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      </div>

      {/* Strike History Section */}
      <div className="strike-history-section">
        <h4>📜 Strike History</h4>

        <div className="history-controls">
          <div className="form-group">
            <label htmlFor="historyUserId">User ID for History:</label>
            <input
              type="text"
              id="historyUserId"
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              placeholder="Enter User ID to view history"
              disabled={historyLoading}
            />
          </div>

          <button
            className="load-history-btn"
            onClick={() => loadStrikeHistory(selectedUserId, 1)}
            disabled={historyLoading || !selectedUserId.trim()}
          >
            {historyLoading ? '⏳ Loading...' : '🔍 Load History'}
          </button>
        </div>

        {showHistory && (
          <div className="strike-history">
            {historyLoading ? (
              <LoadingCard title="Loading strike history..." />
            ) : strikeHistory.length > 0 ? (
              <>
                <div className="history-header">
                  <h5>History for User {selectedUserId}</h5>
                  <div className="current-strikes">
                    Current Strikes:{' '}
                    <span className="strikes-count">
                      {historyPagination?.currentStrikes || 'Unknown'}
                    </span>
                  </div>
                </div>

                <div className="history-list">
                  {strikeHistory.map(entry => (
                    <div key={entry.id} className="history-entry">
                      <div className="entry-header">
                        <span
                          className="action-badge"
                          style={{ backgroundColor: getActionColor(entry.action) }}
                        >
                          {getActionIcon(entry.action)} {entry.action.toUpperCase()}
                        </span>
                        <span className="entry-strikes">
                          {entry.action === 'add' ? '+' : entry.action === 'remove' ? '-' : '='}
                          {entry.strikes} strikes
                        </span>
                        <span className="entry-timestamp">{formatTimestamp(entry.timestamp)}</span>
                      </div>
                      <div className="entry-details">
                        <div className="entry-admin">
                          By: {entry.adminName} ({entry.adminId})
                        </div>
                        {entry.reason && <div className="entry-reason">Reason: {entry.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {historyPagination && historyPagination.totalPages > 1 && (
                  <div className="history-pagination">
                    <button
                      disabled={historyPage <= 1}
                      onClick={() => handleHistoryPageChange(historyPage - 1)}
                    >
                      ⬅️ Previous
                    </button>

                    <span className="page-info">
                      Page {historyPage} of {historyPagination.totalPages}({historyPagination.total}{' '}
                      total entries)
                    </span>

                    <button
                      disabled={historyPage >= historyPagination.totalPages}
                      onClick={() => handleHistoryPageChange(historyPage + 1)}
                    >
                      Next ➡️
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="no-history">
                <p>📭 No strike history found for user {selectedUserId}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StrikeManagement;
