/**
 * @fileoverview Defines application-wide constants and enumerations.
 * Using enums helps prevent errors from typos and makes the code more readable.
 */

/**
 * Defines the penalty modes for repeat offenders.
 * This enum provides a standardized way to refer to different penalty types
 * throughout the application.
 * @readonly
 * @enum {string}
 */
export const PenaltyMode = {
    /** The user is kicked from the chat but can rejoin immediately. */
    KICK: 'kick',
    /** The user is permanently banned from the chat. */
    BAN: 'ban',
};