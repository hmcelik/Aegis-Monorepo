// Keyword matching utilities using Aho-Corasick-like algorithm

export interface KeywordMatch {
  keyword: string;
  start: number;
  end: number;
}

export class KeywordMatcher {
  private keywords: Set<string> = new Set();
  private patterns: RegExp[] = [];

  addKeyword(keyword: string): void {
    this.keywords.add(keyword); // Don't lowercase the keyword when storing
    this.rebuildPatterns();
  }

  addKeywords(keywords: string[]): void {
    keywords.forEach(keyword => this.keywords.add(keyword)); // Don't lowercase
    this.rebuildPatterns();
  }

  removeKeyword(keyword: string): void {
    this.keywords.delete(keyword); // Don't lowercase
    this.rebuildPatterns();
  }

  private rebuildPatterns(): void {
    this.patterns = Array.from(this.keywords).map(keyword => {
      // Escape special regex characters properly
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Check if keyword starts/ends with word characters to decide on word boundaries
      const startsWithWord = /^\w/.test(keyword);
      const endsWithWord = /\w$/.test(keyword);
      
      let pattern = escaped;
      if (startsWithWord) {
        pattern = `\\b${pattern}`;
      }
      if (endsWithWord) {
        pattern = `${pattern}\\b`;
      }
      
      return new RegExp(pattern, 'gi'); // Case insensitive
    });
  }

  findMatches(text: string): KeywordMatch[] {
    const matches: KeywordMatch[] = [];
    
    for (const pattern of this.patterns) {
      // Reset regex to avoid issues with global flag
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          keyword: match[0].toLowerCase(),
          start: match.index,
          end: match.index + match[0].length
        });
        // Prevent infinite loop for zero-length matches
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }

    return matches.sort((a, b) => a.start - b.start);
  }

  hasMatch(text: string): boolean {
    return this.patterns.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state
      return pattern.test(text);
    });
  }
}
