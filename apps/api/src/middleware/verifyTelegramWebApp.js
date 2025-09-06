import crypto from 'crypto';
import logger from '@telegram-moderator/shared/src/services/logger.js';
import ApiError from '../utils/apiError.js';

/**
 * Validates Telegram WebApp initData
 * @param {string} initData - The initData string from Telegram WebApp
 * @param {string} botToken - Bot token for validation
 * @returns {boolean} - Whether the data is valid
 */
export const validateTelegramWebAppData = (initData, botToken) => {
    try {
        if (!initData || !botToken) {
            return false;
        }

        // Parse the initData
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');

        // Create data-check-string
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Generate secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();

        // Generate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        // Check if auth_date is not too old (within 1 hour)
        const authDate = parseInt(urlParams.get('auth_date'));
        const currentTime = Math.floor(Date.now() / 1000);
        const timeDiff = currentTime - authDate;

        if (timeDiff > 3600) { // 1 hour
            logger.warn('Telegram WebApp auth data is too old');
            return false;
        }

        return calculatedHash === hash;
    } catch (error) {
        logger.error('Error validating Telegram WebApp data:', error);
        return false;
    }
};

/**
 * Extract user data from Telegram WebApp initData
 * @param {string} initData - The initData string from Telegram WebApp
 * @returns {object|null} - User data or null if invalid
 */
export const extractUserFromWebAppData = (initData) => {
    try {
        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        
        if (!userParam) {
            return null;
        }

        return JSON.parse(decodeURIComponent(userParam));
    } catch (error) {
        logger.error('Error extracting user from WebApp data:', error);
        return null;
    }
};

/**
 * Middleware to verify Telegram WebApp authentication
 */
export const verifyTelegramWebApp = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData) {
            return next(new ApiError(401, 'Missing Telegram WebApp authentication data'));
        }

        if (!validateTelegramWebAppData(initData, botToken)) {
            return next(new ApiError(401, 'Invalid Telegram WebApp authentication'));
        }

        // Extract user data and attach to request
        const user = extractUserFromWebAppData(initData);
        if (!user) {
            return next(new ApiError(401, 'Unable to extract user data from Telegram WebApp'));
        }

        req.telegramUser = user;
        req.initData = initData;
        
        logger.info(`Telegram WebApp user authenticated: ${user.id}`);
        next();
    } catch (error) {
        logger.error('Error in verifyTelegramWebApp middleware:', error);
        next(new ApiError(500, 'Authentication error'));
    }
};
