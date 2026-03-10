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
        <a href="${process.env.APP_URL || process.env.BASE_URL}/api/auth/verify-email/${token}"
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
        <a href="${process.env.APP_URL || process.env.BASE_URL}/#reset-password/${token}"
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
        <a href="${process.env.APP_URL || process.env.BASE_URL}"
           style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;margin:1rem 0">
          Mulai Sekarang
        </a>
      </div>`
  })
};



// ===== EMAIL NOTIFIKASI =====
const sendEmailNotif = async (userId, type, data, pool) => {
  if (!pool) { console.error('sendEmailNotif: pool required'); return; }
  try {
    const user = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [userId]);
    if (!user.rows.length) return;
    const { email, full_name } = user.rows[0];
    const template = emailNotifTemplates[type];
    if (!template) return;
    const { subject, html } = template(full_name, data);
    await sendEmail({ to: email, subject, html });
  } catch(e) {
    console.error('Email notif error:', e.message);
  }
};

const emailNotifTemplates = {
  new_message: (name, { senderName, preview }) => ({
    subject: `💬 Pesan baru dari ${senderName} — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p><strong>${senderName}</strong> mengirim pesan kepadamu:</p>
      <div style="background:#f5f5f5;border-left:4px solid #e8521a;padding:1rem;border-radius:0 8px 8px 0;margin:1rem 0;font-style:italic;color:#555">"${preview}"</div>
      <a href="${process.env.BASE_URL}/#messages" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Balas Pesan →</a>
    </div>`
  }),
  new_transaction: (name, { clientName, amount, description }) => ({
    subject: `💳 Transaksi baru masuk — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p><strong>${clientName}</strong> telah membayar DP untuk proyekmu!</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:1rem;margin:1rem 0">
        <div style="font-size:.9rem;color:#166534"><strong>Proyek:</strong> ${description}</div>
        <div style="font-size:1.2rem;font-weight:800;color:#e8521a;margin-top:.5rem">DP: ${amount}</div>
      </div>
      <a href="${process.env.BASE_URL}/#transactions" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Lihat Transaksi →</a>
    </div>`
  }),
  work_submitted: (name, { workerName, description }) => ({
    subject: `📦 Pekerjaan telah disubmit — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p><strong>${workerName}</strong> telah menyelesaikan dan submit pekerjaan:</p>
      <div style="background:#f5f5f5;border-radius:10px;padding:1rem;margin:1rem 0;color:#555">${description}</div>
      <p>Silakan cek dan setujui jika sesuai ekspektasi.</p>
      <a href="${process.env.BASE_URL}/#transactions" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Cek Pekerjaan →</a>
    </div>`
  }),
  transaction_completed: (name, { amount }) => ({
    subject: `✅ Transaksi selesai — Dana masuk ke dompetmu`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p>🎉 Transaksi telah selesai! Dana telah masuk ke dompetmu.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:1rem;margin:1rem 0;text-align:center">
        <div style="font-size:1.5rem;font-weight:800;color:#166534">${amount}</div>
        <div style="font-size:.85rem;color:#166534;margin-top:.3rem">Tersedia di dompetmu</div>
      </div>
      <a href="${process.env.BASE_URL}/#wallet" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Lihat Dompet →</a>
    </div>`
  }),
  kyc_approved: (name) => ({
    subject: `✅ Identitas kamu telah terverifikasi — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p>🎉 Selamat! Identitasmu telah berhasil diverifikasi. Badge <strong>Pengguna Terverifikasi</strong> kini tampil di profilmu.</p>
      <a href="${process.env.BASE_URL}/#profile" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Lihat Profilku →</a>
    </div>`
  }),
  kyc_rejected: (name, { note }) => ({
    subject: `❌ Verifikasi identitas ditolak — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p>Maaf, pengajuan verifikasi identitasmu ditolak.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:1rem;margin:1rem 0;color:#991b1b"><strong>Alasan:</strong> ${note}</div>
      <p>Silakan perbaiki dokumen dan ajukan ulang.</p>
      <a href="${process.env.BASE_URL}/#profile" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Ajukan Ulang →</a>
    </div>`
  }),
  new_job_application: (name, { applicantName, jobTitle }) => ({
    subject: `📝 Lamaran baru untuk "${jobTitle}" — AkuBisa`,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
      <h2 style="color:#e8521a">AkuBisa</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p><strong>${applicantName}</strong> melamar untuk kebutuhanmu:</p>
      <div style="background:#f5f5f5;border-radius:10px;padding:1rem;margin:1rem 0;font-weight:700;color:#333">${jobTitle}</div>
      <a href="${process.env.BASE_URL}/#job-requests" style="display:inline-block;background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:700">Lihat Lamaran →</a>
    </div>`
  }),
};

module.exports = { sendEmail, emailTemplates, sendEmailNotif };
