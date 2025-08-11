import * as tokenService from '../services/tokenService.js';
import { validateTelegramWebAppData, extractUserFromWebAppData } from './verifyTelegramWebApp.js';
import ApiError from '../utils/apiError.js';
import { ERROR_TYPES } from '../utils/errorTypes.js';

/**
 * Unified authentication middleware that supports both JWT tokens and Telegram WebApp initData
 */
export const unifiedAuth = (req, res, next) => {
    try {
        // Check for JWT token first
        const authHeader = req.headers['authorization'];
        const jwtToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        
        if (jwtToken) {
            // Handle JWT authentication
            try {
                const decoded = tokenService.verifyToken(jwtToken);
                req.user = decoded;
                req.authType = 'jwt';
                return next();
            } catch (err) {
                return next(ApiError.fromType(ERROR_TYPES.TOKEN_INVALID, 'Invalid or expired JWT token'));
            }
        }
        
        // Check for Telegram WebApp initData only if no JWT token
        const initData = req.headers['x-telegram-init-data'] || (req.body && req.body.initData);

        if (initData) {
            // Handle Telegram WebApp authentication
            const botToken = process.env.BOT_TOKEN;
            
            if (!botToken) {
                return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'Bot token not configured'));
            }
            
            if (!validateTelegramWebAppData(initData, botToken)) {
                return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'Invalid Telegram WebApp data'));
            }

            try {
                const telegramUser = extractUserFromWebAppData(initData);
                
                if (!telegramUser) {
                    return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'No user data found in initData'));
                }

                // Set both user and telegramUser for backward compatibility
                req.user = { id: telegramUser.id, type: 'webapp' };
                req.telegramUser = telegramUser;
                req.authType = 'webapp';
                return next();
            } catch (error) {
                return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'Failed to parse Telegram user data'));
            }
        }
        
        // No authentication method provided
        return next(ApiError.fromType(ERROR_TYPES.UNAUTHORIZED, 'No authentication method provided (JWT token or Telegram WebApp data required)'));
    } catch (error) {
        // Log the error but return a proper API error
        console.error('unifiedAuth error:', error);
        return next(ApiError.fromType(ERROR_TYPES.HTTP_500, 'Authentication middleware error: ' + error.message));
    }
};

/**
 * Legacy JWT-only middleware for backward compatibility
 */
export const checkJwt = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next(ApiError.fromType(ERROR_TYPES.UNAUTHORIZED, 'No JWT token provided'));
    }

    try {
        const decoded = tokenService.verifyToken(token);
        req.user = decoded;
        req.authType = 'jwt';
        next();
    } catch (err) {
        return next(ApiError.fromType(ERROR_TYPES.TOKEN_INVALID, 'Invalid or expired JWT token'));
    }
};

/**
 * Legacy Telegram WebApp-only middleware for backward compatibility
 */
export const verifyTelegramWebApp = (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'] || req.body.initData;
    const botToken = process.env.BOT_TOKEN;
    
    if (!validateTelegramWebAppData(initData, botToken)) {
        return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'Invalid Telegram WebApp data'));
    }

    try {
        const telegramUser = extractUserFromWebAppData(initData);
        
        if (!telegramUser) {
            return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'No user data found in initData'));
        }

        req.user = { id: telegramUser.id, type: 'webapp' };
        req.telegramUser = telegramUser;
        req.authType = 'webapp';
        next();
    } catch (error) {
        return next(ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'Failed to parse Telegram user data'));
    }
};
