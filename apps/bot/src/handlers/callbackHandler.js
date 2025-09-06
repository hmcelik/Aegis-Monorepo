/**
 * @fileoverview Handles all interactions originating from inline keyboard buttons (callback queries).
 * This includes navigating menus, toggling settings, and initiating workflows for updating values
 * on a per-group basis.
 */

import logger from '@telegram-moderator/shared/src/services/logger.js';
import * as telegram from '@telegram-moderator/shared/src/services/telegram.js';
import { mainKeyboard } from '../keyboards/mainMenu.js';
import { aiSensitivityKeyboard } from '../keyboards/aiSensitivityMenu.js';
import { profanityKeyboard } from '../keyboards/profanityMenu.js';
import { penaltyLevelsKeyboard } from '../keyboards/penaltyLevelsMenu.js';
import { miscKeyboard } from '../keyboards/miscMenu.js';
import { whitelistKeyboard } from '../keyboards/whitelistMenu.js';
import { keywordMenuKeyboard } from '../keyboards/keywordMenu.js';
import { moderatorMenuKeyboard } from '../keyboards/moderatorMenu.js';
import { updateSetting, getGroupSettings } from '@telegram-moderator/shared/src/config/index.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import bot from '@telegram-moderator/shared/src/services/telegram.js';
import { escapeMarkdownV2 } from './commandHandler.js';

// A simple in-memory store for tracking pending admin actions with automatic cleanup
const userState = new Map();

// Cleanup old user states every 30 minutes to prevent memory leaks
const USER_STATE_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const USER_STATE_MAX_AGE = 60 * 60 * 1000; // 1 hour

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userState.entries()) {
        if (now - value.timestamp > USER_STATE_MAX_AGE) {
            userState.delete(key);
        }
    }
}, USER_STATE_CLEANUP_INTERVAL);

// Enhanced userState setter with timestamp
const setUserState = (userId, state) => {
    userState.set(userId, {
        ...state,
        timestamp: Date.now()
    });
};

// Enhanced userState getter with validation
const getUserState = (userId) => {
    const state = userState.get(userId);
    if (state && (Date.now() - state.timestamp < USER_STATE_MAX_AGE)) {
        return state;
    }
    userState.delete(userId); // Clean up expired state
    return null;
};

// This object no longer holds the group context (targetChatId), only the message details for editing.
let activeMenu = {
    messageId: null,
    chatId: null,
    text: '',
    keyboard: null,
};

/**
 * Sets or updates the state of the currently active menu message.
 */
export const setActiveMenu = (message, text, keyboard) => {
    if (!message) return;
    activeMenu.messageId = message.message_id;
    activeMenu.chatId = message.chat.id;
    if (text) activeMenu.text = text;
    if (keyboard) activeMenu.keyboard = keyboard;
};

/**
 * Main handler for all incoming callback queries from inline keyboards.
 */
