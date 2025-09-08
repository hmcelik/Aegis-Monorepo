import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api';
import GroupSelector from './GroupSelector';
import GroupStats from './GroupStats';
import GroupSettings from './GroupSettings';
import StrikeManagement from './StrikeManagement';
import AuditLog from './AuditLog';
import LoadingScreen from './common/LoadingScreen';
import ErrorScreen from './common/ErrorScreen';
import { LoadingCard, ErrorCard, EmptyState } from './UXComponents';
import StatsDebugger from './StatsDebugger';

const GroupManagementDashboard = ({ user }) => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupStats, setGroupStats] = useState({}); // Initialize as empty object instead of null
  const [groupSettings, setGroupSettings] = useState({}); // Initialize as empty object instead of null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const [activeTab, setActiveTab] = useState('statistics'); // statistics, settings, strikes, audit
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // Default to week
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);

  // Load groups on component mount
  useEffect(() => {
    loadGroups();
  }, []);

  // Load group data when group is selected
  useEffect(() => {
    if (selectedGroup) {
      loadGroupData(selectedGroup.id);
    }
  }, [selectedGroup]);

  const loadGroups = async () => {
    console.log('🔄 Loading groups...');
    try {
      setLoading(true);
      setError(null);

      // Try to get groups using JWT token first, fallback to WebApp method
      let response;
      try {
        console.log('🔐 Trying JWT method...');
        response = await apiService.groups.getAll();
        console.log('✅ JWT method successful:', response);
      } catch (jwtError) {
        console.log('❌ JWT method failed, trying WebApp method:', jwtError.message);
        try {
          response = await apiService.groups.getAllWebApp();
          console.log('✅ WebApp method successful:', response);
        } catch (webAppError) {
          console.log('❌ WebApp method also failed:', webAppError.message);
          throw new Error(
            `Both auth methods failed: JWT(${jwtError.message}), WebApp(${webAppError.message})`
          );
        }
      }

      // Ensure we always have an array for groups
      let groupsData = [];
      if (response?.data) {
        if (Array.isArray(response.data)) {
          // Direct array response (legacy format)
          groupsData = response.data;
        } else if (typeof response.data === 'object') {
          // Check for unified API format: {success, data: [groups]}
          if (response.data.data && Array.isArray(response.data.data)) {
            groupsData = response.data.data;
          }
          // Check for legacy format: {groups: [array]}
          else if (response.data.groups && Array.isArray(response.data.groups)) {
            groupsData = response.data.groups;
          } else {
            console.warn('⚠️ Unexpected groups data format:', response.data);
            groupsData = [];
          }
        }
      }

      console.log('📊 Final groups data:', { length: groupsData.length, groups: groupsData });
      setGroups(groupsData);
      toast.success(`Loaded ${groupsData.length} groups`);
    } catch (err) {
      console.error('💥 Error loading groups:', err);
      console.error('📄 Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        stack: err.stack,
      });

      // Always ensure groups is an empty array, never undefined
      setGroups([]);
      const errorMessage = `Failed to load groups: ${err.message}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupData = async (
    groupId,
    period = selectedPeriod,
    startDate = customStartDate,
    endDate = customEndDate
  ) => {
    console.log('📊 Loading group data for groupId:', groupId);
    console.log('📊 Using period:', period, 'startDate:', startDate, 'endDate:', endDate);
    console.log('📊 GroupId type:', typeof groupId);
    console.log('📊 GroupId value:', JSON.stringify(groupId));

    // Validate groupId
    if (!groupId) {
      console.error('❌ No groupId provided to loadGroupData');
      toast.error('No group ID provided');
      return;
    }

    try {
      setStatsLoading(true);
      setSettingsLoading(true);

      // Try WebApp version first, then fallback to JWT version
      let statsPromise, settingsPromise;

      // Check if we're in Telegram WebApp context
      const isWebApp = window.Telegram?.WebApp?.initData;

      if (isWebApp) {
        console.log('🌐 Using WebApp API methods...');
        statsPromise = apiService.groups.getStatsWebApp(groupId, period, startDate, endDate);
        settingsPromise = apiService.groups.getSettingsWebApp(groupId);
      } else {
        console.log('🔑 Using JWT API methods...');
        statsPromise = apiService.groups.getStats(groupId, period, startDate, endDate);
        settingsPromise = apiService.groups.getSettings(groupId);
      }

      // Load both stats and settings in parallel
      const [statsResponse, settingsResponse] = await Promise.allSettled([
        statsPromise,
        settingsPromise,
      ]);

      console.log('📊 Raw stats response:', statsResponse);
      console.log('⚙️ Raw settings response:', settingsResponse);

      // Handle stats response with better error logging
      if (statsResponse.status === 'fulfilled') {
        console.log('📊 Stats response structure:', JSON.stringify(statsResponse.value, null, 2));

        // Extract the actual stats data based on API documentation structure
        let statsData = null;
        let actualStats = null;

        // Handle Axios response wrapper structure
        if (statsResponse.value?.data) {
          statsData = statsResponse.value.data;
          console.log('✅ Stats extracted from Axios response.data:', statsData);
        } else {
          statsData = statsResponse.value;
          console.log('✅ Stats using direct response:', statsData);
        }

        // Based on API documentation:
        // WebApp endpoint: { success: true, data: { groupId: "...", period: "...", stats: {...} } }
        // JWT endpoint: { totalMessagesProcessed: 1250, violationsDetected: 45, ... }

        if (statsData && statsData.success && statsData.data && statsData.data.stats) {
          // WebApp format: Extract from nested structure
          actualStats = statsData.data.stats;
          console.log('✅ Stats loaded successfully (WebApp nested format):', actualStats);
        } else if (statsData && statsData.data && statsData.data.stats) {
          // WebApp format without success wrapper
          actualStats = statsData.data.stats;
          console.log('✅ Stats loaded successfully (WebApp direct data.stats):', actualStats);
        } else if (statsData && statsData.stats) {
          // WebApp format: stats directly under response
          actualStats = statsData.stats;
          console.log('✅ Stats loaded successfully (WebApp direct stats):', actualStats);
        } else if (
          statsData &&
          (statsData.totalMessages !== undefined ||
            statsData.flaggedMessages !== undefined ||
            statsData.deletedMessages !== undefined ||
            statsData.mutedUsers !== undefined)
        ) {
          // WebApp format: Direct stats data (flat structure)
          // WebApp format: Direct stats data (flat structure)
          actualStats = statsData;
          console.log('✅ Stats loaded successfully (WebApp flat structure):', actualStats);
        } else if (
          statsData &&
          (statsData.totalMessagesProcessed !== undefined ||
            statsData.violationsDetected !== undefined ||
            statsData.actionsTaken !== undefined ||
            statsData.deletionsToday !== undefined)
        ) {
          // JWT format: Convert to WebApp format for consistency
          actualStats = {
            totalMessages: statsData.totalMessagesProcessed || 0,
            flaggedMessages: statsData.violationsDetected || 0,
            deletedMessages: statsData.deletionsToday || 0,
            mutedUsers: 0, // Not provided by JWT endpoint
            kickedUsers: 0, // Not provided by JWT endpoint
            bannedUsers: 0, // Not provided by JWT endpoint
            averageSpamScore: 0, // Not provided by JWT endpoint
            topViolationTypes: [], // Not provided by JWT endpoint
          };
          console.log('✅ Stats loaded successfully (JWT format converted):', actualStats);
          console.log('🔄 Original JWT data:', statsData);
        } else {
          console.warn('⚠️ No valid stats data found in response:', {
            hasSuccess: !!statsData?.success,
            hasData: !!statsData?.data,
            hasStats: !!statsData?.stats,
            hasDirectWebAppFields: !!(statsData?.totalMessages || statsData?.flaggedMessages),
            hasJWTFields: !!(statsData?.totalMessagesProcessed || statsData?.violationsDetected),
            rawData: statsData,
          });
          actualStats = {};
        }

        // Set the final stats
        if (actualStats) {
          setGroupStats(actualStats);
        }
      } else {
        console.error('❌ Failed to load group stats:', statsResponse.reason);
        setGroupStats({});
        toast.error(
          `Failed to load group statistics: ${statsResponse.reason?.message || 'Unknown error'}`
        );
      }

      // Handle settings response with better error logging
      if (settingsResponse.status === 'fulfilled') {
        console.log(
          '⚙️ Settings response structure:',
          JSON.stringify(settingsResponse.value, null, 2)
        );

        // Extract the actual settings data from the nested structure
        let settingsData = null;
        if (settingsResponse.value?.data?.data?.settings) {
          // Backend returns: { data: { success: true, data: { settings: {...} } } }
          settingsData = settingsResponse.value.data.data.settings;
          console.log('✅ Settings extracted from nested structure:', settingsData);
        } else if (settingsResponse.value?.data?.settings) {
          // Fallback: { data: { settings: {...} } }
          settingsData = settingsResponse.value.data.settings;
          console.log('✅ Settings extracted from data.settings:', settingsData);
        } else if (settingsResponse.value?.data) {
          // Fallback: use the entire data object
          settingsData = settingsResponse.value.data;
          console.log('✅ Settings using entire data object:', settingsData);
        }

        if (settingsData) {
          setGroupSettings(settingsData);
          console.log('✅ Settings loaded successfully:', settingsData);
        } else {
          console.warn('⚠️ No settings data found in response:', settingsResponse.value);
          setGroupSettings({});
        }
      } else {
        console.error('❌ Failed to load group settings:', settingsResponse.reason);
        setGroupSettings({});
        toast.error(
          `Failed to load group settings: ${settingsResponse.reason?.message || 'Unknown error'}`
        );
      }
    } catch (err) {
      console.error('💥 Error loading group data:', err);
      toast.error('Failed to load group data');
    } finally {
      setStatsLoading(false);
      setSettingsLoading(false);
    }
  };

  const handleGroupSelect = group => {
    console.log('🎯 Group selected:', group);

    // Validate group object
    if (!group || typeof group !== 'object' || !group.id) {
      console.error('❌ Invalid group object:', group);
      toast.error('Invalid group selection');
      return;
    }

    try {
      setSelectedGroup(group);
      setGroupStats({}); // Use empty object instead of null to prevent Object.keys errors
      setGroupSettings({}); // Use empty object instead of null to prevent Object.keys errors
      toast.info(`Selected group: ${group.title || 'Unknown Group'}`);
    } catch (error) {
      console.error('💥 Error selecting group:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        group: group,
      });
      toast.error('Failed to select group');
    }
  };

  const handleSettingsUpdate = async newSettings => {
    if (!selectedGroup) return;

    try {
      const response = await apiService.groups.updateSettings(selectedGroup.id, newSettings);

      if (response?.data?.settings) {
        setGroupSettings(response.data.settings);
        toast.success('Settings updated successfully!');
      } else {
        toast.success('Settings updated!');
        // Reload settings to get the latest state
        const settingsResponse = await apiService.groups.getSettings(selectedGroup.id);
        if (settingsResponse?.data) {
          setGroupSettings(settingsResponse.data);
        }
      }
    } catch (err) {
      console.error('Error updating settings:', err);
      toast.error(`Failed to update settings: ${err.message}`);
    }
  };

  const handleRefreshStats = () => {
    if (selectedGroup) {
      loadGroupData(selectedGroup.id, selectedPeriod, customStartDate, customEndDate);
    }
  };

  const handlePeriodChange = (period, startDate = null, endDate = null) => {
    console.log('📅 Period changed to:', period, 'dates:', startDate, endDate);

    setSelectedPeriod(period);
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);

    if (selectedGroup) {
      loadGroupData(selectedGroup.id, period, startDate, endDate);
    }
  };

  // Debug function to test API endpoints directly
  const debugTestStats = async () => {
    if (!selectedGroup) {
      toast.error('Please select a group first');
      return;
    }

    console.log('\n🔍 COMPREHENSIVE API DEBUG TEST');
    console.log('===============================');
    console.log('Selected Group ID:', selectedGroup.id);
    console.log(
      'API Base URL:',
      import.meta.env.VITE_API_URL || 'https://minnow-good-mostly.ngrok-free.app/api/v1'
    );

    toast.info('Running API endpoint verification - check console for detailed results');

    try {
      // Test 1: Direct API calls bypassing service layer
      console.log('\n🧪 TEST 1: Direct API endpoint calls');

      const baseUrl =
        import.meta.env.VITE_API_URL || 'https://minnow-good-mostly.ngrok-free.app/api/v1';
      const groupId = selectedGroup.id;

      // Get auth headers for both types
      const telegramInitData = window.Telegram?.WebApp?.initData;
      const jwtToken =
        localStorage.getItem('telegram_auth_token') || localStorage.getItem('authToken');

      console.log('Auth Status:', {
        hasInitData: !!telegramInitData,
        hasJWTToken: !!jwtToken,
        initDataLength: telegramInitData?.length || 0,
        jwtTokenLength: jwtToken?.length || 0,
      });

      // Direct WebApp endpoint call
      if (telegramInitData) {
        console.log('\n📱 Direct WebApp Stats Call:');
        try {
          const webappUrl = `${baseUrl}/webapp/group/${groupId}/stats?period=week`;
          console.log('WebApp URL:', webappUrl);

          const webappResponse = await fetch(webappUrl, {
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': telegramInitData,
              'ngrok-skip-browser-warning': 'true',
            },
          });

          const webappData = await webappResponse.json();
          console.log('WebApp Response Status:', webappResponse.status);
          console.log('WebApp Response Headers:', Object.fromEntries(webappResponse.headers));
          console.log('WebApp Full Response:', webappData);

          // Navigate to stats data
          if (webappData?.success && webappData?.data?.stats) {
            console.log('✅ WebApp Stats Found:', webappData.data.stats);
          } else if (webappData?.data?.stats) {
            console.log('✅ WebApp Stats Found (no success wrapper):', webappData.data.stats);
          } else {
            console.log('❌ WebApp Stats NOT found in expected location');
          }
        } catch (err) {
          console.error('❌ Direct WebApp call failed:', err);
        }
      }

      // Direct JWT endpoint call
      if (jwtToken) {
        console.log('\n🔐 Direct JWT Stats Call:');
        try {
          const jwtUrl = `${baseUrl}/groups/${groupId}/stats`;
          console.log('JWT URL:', jwtUrl);

          const jwtResponse = await fetch(jwtUrl, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwtToken}`,
              'ngrok-skip-browser-warning': 'true',
            },
          });

          const jwtData = await jwtResponse.json();
          console.log('JWT Response Status:', jwtResponse.status);
          console.log('JWT Response Headers:', Object.fromEntries(jwtResponse.headers));
          console.log('JWT Full Response:', jwtData);

          // Check for JWT format
          if (jwtData?.totalMessagesProcessed !== undefined) {
            console.log('✅ JWT Stats Found (legacy format):', jwtData);
          } else {
            console.log('❌ JWT Stats NOT found in expected format');
          }
        } catch (err) {
          console.error('❌ Direct JWT call failed:', err);
        }
      }

      // Test 2: Service layer calls
      console.log('\n🔧 TEST 2: Service layer calls');

      const periods = ['day', 'week', 'month'];
      for (const period of periods) {
        console.log(`\n� Testing period: ${period}`);

        try {
          const webAppResponse = await apiService.groups.getStatsWebApp(selectedGroup.id, period);
          console.log(`WebApp ${period} full response:`, webAppResponse);
          console.log(`WebApp ${period} data path:`, webAppResponse?.data);
        } catch (err) {
          console.error(`WebApp ${period} error:`, err.message);
        }

        try {
          const jwtResponse = await apiService.groups.getStats(selectedGroup.id, period);
          console.log(`JWT ${period} full response:`, jwtResponse);
          console.log(`JWT ${period} data path:`, jwtResponse?.data);
        } catch (err) {
          console.error(`JWT ${period} error:`, err.message);
        }
      }

      // Test 3: Compare with audit logs
      console.log('\n� TEST 3: Audit logs for data verification');
      try {
        const auditResponse = await apiService.audit.getLogs(selectedGroup.id);
        const auditCount = auditResponse?.data?.length || 0;
        console.log('Audit logs response:', auditResponse);
        console.log('Audit logs count:', auditCount);

        if (auditCount > 0) {
          console.log('Sample audit entries:', auditResponse.data.slice(0, 5));
          console.log("❗ If audit logs exist but stats are zero, there's a data extraction issue");
        } else {
          console.log('No audit logs found - this might explain zero stats');
        }
      } catch (err) {
        console.error('Audit logs error:', err.message);
      }

      toast.success('🎯 API Debug test completed - check console for detailed analysis');
    } catch (err) {
      console.error('❌ Debug test failed:', err);
      toast.error('Debug test failed - check console for error details');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingCard
          title="Loading your groups..."
          subtitle="Please wait while we fetch your administration data"
          size="large"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <ErrorCard
            title="Failed to Load Groups"
            message={error}
            onRetry={loadGroups}
            retryText="Retry Loading"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl border border-green-200/50 p-8 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-4">
              <span className="text-3xl">🏘️</span>
              <span>Group Management</span>
            </h1>
            <p className="mt-3 text-gray-700 text-lg">
              Managing groups for{' '}
              <span className="font-semibold text-green-600">{user.first_name}</span>
              {user.is_guest && (
                <span className="ml-3 px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-sm rounded-full font-medium shadow-md">
                  Demo Mode
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/30 shadow-md">
              <div className="text-sm text-gray-600 mb-1">Total Groups</div>
              <div className="text-2xl font-bold text-gray-900">{groups.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Panel - Group Selector */}
        <div className="lg:col-span-1">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 overflow-hidden h-fit">
            <GroupSelector
              groups={groups}
              selectedGroup={selectedGroup}
              onGroupSelect={handleGroupSelect}
              onRefresh={loadGroups}
            />
          </div>
        </div>

        {/* Right Panel - Group Details */}
        <div className="lg:col-span-3">
          {selectedGroup ? (
            <div className="space-y-6">
              {/* Group Info Header */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-4 mb-2">
                      <span className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {selectedGroup.title?.[0] || '🏘️'}
                      </span>
                      <span className="flex-1">{selectedGroup.title}</span>
                    </h2>
                    <div className="mt-3 flex items-center space-x-4">
                      <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                        <span className="text-sm font-medium text-green-700">
                          {selectedGroup.member_count} members
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 rounded-full">
                        <span className="text-sm font-medium text-blue-700 capitalize">
                          {selectedGroup.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab Navigation - Fixed Chrome-style with Better Spacing */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                <div className="bg-slate-50/50 border-b border-slate-200/80">
                  <nav className="flex flex-wrap gap-2 p-2 sm:p-3">
                    <button
                      onClick={() => setActiveTab('statistics')}
                      className={`!relative !px-4 !py-3 !font-medium !text-sm !transition-all !duration-200 !rounded-lg !border-b-3 !flex-shrink-0 !inline-flex !items-center !gap-2 !border-none !outline-none !cursor-pointer ${
                        activeTab === 'statistics'
                          ? '!bg-white !text-blue-600 !border-blue-500 !shadow-sm !z-10'
                          : '!text-slate-600 !border-transparent hover:!text-slate-900 hover:!bg-white/60'
                      }`}
                      type="button"
                    >
                      <span>📊</span>
                      <span className="hidden sm:inline">Statistics</span>
                      <span className="sm:hidden">Stats</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`!relative !px-4 !py-3 !font-medium !text-sm !transition-all !duration-200 !rounded-lg !border-b-3 !flex-shrink-0 !inline-flex !items-center !gap-2 !border-none !outline-none !cursor-pointer ${
                        activeTab === 'settings'
                          ? '!bg-white !text-blue-600 !border-blue-500 !shadow-sm !z-10'
                          : '!text-slate-600 !border-transparent hover:!text-slate-900 hover:!bg-white/60'
                      }`}
                      type="button"
                    >
                      <span>⚙️</span>
                      <span>Settings</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('strikes')}
                      className={`!relative !px-4 !py-3 !font-medium !text-sm !transition-all !duration-200 !rounded-lg !border-b-3 !flex-shrink-0 !inline-flex !items-center !gap-2 !border-none !outline-none !cursor-pointer ${
                        activeTab === 'strikes'
                          ? '!bg-white !text-orange-600 !border-orange-500 !shadow-sm !z-10'
                          : '!text-slate-600 !border-transparent hover:!text-slate-900 hover:!bg-white/60'
                      }`}
                      type="button"
                    >
                      <span>⚠️</span>
                      <span className="hidden sm:inline">Strike Management</span>
                      <span className="sm:hidden">Strikes</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('audit')}
                      className={`!relative !px-4 !py-3 !font-medium !text-sm !transition-all !duration-200 !rounded-lg !border-b-3 !flex-shrink-0 !inline-flex !items-center !gap-2 !border-none !outline-none !cursor-pointer ${
                        activeTab === 'audit'
                          ? '!bg-white !text-purple-600 !border-purple-500 !shadow-sm !z-10'
                          : '!text-slate-600 !border-transparent hover:!text-slate-900 hover:!bg-white/60'
                      }`}
                      type="button"
                    >
                      <span>📋</span>
                      <span className="hidden sm:inline">Audit Log</span>
                      <span className="sm:hidden">Audit</span>
                    </button>
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="min-h-[600px]">
                  {activeTab === 'statistics' && (
                    <div className="p-8">
                      <GroupStats
                        stats={groupStats}
                        loading={statsLoading}
                        onRefresh={handleRefreshStats}
                        onPeriodChange={handlePeriodChange}
                      />
                    </div>
                  )}

                  {activeTab === 'settings' && (
                    <div className="p-8">
                      <GroupSettings
                        settings={groupSettings}
                        loading={settingsLoading}
                        onUpdate={handleSettingsUpdate}
                      />
                    </div>
                  )}

                  {activeTab === 'strikes' && (
                    <div className="p-8">
                      <StrikeManagement
                        groupId={selectedGroup.id}
                        groupTitle={selectedGroup.title}
                      />
                    </div>
                  )}

                  {activeTab === 'audit' && (
                    <div className="p-8">
                      <AuditLog groupId={selectedGroup.id} groupTitle={selectedGroup.title} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl text-gray-500">�️</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Select a Group to Manage
                </h3>
                <p className="text-gray-600 mb-6">
                  Choose a group from the sidebar to view its statistics, configure settings, and
                  manage moderation.
                </p>
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-700">
                    💡 <strong>Tip:</strong> If you don't see any groups, make sure the bot is added
                    to your Telegram groups with admin permissions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Debug Tools */}
    </div>
  );
};

export default GroupManagementDashboard;
