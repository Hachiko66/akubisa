const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: parseInt(process.env.EMAIL_PORT || '465') === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to, subject, html
    });
    console.log(`📧 Email terkirim ke ${to}`);
    return true;
  } catch(e) {
    console.error('Email error:', e.message);
    return false;
  }
};

const emailTemplates = {
  verification: (name, token) => ({
    subject: 'Verifikasi Email AkuBisa',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
        <h2 style="color:#e8521a">AkuBisa</h2>
        <h3>Halo ${name}! 👋</h3>
        <p>Terima kasih sudah mendaftar. Klik tombol di bawah untuk verifikasi emailmu:</p>
        <a href="${process.env.APP_URL}/api/auth/verify-email/${token}"
           style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;margin:1rem 0">
          Verifikasi Email
        </a>
        <p style="color:#888;font-size:.85rem">Link berlaku 24 jam. Abaikan jika tidak merasa mendaftar.</p>
      </div>`
  }),

  resetPassword: (name, token) => ({
    subject: 'Reset Password AkuBisa',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
        <h2 style="color:#e8521a">AkuBisa</h2>
        <h3>Reset Password</h3>
        <p>Halo ${name}, kamu meminta reset password. Klik tombol di bawah:</p>
        <a href="${process.env.APP_URL}/reset-password/${token}"
           style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;margin:1rem 0">
          Reset Password
        </a>
        <p style="color:#888;font-size:.85rem">Link berlaku 1 jam. Abaikan jika tidak meminta reset.</p>
      </div>`
  }),

  welcome: (name) => ({
    subject: 'Selamat Datang di AkuBisa! 🎉',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
        <h2 style="color:#e8521a">AkuBisa</h2>
        <h3>Selamat datang, ${name}! 🎉</h3>
        <p>Akunmu sudah aktif. Mulai posting kemampuanmu dan temukan klien pertamamu!</p>
        <a href="${process.env.APP_URL}"
           style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;margin:1rem 0">
          Mulai Sekarang
        </a>
      </div>`
  })
};

module.exports = { sendEmail, emailTemplates };
