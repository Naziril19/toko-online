const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /auth/register
router.get('/register', (req, res) => {
  if (req.session.accessToken) {
    return res.redirect('/');
  }
  res.render('register', { title: 'Daftar Akun', error_msg: null });
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const { full_name, email, password, phone } = req.body;

  // Basic validation
  if (!full_name || !email || !password) {
    return res.render('register', { 
      title: 'Daftar Akun', 
      error_msg: 'Nama lengkap, email, dan password wajib diisi.' 
    });
  }

  try {
    // Register the user with Supabase Auth
    // Send full_name and phone in metadata so the DB trigger can sync it to public.users
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          phone,
          role: 'customer' // default role
        }
      }
    });

    if (error) {
      return res.render('register', { title: 'Daftar Akun', error_msg: error.message });
    }

    // Check if email confirmation is required
    if (data.session === null) {
      req.session.success_msg = 'Registrasi berhasil! Silakan cek email Anda untuk konfirmasi akun.';
    } else {
      req.session.success_msg = 'Registrasi berhasil! Silakan masuk.';
    }

    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.render('register', { title: 'Daftar Akun', error_msg: 'Terjadi kesalahan sistem saat mendaftar.' });
  }
});

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.accessToken) {
    return res.redirect('/');
  }
  
  // Extract flash messages if any
  const success_msg = req.session.success_msg || null;
  req.session.success_msg = null;

  res.render('login', { 
    title: 'Masuk Akun', 
    error_msg: null,
    success_msg: success_msg
  });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { 
      title: 'Masuk Akun', 
      error_msg: 'Email dan password wajib diisi.',
      success_msg: null
    });
  }

  try {
    // Authenticate user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.render('login', { 
        title: 'Masuk Akun', 
        error_msg: error.message,
        success_msg: null
      });
    }

    // Save tokens in session
    req.session.accessToken = data.session.access_token;
    req.session.success_msg = 'Selamat datang kembali!';

    // Redirect to requested page, or home
    const redirectUrl = req.session.redirectTo || '/';
    req.session.redirectTo = null;
    
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(err);
    res.render('login', { 
      title: 'Masuk Akun', 
      error_msg: 'Terjadi kesalahan sistem saat masuk.',
      success_msg: null
    });
  }
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out of Supabase:', error);
    }
  } catch (err) {
    console.error('Logout error:', err);
  }

  // Clear local express session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    // Redirect to home without session
    res.redirect('/');
  });
});

// GET /auth/forgot-password
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Lupa Password', error_msg: null, success_msg: null });
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.render('forgot-password', { 
      title: 'Lupa Password', 
      error_msg: 'Email wajib diisi.',
      success_msg: null
    });
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.protocol}://${req.get('host')}/auth/reset-password`
    });

    if (error) {
      return res.render('forgot-password', { 
        title: 'Lupa Password', 
        error_msg: error.message,
        success_msg: null
      });
    }

    res.render('forgot-password', { 
      title: 'Lupa Password', 
      error_msg: null,
      success_msg: 'Tautan reset password telah dikirim ke email Anda!' 
    });
  } catch (err) {
    console.error(err);
    res.render('forgot-password', { 
      title: 'Lupa Password', 
      error_msg: 'Terjadi kesalahan sistem.',
      success_msg: null
    });
  }
});

module.exports = router;
