/**
 * @fileoverview Manages all interactions with the OpenAI API for natural language processing.
 * Provides spam detection and profanity filtering for message moderation.
 */

import axios from 'axios';
import config from '../config/index.js';
import logger from '../services/logger.js';

// Lazy initialization of API client to avoid config issues during tests
let apiClient = null;

const getApiClient = () => {
    if (!apiClient) {
        apiClient = axios.create({
            baseURL: 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${config.nlp?.apiKey || 'test-key'}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 second timeout for faster failure detection
        });
    }
    return apiClient;
};

// Common profanity words for quick local filtering (as fallback)
const PROFANITY_PATTERNS = [
    /\b(f[u\*]+ck|sh[i\*]+t|b[i\*]+tch|d[a\*]+mn|h[e\*]+ll)\b/gi,
    /\b(a[s\*]+s|cr[a\*]+p|p[i\*]+ss|s[u\*]+ck)\b/gi,
    // Add more patterns as needed
];

/**
 * Validates and sanitizes input text for NLP processing.
 * @param {any} text - The input to validate
 * @returns {string|null} Sanitized text or null if invalid
 */
const validateInput = (text) => {
    if (typeof text !== 'string') {
        if (text === null || text === undefined) return null;
        text = String(text);
    }
    
    // Trim and check if empty
    text = text.trim();
    if (!text) return null;
    
    // Limit length for performance (OpenAI has token limits anyway)
    if (text.length > 4000) {
        text = text.substring(0, 4000) + '...';
    }
    
    return text;
};

/**
 * Analyzes message text to determine if it is promotional spam.
 *
 * Uses GPT-4o-mini for faster, cost-effective analysis with an optimized prompt
 * for quicker processing and better accuracy.
 *
 * @param {string} text - The message content to analyze.
 * @param {string[]} [whitelistedKeywords=[]] - A list of keywords to provide as context to the AI.
 * @returns {Promise<{isSpam: boolean, score: number, reason?: string}>} Classification result
 */
export const isPromotional = async (text, whitelistedKeywords = []) => {
    const validatedText = validateInput(text);
    if (!validatedText) {
        return { isSpam: false, score: 0, reason: 'invalid_input' };
    }

    // Optimized system prompt for faster processing
    let systemContent = `Analyze if this message is promotional spam in a crypto/Web3 Telegram chat.

SPAM indicators (high score 0.7-1.0):
- External project promotion/links
- DM requests from strangers  
- Phishing/scam attempts
- Admin impersonation
- Unsolicited trading signals

ACCEPTABLE (low score 0.0-0.3):
- Community discussion/hype
- Price talk ("moon", "100x")
- Project enthusiasm
- Partnership news

Output JSON: {"isSpam": boolean, "score": 0.0-1.0}`;

    // Add whitelist context if provided and not bypassed
    if (whitelistedKeywords.length > 0 && !config.keywordWhitelistBypass) {
        const keywordList = whitelistedKeywords.slice(0, 10).join(', '); // Limit keywords for performance
        systemContent += `\n\nWhitelisted topics (consider acceptable): ${keywordList}`;
        logger.debug(`Using whitelisted keywords: [${keywordList}]`);
    }

    try {
        const response = await getApiClient().post('/chat/completions', {
            model: "gpt-4o-mini", // Faster and more cost-effective than gpt-3.5-turbo
            messages: [{
                role: "system",
                content: systemContent
            }, {
                role: "user",
                content: validatedText
            }],
            response_format: { type: "json_object" },
            max_tokens: 100, // Limit response tokens for faster processing
            temperature: 0.1, // Lower temperature for more consistent results
        });

        const result = JSON.parse(response.data.choices[0].message.content);
        
        // Validate the response structure
        if (typeof result.isSpam !== 'boolean' || typeof result.score !== 'number') {
            logger.warn('Invalid NLP response structure, using fallback');
            return { isSpam: false, score: 0, reason: 'invalid_response' };
        }

        // Ensure score is within valid range
        result.score = Math.max(0, Math.min(1, result.score));
        
        logger.debug(`Spam analysis complete: ${result.score.toFixed(2)} (${result.isSpam ? 'SPAM' : 'OK'})`);
        return result;

    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        logger.error(`NLP spam analysis failed: ${errorMsg}`);
        
        // Return safe default to avoid false positives
        return { isSpam: false, score: 0, reason: 'api_error' };
    }
};

