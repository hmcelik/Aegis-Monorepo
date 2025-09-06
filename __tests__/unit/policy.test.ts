import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine, defaultRules } from '../../packages/policy/src/index.js';
import { KeywordMatcher } from '../../packages/policy/src/keywords.js';

describe('Policy Engine (AEG-204)', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
    // Add default rules for testing
    defaultRules.forEach(rule => engine.addRule(rule));
  });

  describe('PolicyEngine', () => {
    it('should allow messages with low risk', () => {
      const result = engine.evaluate('Hello, how are you today?');
      
      expect(result.verdict).toBe('allow');
      expect(result.scores).toEqual({});
      expect(result.rulesMatched).toEqual([]);
    });

    it('should block messages with high profanity score', () => {
      const result = engine.evaluate('This is spam and scam content');
      
      expect(result.verdict).toBe('block');
      expect(result.rulesMatched).toContain('Profanity Filter');
      expect(result.scores['profanity']).toBe(80);
    });

    it('should flag messages for review with medium risk', () => {
      const result = engine.evaluate('CHECK THIS OUT bit.ly/suspicious');
      
      expect(result.verdict).toBe('review');
      expect(result.rulesMatched).toContain('Suspicious URLs');
    });

    it('should detect excessive caps', () => {
      const result = engine.evaluate('HELLO EVERYONE THIS IS A VERY LONG CAPS MESSAGE');
      
      expect(result.verdict).toBe('allow'); // 30 points, below review threshold
      expect(result.rulesMatched).toContain('Excessive Caps');
      expect(result.scores['excessive_caps']).toBe(30);
    });

    it('should combine multiple rule scores', () => {
      const result = engine.evaluate('SPAM ALERT!!! CHECK bit.ly/fake-deal NOW!!!');
      
      expect(result.verdict).toBe('block'); // Should exceed 100 points
      expect(result.rulesMatched.length).toBeGreaterThan(1);
    });
  });

  describe('Rule management', () => {
    it('should allow adding custom rules', () => {
      engine.addRule({
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        weight: 50,
        matcher: (content) => content.normalizedText.includes('test')
      });

      const result = engine.evaluate('This is a test message');
      expect(result.rulesMatched).toContain('Test Rule');
      expect(result.scores['test-rule']).toBe(50);
    });

    it('should allow removing rules', () => {
      engine.removeRule('profanity');
      
      const result = engine.evaluate('This is spam content');
      expect(result.rulesMatched).not.toContain('Profanity Filter');
      expect(result.scores).not.toHaveProperty('profanity');
    });
  });
});

describe('Keyword Matcher (AEG-203)', () => {
  let matcher: KeywordMatcher;

  beforeEach(() => {
    matcher = new KeywordMatcher();
  });

  describe('Basic keyword matching', () => {
    it('should find exact keyword matches', () => {
      matcher.addKeyword('spam');
      
      const matches = matcher.findMatches('This is spam content');
      expect(matches).toHaveLength(1);
      expect(matches[0].keyword).toBe('spam');
      expect(matches[0].start).toBe(8);
      expect(matches[0].end).toBe(12);
    });

    it('should find multiple keywords', () => {
      matcher.addKeywords(['spam', 'scam', 'fake']);
      
      const matches = matcher.findMatches('This spam and scam content is fake');
      expect(matches).toHaveLength(3);
      expect(matches.map(m => m.keyword)).toEqual(['spam', 'scam', 'fake']);
    });

    it('should respect word boundaries', () => {
      matcher.addKeyword('spam');
      
      const matches = matcher.findMatches('spamming is not spam');
      expect(matches).toHaveLength(1); // Only the second 'spam' should match
      expect(matches[0].start).toBe(16); // Fixed: correct position is 16, not 15
    });

    it('should be case insensitive', () => {
      matcher.addKeyword('spam');
      
      expect(matcher.hasMatch('SPAM content')).toBe(true);
      expect(matcher.hasMatch('Spam content')).toBe(true);
      expect(matcher.hasMatch('spam content')).toBe(true);
    });
  });

  describe('Keyword management', () => {
    it('should allow adding and removing keywords', () => {
      matcher.addKeyword('test');
      expect(matcher.hasMatch('test message')).toBe(true);
      
      matcher.removeKeyword('test');
      expect(matcher.hasMatch('test message')).toBe(false);
    });

    it('should handle multiple keywords efficiently', () => {
      const keywords = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
      matcher.addKeywords(keywords);
      
      expect(matcher.hasMatch('keyword50 found')).toBe(true);
      expect(matcher.hasMatch('keyword999 not found')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      matcher.addKeyword('test');
      expect(matcher.findMatches('')).toEqual([]);
    });

    it('should handle special regex characters', () => {
      matcher.addKeyword('$pecial');
      expect(matcher.hasMatch('$pecial characters')).toBe(true);
    });

    it('should handle overlapping matches correctly', () => {
      matcher.addKeywords(['test', 'testing']);
      const matches = matcher.findMatches('testing phase');
      
      // Should find both 'test' and 'testing' or handle appropriately
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
