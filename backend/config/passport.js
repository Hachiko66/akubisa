const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');
const jwt = require('jsonwebtoken');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://akubisa.co/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName;
    const avatar_url = profile.photos?.[0]?.value;

    if (!email) return done(null, false, { message: 'Email tidak ditemukan dari Google' });

    // Cek apakah user sudah ada
    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      // Buat user baru
      const newUser = await pool.query(
        `INSERT INTO users (full_name, email, password, email_verified, role, google_id)
         VALUES ($1, $2, $3, true, 'client', $4) RETURNING *`,
        [name, email, 'GOOGLE_AUTH', profile.id]
      );
      user = newUser;
    } else {
      // Update google_id jika belum ada
      await pool.query(
        'UPDATE users SET google_id=$1, email_verified=true WHERE email=$2',
        [profile.id, email]
      );
    }

    return done(null, user.rows[0]);
  } catch(e) {
    return done(e, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, user.rows[0]);
  } catch(e) { done(e, null); }
});

module.exports = passport;
