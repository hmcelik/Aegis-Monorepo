import { validationResult } from 'express-validator';
import { isPromotional, hasProfanity, analyzeMessage } from '@telegram-moderator/shared/src/services/nlp.js';
import { getGroupSettings } from '@telegram-moderator/shared/src/config/index.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';
import ApiError from '../utils/apiError.js';

/**
 * Test spam detection on a message
 */
export const testSpamDetection = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { text, whitelistedKeywords = [] } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        const result = await isPromotional(text, whitelistedKeywords);
        
        res.status(200).json({
            success: true,
            analysis: result,
            input: {
                text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                whitelistedKeywords
            }
        });

    } catch (error) {
        logger.error('Error in testSpamDetection:', error);
        next(new ApiError(500, 'Spam detection failed'));
    }
};

/**
 * Test profanity detection on a message
 */
export const testProfanityDetection = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { text } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        const result = await hasProfanity(text);
        
        res.status(200).json({
            success: true,
            analysis: result,
            input: {
                text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            }
        });

    } catch (error) {
        logger.error('Error in testProfanityDetection:', error);
        next(new ApiError(500, 'Profanity detection failed'));
    }
};

/**
 * Run complete message analysis (spam + profanity)
 */
export const analyzeMessageEndpoint = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { text, whitelistedKeywords = [], groupId } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        // Get group settings if groupId provided
        let groupSettings = null;
        if (groupId) {
            try {
                groupSettings = await getGroupSettings(groupId);
            } catch (error) {
                logger.warn(`Could not get settings for group ${groupId}:`, error);
            }
        }

        const result = await analyzeMessage(text, whitelistedKeywords);
        
        // Add interpretation based on group settings
        let interpretation = {};
        if (groupSettings) {
            interpretation = {
                wouldTriggerSpam: result.spam.isSpam && result.spam.score >= groupSettings.spamThreshold,
                wouldTriggerProfanity: groupSettings.profanityEnabled && 
                                     result.profanity.hasProfanity && 
                                     result.profanity.severity >= groupSettings.profanityThreshold,
                spamThreshold: groupSettings.spamThreshold,
                profanityEnabled: groupSettings.profanityEnabled,
                profanityThreshold: groupSettings.profanityThreshold
            };
        }
        
        res.status(200).json({
            success: true,
            analysis: result,
            interpretation,
            input: {
                text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                whitelistedKeywords,
                groupId
            }
        });

    } catch (error) {
        logger.error('Error in analyzeMessageEndpoint:', error);
        next(new ApiError(500, 'Message analysis failed'));
    }
};

/**
 * Get NLP service status and configuration
 */
export const getNLPStatus = async (req, res, next) => {
    try {
        const status = {
            service: 'NLP Processing Service',
            version: '2.0',
            model: 'gpt-4o-mini',
            features: {
                spamDetection: true,
                profanityFilter: true,
                combinedAnalysis: true,
                localFallbacks: true
            },
            capabilities: [
                'Real-time spam detection',
                'Context-aware profanity filtering', 
                'Whitelist keyword support',
                'Parallel processing',
                'Error handling with fallbacks'
            ]
        };

        res.status(200).json({
            success: true,
            status
        });

    } catch (error) {
        logger.error('Error in getNLPStatus:', error);
        next(new ApiError(500, 'Failed to get NLP status'));
    }
};
