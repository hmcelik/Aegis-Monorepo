export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  filename?: string;
  maxFiles?: number;
  maxSize?: string;
}

export const loggingConfig: LoggingConfig = {
  level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
  format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'json',
  filename: process.env.LOG_FILENAME,
  maxFiles: process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES) : 5,
  maxSize: process.env.LOG_MAX_SIZE || '20m',
};
