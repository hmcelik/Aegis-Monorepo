// __tests__/commandHandler.test.js

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleCommand } from 'apps/bot/src/handlers/commandHandler.js';

// Mock all dependencies
vi.mock('packages/shared/src/services/telegram.js', () => ({
  default: { on: vi.fn() },
  sendMessage: vi.fn().mockResolvedValue({ message_id: 'temp_msg_id' }),
  getChatAdmins: vi.fn(),
  deleteMessage: vi.fn(),
  getChatMember: vi.fn(),
}));

vi.mock('@telegram-moderator/shared/src/services/database.js', () => ({
  upsertUser: vi.fn(),
  findUserByUsernameInDb: vi.fn(),
  getStrikes: vi.fn(),
  getStrikeHistory: vi.fn(),
  addGroup: vi.fn(),
  getGroup: vi.fn(),
  getAuditLog: vi.fn(),
  addStrikes: vi.fn(),
  removeStrike: vi.fn(),
  setStrikes: vi.fn(),
  logManualAction: vi.fn(),
  getAllGroups: vi.fn(),
}));

vi.mock('@telegram-moderator/shared/src/config/index.js', () => ({
  getGroupSettings: vi.fn(),
}));

// Import mocks for easy reference
import * as telegram from 'packages/shared/src/services/telegram.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

