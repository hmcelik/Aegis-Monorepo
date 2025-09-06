/**
 * @fileoverview Configures the Winston logging service for the application.
 * This setup provides structured, timestamped logging to the console and to files.
 */

import winston from 'winston';

interface LogMeta {
  error?: {
    code?: string;
    statusCode?: number;
    details?: unknown;
  };
  request?: {
    method: string;
    url: string;
    ip: string;
    userAgent?: string;
  };
  [key: string]: unknown;
}

// Custom format for cleaner error logging
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }: winston.Logform.TransformableInfo & { stack?: string }) => {
    // Clean formatting for different log levels
    const levelUpper = level.toUpperCase().padEnd(5);
    let output = `${timestamp} [${levelUpper}] ${message}`;
    
    const logMeta = meta as LogMeta;
    
    // Handle meta data more cleanly
    if (Object.keys(logMeta).length > 0) {
      // Special handling for error objects
      if (logMeta.error) {
        output += '\n  Error Details:';
        output += `\n    Code: ${logMeta.error.code || 'UNKNOWN'}`;
        output += `\n    Status: ${logMeta.error.statusCode || 'N/A'}`;
        if (logMeta.error.details) {
          output += `\n    Details: ${JSON.stringify(logMeta.error.details, null, 6)}`;
        }
      }
      
      // Handle request context
      if (logMeta.request) {
        output += '\n  Request:';
        output += `\n    ${logMeta.request.method} ${logMeta.request.url}`;
        output += `\n    IP: ${logMeta.request.ip}`;
        if (logMeta.request.userAgent) {
          output += `\n    User-Agent: ${logMeta.request.userAgent}`;
        }
      }
      
      // Show stack trace only in development and for errors
      if (level === 'error' && stack && process.env.NODE_ENV === 'development') {
        output += '\n  Stack Trace:';
        output += `\n${stack.split('\n').map(line => `    ${line}`).join('\n')}`;
      }
      
      // Handle other meta properties
      const otherMeta = { ...logMeta };
      delete otherMeta.error;
      delete otherMeta.request;
      delete (otherMeta as any).stack;
      
      if (Object.keys(otherMeta).length > 0) {
        output += `\n  Additional Info: ${JSON.stringify(otherMeta, null, 2)}`;
      }
    }
    
    return output;
  })
);

/**
 * The configured Winston logger instance.
 *
 * It logs messages to:
 * - The console with colorization.
 * - `error.log`: Only logs messages with a level of 'error'.
 * - `combined.log`: Logs all messages.
 */
export const logger = winston.createLogger({
  // The minimum level of messages to log.
  level: process.env.LOG_LEVEL || 'info',
  
  // Defines the format for log messages.
  format: customFormat,
  
  // Defines the transport mechanisms (where to send logs).
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      format: customFormat
    }),
    new winston.transports.File({ 
      filename: 'combined.log',
      format: customFormat
    }),
  ],
  
  // Don't exit on handled exceptions
  exitOnError: false
});

export default logger;
