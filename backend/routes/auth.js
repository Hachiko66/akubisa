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
