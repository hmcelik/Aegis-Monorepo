export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  apiUrl: string;
}

export const telegramConfig: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  apiUrl: process.env.TELEGRAM_API_URL || 'https://api.telegram.org',
};
