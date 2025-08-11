import * as tokenService from '../services/tokenService.js';
import * as db from '@telegram-moderator/shared/services/database.js';
import jwt from 'jsonwebtoken';
import config from '@telegram-moderator/shared/config/index.js';

export const verify = async (req, res, next) => {
    try {
        // The user object is attached by the verifyTelegramAuth middleware
        const { user } = req;
        
        // Ensure user is in our database
        await db.upsertUser(user);

        // Create a session token (JWT)
        const token = tokenService.generateToken({ id: user.id });

        res.status(200).json({
            message: 'Authentication successful',
            token: token
        });
    } catch (error) {
        next(error);
    }
};

export const loginWidget = async (req, res, next) => {
    try {
        // The user object is attached by the verifyTelegramAuth middleware
        const { user } = req;
        
        // Ensure user is in our database
        await db.upsertUser(user);

        // Create a JWT token for API access
        const token = tokenService.generateToken({ 
            id: user.id,
            username: user.username,
            first_name: user.first_name 
        });

        res.status(200).json({
            success: true,
            token: token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const refreshToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.decode(token);
        
        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        // Generate new token
        const newToken = tokenService.generateToken({
            id: decoded.id,
            username: decoded.username,
            first_name: decoded.first_name
        });

        const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                token: newToken,
                expiresAt: expiresAt.toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
};

export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        
        try {
            const decoded = jwt.verify(token, config.jwt.secret);

            res.json({
                success: true,
                message: 'Token is valid',
                data: {
                    valid: true,
                    user: {
                        id: decoded.id,
                        first_name: decoded.first_name,
                        username: decoded.username
                    },
                    expiresAt: new Date(decoded.exp * 1000).toISOString()
                }
            });
        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
    } catch (error) {
        next(error);
    }
};