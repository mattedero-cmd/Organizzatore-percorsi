import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${salt}:${buf.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const storedBuf = Buffer.from(hashHex, 'hex');
  const derivedBuf = await scryptAsync(password, salt, 64);
  return storedBuf.length === derivedBuf.length && timingSafeEqual(storedBuf, derivedBuf);
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}
