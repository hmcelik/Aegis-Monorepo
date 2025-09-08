/**
 * @fileoverview Manages the application's configuration. It provides default settings
 * and functions to retrieve group-specific settings from the database.
 */

import {
  getSetting,
  getWhitelistKeywords,
  setSetting as dbSetSetting,
} from '../services/database.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the monorepo root by looking for package.json with workspaces
const findMonorepoRoot = startDir => {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.workspaces || packageJson.packageManager) {
        return currentDir;
      }
    } catch (e) {
      // Continue searching
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir; // fallback
};

// Load .env from the monorepo root
const monorepoRoot = findMonorepoRoot(__dirname);
const envPath = path.join(monorepoRoot, '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.log(
    '⚠️  No .env file found at monorepo root, continuing with system environment variables'
  );
} else {
  console.log(`📱 Loaded environment from: ${envPath}`);
}

/**
 * The default configuration object.
 * These values are used as a fallback for any group that has not configured a specific setting.
 */
const defaultConfig = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  nlp: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  database: {
    path: process.env.DATABASE_PATH || './moderator.db',
  },
  alertLevel: 1,
  muteLevel: 2,
  kickLevel: 3,
  banLevel: 0,
  spamThreshold: 0.85,
  profanityThreshold: 0.7, // Threshold for profanity detection (0.0-1.0)
  profanityEnabled: true, // Enable/disable profanity filtering
  muteDurationMinutes: 60,
  warningMessage: '⚠️ {user}, please avoid posting promotional/banned content.',
  profanityWarningMessage: '⚠️ {user}, please keep your language appropriate and respectful.',
  warningMessageDeleteSeconds: 15, // How long the warning message stays in chat. 0 = forever.
  moderatorIds: [],
  whitelistedKeywords: [],
  keywordWhitelistBypass: true,
  strikeExpirationDays: 30, // New setting
  goodBehaviorDays: 7, // New setting
};

/**
 * Retrieves a complete settings object for a specific group.
 * It fetches each setting from the database, falling back to the `defaultConfig`
 * if a setting is not found for the given chat ID.
 *
 * @param {string} chatId The ID of the chat.
 * @returns {Promise<object>} A promise that resolves to the complete settings object for the group.
 */
export const getGroupSettings = async chatId => {
  const settings = {};
  const keys = [
    'alertLevel',
    'muteLevel',
    'kickLevel',
    'banLevel',
    'spamThreshold',
    'profanityThreshold',
    'profanityEnabled',
    'muteDurationMinutes',
    'warningMessage',
    'profanityWarningMessage',
    'warningMessageDeleteSeconds',
    'moderatorIds',
    'keywordWhitelistBypass',
    'strikeExpirationDays',
    'goodBehaviorDays',
  ];

  for (const key of keys) {
    settings[key] = await getSetting(chatId, key, defaultConfig[key]);
  }

  settings.whitelistedKeywords = await getWhitelistKeywords(chatId);

  return settings;
};

/**
 * Updates a specific setting for a group in the database.
 *
 * @param {string} chatId The ID of the chat.
 * @param {string} key The configuration key to update.
 * @param {*} value The new value for the setting.
 */
export const updateSetting = (chatId, key, value) => {
  return dbSetSetting(chatId, key, value);
};

export default defaultConfig;
