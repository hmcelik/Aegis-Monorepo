# Bot Commands Documentation

This document provides comprehensive information about all available bot commands for the Telegram Moderator Bot.

## 📋 Command Overview

The bot supports three levels of commands based on user permissions:
- **Public Commands** - Available to all users
- **Administrator Commands** - Available to group administrators
- **Super Administrator Commands** - Available only to the bot owner

## 🔧 Command Registration

Commands are automatically registered based on user permissions:
- Public commands are always available
- Admin commands are registered for group administrators
- Super admin commands are registered only for the configured `ADMIN_USER_ID`

## 👥 Public Commands

These commands are available to all users in groups where the bot is present.

### `/help`
**Description**: Shows the command list and bot information

**Usage**: `/help`

**Behavior**:
- Sends a private message with available commands
- Command list varies based on user's admin status
- If user blocks private messages, shows an error in the group
- Automatically deletes the confirmation message after 3 seconds

**Example Response**:
```
Hello! Here is a list of commands available to you.

`<required>` brackets mean a value must be provided.
`[optional]` brackets mean a value is not required.

─────────────────────

👤 *Public Commands*
`/mystrikes`
_Check your own strike count privately._

`/help`
_Shows this help message._

─────────────────────
```

**For Administrators** (additional commands shown):
```
🛡️ *Administrator Commands*
`/status`
_Displays the bot's current settings._

`/checkstrikes <@user>`
_View a user's strike history._

... (more admin commands)
```

### `/mystrikes`
**Description**: Check your own strike count privately

**Usage**: `/mystrikes`

**Behavior**:
- Shows your current strikes in a private message
- Displays recent strike history with timestamps
- Works across all groups where you're a member
- If you're only in one group, shows strikes directly
- If you're in multiple groups, shows a selection menu

**Example Response**:
```
⚖️ *Your Strike Report*
*Group:* My Test Group
*Current Strikes:* 2

*Recent History:*
(Showing last 3 actions)

─────────────────────
🔥 *Action:* AUTO-STRIKE
📅 *Date:* 30/07/2025, 14:30:00
💬 *Reason:* "This is spam content"

─────────────────────
🛡️ *Action:* Added 1 strike(s)
👮 *Admin:* John Admin
📅 *Date:* 29/07/2025, 10:15:00
💬 *Reason:* "Manual violation"
```

## 🛡️ Administrator Commands

These commands are available only to group administrators and work within the group context.

### `/register`
**Description**: Register the bot in a new group

**Usage**: `/register`

**Behavior**:
- Registers the current group with the bot
- Allows administrators to manage bot settings
- Can only be used once per group
- Automatically deletes the command message
- Shows success message with group name

**Response**:
```
✅ This group, "My Group Name", has been successfully registered. 
Admins can now manage me via a private message.
```

### `/status`
**Description**: Display current bot settings for the group

**Usage**: `/status`

**Behavior**:
- Shows comprehensive bot configuration
- Displays penalty levels, AI settings, and statistics
- Message remains permanently in the group
- Provides complete overview of current settings

**Example Response**:
```
📊 Bot Status & Configuration for My Group

⚖️ Penalty Levels (0 = disabled)
- Alert on Strike: 3
- Mute on Strike: 5
- Kick on Strike: 8
- Ban on Strike: 10

🧠 AI & Content
- Spam Threshold: 0.7
- Profanity Filter: ON
- Profanity Threshold: 0.8
- Keyword Bypass Mode: OFF

⚙️ Other Settings
- Mute Duration: 60 minutes
- Whitelisted Keywords: admin, help, support
- Manual User Whitelist: 123456789

📈 Stats
- Deletions Today: 15
```

### `/checkstrikes <@user>`
**Description**: View a user's strike history and current count

**Usage**: `/checkstrikes @username`

**Parameters**:
- `@user` (required) - Username or mention of the user to check

