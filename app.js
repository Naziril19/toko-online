require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { loadUser } = require('./middleware/auth');
const { supabaseAdmin } = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup View Engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body Parser & Cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Folder
app.use(express.static(path.join(__dirname, 'public')));

// Configure Express Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'electrotech-session-key-random-12345',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 Hours
    secure: false, // Set to true if deploying over HTTPS
    httpOnly: true
  }
}));

// Load logged in user metadata automatically (if session exists)
app.use(loadUser);

// Global Template Variable Sync Middleware
app.use(async (req, res, next) => {
  // Sync Success & Error alerts from session flashes
  res.locals.success_msg = req.session.success_msg || null;
  res.locals.error_msg = req.session.error_msg || null;
  req.session.success_msg = null;
  req.session.error_msg = null;

  // Sync Cart Quantity
  res.locals.cartCount = 0;
  if (req.user) {
    try {
      const { data: cart } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (cart) {
        const { data: items } = await supabaseAdmin
          .from('cart_items')
          .select('quantity')
          .eq('cart_id', cart.id);

        if (items) {
          res.locals.cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
        }
      }
    } catch (err) {
      console.error('Error counting items globally for navbar:', err);
    }
  }

  next();
});

// Import Router Handlers
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

// Bind Root Route (Delegated to home page render)
app.get('/', async (req, res) => {
  try {
    // 1. Fetch latest products (e.g. recent 6 items)
    const { data: latestProducts } = await supabaseAdmin
      .from('products')
      .select('*, categories(name)')
      .order('created_at', { ascending: false })
      .limit(6);

    // 2. Fetch popular/bestseller products (e.g. stock <= 5 or ordered by price limit 3)
    const { data: bestSellerProducts } = await supabaseAdmin
      .from('products')
      .select('*, categories(name)')
      .order('price', { ascending: false })
      .limit(3);

    // 3. Fetch categories
    const { data: categories } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true })
      .limit(4);

    res.render('home', {
      title: 'Selamat Datang',
      latestProducts: latestProducts || [],
      bestSellerProducts: bestSellerProducts || [],
      categories: categories || [],
      searchVal: ''
    });
  } catch (err) {
    console.error('Home Page Render Error:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat halaman utama.',
      error: err
    });
  }
});

// Bind Sub-Routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);

// Catch 404 & Forward to Error Handler
app.use((req, res, next) => {
  res.status(404).render('error', {
    title: 'Halaman Tidak Ditemukan',
    message: 'Maaf, halaman yang Anda cari tidak tersedia atau telah dipindahkan.',
    error: { status: 404 }
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.render('error', {
    title: 'Kesalahan Internal Server',
    message: err.message || 'Terjadi kesalahan tidak terduga pada server.',
    error: err
  });
});

// Listen
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` ElectroTech E-Commerce Server Active!`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(`========================================`);
});