/**
 * Analyzes message text for profanity and inappropriate content.
 *
 * Uses a hybrid approach: local pattern matching for common profanity
 * and AI analysis for context-aware detection.
 *
 * @param {string} text - The message content to analyze.
 * @returns {Promise<{hasProfanity: boolean, severity: number, type?: string}>} Profanity analysis result
 */
export const hasProfanity = async (text) => {
    const validatedText = validateInput(text);
    if (!validatedText) {
        return { hasProfanity: false, severity: 0, type: 'invalid_input' };
    }

    // Quick local check for obvious profanity
    const localCheck = PROFANITY_PATTERNS.some(pattern => pattern.test(validatedText));
    if (localCheck) {
        logger.debug('Profanity detected via local patterns');
        return { hasProfanity: true, severity: 0.8, type: 'explicit' };
    }

    // For borderline cases, use AI analysis
    const systemContent = `Analyze this message for profanity, offensive language, or inappropriate content.

Consider:
- Explicit profanity/swearing
- Hate speech or slurs
- Sexual content
- Harassment language
- Toxic behavior

Context: Telegram group chat moderation.

Output JSON: {"hasProfanity": boolean, "severity": 0.0-1.0, "type": "explicit|implicit|hate|sexual|toxic|clean"}`;

    try {
        const response = await getApiClient().post('/chat/completions', {
            model: "gpt-4o-mini",
            messages: [{
                role: "system", 
                content: systemContent
            }, {
                role: "user",
                content: validatedText
            }],
            response_format: { type: "json_object" },
            max_tokens: 80,
            temperature: 0.1,
        });

        const result = JSON.parse(response.data.choices[0].message.content);
        
        // Validate response structure
        if (typeof result.hasProfanity !== 'boolean' || typeof result.severity !== 'number') {
            logger.warn('Invalid profanity response structure, using local fallback');
            return { hasProfanity: localCheck, severity: localCheck ? 0.8 : 0, type: 'fallback' };
        }

        // Ensure severity is within valid range
        result.severity = Math.max(0, Math.min(1, result.severity));
        
        logger.debug(`Profanity analysis: ${result.severity.toFixed(2)} (${result.hasProfanity ? result.type || 'detected' : 'clean'})`);
        return result;

    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        logger.error(`NLP profanity analysis failed: ${errorMsg}`);
        
        // Fallback to local detection only
        return { 
            hasProfanity: localCheck, 
            severity: localCheck ? 0.8 : 0, 
            type: localCheck ? 'explicit_fallback' : 'api_error' 
        };
    }
};

/**
 * Combined analysis for both spam and profanity detection.
 * More efficient when both checks are needed.
 *
 * @param {string} text - The message content to analyze.
 * @param {string[]} [whitelistedKeywords=[]] - Keywords for spam context.
 * @returns {Promise<{spam: object, profanity: object}>} Combined analysis results
 */
export const analyzeMessage = async (text, whitelistedKeywords = []) => {
    const validatedText = validateInput(text);
    if (!validatedText) {
        return {
            spam: { isSpam: false, score: 0, reason: 'invalid_input' },
            profanity: { hasProfanity: false, severity: 0, type: 'invalid_input' }
        };
    }

    // Run both analyses in parallel for better performance
    const [spamResult, profanityResult] = await Promise.allSettled([
        isPromotional(validatedText, whitelistedKeywords),
        hasProfanity(validatedText)
    ]);

    return {
        spam: spamResult.status === 'fulfilled' ? spamResult.value : { isSpam: false, score: 0, reason: 'analysis_failed' },
        profanity: profanityResult.status === 'fulfilled' ? profanityResult.value : { hasProfanity: false, severity: 0, type: 'analysis_failed' }
    };
};