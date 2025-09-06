import { describe, it, expect } from 'vitest';
import { normalize } from '../../packages/normalizer/src/index.js';
import { normalizeUrl, extractDomain, getETLDPlusOne } from '../../packages/normalizer/src/url.js';

describe('Text Normalizer (AEG-201)', () => {
  describe('normalize function', () => {
    it('should normalize basic text', () => {
      const result = normalize('Hello World!');
      
      expect(result.originalText).toBe('Hello World!');
      expect(result.normalizedText).toBe('hello world!');
      expect(result.urls).toEqual([]);
      expect(result.mentions).toEqual([]);
      expect(result.hashtags).toEqual([]);
    });

    it('should extract URLs', () => {
      const text = 'Check out https://example.com and http://test.org';
      const result = normalize(text);
      
      expect(result.urls).toEqual(['https://example.com', 'http://test.org']);
    });

    it('should extract mentions', () => {
      const text = 'Hello @john and @jane_doe!';
      const result = normalize(text);
      
      expect(result.mentions).toEqual(['john', 'jane_doe']);
    });

    it('should extract hashtags', () => {
      const text = 'Great day! #sunny #weekend #fun';
      const result = normalize(text);
      
      expect(result.hashtags).toEqual(['sunny', 'weekend', 'fun']);
    });

    it('should handle Unicode normalization', () => {
      const text = 'café résumé naïve'; // Contains accented characters
      const result = normalize(text);
      
      expect(result.normalizedText).toBe('café résumé naïve');
      expect(result.normalizedText.length).toBeGreaterThan(0);
    });

    it('should remove zero-width characters', () => {
      const text = 'hello\u200Bworld\u200C\u200D\uFEFF'; // Contains zero-width chars
      const result = normalize(text);
      
      expect(result.normalizedText).toBe('helloworld');
    });

    it('should collapse multiple whitespace', () => {
      const text = 'hello    world\n\n\nthere';
      const result = normalize(text);
      
      expect(result.normalizedText).toBe('hello world there');
    });
  });
});

describe('URL Normalizer (AEG-202)', () => {
  describe('normalizeUrl', () => {
    it('should normalize basic URLs', () => {
      const url = 'HTTPS://EXAMPLE.COM/Path?param=value';
      const result = normalizeUrl(url);
      
      expect(result).toBe('https://example.com/Path?param=value');
    });

    it('should remove tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=twitter&utm_medium=social&content=test';
      const result = normalizeUrl(url);
      
      expect(result).toBe('https://example.com/page?content=test');
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-url';
      const result = normalizeUrl(invalidUrl);
      
      expect(result).toBe(invalidUrl); // Should return original
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('www.example.com');
      expect(extractDomain('http://subdomain.example.org')).toBe('subdomain.example.org');
    });

    it('should handle invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBeNull();
    });
  });

  describe('getETLDPlusOne', () => {
    it('should extract effective TLD plus one', () => {
      expect(getETLDPlusOne('www.example.com')).toBe('example.com');
      expect(getETLDPlusOne('subdomain.test.example.org')).toBe('example.org');
    });

    it('should handle simple domains', () => {
      expect(getETLDPlusOne('localhost')).toBe('localhost');
      expect(getETLDPlusOne('example')).toBe('example');
    });
  });
});
