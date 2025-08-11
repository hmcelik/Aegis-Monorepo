/**
 * @fileoverview This is the core message processor for the moderation bot.
 * It handles all non-command messages in groups, analyzes them for spam and profanity,
 * and applies penalties based on the configured rules for each specific group.
 */

import { isPromotional, hasProfanity, analyzeMessage } from '@telegram-moderator/shared/services/nlp.js';
import * as db from '@telegram-moderator/shared/services/database.js';
import { deleteMessage, kickUser, banUser, muteUser, sendMessage, getChatAdmins } from '@telegram-moderator/shared/services/telegram.js';
import { getGroupSettings } from '@telegram-moderator/shared/config/index.js';
import logger from '@telegram-moderator/shared/services/logger.js';
// Removed the obsolete userCache import

/**
 * Escapes characters that are special in Telegram's MarkdownV2 format.
 * This version uses a single regex for efficiency.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text.
 */
const escapeMarkdownV2 = (text) => {
    if (typeof text !== 'string') return '';
    // This regex matches all reserved characters for MarkdownV2.
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};


/**
 * Main handler for incoming messages.
 *
 * @param {object} msg - The Telegram message object.
 */
export const handleMessage = async (msg) => {
    const { chat, from, text, message_id } = msg;

    // Persist the user who sent the message to the database for future lookups.
    await db.upsertUser(from);

    // IMPORTANT: Ignore all messages in private chats and non-text messages. This bot is for group moderation only.
    if (chat.type === 'private' || !text) {
        return;
    }

    // Load the specific configuration for this group using its string ID.
    const groupSettings = await getGroupSettings(chat.id.toString());

    // Fetch the list of chat administrators.
    const adminIds = await getChatAdmins(chat.id);

    // Combine chat admins with manually whitelisted moderators into a single whitelist.
    const whitelist = [...adminIds.map(id => id.toString()), ...groupSettings.moderatorIds];

    // Ignore messages from whitelisted users.
    if (whitelist.includes(from.id.toString())) {
        return;
    }
    
    // Good behavior forgiveness
    if (groupSettings.goodBehaviorDays > 0) {
        const strikes = await db.getStrikes(chat.id.toString(), from.id.toString());
        if (strikes.count > 0 && strikes.timestamp) {
            const lastStrikeDate = new Date(strikes.timestamp);
            const now = new Date();
            const diffDays = (now.getTime() - lastStrikeDate.getTime()) / (1000 * 3600 * 24);

            if (diffDays > groupSettings.goodBehaviorDays) {
                await db.removeStrike(chat.id.toString(), from.id.toString(), 1);
                try {
                    await sendMessage(from.id, "Your good behavior has been noticed, and one of your strikes in " + chat.title + " has been removed. Keep it up!");
                } catch (error) {
                    logger.warn(`Could not send good behavior forgiveness PM to user ${from.id}`);
                }
            }
        }
    }


    // If keyword bypass is enabled, check if the message contains any whitelisted keywords.
    if (groupSettings.keywordWhitelistBypass && groupSettings.whitelistedKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
        logger.info(`Ignoring message from ${from.id} in chat ${chat.id} due to whitelisted keyword bypass.`);
        return;
    }

    try {
        // Use combined analysis for better performance when both spam and profanity checks are needed
        const shouldCheckProfanity = groupSettings.profanityEnabled && groupSettings.profanityThreshold > 0;
        
        let spamResult, profanityResult;
        
        if (shouldCheckProfanity) {
            // Use combined analysis for efficiency
            const analysis = await analyzeMessage(text, groupSettings.whitelistedKeywords);
            spamResult = analysis.spam;
            profanityResult = analysis.profanity;
        } else {
            // Only check for spam
            spamResult = await isPromotional(text, groupSettings.whitelistedKeywords);
            profanityResult = { hasProfanity: false, severity: 0, type: 'disabled' };
        }

        // Log ALL scanned messages for comprehensive stats
        await db.logManualAction(chat.id.toString(), from.id.toString(), {
            type: 'SCANNED',
            action: 'message_analyzed',
            timestamp: new Date().toISOString(),
            user: from,
            messageExcerpt: text.substring(0, 150),
            spamScore: spamResult.score,
            profanityScore: profanityResult.severity,
            profanityType: profanityResult.type || 'none',
            messageLength: text.length
        });

        logger.debug(`Message analysis - Spam: ${spamResult.score.toFixed(2)}, Profanity: ${profanityResult.severity.toFixed(2)}`);

        // Determine which violation occurred (spam takes precedence for logging)
        const isSpamViolation = spamResult.score >= groupSettings.spamThreshold;
        const isProfanityViolation = shouldCheckProfanity && profanityResult.severity >= groupSettings.profanityThreshold;
        
        if (isSpamViolation || isProfanityViolation) {
            // 1. Delete the offending message.
            await deleteMessage(chat.id, message_id);
            
            // Log the message deletion with detailed violation info
            await db.logManualAction(chat.id.toString(), from.id.toString(), {
                type: 'VIOLATION',
                action: 'message_deleted',
                timestamp: new Date().toISOString(),
                user: from,
                messageExcerpt: text.substring(0, 150),
                reason: 'Violation detected',
                violationType: isSpamViolation ? 'SPAM' : 'PROFANITY',
                spamScore: spamResult.score,
                profanityScore: profanityResult.severity,
                profanityType: profanityResult.type || 'unknown',
                messageLength: text.length,
                thresholdExceeded: isSpamViolation ? groupSettings.spamThreshold : groupSettings.profanityThreshold
            });

            // 2. Prepare the log data for the strike (prioritize spam over profanity for logging)
            const violationType = isSpamViolation ? 'SPAM' : 'PROFANITY';
            const primaryScore = isSpamViolation ? spamResult.score : profanityResult.severity;
            const logData = {
                type: 'STRIKE',
                violationType: violationType,
                timestamp: new Date().toISOString(),
                user: from,
                messageExcerpt: text.substring(0, 150),
                classificationScore: primaryScore,
                spamScore: spamResult.score,
                profanityScore: profanityResult.severity,
                profanityType: profanityResult.type || 'unknown',
                messageLength: text.length,
                thresholdExceeded: isSpamViolation ? groupSettings.spamThreshold : groupSettings.profanityThreshold
            };

            // 3. Record the strike in the database.
            const newStrikeCount = await db.recordStrike(chat.id.toString(), from.id.toString(), logData);
            logger.info(`User ${from.id} in chat ${chat.id} committed ${violationType} strike #${newStrikeCount}.`);

            // 4. Apply the appropriate penalty with updated logData for more detailed alerts.
            await applyPenalty(chat.id, from, newStrikeCount, groupSettings, logData);
        }
    } catch (error) {
        logger.error(`Error processing message from ${from.id} in chat ${chat.id}: ${error.message}`, { stack: error.stack });
    }
};

