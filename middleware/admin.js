// Middleware to restrict access to admin-only routes
function requireAdmin(req, res, next) {
  if (!req.user) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  if (req.user.role !== 'admin') {
    // Return a styled unauthorized error page or 403
    return res.status(403).render('error', {
      title: 'Akses Ditolak',
      message: 'Anda tidak memiliki hak akses untuk halaman ini. Hanya Admin yang diperbolehkan.',
      error: { status: 403 }
    });
  }

  next();
}

module.exports = {
  requireAdmin
};
