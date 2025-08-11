/**
 * @fileoverview Defines the inline keyboard for the Profanity Filter settings menu.
 */

/**
 * Generates the profanity filter keyboard layout.
 * This function is called each time the menu is displayed to ensure the
 * labels reflect the current configuration values for profanity detection.
 *
 * @param {object} settings - The settings object for the group being configured.
 * @param {string} chatId - The ID of the group being configured.
 * @returns {object} The keyboard layout object for the Telegram API.
 */
export const profanityKeyboard = (settings, chatId) => ({
    reply_markup: {
        inline_keyboard: [
            // Toggle profanity detection on/off
            [{ text: `${settings.profanityEnabled ? '✅' : '❌'} Profanity Detection (${settings.profanityEnabled ? 'ON' : 'OFF'})`, callback_data: `toggle_profanity:${chatId}` }],
            // Set profanity detection threshold
            [{ text: `🎯 Sensitivity (current: ${(settings.profanityThreshold * 100).toFixed(0)}%)`, callback_data: `set_profanity_threshold:${chatId}` }],
            // Set custom profanity warning message
            [{ text: `💬 Warning Message`, callback_data: `set_profanity_warning:${chatId}` }],
            // Navigation button to return to the main menu.
            [{ text: '⬅️ Back', callback_data: `settings_main:${chatId}` }],
        ],
    },
});
