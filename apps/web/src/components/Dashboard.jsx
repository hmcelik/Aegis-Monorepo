import React from 'react';
import { Toaster } from 'react-hot-toast';
import { API_BASE_URL } from '../services/api';

const Dashboard = ({ 
  user, 
  dashboardData, 
  onReloadData,
  showDebugConsole,
  onToggleDebugConsole
}) => {
  console.log('🎨 Rendering main dashboard for user:', user?.username);
  
  return (
    <div className="space-y-8">
      <Toaster position="top-right" />

      {/* Stats Overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">📊 Overview</h2>
            <p className="text-slate-600">Your moderation dashboard at a glance</p>
          </div>
          <button 
            onClick={onReloadData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors duration-200"
          >
            🔄 <span>Refresh</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="group relative bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/60 rounded-2xl p-6 hover:shadow-md transition-all duration-300">
            <div className="relative">
              <div className="text-3xl font-bold text-blue-900 mb-2">
                {dashboardData?.stats?.total_groups || 0}
              </div>
              <p className="text-blue-700 font-medium">Total Groups</p>
              <div className="mt-3 text-xs text-blue-600">
                <span>Active monitoring across all groups</span>
              </div>
            </div>
          </div>
          <div className="group relative bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200/60 rounded-2xl p-6 hover:shadow-md transition-all duration-300">
            <div className="relative">
              <div className="text-3xl font-bold text-green-900 mb-2">
                {dashboardData?.stats?.total_members || 0}
              </div>
              <p className="text-green-700 font-medium">Total Members</p>
              <div className="mt-3 text-xs text-green-600">
                <span>Users protected by moderation</span>
              </div>
            </div>
          </div>
          <div className="group relative bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200/60 rounded-2xl p-6 hover:shadow-md transition-all duration-300">
            <div className="relative">
              <div className="text-3xl font-bold text-purple-900 mb-2">
                {dashboardData?.stats?.active_bots || 0}
              </div>
              <p className="text-purple-700 font-medium">Active Bots</p>
              <div className="mt-3 text-xs text-purple-600">
                <span>Automated moderation systems</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Groups Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-1">👥 Your Groups</h2>
          <p className="text-slate-600">Manage and monitor your Telegram groups</p>
        </div>
        
        {dashboardData?.groups?.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {dashboardData.groups.map(group => (
              <div key={group.id} className="group relative bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-lg mb-1 truncate group-hover:text-blue-700 transition-colors">
                      {group.title}
                    </h3>
                    <p className="text-slate-600 text-sm flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                      </svg>
                      {group.member_count} members
                    </p>
                  </div>
                  <div className="flex items-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${
                      group.bot_active 
                        ? 'bg-green-50 text-green-700 border-green-200' 
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${group.bot_active ? 'bg-green-400' : 'bg-red-400'}`}></div>
                      {group.bot_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No groups found</h3>
            <p className="text-slate-600 mb-6">
              Connect via Telegram Mini App to see your groups
            </p>
            <button 
              onClick={onReloadData}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm hover:shadow transition-all duration-200"
            >
              🔄 <span>Refresh</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
