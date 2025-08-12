/**
 * @fileoverview Tests for enhanced message handler logging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMessage } from 'apps/bot/src/handlers/messageHandler.js';
import * as db from '@telegram-moderator/shared/services/database.js';
import * as nlp from 'packages/shared/services/nlp.js';
import * as telegram from 'packages/shared/services/telegram.js';
import * as config from 'packages/shared/config/index.js';

// Mock all external dependencies
vi.mock('@telegram-moderator/shared/services/database.js');
vi.mock('packages/shared/services/nlp.js');
vi.mock('packages/shared/services/telegram.js');
vi.mock('packages/shared/config/index.js');

describe('Enhanced Message Handler Logging', () => {
    const mockUser = {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
    };

    const mockChat = {
        id: -1001234567890,
        type: 'supergroup',
        title: 'Test Group'
    };

    const mockGroupSettings = {
        spamThreshold: 0.7,
        profanityEnabled: true,
        profanityThreshold: 0.8,
        profanityWarningMessage: 'No profanity please, {user}!',
        warningMessage: 'Please follow the rules, {user}!',
        keywordWhitelistBypass: false,
        whitelistedKeywords: [],
        moderatorIds: [],
        goodBehaviorDays: 0,
        muteLevel: 1,
        kickLevel: 2,
        banLevel: 3,
        alertLevel: 1,
        muteDurationMinutes: 60,
        warningMessageDeleteSeconds: 0
    };

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default mock implementations
        db.upsertUser.mockResolvedValue();
        db.getStrikes.mockResolvedValue({ count: 0, timestamp: null });
        db.logManualAction.mockResolvedValue();
        db.recordStrike.mockResolvedValue(1);
        db.resetStrikes.mockResolvedValue();
        
        telegram.getChatAdmins.mockResolvedValue([]);
        telegram.deleteMessage.mockResolvedValue();
        telegram.muteUser.mockResolvedValue();
        telegram.kickUser.mockResolvedValue();
        telegram.banUser.mockResolvedValue();
        telegram.sendMessage.mockResolvedValue({ message_id: 123 });
        
        config.getGroupSettings.mockResolvedValue(mockGroupSettings);
        
        nlp.isPromotional.mockResolvedValue({ score: 0.3, reason: 'clean' });
        nlp.hasProfanity.mockResolvedValue({ hasProfanity: false, severity: 0.1, type: 'none' });
        nlp.analyzeMessage.mockResolvedValue({
            spam: { score: 0.3, reason: 'clean' },
            profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
        });
    });

    describe('Message scanning and logging', () => {
        it('should log all scanned messages with enhanced data', async () => {
            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'This is a normal message for testing'
            };

            await handleMessage(message);

            // Should log the scanned message
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'SCANNED',
                    action: 'message_analyzed',
                    user: mockUser,
                    messageExcerpt: message.text,
                    spamScore: 0.3,
                    profanityScore: 0.1,
                    profanityType: 'none',
                    messageLength: message.text.length
                })
            );

            // Should NOT log violation or penalty for clean message
            expect(db.recordStrike).not.toHaveBeenCalled();
        });

        it('should log violations with detailed information', async () => {
            // Mock spam detection
            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
            });

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Buy our amazing product now! Special discount!'
            };

            await handleMessage(message);

            // Should log the scanned message first
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'SCANNED',
                    action: 'message_analyzed',
                    spamScore: 0.85,
                    profanityScore: 0.1
                })
            );

            // Should log the violation
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'VIOLATION',
                    action: 'message_deleted',
                    violationType: 'SPAM',
                    spamScore: 0.85,
                    profanityScore: 0.1,
                    thresholdExceeded: mockGroupSettings.spamThreshold
                })
            );

            // Should record strike with detailed data
            expect(db.recordStrike).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'STRIKE',
                    violationType: 'SPAM',
                    classificationScore: 0.85,
                    spamScore: 0.85,
                    profanityScore: 0.1,
                    thresholdExceeded: mockGroupSettings.spamThreshold
                })
            );
        });

        it('should log profanity violations with profanity-specific data', async () => {
            // Mock profanity detection
            nlp.isPromotional.mockResolvedValue({ score: 0.3, reason: 'clean' });
            nlp.hasProfanity.mockResolvedValue({ hasProfanity: true, severity: 0.9, type: 'severe' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.3, reason: 'clean' },
                profanity: { hasProfanity: true, severity: 0.9, type: 'severe' }
            });

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'This message contains profanity'
            };

            await handleMessage(message);

            // Should log violation with profanity type
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'VIOLATION',
                    action: 'message_deleted',
                    violationType: 'PROFANITY',
                    spamScore: 0.3,
                    profanityScore: 0.9,
                    profanityType: 'severe',
                    thresholdExceeded: mockGroupSettings.profanityThreshold
                })
            );

            // Should record strike with profanity classification
            expect(db.recordStrike).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'STRIKE',
                    violationType: 'PROFANITY',
                    classificationScore: 0.9,
                    profanityType: 'severe'
                })
            );
        });
    });

    describe('Penalty logging', () => {
        it('should log mute penalties with enhanced data', async () => {
            // Mock violation that triggers mute
            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
            });
            
            // Set group settings where mute is the primary action at strike 1
            config.getGroupSettings.mockResolvedValue({
                ...mockGroupSettings,
                muteLevel: 1,
                alertLevel: 0, // Disable alert so mute is the only action
                kickLevel: 2,
                banLevel: 3
            });
            
            db.recordStrike.mockResolvedValue(1); // First strike triggers mute

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Spam message that triggers mute'
            };

            await handleMessage(message);

            // Should log the mute penalty
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'PENALTY',
                    action: 'user_muted',
                    strikeCount: 1,
                    reason: 'Strike limit reached',
                    violationType: 'SPAM',
                    executedBy: 'AUTO_MODERATOR',
                    severity: 'LOW'
                })
            );

            expect(telegram.muteUser).toHaveBeenCalledWith(
                mockChat.id,
                mockUser.id,
                60 // Use the muteDurationMinutes from the modified settings
            );
        });

        it('should log kick penalties with enhanced data', async () => {
            // Mock violation that triggers kick
            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
            });
            db.recordStrike.mockResolvedValue(2); // Second strike triggers kick

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Spam message that triggers kick'
            };

            await handleMessage(message);

            // Should log the kick penalty
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'PENALTY',
                    action: 'user_kicked',
                    strikeCount: 2,
                    reason: 'Strike limit reached',
                    violationType: 'SPAM',
                    executedBy: 'AUTO_MODERATOR',
                    severity: 'MEDIUM'
                })
            );

            expect(telegram.kickUser).toHaveBeenCalledWith(mockChat.id, mockUser.id);
            expect(db.resetStrikes).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString()
            );
        });

        it('should log ban penalties with enhanced data', async () => {
            // Mock violation that triggers ban
            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
            });
            db.recordStrike.mockResolvedValue(3); // Third strike triggers ban

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Spam message that triggers ban'
            };

            await handleMessage(message);

            // Should log the ban penalty
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'PENALTY',
                    action: 'user_banned',
                    strikeCount: 3,
                    reason: 'Strike limit reached',
                    violationType: 'SPAM',
                    executedBy: 'AUTO_MODERATOR',
                    severity: 'HIGH'
                })
            );

            expect(telegram.banUser).toHaveBeenCalledWith(mockChat.id, mockUser.id);
        });

        it('should log warning penalties with enhanced data', async () => {
            // Mock violation that triggers only warning (no higher penalties configured)
            const settingsWithOnlyWarning = {
                ...mockGroupSettings,
                muteLevel: 0, // Disable mute
                kickLevel: 0, // Disable kick
                banLevel: 0,  // Disable ban
                alertLevel: 1 // Only warning enabled
            };
            config.getGroupSettings.mockResolvedValue(settingsWithOnlyWarning);

            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: false, severity: 0.1, type: 'none' }
            });
            db.recordStrike.mockResolvedValue(1);

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Spam message that triggers warning'
            };

            await handleMessage(message);

            // Should log the warning penalty
            expect(db.logManualAction).toHaveBeenCalledWith(
                mockChat.id.toString(),
                mockUser.id.toString(),
                expect.objectContaining({
                    type: 'PENALTY',
                    action: 'user_warned',
                    strikeCount: 1,
                    reason: 'Strike warning',
                    violationType: 'SPAM',
                    executedBy: 'AUTO_MODERATOR',
                    severity: 'WARNING'
                })
            );

            expect(telegram.sendMessage).toHaveBeenCalled();
        });
    });

    describe('Data accuracy and completeness', () => {
        it('should include all required fields in scanned message logs', async () => {
            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Test message with specific content for field validation'
            };

            await handleMessage(message);

            const scannedLogCall = db.logManualAction.mock.calls.find(call => 
                JSON.stringify(call[2]).includes('SCANNED')
            );

            expect(scannedLogCall).toBeTruthy();
            const logData = scannedLogCall[2];

            expect(logData).toMatchObject({
                type: 'SCANNED',
                action: 'message_analyzed',
                timestamp: expect.any(String),
                user: mockUser,
                messageExcerpt: expect.any(String),
                spamScore: expect.any(Number),
                profanityScore: expect.any(Number),
                profanityType: expect.any(String),
                messageLength: expect.any(Number)
            });

            expect(logData.messageExcerpt.length).toBeLessThanOrEqual(150);
            expect(logData.messageLength).toBe(message.text.length);
        });

        it('should truncate long messages in excerpts', async () => {
            const longMessage = 'A'.repeat(200); // 200 characters
            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: longMessage
            };

            await handleMessage(message);

            const scannedLogCall = db.logManualAction.mock.calls.find(call => 
                JSON.stringify(call[2]).includes('SCANNED')
            );

            const logData = scannedLogCall[2];
            expect(logData.messageExcerpt.length).toBe(150);
            expect(logData.messageLength).toBe(200);
        });

        it('should handle spam prioritization over profanity in violations', async () => {
            // Mock both spam and profanity detection
            nlp.isPromotional.mockResolvedValue({ score: 0.85, reason: 'promotional' });
            nlp.hasProfanity.mockResolvedValue({ hasProfanity: true, severity: 0.9, type: 'severe' });
            nlp.analyzeMessage.mockResolvedValue({
                spam: { score: 0.85, reason: 'promotional' },
                profanity: { hasProfanity: true, severity: 0.9, type: 'severe' }
            });

            const message = {
                message_id: 1,
                from: mockUser,
                chat: mockChat,
                text: 'Spam message with profanity'
            };

            await handleMessage(message);

            // Should prioritize SPAM over PROFANITY in violation logging
            const violationLogCall = db.logManualAction.mock.calls.find(call => 
                JSON.stringify(call[2]).includes('VIOLATION')
            );

            expect(violationLogCall[2].violationType).toBe('SPAM');

            // But should still include profanity data
            expect(violationLogCall[2]).toMatchObject({
                spamScore: 0.85,
                profanityScore: 0.9,
                profanityType: 'severe'
            });
        });
    });
});