export const handleCallback = async (callbackQuery) => {
    const { from, message, data } = callbackQuery;
    const [action, targetChatId, ...params] = data.split(':');

    logger.info(`Callback received from ${from.id}: ${data}`);

    // Optimization: Fail-fast if the essential targetChatId is missing for most actions.
    if (action !== 'select_group' && !targetChatId) {
        logger.warn(`Callback handler invoked without a targetChatId for user ${from.id}. Data: ${data}`);
        await telegram.answerCallbackQuery(callbackQuery.id, { text: 'Your session may have expired. Please use /settings again.' });
        return;
    }

    try {
        let text, keyboard;
        let isMenuNavigation = true;

        if (action === 'select_group') {
            const nextAction = params[0];
            const group = await db.getGroup(targetChatId);
            
            if (!group) {
                await telegram.answerCallbackQuery(callbackQuery.id, { text: 'Error: Group not found.' });
                return;
            }

            if (nextAction === 'status') {
                 const groupSettings = await getGroupSettings(targetChatId);
                 const deletionsToday = await db.getTotalDeletionsToday(targetChatId);
                 const response = `**📊 Bot Status & Configuration for ${group.chatTitle}**\n\n**⚖️ Penalty Levels** (\`0\` = disabled)\n- Alert on Strike: \`${groupSettings.alertLevel}\`\n- Mute on Strike: \`${groupSettings.muteLevel}\`\n- Kick on Strike: \`${groupSettings.kickLevel}\`\n- Ban on Strike: \`${groupSettings.banLevel}\`\n\n**🧠 AI & Content**\n- Spam Threshold: \`${groupSettings.spamThreshold}\`\n- Keyword Bypass Mode: \`${groupSettings.keywordWhitelistBypass ? 'ON' : 'OFF'}\`\n\n**⚙️ Other Settings**\n- Mute Duration: \`${groupSettings.muteDurationMinutes} minutes\`\n- Whitelisted Keywords: \`${groupSettings.whitelistedKeywords.join(', ') || 'None'}\`\n- Manual User Whitelist: \`${groupSettings.moderatorIds.join(', ') || 'None'}\`\n\n**📈 Stats**\n- Deletions Today: \`${deletionsToday}\``;
                 await telegram.editMessageText(response, { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'Markdown' });
                 await telegram.answerCallbackQuery(callbackQuery.id);
                 return;
            } else if (nextAction === 'mystrikes') {
                isMenuNavigation = false;
                const strikes = await db.getStrikes(targetChatId, from.id.toString());
                const history = await db.getStrikeHistory(targetChatId, from.id.toString(), 10);
                let report = `⚖️ *Your Strike Report*\n*Group:* ${escapeMarkdownV2(group.chatTitle)}\n*Current Strikes:* ${strikes.count}\n`;
                if (history.length > 0) {
                    report += `\n*Recent History:*\n\\(Showing last ${history.length} actions\\)\n`;
                    for (const record of history) {
                        report += `\n─────────────────────\n`;
                        const logData = JSON.parse(record.logData);
                        const timestamp = new Date(record.timestamp).toLocaleString('en-GB', { timeZone: 'UTC' });
                        const actionType = logData.type || 'AUTO';
                        if (actionType.startsWith('MANUAL')) {
                            let actionDetail = logData.type;
                            if (logData.type === 'MANUAL-STRIKE-ADD') actionDetail = `Added ${logData.amount} strike(s)`;
                            else if (logData.type === 'MANUAL-STRIKE-REMOVE') actionDetail = `Removed ${logData.amount} strike(s)`;
                            else if (logData.type === 'MANUAL-STRIKE-SET') actionDetail = `Set strikes to ${logData.amount}`;
                            report += `🛡️ *Action:* ${escapeMarkdownV2(actionDetail)}\n`;
                            report += `👮 *Admin:* ${escapeMarkdownV2(logData.admin.first_name)}\n`;
                            report += `📅 *Date:* ${escapeMarkdownV2(timestamp)}\n`;
                            report += `💬 *Reason:* "${escapeMarkdownV2(logData.reason)}"\n`;
                        } else {
                            report += `🔥 *Action:* AUTO\\-STRIKE\n`;
                            report += `📅 *Date:* ${escapeMarkdownV2(timestamp)}\n`;
                            report += `💬 *Reason:* "${escapeMarkdownV2(logData.messageExcerpt)}"\n`;
                        }
                    }
                } else {
                    report += "\n_You have no strike history in the audit log\\._\n";
                }
                await telegram.editMessageText(report, { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'MarkdownV2' });
            } else { // Default to settings
                 text = `Managing settings for **${group.chatTitle}**. Please choose a category.`;
                 keyboard = mainKeyboard(targetChatId);
            }

        } else {
            const groupSettings = await getGroupSettings(targetChatId);

            switch (action) {
                case 'settings_main':
                    const group = await db.getGroup(targetChatId);
                    text = `Managing settings for **${group.chatTitle}**. Please choose a category.`;
                    keyboard = mainKeyboard(targetChatId);
                    break;
                case 'settings_ai_sensitivity':
                    text = 'Configure AI sensitivity settings:';
                    keyboard = aiSensitivityKeyboard(groupSettings, targetChatId);
                    break;
                case 'settings_profanity':
                    text = 'Configure profanity filter settings:';
                    keyboard = profanityKeyboard(groupSettings, targetChatId);
                    break;
                case 'settings_penalty_levels':
                    text = 'Configure penalty level settings:';
                    keyboard = penaltyLevelsKeyboard(groupSettings, targetChatId);
                    break;
                case 'settings_whitelist':
                    text = 'Manage keyword and user whitelists:';
                    keyboard = whitelistKeyboard(targetChatId);
                    break;
                case 'settings_misc':
                    text = 'Configure miscellaneous settings:';
                    keyboard = miscKeyboard(groupSettings, targetChatId);
                    break;
                case 'whitelist_keywords':
                    text = 'Manage whitelisted keywords that bypass AI checks.';
                    keyboard = keywordMenuKeyboard(targetChatId);
                    break;
                case 'whitelist_mods':
                    text = 'Manage whitelisted moderator IDs.';
                    keyboard = moderatorMenuKeyboard(targetChatId);
                    break;
                case 'list_keywords':
                case 'list_mods':
                    isMenuNavigation = false;
                    const isKeywords = action === 'list_keywords';
                    const items = isKeywords ? await db.getWhitelistKeywords(targetChatId) : (await getGroupSettings(targetChatId)).moderatorIds;
                    const title = isKeywords ? '📜 Whitelisted Keywords' : '👥 Whitelisted Moderator IDs';
                    const itemList = items.length > 0 ? items.map(item => `- \`${item}\``).join('\n') : `No ${isKeywords ? 'keywords' : 'moderators'} whitelisted.`;
                    await telegram.sendMessage(message.chat.id, `**${title}**\n${itemList}`, { parse_mode: 'Markdown'});
                    await telegram.answerCallbackQuery(callbackQuery.id);
                    return;

                case 'toggle_bypass':
                    const newBypassValue = !groupSettings.keywordWhitelistBypass;
                    await updateSetting(targetChatId, 'keywordWhitelistBypass', newBypassValue);
                    await telegram.answerCallbackQuery(callbackQuery.id, { text: `Keyword Bypass is now ${newBypassValue ? 'ON' : 'OFF'}` });
                    const updatedSettingsForBypass = await getGroupSettings(targetChatId);
                    text = 'Configure AI sensitivity settings:';
                    keyboard = aiSensitivityKeyboard(updatedSettingsForBypass, targetChatId);
                    break;

                case 'toggle_profanity':
                    const newProfanityValue = !groupSettings.profanityEnabled;
                    await updateSetting(targetChatId, 'profanityEnabled', newProfanityValue);
                    await telegram.answerCallbackQuery(callbackQuery.id, { text: `Profanity Filter is now ${newProfanityValue ? 'ON' : 'OFF'}` });
                    const updatedSettingsForProfanity = await getGroupSettings(targetChatId);
                    text = 'Configure profanity filter settings:';
                    keyboard = profanityKeyboard(updatedSettingsForProfanity, targetChatId);
                    break;

                default:
                    isMenuNavigation = false;
                    userState.set(from.id, { action: data, targetChatId });
                    
                    let promptText = `Please send the new value.`;
                    if (action.startsWith('set_')) {
                        promptText = `Please send the new value for **${action.replace(/_/g, ' ')}**.`;
                    } else if (action === 'add_keyword') {
                        promptText = "Please send the keyword you want to add to the whitelist.";
                    } else if (action === 'remove_keyword') {
                        promptText = "Please send the keyword you want to remove.";
                    } else if (action === 'add_mod') {
                        promptText = "Please send the numeric User ID of the moderator to add.";
                    } else if (action === 'remove_mod') {
                        promptText = "Please send the numeric User ID of the moderator to remove.";
                    }
                
                    await telegram.editMessageText(promptText, {
                        chat_id: message.chat.id,
                        message_id: message.message_id,
                        reply_markup: { inline_keyboard: [] },
                        parse_mode: 'Markdown'
                    });
                    break;
            }
        }

        if (isMenuNavigation) {
            await telegram.editMessageText(text, {
                chat_id: message.chat.id,
                message_id: message.message_id,
                ...keyboard,
                parse_mode: 'Markdown'
            });
            setActiveMenu(message, text, keyboard);
        }
        await telegram.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
        if (error.response && error.response.body?.description.includes('message is not modified')) {
            logger.warn('Ignoring "message is not modified" error.');
        } else {
            logger.error(`Error in callback handler: ${error.message}`, { stack: error.stack });
            await telegram.answerCallbackQuery(callbackQuery.id, { text: 'An error occurred.' });
        }
    }
};