**Behavior**:
- Sends detailed strike report in private message
- Shows current strikes and recent history
- Includes both manual and automatic strikes
- Automatically deletes command and confirmation messages
- Displays timestamps and reasons for each action

**Example**:
```
/checkstrikes @johndoe
```

**Response** (sent privately):
```
⚖️ *Strike Report for John Doe*
*Group:* My Test Group
*Current Strikes:* 3

*Recent History:*
(Showing last 10 actions)

─────────────────────
🔥 *Action:* AUTO-STRIKE
📅 *Date:* 30/07/2025, 14:30:00
💬 *Reason:* "Promotional spam detected"

─────────────────────
🛡️ *Action:* Added 2 strike(s)
👮 *Admin:* Admin Name
📅 *Date:* 29/07/2025, 10:15:00
💬 *Reason:* "Repeated rule violations"
```

### `/addstrike <@user> <amount> [reason...]`
**Description**: Add strikes to a user

**Usage**: `/addstrike @username 2 Spam posting`

**Parameters**:
- `@user` (required) - Username or mention of the user
- `<amount>` (required) - Number of strikes to add (positive integer)
- `[reason...]` (optional) - Reason for adding strikes

**Behavior**:
- Adds specified strikes to user's count
- Records action in audit log with admin info
- Shows before and after strike count
- Automatically deletes the command message
- Triggers penalty actions if thresholds are reached

**Examples**:
```
/addstrike @johndoe 1 Inappropriate language
/addstrike @spammer 3 Multiple spam messages
/addstrike @user 2
```

**Response**:
```
Strikes for @johndoe changed from 2 -> 4 (+2).
```

### `/removestrike <@user> [amount] [reason...]`
**Description**: Remove strikes from a user

**Usage**: `/removestrike @username 1 Appeal approved`

**Parameters**:
- `@user` (required) - Username or mention of the user
- `[amount]` (optional) - Number of strikes to remove (defaults to 1)
- `[reason...]` (optional) - Reason for removing strikes

**Behavior**:
- Removes specified strikes from user's count
- Cannot reduce strikes below 0
- Records action in audit log
- Shows before and after strike count
- Automatically deletes the command message

**Examples**:
```
/removestrike @johndoe         # Removes 1 strike
/removestrike @user 2 Mistake corrected
/removestrike @member 3
```

**Response**:
```
Strikes for @johndoe changed from 4 -> 2 (-2).
```

### `/setstrike <@user> <amount> [reason...]`
**Description**: Set a user's strike count to a specific number

**Usage**: `/setstrike @username 5 Resetting after review`

**Parameters**:
- `@user` (required) - Username or mention of the user
- `<amount>` (required) - Exact number of strikes to set (0 or positive)
- `[reason...]` (optional) - Reason for setting strikes

**Behavior**:
- Sets user's strikes to exact amount specified
- Can be used to reset strikes to 0
- Records action in audit log
- Shows before and after strike count
- Automatically deletes the command message

**Examples**:
```
/setstrike @johndoe 0 Clean slate
/setstrike @user 5 After review
/setstrike @member 3
```

**Response**:
```
Strikes for @johndoe set from 7 -> 0.
```

### `/auditlog`
**Description**: View recent moderation actions

**Usage**: `/auditlog`

**Behavior**:
- Generates audit log for the group
- Sends log as a text file in private message
- Shows last 100 actions by default
- Includes both manual and automatic actions
- Automatically deletes command and confirmation messages
- File includes timestamps, users, actions, and reasons

**Response**:
```
I've sent the group audit log to you privately as a file.
```

**Audit Log Format**:
```
Audit Log for My Test Group
Showing the last 15 actions

----------------------------------------
User: John Doe (123456789)
Date: Wed, 30 Jul 2025 14:30:00 GMT
Action: AUTO-STRIKE (Score: 0.85)
Reason: "Check out this amazing deal!"

----------------------------------------
User: Jane Smith (987654321)  
Date: Wed, 30 Jul 2025 10:15:00 GMT
Action: Added 2 strike(s)
Admin: Admin Name
Reason: "Repeated spam posting"
```

