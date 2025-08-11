import { useState } from 'react';
import { apiService } from '../services/api';

export const useDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);

  const loadDashboardData = async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Loading dashboard data...');
      }
      
      // Check available authentication methods
      const storedToken = localStorage.getItem('telegram_auth_token');
      const storedInitData = localStorage.getItem('telegram_init_data');
      const telegramInitData = window.Telegram?.WebApp?.initData || storedInitData;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔑 Authentication check:', {
          hasJwtToken: !!storedToken,
          hasInitData: !!telegramInitData,
          tokenLength: storedToken?.length || 0,
          initDataLength: telegramInitData?.length || 0,
          authMethod: storedToken ? 'JWT Bearer' : telegramInitData ? 'WebApp InitData' : 'None'
        });
      }
      
      // Set a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Try different approaches for loading groups data
      let groupsPromise;
      
      if (storedToken) {
        // Method 1: Use JWT Bearer token with /groups endpoint
        if (process.env.NODE_ENV === 'development') {
          console.log('🔑 Using JWT token authentication for /groups');
        }
        groupsPromise = apiService.groups.getAll();
      } else if (telegramInitData) {
        // Method 2: Use WebApp authentication with /webapp/user/groups
        if (process.env.NODE_ENV === 'development') {
          console.log('📱 Using WebApp authentication for /webapp/user/groups');
        }
        groupsPromise = apiService.groups.getAllWebApp();
      } else {
        // No authentication available
        console.warn('⚠️ No authentication method available for groups endpoint');
        groupsPromise = Promise.reject(new Error('No authentication available'));
      }
      
      const [groupsRes, healthRes] = await Promise.allSettled([
        groupsPromise,
        apiService.health?.check ? apiService.health.check() : Promise.resolve({ status: 'unknown' })
      ]);

      clearTimeout(timeoutId);

      if (process.env.NODE_ENV === 'development') {
        console.log('📈 Groups API result:', groupsRes);
        console.log('💚 Health API result:', healthRes);
      }

      // Handle groups response based on API documentation format
      let groups = [];
      if (groupsRes.status === 'fulfilled') {
        const groupsResponse = groupsRes.value;
        if (process.env.NODE_ENV === 'development') {
          console.log('📋 Raw groups response:', groupsResponse);
        }
        
        // Check if we have axios response with .data property
        if (groupsResponse.data && Array.isArray(groupsResponse.data)) {
          // Direct array in axios response.data (legacy format)
          groups = groupsResponse.data.map(group => ({
            ...group,
            bot_active: true // Assume bot is active if we can fetch group data
          }));
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Parsed groups from axios response.data (legacy):', groups.length);
          }
        } else if (groupsResponse.data?.data && Array.isArray(groupsResponse.data.data)) {
          // Unified API format: axios response with {success, data: [groups]}
          groups = groupsResponse.data.data.map(group => ({
            ...group,
            bot_active: true // Assume bot is active if we can fetch group data
          }));
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Parsed groups from unified API format:', groups.length);
          }
        } else if (Array.isArray(groupsResponse)) {
          groups = groupsResponse.map(group => ({
            ...group,
            bot_active: true // Assume bot is active if we can fetch group data
          }));
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Parsed groups from direct array:', groups.length);
          }
        } else if (groupsResponse.success && groupsResponse.data) {
          groups = Array.isArray(groupsResponse.data) 
            ? groupsResponse.data.map(group => ({
                ...group,
                bot_active: true // Assume bot is active if we can fetch group data
              }))
            : groupsResponse.data;
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Parsed groups from success.data format:', groups.length);
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Unexpected groups response format:', groupsResponse);
          }
        }
      } else {
        console.error('❌ Groups request failed:', groupsRes.reason);
      }

      // Handle health response
      let health = null;
      if (healthRes.status === 'fulfilled') {
        const healthResponse = healthRes.value;
        if (process.env.NODE_ENV === 'development') {
          console.log('🏥 Raw health response:', healthResponse);
        }
        
        // Extract health data from axios response
        if (healthResponse.data) {
          health = healthResponse.data;
        } else {
          health = healthResponse;
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('📝 Parsed groups:', groups);
        console.log('🏥 Parsed health:', health);
        
        // Debug: Show individual group details
        if (groups.length > 0) {
          console.log('🎯 Group details:');
          groups.forEach((group, index) => {
            console.log(`  ${index + 1}. ${group.title} (${group.id}) - ${group.member_count} members`);
          });
        }
      }

      // Calculate total members and active bots from groups
      const totalMembers = Array.isArray(groups) ? groups.reduce((total, group) => {
        return total + (group.member_count || group.members || 0);
      }, 0) : 0;

      const activeBots = Array.isArray(groups) ? groups.filter(group => group.bot_active).length : 0;

      const data = {
        groups: Array.isArray(groups) ? groups : [],
        stats: {
          total_groups: Array.isArray(groups) ? groups.length : 0,
          total_members: totalMembers,
          active_bots: activeBots
        },
        recent_activity: []
      };
      
      if (process.env.NODE_ENV === 'development') {
        console.log('💾 Setting dashboard data:', data);
      }
      setDashboardData(data);
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Dashboard data loaded successfully');
      }
      return data;
    } catch (error) {
      console.error('❌ Dashboard data loading error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        error: error
      });
      
      // Always set some data, even if empty
      const fallbackData = {
        groups: [],
        stats: { total_groups: 0, total_members: 0, active_bots: 0 },
        recent_activity: []
      };
      
      console.log('🔄 Setting fallback dashboard data:', fallbackData);
      setDashboardData(fallbackData);
      return fallbackData;
    }
  };

  const setDemoData = () => {
    const demoData = {
      groups: [
        { id: 1, title: 'Demo Group 1', member_count: 125, bot_active: true },
        { id: 2, title: 'Demo Group 2', member_count: 89, bot_active: false }
      ],
      stats: { total_groups: 2, total_members: 214, active_bots: 1 },
      recent_activity: []
    };
    
    setDashboardData(demoData);
    return demoData;
  };

  return {
    dashboardData,
    loadDashboardData,
    setDemoData,
    setDashboardData
  };
};
