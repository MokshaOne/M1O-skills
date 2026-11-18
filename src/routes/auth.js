import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import {
  signAccessToken, signRefreshToken,
  storeRefreshToken, validateRefreshToken,
  verifyRefreshToken,
} from '../lib/auth.js';

const router = Router();

/** POST /api/auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { rows } = await query(
    'SELECT id, email, name, role, password_hash, is_active FROM users WHERE email = $1',
    [email]
  );

  const user = rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = signRefreshToken(user);
  await storeRefreshToken(user.id, refreshToken, expiresAt);

  // Get user's sites
  const { rows: sites } = await query(
    user.role === 'super_admin'
      ? 'SELECT id, name, slug, domain FROM sites ORDER BY name'
      : `SELECT s.id, s.name, s.slug, s.domain
         FROM sites s JOIN site_users su ON su.site_id = s.id
         WHERE su.user_id = $1 ORDER BY s.name`,
    user.role === 'super_admin' ? [] : [user.id]
  );

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    sites,
    accessToken,
    refreshToken,
  });
});

/** POST /api/auth/refresh */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const valid = await validateRefreshToken(payload.sub, refreshToken);
  if (!valid) {
    return res.status(401).json({ error: 'Refresh token revoked or expired' });
  }

  const { rows } = await query(
    'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = true',
    [payload.sub]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'User not found' });
  }

  const user = rows[0];
  const newAccessToken = signAccessToken(user);
  const { token: newRefreshToken, expiresAt } = signRefreshToken(user);
  await storeRefreshToken(user.id, newRefreshToken, expiresAt);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

export default router;