describe('Command Handler', () => {
    // Mock Data
    const CHAT_ID = '-1001';
    const USER_ID = '12345';
    const ADMIN_ID = '99999';
    const TARGET_USER_ID = '54321';
    
    const mockUser = { id: USER_ID, first_name: 'RegularUser' };
    const mockAdmin = { id: ADMIN_ID, first_name: 'AdminUser' };
    const mockTargetUser = { userId: TARGET_USER_ID, firstName: 'TargetUser', username: 'targetuser' };
    const mockChat = { id: CHAT_ID, type: 'group', title: 'Test Group' };
    const mockPrivateChat = { id: USER_ID, type: 'private' };

    // Reset mocks before each test
    beforeEach(() => {
        vi.clearAllMocks();
        telegram.getChatAdmins.mockResolvedValue([ADMIN_ID]); // Default admin setup
    });
    
    describe('Group Commands', () => {
        // --- PUBLIC COMMANDS ---
        describe('/mystrikes', () => {
            test('should send a user their strike history privately', async () => {
                db.getStrikes.mockResolvedValue({ count: 2 });
                db.getStrikeHistory.mockResolvedValue([]);
                const msg = { from: mockUser, chat: mockChat, text: '/mystrikes', message_id: 1 };

                await handleCommand(msg);
                
                expect(telegram.deleteMessage).toHaveBeenCalledWith(CHAT_ID, 1);
                expect(telegram.sendMessage).toHaveBeenCalledWith(USER_ID, expect.stringContaining('Your Strike Report'), expect.any(Object));
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, `I've sent your strike report to you in a private message, ${mockUser.first_name}.`);
            });
        });

        // --- ADMIN COMMANDS ---
        describe('Permissions and Error Handling', () => {
             test('should block a non-admin from using an admin command', async () => {
                const msg = { from: mockUser, chat: mockChat, text: '/auditlog', message_id: 1 };
                await handleCommand(msg);
                // **FIX**: Expect the MarkdownV2 escaped version of the message.
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'You must be an admin to use this command\\.', expect.any(Object));
            });

             test('should show error if target user is not found', async () => {
                db.findUserByUsernameInDb.mockResolvedValue(null);
                const msg = { from: mockAdmin, chat: mockChat, text: '/checkstrikes @unknownuser', message_id: 1 };
                
                await handleCommand(msg);
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('User @unknownuser not found'), expect.any(Object));
            });

             test('should show error for invalid amount in /addstrike', async () => {
                const msg = { from: mockAdmin, chat: mockChat, text: '/addstrike @targetuser abc', message_id: 1 };
                db.findUserByUsernameInDb.mockResolvedValue(mockTargetUser);

                await handleCommand(msg);
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('Invalid usage'), expect.any(Object));
            });
        });

        describe('Strike Management Commands', () => {
             beforeEach(() => {
                db.findUserByUsernameInDb.mockResolvedValue(mockTargetUser);
                db.getStrikes.mockResolvedValue({ count: 3 });
            });

            test('/addstrike should add strikes and log the action', async () => {
                const msg = { from: mockAdmin, chat: mockChat, text: '/addstrike @targetuser 2 Manual strike', message_id: 1 };
                db.addStrikes.mockResolvedValue(5);

                await handleCommand(msg);
                expect(db.addStrikes).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, 2);
                expect(db.logManualAction).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, expect.objectContaining({ type: 'MANUAL-STRIKE-ADD', amount: 2 }));
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'Strikes for @targetuser changed from 3 -> 5 (+2).');
            });

            test('/removestrike should remove strikes and log the action', async () => {
                const msg = { from: mockAdmin, chat: mockChat, text: '/removestrike @targetuser 1', message_id: 1 };
                db.removeStrike.mockResolvedValue(2);

                await handleCommand(msg);
                expect(db.removeStrike).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, 1);
                expect(db.logManualAction).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, expect.objectContaining({ type: 'MANUAL-STRIKE-REMOVE', amount: 1 }));
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'Strikes for @targetuser changed from 3 -> 2 (-1).');
            });

            test('/setstrike should set strikes and log the action', async () => {
                const msg = { from: mockAdmin, chat: mockChat, text: '/setstrike @targetuser 0', message_id: 1 };
                
                await handleCommand(msg);
                expect(db.setStrikes).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, 0);
                expect(db.logManualAction).toHaveBeenCalledWith(CHAT_ID, TARGET_USER_ID, expect.objectContaining({ type: 'MANUAL-STRIKE-SET', amount: 0 }));
                expect(telegram.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'Strikes for @targetuser set from 3 -> 0.');
            });
        });
    });

    describe('Private Chat Commands', () => {
        test('/start should send a welcome message', async () => {
            const msg = { from: mockUser, chat: mockPrivateChat, text: '/start' };
            await handleCommand(msg);
            expect(telegram.sendMessage).toHaveBeenCalledWith(USER_ID, expect.stringContaining('Hello\\! I am the AI Moderator Bot'), expect.any(Object));
        });

        test('/mystrikes should trigger group selection for a user in multiple groups', async () => {
            db.getAllGroups.mockResolvedValue([{ chatId: '1' }, { chatId: '2' }]);
            telegram.getChatMember.mockResolvedValue({ status: 'member' }); // User is a member of the groups
            const msg = { from: mockUser, chat: mockPrivateChat, text: '/mystrikes' };

            await handleCommand(msg);
            expect(telegram.sendMessage).toHaveBeenCalledWith(USER_ID, 'Please choose a group for the /mystrikes command:', expect.any(Object));
        });

        test('/mystrikes should show report directly for a user in one group', async () => {
            db.getAllGroups.mockResolvedValue([{ chatId: CHAT_ID, chatTitle: 'Test Group' }]);
            telegram.getChatMember.mockResolvedValue({ status: 'member' });
            db.getStrikes.mockResolvedValue({ count: 1 });
            db.getStrikeHistory.mockResolvedValue([]);
            const msg = { from: mockUser, chat: mockPrivateChat, text: '/mystrikes' };

            await handleCommand(msg);
            expect(telegram.sendMessage).toHaveBeenCalledWith(USER_ID, expect.stringContaining('Your Strike Report'), expect.any(Object));
        });

        test('/settings should show an error for a user who is not an admin in any group', async () => {
            db.getAllGroups.mockResolvedValue([{ chatId: '1' }]);
            telegram.getChatAdmins.mockResolvedValue([]); // User is not an admin
            const msg = { from: mockUser, chat: mockPrivateChat, text: '/settings' };

            await handleCommand(msg);
            expect(telegram.sendMessage).toHaveBeenCalledWith(USER_ID, "I couldn't find any groups where you are an admin and I am present.");
        });
    });
});
