/**
 * @fileoverview Defines the inline keyboard for the main Whitelist menu.
 */

/**
 * The main whitelist menu keyboard layout.
 * Provides navigation to the keyword and moderator management sub-menus.
 *
 * @param {string} chatId - The ID of the group being configured.
 * @returns {object} The keyboard layout object for the Telegram API.
 */
export const whitelistKeyboard = (chatId) => ({
    reply_markup: {
        inline_keyboard: [
            // Navigate to the keyword management menu.
            [{ text: '🔑 Manage Keywords', callback_data: `whitelist_keywords:${chatId}` }],
            // Navigate to the moderator management menu.
            [{ text: '👮 Manage Moderators', callback_data: `whitelist_mods:${chatId}` }],
            // Navigation button to return to the main settings menu.
            [{ text: '⬅️ Back to Main Menu', callback_data: `settings_main:${chatId}` }],
        ],
    },
});