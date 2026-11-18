import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function signRefreshToken(user) {
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const token = jwt.sign(
    { sub: user.id, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { token, expiresAt };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

export async function storeRefreshToken(userId, token, expiresAt) {
  const hash = await bcrypt.hash(token, 10);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );
}

export async function validateRefreshToken(userId, token) {
  const { rows } = await query(
    `SELECT id, token_hash FROM refresh_tokens
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY created_at DESC LIMIT 5`,
    [userId]
  );
  for (const row of rows) {
    if (await bcrypt.compare(token, row.token_hash)) {
      // Rotate: delete used token
      await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
      return true;
    }
  }
  return false;
}

export async function cleanExpiredTokens() {
  await query('DELETE FROM refresh_tokens WHERE expires_at < now()');
}
