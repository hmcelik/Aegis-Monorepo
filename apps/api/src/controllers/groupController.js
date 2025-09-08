import { validationResult } from 'express-validator';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import { getGroupSettings, updateSetting } from '@telegram-moderator/shared/src/config/index.js';
import ApiError from '../utils/apiError.js';

export const listGroups = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userAdminGroups = await db.getUserAdminGroups(userId);
    res.status(200).json(userAdminGroups);
  } catch (error) {
    next(error);
  }
};

export const getSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const settings = await getGroupSettings(groupId);
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const { settings } = req.body;

    for (const key in settings) {
      await updateSetting(groupId, key, settings[key]);
    }

    const updatedSettings = await getGroupSettings(groupId);
    res.status(200).json({
      message: 'Settings updated successfully.',
      settings: updatedSettings,
    });
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const group = await db.getGroup(groupId);
    if (!group) {
      throw new ApiError(404, 'Group not found');
    }

    const deletionsToday = await db.getTotalDeletionsToday(groupId);
    const auditLog = await db.getAuditLog(groupId, 100);

    res.status(200).json({
      totalMessagesProcessed: auditLog.length,
      violationsDetected: auditLog.length,
      actionsTaken: auditLog.length,
      deletionsToday,
    });
  } catch (error) {
    next(error);
  }
};
