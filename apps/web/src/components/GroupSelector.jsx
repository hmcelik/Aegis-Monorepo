import React from 'react';
import { RefreshCw, Users, Settings2 } from 'lucide-react';
import { EmptyState } from './UXComponents';

const GroupSelector = ({ groups = [], selectedGroup, onGroupSelect, onRefresh }) => {
  // Ensure groups is always an array and handle all edge cases
  const safeGroups = Array.isArray(groups) ? groups : [];

  console.log('🔍 GroupSelector render:', {
    groupsType: typeof groups,
    isArray: Array.isArray(groups),
    groupsLength: safeGroups.length,
    safeGroupsType: typeof safeGroups,
  });

  if (!safeGroups || safeGroups.length === 0) {
    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-white to-gray-50 rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
            <span className="text-2xl">📋</span>
            <span>Your Groups</span>
          </h3>
          <button
            onClick={onRefresh}
            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100/70 rounded-xl transition-all duration-200 hover:shadow-md"
            title="Refresh groups"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon="👥"
            title="No Groups Found"
            description="Make sure you are an administrator of at least one group with the bot added."
            action={onRefresh}
            actionText="🔄 Refresh Groups"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-white to-gray-50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200/50 bg-white/50">
        <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-3">
          <span className="text-2xl">📋</span>
          <div>
            <div>Your Groups</div>
            <div className="text-sm text-gray-500 font-normal">({safeGroups.length} total)</div>
          </div>
        </h3>
        <button
          onClick={onRefresh}
          className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100/70 rounded-xl transition-all duration-200 hover:shadow-md"
          title="Refresh groups"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {safeGroups.map(group => {
            // Extra safety check for each group object
            if (!group || typeof group !== 'object') {
              console.warn('⚠️ Invalid group object:', group);
              return null;
            }

            const isSelected = selectedGroup?.id === group.id;

            return (
              <div
                key={group.id || Math.random()} // Fallback key if id is missing
                className={`relative rounded-2xl border cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                  isSelected
                    ? 'border-blue-400 bg-gradient-to-r from-blue-50 to-blue-100 shadow-lg shadow-blue-200/50'
                    : 'border-gray-200/50 hover:border-gray-300 hover:shadow-lg bg-white/80 backdrop-blur-sm'
                }`}
                onClick={() => {
                  console.log('🎯 Group selected:', group);
                  if (onGroupSelect && typeof onGroupSelect === 'function') {
                    onGroupSelect(group);
                  }
                }}
              >
                <div className="p-5">
                  {/* Group Avatar and Title */}
                  <div className="flex items-start space-x-4 mb-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-md ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                          : 'bg-gradient-to-r from-gray-400 to-gray-500'
                      }`}
                    >
                      {group.title?.[0] || '🏘️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`font-semibold text-base mb-1 truncate ${
                          isSelected ? 'text-blue-900' : 'text-gray-900'
                        }`}
                      >
                        {group.title || 'Unknown Group'}
                      </h4>
                      <div className="flex items-center space-x-3">
                        <div
                          className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                            isSelected ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          <Users size={12} />
                          <span>{group.member_count || 0}</span>
                        </div>
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            isSelected ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {group.type || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex justify-end">
                    <button
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-2.5 ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg'
                          : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300'
                      }`}
                      onClick={e => {
                        e.stopPropagation();
                        if (onGroupSelect && typeof onGroupSelect === 'function') {
                          onGroupSelect(group);
                        }
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Settings2 size={14} />
                          <span>Managing</span>
                        </>
                      ) : (
                        <span>Select Group</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-200/50 bg-gradient-to-r from-gray-50/80 to-blue-50/80">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2 font-medium">💡 Getting Started</p>
          <p className="text-xs text-gray-500">
            Select a group to view moderation statistics and configure settings
          </p>
        </div>
      </div>
    </div>
  );
};

export default GroupSelector;
