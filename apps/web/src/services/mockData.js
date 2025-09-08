// Mock data for development and testing
export const mockData = {
  user: {
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
  },

  token: 'mock_jwt_token_for_development',

  groups: [
    {
      id: 'group1',
      title: 'Test Group #1',
      member_count: 150,
      bot_active: true,
      is_active: true,
      photo_url: null,
    },
    {
      id: 'group2',
      title: 'My Community',
      member_count: 75,
      bot_active: true,
      is_active: true,
      photo_url: null,
    },
    {
      id: 'group3',
      title: 'Development Chat',
      member_count: 25,
      bot_active: false,
      is_active: false,
      photo_url: null,
    },
  ],

  stats: {
    moderatedMessages: 1247,
    blockedSpam: 89,
    activeUsers: 342,
    recentActivities: [
      {
        icon: '🛡️',
        description: 'Spam message blocked in Test Group #1',
        timestamp: '2 minutes ago',
      },
      {
        icon: '⚠️',
        description: 'User warned for flooding in My Community',
        timestamp: '15 minutes ago',
      },
      {
        icon: '👤',
        description: 'New user joined Development Chat',
        timestamp: '1 hour ago',
      },
      {
        icon: '🔧',
        description: 'Settings updated in Test Group #1',
        timestamp: '3 hours ago',
      },
    ],
  },

  groupSettings: {
    antiFlood: {
      enabled: true,
      maxMessages: 5,
      timeWindow: 10,
      action: 'warn',
    },
    mediaRestrictions: {
      photos: false,
      videos: false,
      gifs: true,
      stickers: false,
      links: true,
      documents: false,
      voice: false,
      polls: false,
    },
    autoDelete: true,
    welcomeMessage: {
      enabled: true,
      text: 'Welcome to our group! Please read the rules and be respectful.',
    },
  },

  botStatus: {
    status: 'online',
    uptime: 86400,
    version: '1.0.0',
    totalGroups: 3,
  },

  groupStats: {
    totalMessagesProcessed: 1247,
    violationsDetected: 89,
    actionsTaken: 67,
    deletionsToday: 12,
    totalMessages: 245,
    moderationActions: 12,
    activeUsers: 38,
    violationsBlocked: 7,
    recentActivities: [
      {
        icon: '🛡️',
        description: 'Spam message blocked in this group',
        timestamp: '2 minutes ago',
      },
      {
        icon: '⚠️',
        description: 'User warned for flooding',
        timestamp: '15 minutes ago',
      },
      {
        icon: '🔧',
        description: 'Settings updated',
        timestamp: '3 hours ago',
      },
    ],
  },

  moderationLogs: [
    {
      action: 'warn',
      user: { first_name: 'John' },
      group: { title: 'Test Group #1' },
      reason: 'Spam detection',
      timestamp: new Date().toISOString(),
    },
    {
      action: 'mute',
      user: { first_name: 'Alice' },
      group: { title: 'My Community' },
      reason: 'Excessive flooding',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

// Mock API service for development
export const mockApiService = {
  auth: {
    verify: () =>
      Promise.resolve({
        data: {
          user: mockData.user,
          token: mockData.token,
        },
      }),

    login: credentials =>
      Promise.resolve({
        data: {
          success: true,
          token: mockData.token,
          user: {
            id: 987654321,
            email: credentials.email || 'user@example.com',
            name: 'Web User',
          },
        },
      }),

    register: userData =>
      Promise.resolve({
        data: {
          success: true,
          token: mockData.token,
          user: {
            id: 987654322,
            email: userData.email,
            name: userData.name || userData.fullName,
          },
        },
      }),

    verifyToken: () =>
      Promise.resolve({
        data: {
          success: true,
          valid: true,
          user: {
            id: 987654321,
            email: 'user@example.com',
            name: 'Web User',
          },
        },
      }),

    refresh: () => Promise.resolve({ data: { token: mockData.token } }),
  },

  groups: {
    getAll: () => Promise.resolve({ data: { groups: mockData.groups } }),
    getById: () =>
      Promise.resolve({
        data: mockData.groups[0],
      }),
    getSettings: () => Promise.resolve({ data: mockData.groupSettings }),
    updateSettings: (_, settings) => {
      console.log('Mock: Updating group settings:', settings);
      return Promise.resolve({ data: { success: true } });
    },
    getStats: () =>
      Promise.resolve({
        data: mockData.groupStats,
      }),
  },

  logs: {
    getByGroup: () => Promise.resolve({ data: { logs: mockData.moderationLogs } }),
    getStats: () => Promise.resolve({ data: mockData.groupStats }),
  },

  users: {
    getProfile: () => Promise.resolve({ data: mockData.user }),
    updateProfile: data => Promise.resolve({ data: { ...mockData.user, ...data } }),
  },

  bot: {
    getStatus: () => Promise.resolve({ data: mockData.botStatus }),
    restart: () => {
      console.log('Mock: Bot restart initiated');
      return Promise.resolve({ data: { success: true } });
    },
    getCommands: () => Promise.resolve({ data: [] }),
  },

  stats: {
    getOverview: () => Promise.resolve({ data: mockData.stats }),
    getGroupStats: groupId =>
      Promise.resolve({
        data: {
          ...mockData.stats,
          groupId,
          groupSpecific: true,
        },
      }),
  },
};
