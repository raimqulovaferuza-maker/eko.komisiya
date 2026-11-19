import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, getClientIp } from './ddosGuard.js';

test('createRateLimiter allows requests within window and blocks bursts above maxRequests', () => {
  const limiter = createRateLimiter({
    windowMs: 10_000,
    maxRequests: 3,
    blockDurationMs: 5_000,
  });

  const t0 = 1_000_000;
  assert.equal(limiter.checkIp('10.0.0.1', t0).allowed, true);
  assert.equal(limiter.checkIp('10.0.0.1', t0 + 100).allowed, true);
  assert.equal(limiter.checkIp('10.0.0.1', t0 + 200).allowed, true);

  // 4th request exceeds maxRequests -> blocked
  const blocked = limiter.checkIp('10.0.0.1', t0 + 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 5);

  // Different IP remains unaffected
  assert.equal(limiter.checkIp('10.0.0.2', t0 + 300).allowed, true);

  // After block duration & window expire, IP is allowed again
  assert.equal(limiter.checkIp('10.0.0.1', t0 + 11_000).allowed, true);
});

test('getClientIp extracts first IP from x-forwarded-for or falls back to req.ip', () => {
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, ip: '127.0.0.1' }),
    '203.0.113.5'
  );
  assert.equal(getClientIp({ headers: {}, ip: '127.0.0.1' }), '127.0.0.1');
});
