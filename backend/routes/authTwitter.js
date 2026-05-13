const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = 'https://akubisa.co/api/auth/twitter/callback';

// Generate code verifier & challenge untuk PKCE
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// Redirect ke Twitter OAuth
router.get('/twitter', (req, res) => {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');
  
  // Simpan verifier & state di session/cookie sementara
  res.cookie('tw_verifier', verifier, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.cookie('tw_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  res.redirect('https://twitter.com/i/oauth2/authorize?' + params.toString());
});

// Callback dari Twitter
router.get('/twitter/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.tw_state;
  const verifier = req.cookies?.tw_verifier;

  if (!code || state !== savedState) return res.redirect('/#login?error=twitter_failed');

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CALLBACK_URL,
        code_verifier: verifier
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/#login?error=twitter_token_failed');

    // Get user info
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name', {
      headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
    });
    const userData = await userRes.json();
    const twUser = userData.data;

    if (!twUser) return res.redirect('/#login?error=twitter_user_failed');

    // Cek atau buat user di DB
    let user = await pool.query('SELECT * FROM users WHERE twitter_id = $1', [twUser.id]);
    
    if (!user.rows.length) {
      // Buat user baru
      const refCode = crypto.createHash('md5').update(twUser.id + Date.now()).digest('hex').slice(0,8).toUpperCase();
      const newUser = await pool.query(
        `INSERT INTO users (full_name, email, password, email_verified, role, twitter_id, avatar, referral_code)
         VALUES ($1, $2, $3, true, 'client', $4, $5, $6) RETURNING *`,
        [twUser.name, `twitter_${twUser.id}@akubisa.co`, 'TWITTER_AUTH', twUser.id, twUser.profile_image_url?.replace('_normal','') || null, refCode]
      );
      user = newUser;
    }

    const u = user.rows[0];
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.clearCookie('tw_verifier');
    res.clearCookie('tw_state');

    res.redirect(`https://akubisa.co/#social-login?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: u.id, full_name: u.full_name, email: u.email, role: u.role, avatar: u.avatar, is_verified: u.is_verified
    }))}`);

  } catch(e) {
    console.error('Twitter auth error:', e);
    res.redirect('/#login?error=server_error');
  }
});

module.exports = router;