## 👑 Super Administrator Commands

These commands are available only to the configured bot owner (set via `ADMIN_USER_ID`) and provide global bot management capabilities.

**Note**: Super admin commands work in both private chats and groups, and are automatically registered when `ADMIN_USER_ID` is configured.

### `/globalstats`
**Description**: View global bot statistics across all groups

**Usage**: `/globalstats`

**Behavior**:
- Shows comprehensive global statistics
- Displays total groups, users, and strikes
- Lists top 5 most active groups
- Provides overview of bot usage
- Works in both private and group chats

**Response**:
```
🌍 **Global Bot Statistics**

📊 **Overview**
• Total Groups: `25`
• Total Users: `1,847`
• Total Active Strikes: `156`
• Deletions Today: `43`

🏆 **Top 5 Most Active Groups**
1. Gaming Community - `15` deletions
2. Tech Discussions - `12` deletions  
3. General Chat - `8` deletions
4. Study Group - `5` deletions
5. News Channel - `3` deletions
```

### `/maintenance <on|off>`
**Description**: Toggle maintenance mode for the entire bot

**Usage**: 
```
/maintenance on
/maintenance off
/maintenance status
```

**Parameters**:
- `on` - Enable maintenance mode
- `off` - Disable maintenance mode
- `status` - Check current maintenance status

**Behavior**:
- Enables/disables maintenance mode globally
- In maintenance mode, bot responds with maintenance messages
- Useful for updates or troubleshooting
- Status command shows current state

**Responses**:
```
/maintenance on
🔧 **Maintenance mode enabled.** Bot will respond with maintenance messages.

/maintenance off  
✅ **Maintenance mode disabled.** Bot is operating normally.

/maintenance status
🔧 **Maintenance Status:** ENABLED

Usage: `/maintenance on|off`
```

### `/broadcast <message>`
**Description**: Send a message to all registered groups

**Usage**: `/broadcast System update scheduled for tonight at 2 AM`

**Parameters**:
- `<message>` (required) - Message to broadcast to all groups

**Behavior**:
- Sends message to all registered groups
- Shows success/failure count
- Includes small delay between messages to avoid rate limits
- Messages are clearly marked as system announcements
- Failed sends are logged

**Example**:
```
/broadcast The bot will be updated tonight. Expect brief downtime.
```

**Response**:
```
📊 **Broadcast Complete**
✅ Sent to: 23 groups
❌ Failed: 2 groups
```

**Broadcasted Message Format**:
```
📢 **System Announcement**

The bot will be updated tonight. Expect brief downtime.

_This message was sent by the bot administrator._
```

### `/forceupdate`
**Description**: Force refresh bot configurations

**Usage**: `/forceupdate`

**Behavior**:
- Triggers configuration refresh
- Useful after making system changes
- Simulates restart without downtime
- Logs the update action
- Shows progress and completion

**Response**:
```
🔄 **Force Update Initiated**

Bot configurations are being refreshed...

(2 seconds later)

✅ **Update Complete**
Bot configurations have been refreshed.
```

### `/clearcache`
**Description**: Clear all cached data

**Usage**: `/clearcache`

**Behavior**:
- Clears various system caches
- Useful for troubleshooting
- Forces fresh data loading
- Shows what was cleared
- Logs the cache clearing action

**Response**:
```
🧹 **Cache Clearing Initiated**

Clearing all cached data...

(1.5 seconds later)

✅ **Cache Clear Complete**

• Configuration cache cleared
• Admin cache cleared  
• Settings cache cleared
```

## ⚙️ Settings Management

### Private Chat Settings
When using `/settings` in a private chat with the bot:

