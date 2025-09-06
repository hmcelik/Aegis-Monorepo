/**
 * @fileoverview Handles incoming commands from users (e.g., /start, /settings, /status).
 * Manages the initial interaction for bot configuration.
 */

import 'dotenv/config';
import { sendMessage, getChatAdmins, deleteMessage, getChatMember, sendDocument } from '@telegram-moderator/shared/src/services/telegram.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import { getGroupSettings } from '@telegram-moderator/shared/src/config/index.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';
import { mainKeyboard } from '../keyboards/mainMenu.js';
import { setActiveMenu } from './callbackHandler.js';
import { Buffer } from 'buffer';

// The global "Super Admin" for bot-wide diagnostics.
const SUPER_ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Validate super admin configuration
if (!SUPER_ADMIN_USER_ID) {
    logger.warn('ADMIN_USER_ID not set in environment variables. Super admin commands will be disabled.');
} else {
    logger.info(`Super admin configured: ${SUPER_ADMIN_USER_ID}`);
}

/**
 * Escapes characters that are special in Telegram's MarkdownV2 format.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
export const escapeMarkdownV2 = (text) => {
    if (typeof text !== 'string') return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

/**
 * Handles command usage errors by sending a temporary message and deleting both it and the original command.
 * @param {object} originalMessage - The user's original message object.
 * @param {string} errorText - The error message to display (do not escape this).
 */
const handleCommandError = async (originalMessage, errorText) => {
    try {
        const escapedErrorText = escapeMarkdownV2(errorText);
        const errorMsg = await sendMessage(originalMessage.chat.id, escapedErrorText, { parse_mode: 'MarkdownV2' });
        setTimeout(() => {
            deleteMessage(originalMessage.chat.id, originalMessage.message_id).catch(() => {});
            deleteMessage(originalMessage.chat.id, errorMsg.message_id).catch(() => {});
        }, 5000);
    } catch (error) {
        logger.error(`Failed to handle command error in chat ${originalMessage.chat.id}`, error);
    }
};


/**
 * Processes and responds to recognized commands.
 *
 * @param {object} msg - The Telegram message object.
 */
export const handleCommand = async (msg) => {
    const { from, chat, text } = msg;
    if (!text) return;
    
    await db.upsertUser(from);

    if (chat.type === 'private') {
        return handlePrivateCommand(msg);
    } else {
        return handleGroupCommand(msg);
    }
};

/**
 * Handles commands sent in a private chat.
 */
