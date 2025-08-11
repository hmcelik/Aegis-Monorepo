/**
 * @fileoverview Defines the inline keyboard for the AI Sensitivity settings menu.
 */

/**
 * Generates the AI sensitivity keyboard layout.
 * This function is called each time the menu is displayed to ensure the
 * labels reflect the current configuration values for the specific group.
 *
 * @param {object} settings - The settings object for the group being configured.
 * @param {string} chatId - The ID of the group being configured.
 * @returns {object} The keyboard layout object for the Telegram API.
 */
export const aiSensitivityKeyboard = (settings, chatId) => ({
    reply_markup: {
        inline_keyboard: [
            // Button to set the spam detection threshold.
            [{ text: `🎯 Threshold (current: ${(settings.spamThreshold * 100).toFixed(0)}%)`, callback_data: `set_threshold:${chatId}` }],
            // Button to toggle the keyword bypass feature.
            [{ text: `${settings.keywordWhitelistBypass ? '✅' : '❌'} Keyword Bypass (${settings.keywordWhitelistBypass ? 'ON' : 'OFF'})`, callback_data: `toggle_bypass:${chatId}` }],
            // Set spam warning message
            [{ text: `💬 Spam Warning Message`, callback_data: `set_spam_warning:${chatId}` }],
            // Navigation button to return to the main menu.
            [{ text: '⬅️ Back', callback_data: `settings_main:${chatId}` }],
        ],
    },
});