import axios from 'axios';
import config from '@telegram-moderator/shared/src/config/index.js';
import ApiError from '../utils/apiError.js';

// Construct the base Telegram API URL from your configuration
const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegram.token}`;

export const checkGroupAdmin = async (req, res, next) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        if (!groupId) {
            return next(new ApiError(400, 'Group ID is required.'));
        }

        // Make a direct API call to Telegram
        const response = await axios.post(`${TELEGRAM_API_URL}/getChatAdministrators`, {
            chat_id: groupId,
        });

        // The list of admins is in response.data.result
        const admins = response.data.result;
        if (!admins) {
            return next(new ApiError(403, 'Could not retrieve admins for this group.'));
        }

        // Extract just the user IDs from the admin list
        const adminIds = admins.map(admin => admin.user.id);

        if (adminIds.includes(userId)) {
            // User is an admin, proceed to the next handler
            return next();
        } else {
            // User is not an admin
            return next(new ApiError(403, 'Forbidden. You are not an administrator of this group.'));
        }
    } catch (error) {
        // This block catches errors from the axios request
        if (error.response && (error.response.status === 403 || error.response.status === 400)) {
            console.error('Telegram API error:', error.response.data?.description);
            return next(new ApiError(403, 'Forbidden. The bot may not be an administrator in the target group.'));
        }
        
        // For other errors (e.g., network issues, server errors)
        console.error('Failed to verify admin status:', error.message);
        next(new ApiError(500, 'Failed to verify admin status.'));
    }
};