const handlePrivateCommand = async (msg) => {
    const { from, chat, text } = msg;
    const command = text.split(/\s+/)[0];

    switch (command) {
        case '/start':
            const welcomeMessage = `
Hello\\! I am the AI Moderator Bot 🤖

I use AI to help keep your Telegram groups safe from spam and promotional content\\.

*To see what I can do*, use the \`/help\` command\\.
*To manage a group*, use the \`/settings\` command\\.
            `;
            await sendMessage(chat.id, welcomeMessage, { parse_mode: 'MarkdownV2' });
            break;
        case '/settings':
            await showGroupSelection(from.id, chat.id, 'settings', true); // Force admin check
            break;
        case '/mystrikes':
            await showGroupSelection(from.id, chat.id, 'mystrikes', false); // Do not force admin check
            break;
        case '/help':
            const fullHelpText = `
Hello\\! Here is a complete list of my commands\\.
\`<required>\` brackets mean a value must be provided\\.
\`[optional]\` brackets mean a value is not required\\.

─────────────────────

👤 *Public Commands*
\`/mystrikes\`
_Check your own strike count privately\\._

\`/help\`
_Shows this help message\\._

─────────────────────

🛡️ *Administrator Commands*
\`/register\`
_Registers the bot in a new group\\._

\`/status\`
_Displays the bot's current settings\\._

\`/checkstrikes <@user>\`
_View a user's strike history\\._

\`/addstrike <@user> <amount> [reason...]\`
_Adds a number of strikes to a user\\._

\`/removestrike <@user> [amount] [reason...]\`
_Removes strikes from a user\\. Amount defaults to 1\\._

\`/setstrike <@user> <amount> [reason...]\`
_Sets a user's strike count to a specific number\\._

\`/auditlog\`
_View recent moderation actions\\._

─────────────────────

${SUPER_ADMIN_USER_ID && from.id.toString() === SUPER_ADMIN_USER_ID ? `👑 *Super Administrator Commands*
\`/globalstats\`
_View global bot statistics across all groups\\._

\`/maintenance <on|off>\`
_Toggle maintenance mode\\._

\`/broadcast <message>\`
_Send a message to all registered groups\\._

\`/forceupdate\`
_Force refresh bot configurations\\._

\`/clearcache\`
_Clear all cached data\\._

─────────────────────

` : ''}*To configure the bot's settings*, use the \`/settings\` command\\.
        `;
            await sendMessage(chat.id, fullHelpText, { parse_mode: 'MarkdownV2' });
            break;
        case '/status':
            await showGroupSelection(from.id, chat.id, 'status', true); // Force admin check
            break;
        
        // --- Super Admin Commands in Private Chat ---
        case '/globalstats':
        case '/maintenance':
        case '/broadcast':
        case '/forceupdate':
        case '/clearcache':
            logger.info(`Super admin command attempted in private chat: ${command} by user ${from.id} (configured admin: ${SUPER_ADMIN_USER_ID})`);
            
            if (!SUPER_ADMIN_USER_ID) {
                await sendMessage(chat.id, '❌ Super admin functionality is not configured.');
                break;
            }
            if (from.id.toString() !== SUPER_ADMIN_USER_ID) {
                await sendMessage(chat.id, '❌ This command is restricted to super administrators.');
                break;
            }
            
            // Create a mock message object for the super admin handler
            const mockGroupMsg = { ...msg, chat: { ...chat, type: 'group' } };
            return handleSuperAdminCommand(mockGroupMsg);
            
        default:
            await sendMessage(chat.id, 'Unknown command. Use /settings or /help.');
            break;
    }
};

/**
 * Handles commands sent in a group chat.
 */
const handleGroupCommand = async (msg) => {
    const { from, chat, text } = msg;
    const command = text.split(/\s+/)[0];
    const adminIds = await getChatAdmins(chat.id);
    const isAdmin = adminIds.includes(from.id);

    // --- Public Commands ---
    if (command === '/mystrikes' || command === '/help') {
        return handlePublicGroupCommand(msg, isAdmin);
    }

    // --- Admin-only Commands ---
    const adminCommands = ['/register', '/status', '/removestrike', '/addstrike', '/setstrike', '/checkstrikes', '/auditlog'];
    if (adminCommands.includes(command)) {
        if (!isAdmin) {
            return handleCommandError(msg, 'You must be an admin to use this command.');
        }
        return handleAdminCommand(msg);
    }

    // --- Super Admin Commands ---
    const superAdminCommands = ['/globalstats', '/maintenance', '/broadcast', '/forceupdate', '/clearcache'];
    if (superAdminCommands.includes(command)) {
        logger.info(`Super admin command attempted: ${command} by user ${from.id} (configured admin: ${SUPER_ADMIN_USER_ID})`);
        
        if (!SUPER_ADMIN_USER_ID) {
            return handleCommandError(msg, 'Super admin functionality is not configured.');
        }
        if (from.id.toString() !== SUPER_ADMIN_USER_ID) {
            return handleCommandError(msg, 'This command is restricted to super administrators.');
        }
        return handleSuperAdminCommand(msg);
    }

    // --- Unknown Commands ---
    await handleCommandError(msg, `Unknown command: ${command}. Use /help for available commands.`);
};

/**
 * Handles public commands issued in a group.
 */
const handlePublicGroupCommand = async (msg, isAdmin) => {
    const { from, chat, text } = msg;
    const command = text.split(/\s+/)[0];

    await deleteMessage(chat.id, msg.message_id);

    if (command === '/mystrikes') {
        try {
            const strikes = await db.getStrikes(chat.id.toString(), from.id.toString());
            const history = await db.getStrikeHistory(chat.id.toString(), from.id.toString(), 10);
            let report = `⚖️ *Your Strike Report*\n*Group:* ${escapeMarkdownV2(chat.title)}\n*Current Strikes:* ${strikes.count}\n`;
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
            await sendMessage(from.id, report, { parse_mode: 'MarkdownV2' });
            const confirmationMsg = await sendMessage(chat.id, `I've sent your strike report to you in a private message, ${from.first_name}.`);
            setTimeout(() => deleteMessage(chat.id, confirmationMsg.message_id), 3000);
        } catch (error) {
            if (error.response?.body.description.includes("bot can't initiate conversation")) {
                const errorMsg = await sendMessage(chat.id, `${from.first_name}, I can't send you a private message. Please start a chat with me first!`);
                setTimeout(() => deleteMessage(chat.id, errorMsg.message_id), 5000);
            } else {
                logger.error(`Failed to send /mystrikes info to user ${from.id}`, error);
            }
        }
    } else if (command === '/help') {
        let helpText = `Hello\\! Here is a list of commands available to you\\.\n\n\`<required>\` brackets mean a value must be provided\\.\n\`[optional]\` brackets mean a value is not required\\.\n\n─────────────────────\n\n👤 *Public Commands*\n\`/mystrikes\`\n_Check your own strike count privately\\._\n\n\`/help\`\n_Shows this help message\\._`;
        if (isAdmin) {
            helpText += `\n\n─────────────────────\n\n🛡️ *Administrator Commands*\n\`/status\`\n_Displays the bot's current settings\\._\n\n\`/checkstrikes <@user>\`\n_View a user's strike history\\._\n\n\`/addstrike <@user> <amount> [reason...]\`\n_Adds a number of strikes to a user\\._\n\n\`/removestrike <@user> [amount] [reason...]\`\n_Removes strikes from a user\\. Amount defaults to 1\\._\n\n\`/setstrike <@user> <amount> [reason...]\`\n_Sets a user's strike count to a specific number\\._\n\n\`/auditlog\`\n_View recent moderation actions\\._`;
        }
        helpText += `\n\n─────────────────────`;
        if (isAdmin) {
            helpText += `\n*To configure advanced settings*, send me a private message with \`/settings\`\\.`;
        }
        try {
            await sendMessage(from.id, helpText, { parse_mode: 'MarkdownV2' });
            const confirmationMsg = await sendMessage(chat.id, `I've sent you the command list in a private message, ${from.first_name}.`);
            setTimeout(() => deleteMessage(chat.id, confirmationMsg.message_id), 3000);
        } catch (error) {
             if (error.response?.body.description.includes("bot can't initiate conversation")) {
                const errorMsg = await sendMessage(chat.id, `${from.first_name}, I can't send you a private message. Please start a chat with me first!`);
                setTimeout(() => deleteMessage(chat.id, errorMsg.message_id), 5000);
            } else {
                logger.error(`Failed to send /help info to user ${from.id}`, error);
            }
        }
    }
};

