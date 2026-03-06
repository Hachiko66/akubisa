const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak. Admin only.' });
    req.user = decoded;
    next();
  } catch(e) {
    res.status(401).json({ message: 'Token tidak valid' });
  }
};
