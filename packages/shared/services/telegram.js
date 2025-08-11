/**
 * Gets the member count for a chat/group.
 * @param {string|number} chatId - The ID of the chat.
 * @returns {Promise<number>} The number of members in the chat, or 0 on failure.
 */
export const getChatMemberCount = async (chatId) => {
    try {
        // Try the newer API method first, then fall back to the older one
        let count;
        try {
            count = await bot.getChatMemberCount(chatId);
        } catch (e) {
            // Fall back to the deprecated method if the new one fails
            count = await bot.getChatMembersCount(chatId);
        }
        return count;
    } catch (error) {
        // Log more detailed error information
        const errorMsg = error.response?.body?.description || error.message;
        logger.warn(`Could not get member count for chat ${chatId}: ${errorMsg}`);
        return 0;
    }
};
/**
 * @fileoverview A wrapper service for the node-telegram-bot-api library.
 * This file centralizes all direct interactions with the Telegram Bot API,
 * providing simplified helper functions for common actions like sending messages,
 * deleting messages, and managing users. It also includes an admin caching mechanism.
 */

import TelegramBot from 'node-telegram-bot-api';
import config from '../config/index.js';
import logger from './logger.js';

// Initialize the bot with the token from the configuration.
const bot = new TelegramBot(config.telegram.token);

/**
 * A simple promise-based delay helper.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A cache for storing chat administrator IDs to reduce API calls.
const adminCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache admin lists for 5 minutes.

/**
 * Gets the list of administrator IDs for a given chat.
 * Results are cached for a short period to avoid rate-limiting issues.
 *
 * @param {string|number} chatId - The ID of the target chat.
 * @returns {Promise<number[]>} A promise that resolves to an array of admin user IDs.
 */
export const getChatAdmins = async (chatId) => {
    const cachedAdmins = adminCache.get(chatId);
    // Return cached data if it's recent.
    if (cachedAdmins && cachedAdmins.timestamp > Date.now() - CACHE_TTL_MS) {
        return cachedAdmins.ids;
    }
    try {
        // Fetch the list of administrators from the Telegram API.
        const admins = await bot.getChatAdministrators(chatId);
        const adminIds = admins.map(admin => admin.user.id);
        // Store the new list and timestamp in the cache.
        adminCache.set(chatId, { ids: adminIds, timestamp: Date.now() });
        logger.info(`Refreshed admin cache for chat ${chatId}. Found ${adminIds.length} admins.`);
        return adminIds;
    } catch (error) {
        logger.error(`Failed to get chat admins for ${chatId}:`, error.response?.body || error.message);
        // On failure, return the old cached data if available, otherwise an empty array.
        return cachedAdmins ? cachedAdmins.ids : [];
    }
};

/**
 * Gets information about a specific member of a chat.
 * @param {string|number} chatId - The ID of the target chat.
 * @param {number} userId - The ID of the user to look up.
 * @returns {Promise<object|null>} A promise that resolves to the chat member object, or null on failure.
 */
export const getChatMember = async (chatId, userId) => {
    try {
        const member = await bot.getChatMember(chatId, userId);
        return member;
    } catch (error) {
        // This error is expected if the user is not in the chat.
        if (error.response && error.response.body.description.includes("user not found")) {
            return null;
        }
        logger.error(`Failed to get chat member ${userId} in chat ${chatId}:`, error.response?.body || error.message);
        return null;
    }
};


/**
 * Deletes a message from a chat, ignoring "not found" errors.
 *
 * @param {string|number} chatId - The ID of the chat.
 * @param {number} messageId - The ID of the message to delete.
 */
export const deleteMessage = async (chatId, messageId) => {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch(error) {
    // **FIX**: If the message is already deleted, just ignore the error and don't log it.
    if (error.response && error.response.body.description.includes("message to delete not found")) {
        return; // Silently fail
    }
    logger.error(`Failed to delete message ${messageId} in chat ${chatId}`, error.response?.body || error.message)
  }
};

/**
 * Kicks a user from a chat. This is a temporary removal; the user can rejoin.
 * Implemented by banning and then immediately unbanning the user.
 *
 * @param {string|number} chatId - The ID of the chat.
 * @param {number} userId - The ID of the user to kick.
 * @returns {Promise<boolean>} A promise that resolves to true on success, false on failure.
 */
export const kickUser = async (chatId, userId) => {
  try {
    // Ban the user.
    await bot.banChatMember(chatId, userId);
    // A short delay can sometimes help with API consistency.
    await delay(1000);
    // Immediately unban them, allowing them to rejoin.
    await bot.unbanChatMember(chatId, userId, { only_if_banned: true });
    return true;
  } catch (error) {
    logger.error(`Failed to kick user ${userId} from chat ${chatId}:`, error.response?.body || error.message);
    return false;
  }
};

/**
 * Permanently bans a user from a chat.
 *
 * @param {string|number} chatId - The ID of the chat.
 * @param {number} userId - The ID of the user to ban.
 * @returns {Promise<boolean>} A promise that resolves on completion.
 */
export const banUser = (chatId, userId) => {
  return bot.banChatMember(chatId, userId);
};

/**
 * Mutes a user in a chat for a specified duration.
 *
 * @param {string|number} chatId - The ID of the chat.
 * @param {number} userId - The ID of the user to mute.
 * @param {number} durationMinutes - The duration of the mute in minutes.
 * @returns {Promise<boolean>} A promise that resolves on completion.
 */
export const muteUser = (chatId, userId, durationMinutes) => {
  // Telegram API requires the 'until_date' to be a Unix timestamp in seconds.
  const until_date = Math.floor(Date.now() / 1000) + durationMinutes * 60;
  return bot.restrictChatMember(chatId, userId, {
    can_send_messages: false, // Disallow sending messages.
    until_date: until_date
  });
};

/**
 * Sends a message to a chat.
 *
 * @param {string|number} chatId - The ID of the chat.
 * @param {string} text - The text of the message.
 * @param {object} [options] - Additional options for the Telegram API.
 * @returns {Promise<object>} A promise that resolves to the sent message object.
 */
export const sendMessage = (chatId, text, options) => {
    return bot.sendMessage(chatId, text, options);
};

/**
 * Sends a document (file) to a chat.
 * @param {string|number} chatId - The ID of the chat.
 * @param {Buffer} fileBuffer - The file content as a buffer.
 * @param {object} [options] - Additional options for the Telegram API.
 * @param {object} [fileOptions] - Options for the file itself (e.g., filename).
 * @returns {Promise<object>} A promise that resolves to the sent message object.
 */
export const sendDocument = (chatId, fileBuffer, options = {}, fileOptions = {}) => {
    return bot.sendDocument(chatId, fileBuffer, options, fileOptions);
};

/**
 * Edits the text of an existing message.
 *
 * @param {string} text - The new text for the message.
 * @param {object} [options] - Additional options, must include chat_id and message_id.
 * @returns {Promise<object|boolean>} A promise that resolves to the edited message object or true.
 */
export const editMessageText = (text, options) => {
    return bot.editMessageText(text, options);
};

/**
 * Answers a callback query from an inline keyboard.
 *
 * @param {string} callbackQueryId - The ID of the callback query.
 * @param {object} [options] - Additional options, such as the text to display.
 * @returns {Promise<boolean>} A promise that resolves on completion.
 */
export const answerCallbackQuery = (callbackQueryId, options) => {
    return bot.answerCallbackQuery(callbackQueryId, options);
};

// Export the bot instance itself for direct use in other modules if needed.
export default bot;