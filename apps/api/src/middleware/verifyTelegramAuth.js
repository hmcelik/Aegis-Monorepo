import crypto from 'crypto';
import ApiError from '../utils/apiError.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';

/**
 * Parses Telegram Mini App initData string into an object
 * @param {string} initData - Raw initData from window.Telegram.WebApp.initData
 * @returns {object} Parsed data object
 */
const parseInitData = (initData) => {
    const params = new URLSearchParams(initData);
    const data = {};
    
    for (const [key, value] of params.entries()) {
        if (key === 'user') {
            data.user = JSON.parse(value);
        } else {
            data[key] = value;
        }
    }
    
    return data;
};

/**
 * Verifies Telegram Login Widget authentication data
 * @param {object} userData - User data from login widget
 * @returns {boolean} Whether the data is valid
 */
const verifyLoginWidget = (userData) => {
    const { hash, ...data } = userData;
    
    if (!hash) return false;
    
    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    
    const dataCheckString = Object.keys(data)
        .sort()
        .filter(key => data[key] !== undefined && data[key] !== null && data[key] !== '')
        .map(key => `${key}=${data[key]}`)
        .join('\n');

    if (dataCheckString === '') return false;

    const hmac = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return hmac === hash;
};

/**
 * Verifies Telegram Mini App initData
 * @param {object} initData - Parsed initData from Mini App
 * @returns {boolean} Whether the data is valid
 */
const verifyInitData = (initData) => {
    const { hash, ...data } = initData;
    
    if (!hash) return false;
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    
    const dataCheckString = Object.keys(data)
        .sort()
        .map(key => {
            const value = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
            return `${key}=${value}`;
        })
        .join('\n');

    const hmac = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return hmac === hash;
};

export const verifyTelegramAuth = (req, res, next) => {
    const body = req.body;
    
    // Debug logging
    logger.info('🔍 Auth verification attempt:', {
        hasInitData: !!body.initData,
        hasUserData: !!(body.id || body.first_name),
        bodyKeys: Object.keys(body),
        initDataLength: body.initData ? body.initData.length : 0,
        initDataSample: body.initData ? body.initData.substring(0, 100) + '...' : null
    });
    
    // Check if this is raw initData from Mini App
    if (typeof body.initData === 'string') {
        try {
            const parsedData = parseInitData(body.initData);
            
            if (!parsedData.hash || !parsedData.user) {
                return next(new ApiError(400, 'Invalid initData format.'));
            }
            
            if (verifyInitData(parsedData)) {
                // Extract user data from Mini App format
                req.user = {
                    id: parsedData.user.id,
                    first_name: parsedData.user.first_name,
                    username: parsedData.user.username,
                    photo_url: parsedData.user.photo_url,
                    auth_date: parsedData.auth_date
                };
                return next();
            } else {
                return next(new ApiError(401, 'Invalid Telegram Mini App data. Hash verification failed.'));
            }
        } catch (error) {
            return next(new ApiError(400, 'Invalid initData format.'));
        }
    }
    
    // Check if this is Login Widget data format
    if (body.id && body.hash) {
        if (verifyLoginWidget(body)) {
            req.user = {
                id: body.id,
                first_name: body.first_name,
                username: body.username,
                photo_url: body.photo_url,
                auth_date: body.auth_date
            };
            return next();
        } else {
            return next(new ApiError(401, 'Invalid Telegram Login Widget data. Hash verification failed.'));
        }
    }
    
    // Legacy format support (existing implementation)
    const { hash, ...userData } = body;

    if (!hash) {
        return next(new ApiError(400, 'Authentication data is missing. Please provide either initData from Mini App or Login Widget data.'));
    }

    if (verifyLoginWidget(body)) {
        req.user = userData;
        return next();
    }

    return next(new ApiError(401, 'Invalid Telegram data. Hash verification failed.'));
};
