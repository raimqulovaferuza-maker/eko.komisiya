/**
 * Sliding-window DDoS & brute-force rate limiter + HTTP security headers.
 * Uses bounded in-memory tracking per client IP.
 */

export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 120,
  blockDurationMs = 60_000,
  message = "Juda ko'p so'rov yuborildi. Biroz kutib qayta urinib ko'ring.",
} = {}) {
  const buckets = new Map();
  let blockedTotal = 0;

  function cleanupExpired(now) {
    if (buckets.size < 2000) return;
    for (const [ip, entry] of buckets.entries()) {
      if (entry.blockedUntil <= now && now - entry.windowStart > windowMs) {
        buckets.delete(ip);
      }
    }
  }

  function checkIp(ip, now = Date.now()) {
    cleanupExpired(now);

    let entry = buckets.get(ip);
    if (!entry) {
      entry = { count: 0, windowStart: now, blockedUntil: 0 };
      buckets.set(ip, entry);
    }

    if (entry.blockedUntil > now) {
      blockedTotal += 1;
      const retryAfterSec = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    if (now - entry.windowStart >= windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      entry.blockedUntil = now + blockDurationMs;
      blockedTotal += 1;
      const retryAfterSec = Math.max(1, Math.ceil(blockDurationMs / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - entry.count),
      retryAfterSec: 0,
    };
  }

  function middleware(req, res, next) {
    const ip = getClientIp(req);
    const result = checkIp(ip);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: message,
        retryAfterSec: result.retryAfterSec,
      });
    }

    return next();
  }

  middleware.checkIp = checkIp;
  middleware.getStats = () => ({
    trackedIps: buckets.size,
    blockedTotal,
    maxRequests,
    windowMs,
  });
  middleware.reset = () => {
    buckets.clear();
    blockedTotal = 0;
  };

  return middleware;
}

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}
