const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/authController');

router.post('/register',          c.register);
router.post('/login',             c.login);
router.get('/verify-email/:token',c.verifyEmail);
router.post('/forgot-password',   c.forgotPassword);
router.post('/reset-password/:token', c.resetPassword);
router.get('/me',                 auth, c.me);
router.patch('/switch-role',      auth, c.switchRole);

module.exports = router;

// ===== GOOGLE OAUTH =====
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/#login?error=google_failed', session: false }),
  async (req, res) => {
    try {
      const user = req.user;
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
      // Redirect ke frontend dengan token
      res.redirect(`https://akubisa.co/#social-login?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.id, full_name: user.full_name, email: user.email, role: user.role, avatar: user.avatar, is_verified: user.is_verified
      }))}`);
    } catch(e) {
      res.redirect('/#login?error=server_error');
    }
  }
);
