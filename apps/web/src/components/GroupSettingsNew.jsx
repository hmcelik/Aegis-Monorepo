import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LoadingCard, EmptyState } from './UXComponents';

const GroupSettings = ({ settings = {}, loading, onUpdate }) => {
  const [formData, setFormData] = useState({
    alertLevel: 1,
    muteLevel: 2,
    kickLevel: 3,
    banLevel: 0,
    spamThreshold: 0.7,
    profanityThreshold: 0.7,
    muteDurationMinutes: 60,
    warningMessage: 'Please follow the group rules.',
    warningMessageDeleteSeconds: 30,
    keywordWhitelistBypass: true,
    strikeExpirationDays: 7,
    goodBehaviorDays: 30,
    whitelistedKeywords: []
  });
  const [isModified, setIsModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');

  // Initialize form data when settings change
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      console.log('🔧 Initializing form with settings:', settings);
      const newFormData = {
        alertLevel: settings.alertLevel !== undefined ? settings.alertLevel : 1,
        muteLevel: settings.muteLevel !== undefined ? settings.muteLevel : 2,
        kickLevel: settings.kickLevel !== undefined ? settings.kickLevel : 3,
        banLevel: settings.banLevel !== undefined ? settings.banLevel : 0,
        spamThreshold: settings.spamThreshold !== undefined ? settings.spamThreshold : 0.7,
        profanityThreshold: settings.profanityThreshold !== undefined ? settings.profanityThreshold : 0.7,
        muteDurationMinutes: settings.muteDurationMinutes !== undefined ? settings.muteDurationMinutes : 60,
        warningMessage: settings.warningMessage || 'Please follow the group rules.',
        warningMessageDeleteSeconds: settings.warningMessageDeleteSeconds !== undefined ? settings.warningMessageDeleteSeconds : 30,
        keywordWhitelistBypass: settings.keywordWhitelistBypass !== undefined ? settings.keywordWhitelistBypass : true,
        strikeExpirationDays: settings.strikeExpirationDays !== undefined ? settings.strikeExpirationDays : 7,
        goodBehaviorDays: settings.goodBehaviorDays !== undefined ? settings.goodBehaviorDays : 30,
        whitelistedKeywords: settings.whitelistedKeywords || []
      };
      setFormData(newFormData);
      setIsModified(false);
      console.log('✅ Form initialized with actual settings values:', newFormData);
    } else if (settings) {
      console.log('⚠️ Settings object exists but is empty, using defaults');
    }
  }, [settings]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsModified(true);
  };

  const handleSliderChange = (field, value) => {
    const numValue = parseFloat(value);
    handleChange(field, numValue);
  };

  const handleIntegerChange = (field, value) => {
    const intValue = parseInt(value) || 0;
    handleChange(field, intValue);
  };

  const addKeyword = () => {
    const currentKeywords = formData.whitelistedKeywords || [];
    if (newKeyword.trim() && !currentKeywords.includes(newKeyword.trim())) {
      handleChange('whitelistedKeywords', [...currentKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword) => {
    const currentKeywords = formData.whitelistedKeywords || [];
    handleChange(
      'whitelistedKeywords',
      currentKeywords.filter(k => k !== keyword)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(formData);
      setIsModified(false);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (settings && Object.keys(settings).length > 0) {
      console.log('🔄 Resetting form to saved values:', settings);
      setFormData({
        alertLevel: settings.alertLevel !== undefined ? settings.alertLevel : 1,
        muteLevel: settings.muteLevel !== undefined ? settings.muteLevel : 2,
        kickLevel: settings.kickLevel !== undefined ? settings.kickLevel : 3,
        banLevel: settings.banLevel !== undefined ? settings.banLevel : 0,
        spamThreshold: settings.spamThreshold !== undefined ? settings.spamThreshold : 0.7,
        profanityThreshold: settings.profanityThreshold !== undefined ? settings.profanityThreshold : 0.7,
        muteDurationMinutes: settings.muteDurationMinutes !== undefined ? settings.muteDurationMinutes : 60,
        warningMessage: settings.warningMessage || 'Please follow the group rules.',
        warningMessageDeleteSeconds: settings.warningMessageDeleteSeconds !== undefined ? settings.warningMessageDeleteSeconds : 30,
        keywordWhitelistBypass: settings.keywordWhitelistBypass !== undefined ? settings.keywordWhitelistBypass : true,
        strikeExpirationDays: settings.strikeExpirationDays !== undefined ? settings.strikeExpirationDays : 7,
        goodBehaviorDays: settings.goodBehaviorDays !== undefined ? settings.goodBehaviorDays : 30,
        whitelistedKeywords: settings.whitelistedKeywords || []
      });
      setIsModified(false);
      toast.info('Settings reset to saved values');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <LoadingCard 
            title="Loading settings..." 
            subtitle="Fetching group configuration"
            size="small"
          />
        </div>
      </div>
    );
  }

  if (!loading && (!settings || Object.keys(settings).length === 0)) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            ⚙️ Settings
          </h3>
        </div>
        <div className="p-6">
          <EmptyState
            icon="⚙️"
            title="Settings Not Available"
            description="Unable to load group settings. Please ensure you have admin permissions."
            action={() => window.location.reload()}
            actionText="🔄 Refresh Page"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            ⚙️ Moderation Settings
          </h3>
          <div className="flex items-center space-x-2">
            {isModified && (
              <button 
                onClick={handleReset} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Reset to saved values"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button 
              onClick={handleSave} 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
                isModified 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              disabled={!isModified || saving}
              title="Save changes"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Strike-Based Penalty Thresholds */}
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
            🎯 Strike-Based Penalty Thresholds
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            Set how many strikes trigger each action. These are strike counts, not percentages.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Alert Level (strikes)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={formData.alertLevel}
                onChange={(e) => handleIntegerChange('alertLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500">Strikes needed to trigger warnings</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Mute Level (strikes)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={formData.muteLevel}
                onChange={(e) => handleIntegerChange('muteLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500">Strikes needed to mute users</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Kick Level (strikes)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={formData.kickLevel}
                onChange={(e) => handleIntegerChange('kickLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500">Strikes needed to kick users</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Ban Level (strikes)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={formData.banLevel}
                onChange={(e) => handleIntegerChange('banLevel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500">Strikes needed to ban users (0 = disabled)</p>
            </div>
          </div>
        </div>

        {/* AI Detection Thresholds */}
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
            🤖 AI Detection Thresholds
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            Set AI confidence levels for content detection. These are percentage values.
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Spam Detection Threshold
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={formData.spamThreshold}
                  onChange={(e) => handleSliderChange('spamThreshold', e.target.value)}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <span className="px-3 py-1 bg-gray-100 text-gray-900 text-sm rounded-lg min-w-[4rem] text-center">
                  {(formData.spamThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-500">AI confidence required to detect spam</p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Profanity Detection Threshold
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={formData.profanityThreshold}
                  onChange={(e) => handleSliderChange('profanityThreshold', e.target.value)}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <span className="px-3 py-1 bg-gray-100 text-gray-900 text-sm rounded-lg min-w-[4rem] text-center">
                  {(formData.profanityThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-500">AI confidence required to detect profanity</p>
            </div>
          </div>
        </div>

        {/* Duration Settings */}
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
            ⏱️ Duration Settings
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Mute Duration (minutes)
              </label>
              <input
                type="number"
                min="1"
                max="10080"
                value={formData.muteDurationMinutes}
                onChange={(e) => handleIntegerChange('muteDurationMinutes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Warning Message Delete (seconds)
              </label>
              <input
                type="number"
                min="0"
                max="300"
                value={formData.warningMessageDeleteSeconds}
                onChange={(e) => handleIntegerChange('warningMessageDeleteSeconds', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Strike Expiration (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={formData.strikeExpirationDays}
                onChange={(e) => handleIntegerChange('strikeExpirationDays', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Good Behavior Reset (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={formData.goodBehaviorDays}
                onChange={(e) => handleIntegerChange('goodBehaviorDays', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Warning Message */}
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
            💬 Warning Message
          </h4>
          <div className="space-y-2">
            <textarea
              value={formData.warningMessage}
              onChange={(e) => handleChange('warningMessage', e.target.value)}
              placeholder="Enter the warning message to show users..."
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900"
            />
          </div>
        </div>

        {/* Whitelisted Keywords */}
        <div className="p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
            📝 Whitelisted Keywords
          </h4>
          <div className="space-y-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add a keyword..."
                onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <button 
                onClick={addKeyword} 
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(formData.whitelistedKeywords || []).map((keyword, index) => (
                <div key={index} className="flex items-center space-x-1 bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                  <span>{keyword}</span>
                  <button 
                    onClick={() => removeKeyword(keyword)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modified Indicator */}
      {isModified && (
        <div className="p-4 bg-amber-50 border-t border-amber-200">
          <p className="text-sm text-amber-800 flex items-center space-x-2">
            <span>⚠️ You have unsaved changes</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default GroupSettings;