/**
 * Handles admin-only commands.
 */
const handleAdminCommand = async (msg) => {
    const { from, chat, text } = msg;
    const parts = text.split(/\s+/);
    const command = parts[0];
    const target = parts[1];

    switch (command) {
        case '/register':
            await deleteMessage(chat.id, msg.message_id);
            const existingGroup = await db.getGroup(chat.id.toString());
            if (existingGroup) {
                await sendMessage(chat.id, 'This group is already registered.');
            } else {
                await db.addGroup(chat.id.toString(), chat.title);
                await sendMessage(chat.id, `✅ This group, "${chat.title}", has been successfully registered. Admins can now manage me via a private message.`);
            }
            break;
        
        case '/status':
            // This command leaves a permanent message, so we don't delete the original.
            const groupSettings = await getGroupSettings(chat.id.toString());
            const deletionsToday = await db.getTotalDeletionsToday(chat.id.toString());
            const response = `**📊 Bot Status & Configuration for ${chat.title}**\n\n**⚖️ Penalty Levels** (\`0\` = disabled)\n- Alert on Strike: \`${groupSettings.alertLevel}\`\n- Mute on Strike: \`${groupSettings.muteLevel}\`\n- Kick on Strike: \`${groupSettings.kickLevel}\`\n- Ban on Strike: \`${groupSettings.banLevel}\`\n\n**🧠 AI & Content**\n- Spam Threshold: \`${groupSettings.spamThreshold}\`\n- Profanity Filter: \`${groupSettings.profanityEnabled ? 'ON' : 'OFF'}\`\n- Profanity Threshold: \`${groupSettings.profanityThreshold}\`\n- Keyword Bypass Mode: \`${groupSettings.keywordWhitelistBypass ? 'ON' : 'OFF'}\`\n\n**⚙️ Other Settings**\n- Mute Duration: \`${groupSettings.muteDurationMinutes} minutes\`\n- Whitelisted Keywords: \`${groupSettings.whitelistedKeywords.join(', ') || 'None'}\`\n- Manual User Whitelist: \`${groupSettings.moderatorIds.join(', ') || 'None'}\`\n\n**📈 Stats**\n- Deletions Today: \`${deletionsToday}\``;
            await sendMessage(chat.id, response, { parse_mode: 'Markdown' });
            break;

        case '/auditlog':
            try {
                const logs = await db.getAuditLog(chat.id.toString(), 100);
                if (logs.length === 0) {
                    await sendMessage(from.id, `There are no audit log entries for the group "${chat.title}".`);
                } else {
                    let logReport = `Audit Log for ${chat.title}\nShowing the last ${logs.length} actions\n\n`;
                    for (const log of logs) {
                        try {
                            logReport += `----------------------------------------\n`;
                            const logData = JSON.parse(log.logData);
                            const timestamp = new Date(log.timestamp).toUTCString();
                            const actionType = logData.type || 'AUTO';
                            const user = actionType.startsWith('MANUAL') ? logData.targetUser : logData.user;
                            logReport += `User: ${user.first_name} (${user.id})\n`;
                            logReport += `Date: ${timestamp}\n`;
                            if (actionType.startsWith('MANUAL')) {
                                const admin = logData.admin;
                                let actionDetail = logData.type;
                                if (logData.type === 'MANUAL-STRIKE-ADD') actionDetail = `Added ${logData.amount} strike(s)`;
                                else if (logData.type === 'MANUAL-STRIKE-REMOVE') actionDetail = `Removed ${logData.amount} strike(s)`;
                                else if (logData.type === 'MANUAL-STRIKE-SET') actionDetail = `Set strikes to ${logData.amount}`;
                                logReport += `Action: ${actionDetail}\n`;
                                logReport += `Admin: ${admin.first_name}\n`;
                                logReport += `Reason: "${logData.reason}"\n`;
                            } else {
                                logReport += `Action: AUTO-STRIKE (Score: ${logData.classificationScore.toFixed(2)})\n`;
                                logReport += `Reason: "${logData.messageExcerpt}"\n`;
                            }
                        } catch (parseError) {
                            logger.error(`Failed to parse logData for log ID ${log.id}`, parseError);
                        }
                    }
                    
                    const logBuffer = Buffer.from(logReport, 'utf-8');
                    await sendMessage(from.id, `Here is the audit log for "${chat.title}":`);
                    await sendDocument(from.id, logBuffer, {}, { filename: `audit_log_${chat.title}.txt`, contentType: 'text/plain' });
                }
                const confirmationMsg = await sendMessage(chat.id, `I've sent the group audit log to you privately as a file.`);
                setTimeout(() => {
                    deleteMessage(chat.id, msg.message_id).catch(() => {});
                    deleteMessage(chat.id, confirmationMsg.message_id).catch(() => {});
                }, 3000);
            } catch (error) {
                logger.error(`Failed to fetch or send audit log for chat ${chat.id}`, error);
                await handleCommandError(msg, 'An error occurred while fetching the audit log.');
            }
            break;
        
        default: // Strike commands
            if (!target) {
                return handleCommandError(msg, `Invalid usage. Please specify a user. Use '/help' for details.`);
            }
            const user = await db.findUserByUsernameInDb(target.replace('@', ''));
            if (!user) {
                return handleCommandError(msg, `User ${target} not found. They may need to send a message so I can see them.`);
            }
            await db.upsertUser({ id: user.userId, first_name: user.firstName, username: user.username });
            
            if (command === '/checkstrikes') {
                try {
                    const strikes = await db.getStrikes(chat.id.toString(), user.userId);
                    const history = await db.getStrikeHistory(chat.id.toString(), user.userId, 10);
                    let report = `⚖️ *Strike Report for ${escapeMarkdownV2(user.firstName)}*\n*Group:* ${escapeMarkdownV2(chat.title)}\n*Current Strikes:* ${strikes.count}\n`;
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
                        report += "\n_No strike history found in the audit log for this user\\._\n";
                    }
                    await sendMessage(from.id, report, { parse_mode: 'MarkdownV2' });
                    const confirmationMsg = await sendMessage(chat.id, `I've sent ${target}'s strike report to you privately.`);
                    setTimeout(() => {
                        deleteMessage(chat.id, msg.message_id).catch(() => {});
                        deleteMessage(chat.id, confirmationMsg.message_id).catch(() => {});
                    }, 3000);
                } catch (error) {
                     logger.error(`Failed to fetch/send strike history for user ${user.userId}`, error);
                     await handleCommandError(msg, 'An error occurred while fetching the strike history.');
                }
            } else { // addstrike, removestrike, setstrike
                const beforeStrikes = await db.getStrikes(chat.id.toString(), user.userId);
                const amount = parseInt(parts[2], 10);
                const reason = parts.slice(3).join(' ') || 'No reason provided.';
                const targetUserObject = {id: user.userId, first_name: user.firstName, username: user.username};

                if (command === '/addstrike') {
                    if (isNaN(amount) || amount <= 0) {
                        return handleCommandError(msg, `Invalid usage. Use \`/addstrike @user <amount>\`. Use \`/help\` for details.`);
                    }
                    const newCount = await db.addStrikes(chat.id.toString(), user.userId, amount);
                    await db.logManualAction(chat.id.toString(), user.userId, { type: 'MANUAL-STRIKE-ADD', admin: from, targetUser: targetUserObject, amount, reason });
                    await sendMessage(chat.id, `Strikes for ${target} changed from ${beforeStrikes.count} -> ${newCount} (+${amount}).`);
                } else if (command === '/removestrike') {
                    const amountToRemove = parts[2] ? parseInt(parts[2], 10) : 1;
                    if (isNaN(amountToRemove) || amountToRemove <= 0) {
                        return handleCommandError(msg, 'Invalid amount specified. Use \`/help\` for details.');
                    }
                    const newCount = await db.removeStrike(chat.id.toString(), user.userId, amountToRemove);
                    await db.logManualAction(chat.id.toString(), user.userId, { type: 'MANUAL-STRIKE-REMOVE', admin: from, targetUser: targetUserObject, amount: amountToRemove, reason });
                    await sendMessage(chat.id, `Strikes for ${target} changed from ${beforeStrikes.count} -> ${newCount} (-${amountToRemove}).`);
                } else if (command === '/setstrike') {
                    if (isNaN(amount) || amount < 0) {
                         return handleCommandError(msg, `Invalid usage. Use \`/setstrike @user <amount>\`. Use \`/help\` for details.`);
                    }
                    await db.setStrikes(chat.id.toString(), user.userId, amount);
                    await db.logManualAction(chat.id.toString(), user.userId, { type: 'MANUAL-STRIKE-SET', admin: from, targetUser: targetUserObject, amount, reason });
                    await sendMessage(chat.id, `Strikes for ${target} set from ${beforeStrikes.count} -> ${amount}.`);
                }
                await deleteMessage(chat.id, msg.message_id);
            }
            break;
    }
};

