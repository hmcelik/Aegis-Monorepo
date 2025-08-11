import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api';
import { Settings, Play, CheckCircle, XCircle, Clock, Database, Shield, Zap } from 'lucide-react';
import './SuperAdminTestPage.css';

const SUPER_ADMIN_ID = '5057224206';

// Helper function to extract groups array from API response
const extractGroupsFromResponse = (response) => {
  if (!response) return [];
  
  // Check axios response format first
  if (response.data) {
    // Unified API format: {data: {success: true, data: [groups]}}
    if (response.data.data && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    // Legacy direct array: {data: [groups]}
    if (Array.isArray(response.data)) {
      return response.data;
    }
    // Legacy format: {data: {groups: [array]}}
    if (response.data.groups && Array.isArray(response.data.groups)) {
      return response.data.groups;
    }
  }
  
  // Direct array response (rare)
  if (Array.isArray(response)) {
    return response;
  }
  
  return [];
};

const SuperAdminTestPage = ({ user }) => {
  const [testResults, setTestResults] = useState({});
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [selectedTests, setSelectedTests] = useState({});
  const [serverStatus, setServerStatus] = useState(null);
  const [lastTestTime, setLastTestTime] = useState(null);

  // Check if user is super admin
  const isSuperAdmin = user?.id?.toString() === SUPER_ADMIN_ID || user?.id === parseInt(SUPER_ADMIN_ID);

  useEffect(() => {
    if (isSuperAdmin) {
      checkServerStatus();
    }
  }, [isSuperAdmin]);

  const checkServerStatus = async () => {
    try {
      const start = Date.now();
      const response = await fetch('/api/health');
      const latency = Date.now() - start;
      
      if (response.ok) {
        setServerStatus({
          status: 'online',
          latency: latency,
          timestamp: new Date().toISOString()
        });
      } else {
        setServerStatus({
          status: 'degraded',
          latency: latency,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      setServerStatus({
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };

  const testEndpoints = [
    // Health Endpoints
    {
      id: 'health',
      name: 'Test /health',
      icon: <Zap size={16} />,
      description: 'Test basic health endpoint',
      test: async () => {
        try {
          const response = await apiService.health.check();
          return { success: true, data: 'Health endpoint accessible', details: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'webapp_health',
      name: 'Test /webapp/health',
      icon: <Zap size={16} />,
      description: 'Test WebApp health endpoint',
      test: async () => {
        try {
          const response = await apiService.webApp.getHealth();
          return { success: true, data: 'WebApp health endpoint accessible', details: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'webapp_auth',
      name: 'Test /webapp/auth',
      icon: <Shield size={16} />,
      description: 'Test WebApp authentication endpoint',
      test: async () => {
        try {
          const tg = window.Telegram?.WebApp;
          if (!tg || !tg.initData) {
            return { success: false, error: 'Telegram WebApp initData not available' };
          }
          const response = await apiService.webApp.authenticate(tg.initData);
          return { success: true, data: 'WebApp auth endpoint accessible', details: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'token_status',
      name: '🔑 Test Token Status',
      icon: <Shield size={16} />,
      description: 'Check authentication token status',
      test: async () => {
        try {
          const response = await apiService.auth.getStatus();
          return { success: true, data: 'Auth status endpoint accessible', details: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'groups',
      name: 'Test /groups',
      icon: <Database size={16} />,
      description: 'Test groups endpoint with JWT',
      test: async () => {
        try {
          const response = await apiService.groups.getAll();
          return { 
            success: true, 
            data: `Found ${response.data?.length || 0} groups (JWT method)`,
            details: response.data 
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'webapp_groups',
      name: 'Test /webapp/user/groups',
      icon: <Database size={16} />,
      description: 'Test WebApp groups endpoint',
      test: async () => {
        try {
          const response = await apiService.groups.getAllWebApp();
          return { 
            success: true, 
            data: `Found ${response.data?.length || 0} groups (WebApp method)`,
            details: response.data 
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    // NLP Testing
    {
      id: 'nlp_status',
      name: 'Test NLP Status',
      icon: <Settings size={16} />,
      description: 'Test NLP service status endpoint',
      test: async () => {
        try {
          const response = await apiService.nlp.getStatus();
          return { success: true, data: 'NLP status endpoint accessible', details: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'nlp_spam',
      name: 'Test NLP Spam',
      icon: <Shield size={16} />,
      description: 'Test NLP spam detection',
      test: async () => {
        try {
          const testText = "Buy now! Limited time offer! Click here for amazing deals!!!";
          const response = await apiService.nlp.testSpam(testText);
          return { 
            success: true, 
            data: `Spam detection result: ${response.analysis?.isSpam ? 'SPAM' : 'NOT SPAM'}`,
            details: response.analysis 
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'nlp_profanity',
      name: 'Test NLP Profanity',
      icon: <Shield size={16} />,
      description: 'Test NLP profanity detection',
      test: async () => {
        try {
          const testText = "This is a clean message for testing.";
          const response = await apiService.nlp.testProfanity(testText);
          return { 
            success: true, 
            data: `Profanity detection result: ${response.analysis?.hasProfanity ? 'PROFANE' : 'CLEAN'}`,
            details: response.analysis 
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'nlp_analyze',
      name: 'Test NLP Analyze',
      icon: <Settings size={16} />,
      description: 'Test complete NLP analysis',
      test: async () => {
        try {
          // Get groups first to get a valid groupId
          let groupsResponse;
          try {
            groupsResponse = await apiService.groups.getAll();
          } catch {
            groupsResponse = await apiService.groups.getAllWebApp();
          }
          
          const groupId = groupsResponse.data?.[0]?.id || '-4982630468'; // Use first group ID or fallback
          
          const testText = "Buy crypto now! Amazing deals! Don't miss out!!!";
          const response = await apiService.nlp.analyze(testText, { groupId });
          return { 
            success: true, 
            data: `Analysis complete - Spam: ${response.analysis?.spam?.isSpam ? 'YES' : 'NO'}, Profanity: ${response.analysis?.profanity?.hasProfanity ? 'YES' : 'NO'}`,
            details: response.analysis 
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    // Audit Log Testing
    {
      id: 'audit_logs',
      name: 'Test Audit Logs',
      icon: <Database size={16} />,
      description: 'Test audit log retrieval',
      test: async () => {
        try {
          // Get groups first
          let groupsResponse;
          try {
            groupsResponse = await apiService.groups.getAll();
          } catch {
            groupsResponse = await apiService.groups.getAllWebApp();
          }
          
          const groups = extractGroupsFromResponse(groupsResponse);
          if (!groups || groups.length === 0) {
            return { success: false, error: 'No groups available to test audit logs' };
          }
          
          const firstGroup = groups[0];
          const response = await apiService.audit.getLogs(firstGroup.id, { page: 1, limit: 10 });
          return { 
            success: true, 
            data: `Found ${response.data?.length || 0} audit log entries for group: ${firstGroup.title}`,
            details: { groupId: firstGroup.id, logs: response.data, pagination: response.pagination }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    {
      id: 'audit_export',
      name: 'Test Audit Export',
      icon: <Database size={16} />,
      description: 'Test audit log export functionality',
      test: async () => {
        try {
          // Get groups first
          let groupsResponse;
          try {
            groupsResponse = await apiService.groups.getAll();
          } catch {
            groupsResponse = await apiService.groups.getAllWebApp();
          }
          
          const groups = extractGroupsFromResponse(groupsResponse);
          if (!groups || groups.length === 0) {
            return { success: false, error: 'No groups available to test audit export' };
          }
          
          const firstGroup = groups[0];
          const response = await apiService.audit.export(firstGroup.id, 'json');
          return { 
            success: true, 
            data: `Audit export successful for group: ${firstGroup.title}`,
            details: { groupId: firstGroup.id, format: 'json', hasData: !!response.data }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    },
    // Strike Management Testing
    {
      id: 'strikes_test',
      name: 'Test Strike Management',
      icon: <Shield size={16} />,
      description: 'Test strike management endpoints',
      test: async () => {
        try {
          // Get groups first
          let groupsResponse;
          try {
            groupsResponse = await apiService.groups.getAll();
          } catch {
            groupsResponse = await apiService.groups.getAllWebApp();
          }
          
          const groups = extractGroupsFromResponse(groupsResponse);
          if (!groups || groups.length === 0) {
            return { success: false, error: 'No groups available to test strikes' };
          }
          
          const firstGroup = groups[0];
          const testUserId = '123456789'; // Test user ID
          
          // Test getting strike history
          const response = await apiService.strikes.getHistory(firstGroup.id, testUserId);
          return { 
            success: true, 
            data: `Strike history retrieved for test user in group: ${firstGroup.title}`,
            details: { groupId: firstGroup.id, userId: testUserId, currentStrikes: response.data?.currentStrikes }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    }
  ];

  const runTest = async (testId) => {
    const test = testEndpoints.find(t => t.id === testId);
    if (!test) return;

    setTestResults(prev => ({
      ...prev,
      [testId]: { status: 'running', startTime: Date.now() }
    }));

    try {
      const result = await test.test();
      const duration = Date.now() - testResults[testId]?.startTime || 0;
      
      setTestResults(prev => ({
        ...prev,
        [testId]: {
          ...result,
          status: result.success ? 'success' : 'error',
          duration,
          timestamp: new Date().toISOString()
        }
      }));

      if (result.success) {
        toast.success(`✅ ${test.name} passed`);
      } else {
        toast.error(`❌ ${test.name} failed`);
      }
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [testId]: {
          success: false,
          error: error.message,
          status: 'error',
          duration: Date.now() - (testResults[testId]?.startTime || 0),
          timestamp: new Date().toISOString()
        }
      }));
      toast.error(`❌ ${test.name} failed`);
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setLastTestTime(new Date().toISOString());
    
    for (const test of testEndpoints) {
      await runTest(test.id);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunningTests(false);
    toast.success('🎯 All tests completed');
  };

  const runSelectedTests = async () => {
    setIsRunningTests(true);
    
    const selectedTestIds = Object.keys(selectedTests).filter(id => selectedTests[id]);
    for (const testId of selectedTestIds) {
      await runTest(testId);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunningTests(false);
    toast.success('🎯 Selected tests completed');
  };

  const getStatusIcon = (result) => {
    if (!result) return <Clock size={16} className="text-gray-400" />;
    if (result.status === 'running') return <Clock size={16} className="text-blue-500 animate-spin" />;
    if (result.status === 'success') return <CheckCircle size={16} className="text-green-500" />;
    return <XCircle size={16} className="text-red-500" />;
  };

  if (!isSuperAdmin) {
    return (
      <div className="super-admin-test-page">
        <div className="unauthorized-access">
          <Shield size={48} className="status-icon error" />
          <h2>🚫 Access Denied</h2>
          <p>This page is only accessible to super administrators.</p>
          <p>
            User ID: {user?.id || 'Unknown'} (Required: {SUPER_ADMIN_ID})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="super-admin-test-page">
      <div className="admin-header">
        <h1>🛠️ Super Admin Test Panel</h1>
        <p>Comprehensive API endpoint testing and diagnostics</p>
        
        {/* Server Status */}
        <div className={`server-status ${serverStatus?.status || 'offline'}`}>
          <h3>🌐 Server Status</h3>
          <div className="server-status-info">
            <div className="server-status-item">
              <span>Status: <strong>{serverStatus?.status || 'checking...'}</strong></span>
            </div>
            {serverStatus?.latency && (
              <div className="server-status-item">
                <span>Latency: <strong>{serverStatus.latency}ms</strong></span>
              </div>
            )}
            <button onClick={checkServerStatus} className="refresh-server-btn">
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Test Controls */}
      <div className="test-controls">
        <div className="test-controls-header">
          <h2>Test Controls</h2>
          <div className="test-buttons">
            <button
              onClick={runAllTests}
              disabled={isRunningTests}
              className={`test-btn primary ${isRunningTests ? 'disabled' : ''}`}
            >
              <Play size={16} />
              {isRunningTests ? 'Running Tests...' : 'Run All Tests'}
            </button>
            
            <button
              onClick={runSelectedTests}
              disabled={isRunningTests || Object.values(selectedTests).every(v => !v)}
              className="test-btn success"
            >
              Run Selected ({Object.values(selectedTests).filter(Boolean).length})
            </button>

            <button
              onClick={() => {
                setTestResults({});
                setSelectedTests({});
              }}
              className="test-btn secondary"
            >
              Clear Results
            </button>
          </div>
        </div>

        {lastTestTime && (
          <div className="test-meta">
            Last test run: {new Date(lastTestTime).toLocaleString()}
          </div>
        )}
      </div>

      {/* Test Grid */}
      <div className="tests-grid">
        {testEndpoints.map(test => {
          const result = testResults[test.id];
          return (
            <div
              key={test.id}
              className={`test-card ${result?.status || 'pending'}`}
            >
              <div className="test-header">
                <div className="test-header-top">
                  <div className="test-info">
                    <input
                      type="checkbox"
                      className="test-checkbox"
                      checked={selectedTests[test.id] || false}
                      onChange={(e) => setSelectedTests(prev => ({
                        ...prev,
                        [test.id]: e.target.checked
                      }))}
                    />
                    <div className="test-icon">{test.icon}</div>
                    <h3 className="test-name">{test.name}</h3>
                  </div>
                  <div className="test-status-icon">{getStatusIcon(result)}</div>
                </div>
                
                <p className="test-description">
                  {test.description}
                </p>
              </div>
              
              <button
                onClick={() => runTest(test.id)}
                disabled={result?.status === 'running'}
                className="test-run-btn"
              >
                {result?.status === 'running' ? 'Running...' : 'Run Test'}
              </button>
              
              {result && (
                <div className="test-result">
                  <div className="test-result-row">
                    <span className="test-result-label">Status:</span>
                    <span className={`test-result-value test-result-${result.status}`}>{result.status}</span>
                  </div>
                  {result.duration && (
                    <div className="test-result-row">
                      <span className="test-result-label">Duration:</span>
                      <span className="test-result-value">{result.duration}ms</span>
                    </div>
                  )}
                  
                  {result.data && (
                    <div className="test-result-row">
                      <span className="test-result-label">Result:</span>
                      <span className="test-result-value test-result-success">{result.data}</span>
                    </div>
                  )}
                  
                  {result.error && (
                    <div className="test-result-row">
                      <span className="test-result-label">Error:</span>
                      <span className="test-result-value test-result-error">{result.error}</span>
                    </div>
                  )}
                  
                  {result.details && (
                    <details className="test-result-details">
                      <summary>Details</summary>
                      <pre>
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </details>
                  )}
                  
                  {result.timestamp && (
                    <div className="test-timestamp">
                      {new Date(result.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SuperAdminTestPage;