/**
 * Determines and applies the most severe, applicable penalty for a given strike count.
 *
 * @param {string|number} chatId - The ID of the chat where the offense occurred.
 * @param {object} user - The Telegram user object for the offender.
 * @param {number} strikeCount - The user's new total number of strikes in this chat.
 * @param {object} settings - The settings object for the specific group.
 * @param {object} [logData] - Optional log data, used for detailed alerts.
 */
async function applyPenalty(chatId, user, strikeCount, settings, logData) {
    const actions = [
        { level: settings.banLevel, name: 'BAN', execute: async () => {
            await banUser(chatId, user.id);
            // Log the ban action
            await db.logManualAction(chatId.toString(), user.id.toString(), {
                type: 'PENALTY',
                action: 'user_banned',
                timestamp: new Date().toISOString(),
                user: user,
                strikeCount: strikeCount,
                reason: 'Strike limit reached',
                violationType: logData?.violationType || 'UNKNOWN',
                executedBy: 'AUTO_MODERATOR',
                severity: 'HIGH'
            });
        }},
        { level: settings.kickLevel, name: 'KICK', execute: async () => {
            await kickUser(chatId, user.id);
            // Log the kick action
            await db.logManualAction(chatId.toString(), user.id.toString(), {
                type: 'PENALTY',
                action: 'user_kicked',
                timestamp: new Date().toISOString(),
                user: user,
                strikeCount: strikeCount,
                reason: 'Strike limit reached',
                violationType: logData?.violationType || 'UNKNOWN',
                executedBy: 'AUTO_MODERATOR',
                severity: 'MEDIUM'
            });
        }},
        { level: settings.muteLevel, name: 'MUTE', execute: async () => {
            await muteUser(chatId, user.id, settings.muteDurationMinutes);
            // Log the mute action
            await db.logManualAction(chatId.toString(), user.id.toString(), {
                type: 'PENALTY',
                action: 'user_muted',
                timestamp: new Date().toISOString(),
                user: user,
                strikeCount: strikeCount,
                reason: 'Strike limit reached',
                muteDuration: settings.muteDurationMinutes,
                violationType: logData?.violationType || 'UNKNOWN',
                executedBy: 'AUTO_MODERATOR',
                severity: 'LOW'
            });
        }},
        { level: settings.alertLevel, name: 'ALERT', execute: async () => {
            const escapedName = escapeMarkdownV2(user.first_name);
            const userTag = `[${escapedName}](tg://user?id=${user.id})`;

            // Choose appropriate warning message based on violation type
            const violationType = logData?.violationType || 'SPAM';
            const warningMessage = violationType === 'PROFANITY' ? settings.profanityWarningMessage : settings.warningMessage;
            const messageParts = warningMessage.split('{user}');
            const strikePart = ` \\(Strike ${strikeCount}\\)`;
            
            // Add the reason (message excerpt) if available
            const violationEmoji = violationType === 'PROFANITY' ? '🤬' : '📢';
            const reason = logData ? ` for ${violationEmoji} ${violationType.toLowerCase()}: "*${escapeMarkdownV2(logData.messageExcerpt)}*"` : '';

            let finalMessage = escapeMarkdownV2(messageParts[0]);
            if (messageParts.length > 1) {
                finalMessage += userTag;
                finalMessage += escapeMarkdownV2(messageParts.slice(1).join('{user}'));
            }
            finalMessage += reason;
            finalMessage += strikePart;

            const sentMsg = await sendMessage(chatId, finalMessage, { parse_mode: 'MarkdownV2' });

            if (settings.warningMessageDeleteSeconds > 0) {
                setTimeout(() => deleteMessage(chatId, sentMsg.message_id), settings.warningMessageDeleteSeconds * 1000);
            }
            
            // Log the alert/warning action
            await db.logManualAction(chatId.toString(), user.id.toString(), {
                type: 'PENALTY',
                action: 'user_warned',
                timestamp: new Date().toISOString(),
                user: user,
                strikeCount: strikeCount,
                reason: 'Strike warning',
                violationType: logData?.violationType || 'UNKNOWN',
                executedBy: 'AUTO_MODERATOR',
                severity: 'WARNING'
            });
        }},
    ];

    const triggeredActions = actions.filter(action => action.level > 0 && strikeCount >= action.level);

    if (triggeredActions.length === 0) {
        logger.info(`No action configured for strike #${strikeCount} in chat ${chatId}.`);
        return;
    }

    const actionToExecute = triggeredActions.reduce((prev, current) => (prev.level > current.level) ? prev : current);

    logger.warn(`Executing penalty: ${actionToExecute.name} for user ${user.id} in chat ${chatId} at strike #${strikeCount}.`);
    await actionToExecute.execute();

    if (actionToExecute.name === 'KICK' || actionToExecute.name === 'BAN') {
        await db.resetStrikes(chatId.toString(), user.id.toString());
        logger.info(`Strikes reset for user ${user.id} in chat ${chatId}.`);
    }
}