import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getLogs = async (req, res, next) => {
    try {
        const { level, limit = 100, offset = 0, from, to } = req.query;
        
        // Read the log file
        const logPath = path.join(__dirname, '../../../combined.log');
        
        try {
            const logContent = await fs.readFile(logPath, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            
            let logs = [];
            
            // Parse log entries
            for (const line of lines) {
                try {
                    const logEntry = JSON.parse(line);
                    
                    // Apply filters
                    if (level && logEntry.level !== level) continue;
                    if (from && new Date(logEntry.timestamp) < new Date(from)) continue;
                    if (to && new Date(logEntry.timestamp) > new Date(to)) continue;
                    
                    logs.push(logEntry);
                } catch (parseError) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
            
            // Sort by timestamp (newest first)
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Apply pagination
            const total = logs.length;
            const paginatedLogs = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
            
            res.json({
                success: true,
                data: {
                    logs: paginatedLogs,
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
        } catch (fileError) {
            res.json({
                success: true,
                data: {
                    logs: [],
                    total: 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    message: 'No log file found'
                }
            });
        }
    } catch (error) {
        next(error);
    }
};

export const downloadLogs = async (req, res, next) => {
    try {
        const { format = 'txt', level, from, to } = req.query;
        const logPath = path.join(__dirname, '../../../combined.log');
        
        try {
            const logContent = await fs.readFile(logPath, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            
            let logs = [];
            
            // Parse and filter log entries
            for (const line of lines) {
                try {
                    const logEntry = JSON.parse(line);
                    
                    if (level && logEntry.level !== level) continue;
                    if (from && new Date(logEntry.timestamp) < new Date(from)) continue;
                    if (to && new Date(logEntry.timestamp) > new Date(to)) continue;
                    
                    logs.push(logEntry);
                } catch (parseError) {
                    continue;
                }
            }
            
            // Sort by timestamp
            logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            if (format === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
                res.send(JSON.stringify(logs, null, 2));
            } else {
                // Text format
                const textLogs = logs.map(log => 
                    `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${log.meta ? ' ' + JSON.stringify(log.meta) : ''}`
                ).join('\n');
                
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', 'attachment; filename="logs.txt"');
                res.send(textLogs);
            }
        } catch (fileError) {
            res.status(404).json({
                success: false,
                message: 'Log file not found'
            });
        }
    } catch (error) {
        next(error);
    }
};

export const getLogStats = async (req, res, next) => {
    try {
        const { period = 'day' } = req.query;
        const logPath = path.join(__dirname, '../../../combined.log');
        
        try {
            const logContent = await fs.readFile(logPath, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            
            const stats = {
                byLevel: { error: 0, warn: 0, info: 0, debug: 0 },
                byTime: []
            };
            
            const timeGroups = new Map();
            
            for (const line of lines) {
                try {
                    const logEntry = JSON.parse(line);
                    
                    // Count by level
                    if (stats.byLevel.hasOwnProperty(logEntry.level)) {
                        stats.byLevel[logEntry.level]++;
                    }
                    
                    // Group by time period
                    const timestamp = new Date(logEntry.timestamp);
                    let timeKey;
                    
                    switch (period) {
                        case 'hour':
                            timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00`;
                            break;
                        case 'week':
                            const weekStart = new Date(timestamp);
                            weekStart.setDate(timestamp.getDate() - timestamp.getDay());
                            timeKey = weekStart.toISOString().split('T')[0];
                            break;
                        case 'month':
                            timeKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}`;
                            break;
                        default: // day
                            timeKey = timestamp.toISOString().split('T')[0];
                    }
                    
                    timeGroups.set(timeKey, (timeGroups.get(timeKey) || 0) + 1);
                } catch (parseError) {
                    continue;
                }
            }
            
            // Convert time groups to array
            stats.byTime = Array.from(timeGroups.entries())
                .map(([timestamp, count]) => ({ timestamp, count }))
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            
            res.json({
                success: true,
                data: stats
            });
        } catch (fileError) {
            res.json({
                success: true,
                data: {
                    byLevel: { error: 0, warn: 0, info: 0, debug: 0 },
                    byTime: [],
                    message: 'No log file found'
                }
            });
        }
    } catch (error) {
        next(error);
    }
};