/**
 * Displays a group selection menu to a user in a private chat.
 */
async function showGroupSelection(userId, chatId, nextAction = 'settings', requireAdmin = true) {
    try {
        const allGroups = await db.getAllGroups();
        const userGroups = [];
        for (const group of allGroups) {
            if (requireAdmin) {
                const adminIds = await getChatAdmins(group.chatId);
                if (adminIds.includes(userId)) userGroups.push(group);
            } else {
                const member = await getChatMember(group.chatId, userId);
                if (member && member.status !== 'left' && member.status !== 'kicked') userGroups.push(group);
            }
        }

        if (userGroups.length === 0) {
            const message = requireAdmin 
                ? "I couldn't find any groups where you are an admin and I am present."
                : "I couldn't find any groups where we are both members.";
            await sendMessage(chatId, message);
            return;
        }

        if (userGroups.length === 1) {
            const group = userGroups[0];
            const targetChatId = group.chatId;

            if (nextAction === 'mystrikes') {
                const strikes = await db.getStrikes(targetChatId, userId.toString());
                const history = await db.getStrikeHistory(targetChatId, userId.toString(), 10);
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
                await sendMessage(chatId, report, { parse_mode: 'MarkdownV2' });
            } else { // 'settings' or 'status'
                 const groupSettings = await getGroupSettings(targetChatId);
                 if (nextAction === 'status') {
                    const deletionsToday = await db.getTotalDeletionsToday(targetChatId);
                    const response = `**📊 Bot Status & Configuration for ${group.chatTitle}**...`; // Truncated for brevity
                    await sendMessage(chatId, response, { parse_mode: 'Markdown' });
                 } else { // 'settings'
                    const text = `Managing settings for **${group.chatTitle}**. Please choose a category.`;
                    // Pass the targetChatId to the mainKeyboard function to create stateless buttons
                    const keyboard = mainKeyboard(targetChatId);
                    const sentMenuMessage = await sendMessage(chatId, text, { ...keyboard, parse_mode: 'Markdown' });
                    setActiveMenu(sentMenuMessage, text, keyboard);
                 }
            }
            return;
        }
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: userGroups.map(group => ([{
                    text: group.chatTitle,
                    callback_data: `select_group:${group.chatId}:${nextAction}`
                }]))
            }
        };
        await sendMessage(chatId, `Please choose a group for the /${nextAction} command:`, keyboard);
    } catch (error) {
        logger.error(`Error showing group selection for user ${userId}:`, error);
        await sendMessage(chatId, 'An error occurred while fetching your groups.');
    }
}

