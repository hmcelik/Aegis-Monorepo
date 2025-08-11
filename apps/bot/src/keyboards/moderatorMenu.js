/**
 * @fileoverview Defines the inline keyboard for the Moderator Whitelist management menu.
 */

/**
 * The keyboard layout for managing whitelisted moderator IDs.
 * Provides options to add, remove, and list moderators.
 *
 * @param {string} chatId - The ID of the group being configured.
 * @returns {object} The keyboard layout object for the Telegram API.
 */
export const moderatorMenuKeyboard = (chatId) => ({
    reply_markup: {
        inline_keyboard: [
            // Button to initiate adding a new moderator ID.
            [{ text: '➕ Add Moderator ID', callback_data: `add_mod:${chatId}` }],
            // Button to initiate removing an existing moderator ID.
            [{ text: '➖ Remove Moderator ID', callback_data: `remove_mod:${chatId}` }],
            // Button to list all currently whitelisted moderator IDs.
            [{ text: '👥 List All Moderators', callback_data: `list_mods:${chatId}` }],
            // Navigation button to return to the main whitelist menu.
            [{ text: '⬅️ Back to Whitelist Menu', callback_data: `settings_whitelist:${chatId}` }],
        ],
    },
});