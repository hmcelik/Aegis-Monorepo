import { config } from 'dotenv';

// Load environment variables
config();

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  path?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export const databaseConfig: DatabaseConfig = {
  type: (process.env.DB_TYPE as 'sqlite' | 'postgres') || 'sqlite',
  path: process.env.DB_PATH || './shared-moderator.db',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
