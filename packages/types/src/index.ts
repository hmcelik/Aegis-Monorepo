// Basic types for the Telegram moderator system
export interface MessageJob {
  chatId: string;
  messageId: string;
  userId: string;
  text?: string;
  media?: {
    type: string;
    fileId: string;
    caption?: string;
  };
  timestamp: number;
}

export interface NormalizedContent {
  originalText: string;
  normalizedText: string;
  detectedLanguage?: string;
  urls: string[];
  mentions: string[];
  hashtags: string[];
}

export interface PolicyVerdict {
  verdict: 'allow' | 'block' | 'review';
  reason: string;
  confidence?: number; // 0-1 confidence score for AI/ML verdicts
  scores: Record<string, number>;
  rulesMatched: string[];
}

// Outbox pattern types
export interface OutboxEntry {
  id: string; // Format: chatId:messageId:actionType
  chatId: number;
  messageId: string;
  actionType: 'delete' | 'mute' | 'kick' | 'ban' | 'warn';
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  retryCount: number;
  lastError?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  telegramResponse?: unknown;
}

export interface ModerationAction {
  chatId: string;
  messageId: string;
  actionType: 'delete' | 'mute' | 'kick' | 'ban' | 'warn';
  duration?: number; // in seconds
  reason: string;
}

export * from './api';
export * from './telegram';
