/**
 * @fileoverview Defines the main inline keyboard for the settings panel.
 */

/**
 * The main settings keyboard layout.
 * This is the root menu that provides access to all other configuration categories.
 *
 * @param {string} chatId - The ID of the group being configured.
 * @returns {object} The keyboard layout object for the Telegram API.
 */
export const mainKeyboard = (chatId) => ({
    reply_markup: {
        inline_keyboard: [
            // Navigate to AI sensitivity settings.
            [{ text: '🧠 AI Sensitivity', callback_data: `settings_ai_sensitivity:${chatId}` }],
            // Navigate to profanity filter settings.
            [{ text: '🤬 Profanity Filter', callback_data: `settings_profanity:${chatId}` }],
            // Navigate to penalty level settings.
            [{ text: '⚖️ Penalty Levels', callback_data: `settings_penalty_levels:${chatId}` }],
            // Navigate to whitelist management (keywords and moderators).
            [{ text: '� Whitelist Management', callback_data: `settings_whitelist:${chatId}` }],
            // Navigate to miscellaneous settings.
            [{ text: '⚙️ Miscellaneous', callback_data: `settings_misc:${chatId}` }],
        ],
    },
});