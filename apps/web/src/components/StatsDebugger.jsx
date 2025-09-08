import React, { useState } from 'react';
import { apiService } from '../services/api';

const StatsDebugger = () => {
  const [testResults, setTestResults] = useState('');
  const [loading, setLoading] = useState(false);

  const testStats = async () => {
    setLoading(true);
    setTestResults('Testing stats API...\n');

    // Get a sample group ID from current groups
    try {
      // First get groups to get a real group ID
      const groupsResponse = await apiService.groups.getAll();
      console.log('Groups response:', groupsResponse);

      let groupId = null;
      if (
        groupsResponse?.data &&
        Array.isArray(groupsResponse.data) &&
        groupsResponse.data.length > 0
      ) {
        // Direct array response (legacy format)
        groupId = groupsResponse.data[0].id;
      } else if (
        groupsResponse?.data?.data &&
        Array.isArray(groupsResponse.data.data) &&
        groupsResponse.data.data.length > 0
      ) {
        // Unified API format: {success, data: [groups]}
        groupId = groupsResponse.data.data[0].id;
      } else if (
        groupsResponse?.data?.groups &&
        Array.isArray(groupsResponse.data.groups) &&
        groupsResponse.data.groups.length > 0
      ) {
        // Legacy format: {groups: [array]}
        groupId = groupsResponse.data.groups[0].id;
      }

      if (!groupId) {
        setTestResults(prev => prev + 'ERROR: No groups found or invalid groups structure\n');
        setTestResults(
          prev => prev + `Groups response: ${JSON.stringify(groupsResponse, null, 2)}\n`
        );
        setLoading(false);
        return;
      }

      setTestResults(prev => prev + `Using group ID: ${groupId}\n`);

      // First, test audit logs to see if there's actual data
      try {
        setTestResults(prev => prev + '\n=== Testing Audit Logs (for comparison) ===\n');
        const auditResponse = await apiService.audit.getLogs(groupId);
        setTestResults(
          prev => prev + `Audit logs response:\n${JSON.stringify(auditResponse, null, 2)}\n`
        );

        if (auditResponse?.data) {
          setTestResults(
            prev => prev + `Total audit entries found: ${auditResponse.data.length}\n`
          );
          if (auditResponse.data.length > 0) {
            setTestResults(
              prev =>
                prev + `Sample audit entry:\n${JSON.stringify(auditResponse.data[0], null, 2)}\n`
            );
          }
        }
      } catch (auditError) {
        setTestResults(prev => prev + `Audit Error: ${auditError.message}\n`);
      }

      // Test WebApp stats with different periods
      const periods = ['day', 'week', 'month', 'year'];
      for (const period of periods) {
        try {
          setTestResults(prev => prev + `\n=== Testing WebApp Stats (${period}) ===\n`);
          const webAppStats = await apiService.groups.getStatsWebApp(groupId, period);
          setTestResults(
            prev =>
              prev +
              `WebApp Stats (${period}) Success:\n${JSON.stringify(webAppStats?.data?.data?.stats, null, 2)}\n`
          );
        } catch (webAppError) {
          setTestResults(prev => prev + `WebApp Stats (${period}) Error: ${webAppError.message}\n`);
        }
      }

      // Test JWT stats with different periods
      for (const period of periods) {
        try {
          setTestResults(prev => prev + `\n=== Testing JWT Stats (${period}) ===\n`);
          const jwtStats = await apiService.groups.getStats(groupId, period);
          setTestResults(
            prev =>
              prev + `JWT Stats (${period}) Success:\n${JSON.stringify(jwtStats?.data, null, 2)}\n`
          );
        } catch (jwtError) {
          setTestResults(prev => prev + `JWT Stats (${period}) Error: ${jwtError.message}\n`);
        }
      }

      // Raw API test - bypass our API service layer
      try {
        setTestResults(prev => prev + '\n=== Raw API Test (Direct Fetch) ===\n');

        const API_BASE = 'https://minnow-good-mostly.ngrok-free.app/api/v1';
        const token =
          localStorage.getItem('telegram_auth_token') || localStorage.getItem('authToken');
        const initData = window.Telegram?.WebApp?.initData;

        // Test raw WebApp endpoint
        if (initData) {
          const response = await fetch(`${API_BASE}/webapp/group/${groupId}/stats?period=month`, {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              'X-Telegram-Init-Data': initData,
              ...(token && { Authorization: `Bearer ${token}` }),
            },
          });

          if (response.ok) {
            const data = await response.json();
            setTestResults(
              prev => prev + `Raw WebApp API Response:\n${JSON.stringify(data, null, 2)}\n`
            );
          } else {
            const errorText = await response.text();
            setTestResults(
              prev => prev + `Raw WebApp API Error (${response.status}): ${errorText}\n`
            );
          }
        }

        // Test raw JWT endpoint
        if (token) {
          const response = await fetch(`${API_BASE}/groups/${groupId}/stats?period=month`, {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setTestResults(
              prev => prev + `Raw JWT API Response:\n${JSON.stringify(data, null, 2)}\n`
            );
          } else {
            const errorText = await response.text();
            setTestResults(prev => prev + `Raw JWT API Error (${response.status}): ${errorText}\n`);
          }
        }
      } catch (rawError) {
        setTestResults(prev => prev + `Raw API Test Error: ${rawError.message}\n`);
      }
    } catch (error) {
      setTestResults(prev => prev + `General Error: ${error.message}\n`);
      console.error('Stats test error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>🔍 Stats API Debugger</h2>
      <button
        onClick={testStats}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Testing...' : 'Test Stats API'}
      </button>

      <pre
        style={{
          backgroundColor: '#f5f5f5',
          padding: '15px',
          borderRadius: '5px',
          marginTop: '20px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: '12px',
          maxHeight: '600px',
          overflow: 'auto',
        }}
      >
        {testResults}
      </pre>
    </div>
  );
};

export default StatsDebugger;