1. **Single Group**: Direct access to settings menu
2. **Multiple Groups**: Group selection menu appears
3. **No Admin Groups**: Error message shown

### Settings Categories
Through the interactive menu system, administrators can configure:

- **🎯 Penalty Thresholds**: Alert, mute, kick, and ban levels
- **🧠 AI Detection**: Spam and profanity sensitivity 
- **📝 Keyword Management**: Whitelist configuration
- **👥 User Management**: Moderator permissions
- **📊 Statistics**: Group analytics and reports

## 🔍 User Lookup

The bot maintains a database of users who have sent messages, enabling:
- **Username lookup**: Find users by @username
- **User tracking**: Monitor activity across groups
- **Strike management**: Apply penalties to specific users

**Note**: Users must have sent at least one message for the bot to find them.

## 🚨 Error Handling

### Command Errors
When commands are used incorrectly:
1. Error message is sent to the group
2. Original command is deleted after 5 seconds
3. Error message is deleted after 5 seconds
4. Prevents chat clutter

### User Not Found
```
User @username not found. They may need to send a message so I can see them.
```

### Permission Denied
```
You don't have permission to use this command.
```

### Invalid Usage
```
Invalid usage. Use `/addstrike @user <amount> [reason]`. Use `/help` for details.
```

## 📝 Command Examples

### Typical Admin Workflow
```bash
# Check current group status
/status

# Check a problematic user
/checkstrikes @spammer

# Add strikes for violation
/addstrike @spammer 2 Promotional content

# Review recent activity
/auditlog

# Help a user who was warned incorrectly
/removestrike @gooduser 1 False positive
```

### Super Admin Workflow  
```bash
# Check global activity
/globalstats

# Send important announcement
/broadcast Bot will be updated in 1 hour

# Enable maintenance for update
/maintenance on

# After update
/maintenance off
/forceupdate
```

## 🔐 Security Features

### Command Validation
- **Parameter checking**: Required parameters validated
- **User existence**: Verifies users exist in database
- **Permission checks**: Ensures proper authorization
- **Rate limiting**: Prevents command spam

### Audit Trail
- **Complete logging**: All manual actions recorded
- **Admin attribution**: Who performed each action
- **Timestamp tracking**: When actions occurred
- **Reason storage**: Why actions were taken

### Message Cleanup
- **Auto-deletion**: Commands removed from chat
- **Temporary messages**: Error messages auto-delete
- **Privacy protection**: Sensitive data sent privately

## 🚀 Best Practices

### For Group Administrators
1. **Use `/status`** regularly to monitor settings
2. **Check `/auditlog`** to review bot actions
3. **Provide reasons** when manually adding/removing strikes
4. **Use `/mystrikes`** to help users understand their status
5. **Configure penalty levels** appropriate for your group

### For Super Administrators
1. **Monitor `/globalstats`** for usage patterns
2. **Use `/maintenance`** before major updates
3. **Test `/broadcast`** with small messages first
4. **Keep `/clearcache`** for troubleshooting
5. **Document major changes** when using admin commands

## 🆘 Troubleshooting

### Common Issues

**Commands not working**:
- Ensure bot is registered in the group (`/register`)
- Check if you have administrator permissions
- Verify super admin user ID is configured correctly

**User not found errors**:
- User must send at least one message in the group
- Check username spelling and @ symbol
- Try with user ID instead of username

**Private message failures**:
- User must start a conversation with the bot first
- Bot cannot initiate conversations
- User may have blocked the bot

**Permission denied**:
- Verify group administrator status
- Check if bot has necessary permissions in group
- Ensure super admin ID is set correctly

### Getting Help

If you encounter issues with bot commands:
1. Check this documentation
2. Verify your permissions
3. Try the `/help` command for quick reference
4. Review the main README.md for setup instructions
5. Check the API documentation for technical details

---

**Note**: This documentation covers all available bot commands. For API integration and web dashboard features, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).
