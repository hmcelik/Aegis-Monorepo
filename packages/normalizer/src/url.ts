// URL normalization utilities

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Convert to lowercase
    urlObj.hostname = urlObj.hostname.toLowerCase();

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'gclid',
    ];
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    // Sort search parameters for consistency
    urlObj.searchParams.sort();

    return urlObj.toString();
  } catch {
    return url; // Return original if invalid URL
  }
}

export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

export function getETLDPlusOne(hostname: string): string {
  // Simple implementation - in production, use a proper TLD library
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}
