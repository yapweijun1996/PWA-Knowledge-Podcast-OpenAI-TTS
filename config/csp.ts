export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://api.openai.com blob:",
    "media-src 'self' blob: mediastream:",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
}