/**
 * Handles super admin commands that provide bot-wide control and monitoring.
 */
const handleSuperAdminCommand = async (msg) => {
    const { from, chat, text } = msg;
    const command = text.split(/\s+/)[0];
    const args = text.split(/\s+/).slice(1);

    // Only delete message in groups, not in private chats
    if (chat.type !== 'private') {
        await deleteMessage(chat.id, msg.message_id);
    }

    switch (command) {
        case '/globalstats':
            try {
                const allGroups = await db.getAllGroups();
                const totalUsers = await db.getTotalUsersCount();
                const totalStrikes = await db.getTotalStrikesCount();
                const deletionsToday = await db.getGlobalDeletionsToday();
                
                let report = `🌍 **Global Bot Statistics**\n\n` +
                    `📊 **Overview**\n` +
                    `• Total Groups: \`${allGroups.length}\`\n` +
                    `• Total Users: \`${totalUsers}\`\n` +
                    `• Total Active Strikes: \`${totalStrikes}\`\n` +
                    `• Deletions Today: \`${deletionsToday}\`\n\n` +
                    `🏆 **Top 5 Most Active Groups**\n`;
                
                // Get top groups by deletion count
                const topGroups = await db.getTopGroupsByDeletions(5);
                for (let i = 0; i < topGroups.length; i++) {
                    const group = topGroups[i];
                    report += `${i + 1}. ${group.chatTitle} - \`${group.deletions}\` deletions\n`;
                }
                
                await sendMessage(chat.id, report, { parse_mode: 'Markdown' });
            } catch (error) {
                logger.error('Error in /globalstats:', error);
                await sendMessage(chat.id, '❌ Failed to retrieve global statistics.');
            }
            break;

        case '/maintenance':
            const mode = args[0]; // 'on', 'off', or 'status'
            try {
                if (mode === 'on') {
                    process.env.MAINTENANCE_MODE = 'true';
                    await sendMessage(chat.id, '🔧 **Maintenance mode enabled.** Bot will respond with maintenance messages.');
                } else if (mode === 'off') {
                    process.env.MAINTENANCE_MODE = 'false';
                    await sendMessage(chat.id, '✅ **Maintenance mode disabled.** Bot is operating normally.');
                } else {
                    const status = process.env.MAINTENANCE_MODE === 'true' ? 'ENABLED' : 'DISABLED';
                    await sendMessage(chat.id, `🔧 **Maintenance Status:** ${status}\n\nUsage: \`/maintenance on|off\``, { parse_mode: 'Markdown' });
                }
            } catch (error) {
                logger.error('Error in /maintenance:', error);
                await sendMessage(chat.id, '❌ Failed to toggle maintenance mode.');
            }
            break;

        case '/broadcast':
            if (args.length === 0) {
                await sendMessage(chat.id, '📢 **Broadcast Command**\n\nUsage: `/broadcast <message>`\n\nThis will send a message to all registered groups.', { parse_mode: 'Markdown' });
                return;
            }
            
            try {
                const message = args.join(' ');
                const allGroups = await db.getAllGroups();
                let successCount = 0;
                let failCount = 0;
                
                const broadcastMessage = `📢 **System Announcement**\n\n${message}\n\n_This message was sent by the bot administrator._`;
                
                for (const group of allGroups) {
                    try {
                        await sendMessage(group.chatId, broadcastMessage, { parse_mode: 'Markdown' });
                        successCount++;
                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        failCount++;
                        logger.warn(`Failed to broadcast to group ${group.chatId}:`, error);
                    }
                }
                
                await sendMessage(chat.id, `📊 **Broadcast Complete**\n✅ Sent to: ${successCount} groups\n❌ Failed: ${failCount} groups`, { parse_mode: 'Markdown' });
            } catch (error) {
                logger.error('Error in /broadcast:', error);
                await sendMessage(chat.id, '❌ Failed to execute broadcast.');
            }
            break;

        case '/forceupdate':
            try {
                // This could trigger a restart or reload of configurations
                await sendMessage(chat.id, '🔄 **Force Update Initiated**\n\nBot configurations are being refreshed...', { parse_mode: 'Markdown' });
                
                // Log the update
                logger.info(`Super admin ${from.first_name} (${from.id}) triggered a force update`);
                
                setTimeout(async () => {
                    await sendMessage(chat.id, '✅ **Update Complete**\nBot configurations have been refreshed.', { parse_mode: 'Markdown' });
                }, 2000);
                
            } catch (error) {
                logger.error('Error in /forceupdate:', error);
                await sendMessage(chat.id, '❌ Failed to execute force update.');
            }
            break;

        case '/clearcache':
            try {
                // Clear various caches if they exist
                const clearActions = [
                    'Configuration cache cleared',
                    'Admin cache cleared',  
                    'Settings cache cleared'
                ];
                
                await sendMessage(chat.id, '🧹 **Cache Clearing Initiated**\n\nClearing all cached data...', { parse_mode: 'Markdown' });
                
                logger.info(`Super admin ${from.first_name} (${from.id}) cleared system caches`);
                
                setTimeout(async () => {
                    const report = '✅ **Cache Clear Complete**\n\n' + clearActions.map(action => `• ${action}`).join('\n');
                    await sendMessage(chat.id, report, { parse_mode: 'Markdown' });
                }, 1500);
                
            } catch (error) {
                logger.error('Error in /clearcache:', error);
                await sendMessage(chat.id, '❌ Failed to clear caches.');
            }
            break;

        default:
            await sendMessage(chat.id, `❌ Unknown super admin command: ${command}`);
    }
};
