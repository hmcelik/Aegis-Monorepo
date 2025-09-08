import { validationResult } from 'express-validator';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import ApiError from '../utils/apiError.js';

/**
 * GET /api/v1/groups/{groupId}/audit
 * Retrieve paginated audit log entries
 */
export const getAuditLog = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const {
      page = 1,
      limit = 50,
      userId = null,
      type = null, // 'AUTO', 'MANUAL-STRIKE-ADD', 'MANUAL-STRIKE-REMOVE', 'MANUAL-STRIKE-SET'
      startDate = null,
      endDate = null,
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit))); // Max 200 per page
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    let whereConditions = ['chatId = ?'];
    let queryParams = [groupId];

    if (userId) {
      whereConditions.push('userId = ?');
      queryParams.push(userId);
    }

    if (type) {
      if (type === 'AUTO') {
        whereConditions.push(
          '(JSON_EXTRACT(logData, "$.type") IS NULL OR JSON_EXTRACT(logData, "$.type") NOT LIKE "MANUAL%")'
        );
      } else {
        whereConditions.push('JSON_EXTRACT(logData, "$.type") = ?');
        queryParams.push(type);
      }
    }

    if (startDate) {
      whereConditions.push('timestamp >= ?');
      queryParams.push(new Date(startDate).toISOString());
    }

    if (endDate) {
      whereConditions.push('timestamp <= ?');
      queryParams.push(new Date(endDate).toISOString());
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`;
    const totalResult = await db.getDb().get(countQuery, queryParams);
    const total = totalResult?.total || 0;

    // Get paginated results
    const dataQuery = `
            SELECT * FROM audit_log 
            WHERE ${whereClause} 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `;
    const results = await db.getDb().all(dataQuery, [...queryParams, limitNum, offset]);

    // Parse and format the results
    const formattedResults = results.map(record => {
      try {
        const logData = JSON.parse(record.logData);
        return {
          id: record.id,
          timestamp: record.timestamp,
          chatId: record.chatId,
          userId: record.userId,
          type: logData.type || 'AUTO',
          action: getActionDescription(logData),
          details: {
            violationType: logData.violationType,
            reason: logData.reason || logData.messageExcerpt,
            amount: logData.amount,
            admin: logData.admin
              ? {
                  id: logData.admin.id,
                  firstName: logData.admin.first_name,
                  username: logData.admin.username,
                }
              : null,
            targetUser: logData.targetUser,
            classificationScore: logData.classificationScore,
            spamScore: logData.spamScore,
            profanityScore: logData.profanityScore,
            profanityType: logData.profanityType,
          },
        };
      } catch (parseError) {
        return {
          id: record.id,
          timestamp: record.timestamp,
          chatId: record.chatId,
          userId: record.userId,
          type: 'UNKNOWN',
          action: 'Failed to parse log data',
          details: { error: 'Parse error' },
        };
      }
    });

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      data: formattedResults,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: {
        userId,
        type,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/groups/{groupId}/audit/export
 * Generate and return a CSV file of the audit log
 */
export const exportAuditLog = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const {
      userId = null,
      type = null,
      startDate = null,
      endDate = null,
      format = 'csv',
    } = req.query;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      throw new ApiError(400, 'Format must be "csv" or "json"');
    }

    // Build query conditions (same as getAuditLog)
    let whereConditions = ['chatId = ?'];
    let queryParams = [groupId];

    if (userId) {
      whereConditions.push('userId = ?');
      queryParams.push(userId);
    }

    if (type) {
      if (type === 'AUTO') {
        whereConditions.push(
          '(JSON_EXTRACT(logData, "$.type") IS NULL OR JSON_EXTRACT(logData, "$.type") NOT LIKE "MANUAL%")'
        );
      } else {
        whereConditions.push('JSON_EXTRACT(logData, "$.type") = ?');
        queryParams.push(type);
      }
    }

    if (startDate) {
      whereConditions.push('timestamp >= ?');
      queryParams.push(new Date(startDate).toISOString());
    }

    if (endDate) {
      whereConditions.push('timestamp <= ?');
      queryParams.push(new Date(endDate).toISOString());
    }

    const whereClause = whereConditions.join(' AND ');

    // Get all results (with reasonable limit for export)
    const dataQuery = `
            SELECT * FROM audit_log 
            WHERE ${whereClause} 
            ORDER BY timestamp DESC 
            LIMIT 10000
        `;
    const results = await db.getDb().all(dataQuery, queryParams);

    if (format === 'json') {
      // Return JSON format
      const formattedResults = results.map(record => {
        try {
          const logData = JSON.parse(record.logData);
          return {
            id: record.id,
            timestamp: record.timestamp,
            chatId: record.chatId,
            userId: record.userId,
            type: logData.type || 'AUTO',
            action: getActionDescription(logData),
            violationType: logData.violationType,
            reason: logData.reason || logData.messageExcerpt,
            amount: logData.amount,
            adminId: logData.admin?.id,
            adminName: logData.admin?.first_name,
            adminUsername: logData.admin?.username,
            classificationScore: logData.classificationScore,
            spamScore: logData.spamScore,
            profanityScore: logData.profanityScore,
          };
        } catch (parseError) {
          return {
            id: record.id,
            timestamp: record.timestamp,
            chatId: record.chatId,
            userId: record.userId,
            type: 'UNKNOWN',
            action: 'Parse error',
            error: 'Failed to parse log data',
          };
        }
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit_log_${groupId}_${new Date().toISOString().split('T')[0]}.json"`
      );
      return res.json(formattedResults);
    }

    // Generate CSV
    const csvHeader = [
      'ID',
      'Timestamp',
      'Chat ID',
      'User ID',
      'Type',
      'Action',
      'Violation Type',
      'Reason',
      'Amount',
      'Admin ID',
      'Admin Name',
      'Admin Username',
      'Classification Score',
      'Spam Score',
      'Profanity Score',
    ].join(',');

    const csvRows = results.map(record => {
      try {
        const logData = JSON.parse(record.logData);
        return [
          record.id,
          record.timestamp,
          record.chatId,
          record.userId,
          escapeCSV(logData.type || 'AUTO'),
          escapeCSV(getActionDescription(logData)),
          escapeCSV(logData.violationType || ''),
          escapeCSV(logData.reason || logData.messageExcerpt || ''),
          logData.amount || '',
          logData.admin?.id || '',
          escapeCSV(logData.admin?.first_name || ''),
          escapeCSV(logData.admin?.username || ''),
          logData.classificationScore || '',
          logData.spamScore || '',
          logData.profanityScore || '',
        ].join(',');
      } catch (parseError) {
        return [
          record.id,
          record.timestamp,
          record.chatId,
          record.userId,
          'UNKNOWN',
          'Parse error',
          '',
          'Failed to parse log data',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ].join(',');
      }
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_log_${groupId}_${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to get action description from log data
 */
function getActionDescription(logData) {
  if (!logData.type || logData.type === 'AUTO') {
    return 'Auto-strike';
  }

  switch (logData.type) {
    case 'MANUAL-STRIKE-ADD':
      return `Added ${logData.amount || 1} strike(s)`;
    case 'MANUAL-STRIKE-REMOVE':
      return `Removed ${logData.amount || 1} strike(s)`;
    case 'MANUAL-STRIKE-SET':
      return `Set strikes to ${logData.amount || 0}`;
    default:
      return logData.type;
  }
}

/**
 * Helper function to escape CSV values
 */
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
