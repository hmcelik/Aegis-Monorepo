import { NormalizedContent } from '@telegram-moderator/types';

export function normalize(text: string): NormalizedContent {
  const originalText = text;

  // Basic normalization steps
  let normalizedText = text
    .normalize('NFKC') // Unicode normalization
    .toLowerCase()
    .trim();

  // Remove zero-width characters
  normalizedText = normalizedText.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Collapse multiple whitespace
  normalizedText = normalizedText.replace(/\s+/g, ' ');

  // Extract URLs (improved regex to catch more patterns)
  const urlRegex = /(https?:\/\/[^\s]+|(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  const urls = Array.from(text.matchAll(urlRegex)).map(match => match[0]);

  // Extract mentions
  const mentionRegex = /@(\w+)/g;
  const mentions = Array.from(text.matchAll(mentionRegex)).map(match => match[1]);

  // Extract hashtags
  const hashtagRegex = /#(\w+)/g;
  const hashtags = Array.from(text.matchAll(hashtagRegex)).map(match => match[1]);

  return {
    originalText,
    normalizedText,
    urls,
    mentions,
    hashtags,
  };
}

export * from './url';
