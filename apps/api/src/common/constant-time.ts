import { timingSafeEqual } from 'crypto';

export function constantTimeSecretEquals(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    // Compare fixed-size digests so length mismatches do not create an obvious
    // short-circuit timing signal at secret boundaries.
    const paddedA = Buffer.alloc(Math.max(a.length, b.length));
    const paddedB = Buffer.alloc(Math.max(a.length, b.length));
    a.copy(paddedA);
    b.copy(paddedB);
    timingSafeEqual(paddedA, paddedB);
    return false;
  }
  return timingSafeEqual(a, b);
}