/**
 * A global listener for text messages to process pending admin inputs.
 */
bot.on('text', async (msg) => {
    const { from, text, chat } = msg;

    if (!userState.has(from.id)) {
        return;
    }

    const { action: data, targetChatId } = userState.get(from.id);
    const [action] = data.split(':');
    userState.delete(from.id);

    if (!targetChatId || !action) {
        logger.warn(`Text input received without a valid state for user ${from.id}. Action: ${action}`);
        return;
    }

    try {
        let responseMessage = '✅ Success!';
        let settingKey, value;

        const handleNumericInput = (text, nonNegative = false) => {
            const num = parseInt(text, 10);
            if (isNaN(num) || (nonNegative && num < 0)) {
                return { valid: false, value: null };
            }
            return { valid: true, value: num };
        };
        
        const handleFloatInput = (text) => {
            const num = parseFloat(text);
            if (isNaN(num)) return { valid: false, value: null };
            return { valid: true, value: num };
        };

        if (action.startsWith('set_')) {
            let result;
            switch (action) {
                case 'set_threshold':
                    result = handleFloatInput(text);
                    if (result.valid && (result.value < 0 || result.value > 1)) {
                         responseMessage = `❌ Invalid value. Threshold must be between 0 and 1.`;
                    } else {
                         settingKey = 'spamThreshold';
                         value = result.value;
                    }
                    break;
                case 'set_profanity_threshold':
                    result = handleFloatInput(text);
                    if (result.valid && (result.value < 0 || result.value > 1)) {
                         responseMessage = `❌ Invalid value. Profanity threshold must be between 0 and 1.`;
                    } else {
                         settingKey = 'profanityThreshold';
                         value = result.value;
                    }
                    break;
                case 'set_profanity_warning':
                    settingKey = 'profanityWarningMessage';
                    value = text;
                    break;
                case 'set_spam_warning':
                    settingKey = 'warningMessage';
                    value = text;
                    break;
                case 'set_mute_duration':
                    result = handleNumericInput(text, true); // Must be non-negative
                    settingKey = 'muteDurationMinutes';
                    value = result.value;
                    if (!result.valid) responseMessage = `❌ Invalid value. Duration must be a positive number.`;
                    break;
                case 'set_warning_delete_seconds':
                    result = handleNumericInput(text, true);
                    settingKey = 'warningMessageDeleteSeconds';
                    value = result.value;
                    if (!result.valid) responseMessage = `❌ Invalid value. Timer must be a positive number.`;
                    break;
                case 'set_strike_expiration':
                case 'set_good_behavior':
                     result = handleNumericInput(text, true);
                     settingKey = action === 'set_strike_expiration' ? 'strikeExpirationDays' : 'goodBehaviorDays';
                     value = result.value;
                     if (!result.valid) responseMessage = `❌ Invalid value. Days must be a positive number.`;
                     break;
                case 'set_warning_message':
                    settingKey = 'warningMessage';
                    value = text;
                    break;
                default: // Penalty Levels
                    result = handleNumericInput(text, true);
                    const levelType = action.substring(4, action.lastIndexOf('_level'));
                    settingKey = `${levelType}Level`;
                    value = result.value;
                    if (!result.valid) responseMessage = `❌ Invalid value. Strike level must be a positive number.`;
                    break;
            }

            if (value !== undefined && value !== null) {
                await updateSetting(targetChatId, settingKey, value);
                responseMessage = `✅ **${settingKey.replace(/([A-Z])/g, ' $1').trim()}** updated successfully.`;
            }
        } else if (action.includes('keyword')) {
            const keyword = text.toLowerCase().trim();
            if (action === 'add_keyword') await db.addWhitelistKeyword(targetChatId, keyword);
            else await db.removeWhitelistKeyword(targetChatId, keyword);
            responseMessage = `✅ Keyword **"${keyword}"** action completed.`;
        } else if (action.includes('mod')) {
            const modId = text.trim();
            if (!/^\d+$/.test(modId)) {
                responseMessage = `❌ Invalid input. Please provide a numeric User ID.`;
            } else {
                const groupSettings = await getGroupSettings(targetChatId);
                let newMods = [...groupSettings.moderatorIds];
                if (action === 'add_mod' && !newMods.includes(modId)) newMods.push(modId);
                else if (action === 'remove_mod') newMods = newMods.filter(id => id !== modId);
                await updateSetting(targetChatId, 'moderatorIds', newMods);
                responseMessage = `✅ Moderator ID **${modId}** action completed.`;
            }
        }

        await telegram.sendMessage(chat.id, responseMessage, { parse_mode: 'Markdown' });

        const updatedSettings = await getGroupSettings(targetChatId);
        const group = await db.getGroup(targetChatId);
        let menuText, keyboard;

        if (['set_threshold', 'toggle_bypass', 'set_spam_warning'].includes(action)) {
            menuText = 'Configure AI sensitivity settings:';
            keyboard = aiSensitivityKeyboard(updatedSettings, targetChatId);
        } else if (['set_profanity_threshold', 'set_profanity_warning', 'toggle_profanity'].includes(action)) {
            menuText = 'Configure profanity filter settings:';
            keyboard = profanityKeyboard(updatedSettings, targetChatId);
        } else if (['set_mute_duration', 'set_warning_delete_seconds', 'set_strike_expiration', 'set_good_behavior'].includes(action)) {
            menuText = 'Configure miscellaneous settings:';
            keyboard = miscKeyboard(updatedSettings, targetChatId);
        } else if (action.startsWith('set_') && action.includes('level')) {
            menuText = 'Configure penalty level settings:';
            keyboard = penaltyLevelsKeyboard(updatedSettings, targetChatId);
        } else if (action.includes('keyword')) {
            menuText = 'Manage whitelisted keywords that bypass AI checks.';
            keyboard = keywordMenuKeyboard(targetChatId);
        } else if (action.includes('mod')) {
            menuText = 'Manage whitelisted moderator IDs.';
            keyboard = moderatorMenuKeyboard(targetChatId);
        } else {
            menuText = `Managing settings for **${group.chatTitle}**. Please choose a category.`;
            keyboard = mainKeyboard(targetChatId);
        }

        const newMenuMessage = await telegram.sendMessage(chat.id, menuText, { ...keyboard, parse_mode: 'Markdown' });
        setActiveMenu(newMenuMessage, menuText, keyboard);

    } catch (error) {
        logger.error(`Failed to process text input for action ${action}:`, error);
        await telegram.sendMessage(chat.id, '❌ An error occurred while processing your request.');
    }
});
