const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

// Setup multer for product image upload (in memory buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Protect all routes under this file with Auth & Admin check
router.use(requireAuth);
router.use(requireAdmin);

// Helper function to upload file to Supabase Storage
async function uploadToSupabase(file) {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `products/${fileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from('e-commerce') // Bucket name
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) {
    // If bucket doesn't exist, log it and return null (we can fall back)
    console.error('Supabase storage upload error:', error.message);
    return null;
  }

  // Get public URL
  const { data: publicUrlData } = supabaseAdmin.storage
    .from('e-commerce')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Fetch counts
    const { count: prodCount } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true });
    const { count: userCount } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    const { count: orderCount } = await supabaseAdmin.from('orders').select('*', { count: 'exact', head: true });
    
    // Sum revenue
    const { data: revenueData, error: revError } = await supabaseAdmin
      .from('orders')
      .select('total_price')
      .neq('status', 'Menunggu Pembayaran'); // Sum completed & processing sales

    if (revError) throw revError;
    const totalRevenue = revenueData.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    // Fetch recent 5 orders for dashboard activity
    const { data: recentOrders } = await supabaseAdmin
      .from('orders')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(5);

    res.render('admin/dashboard', {
      title: 'Dashboard Admin',
      prodCount: prodCount || 0,
      userCount: userCount || 0,
      orderCount: orderCount || 0,
      totalRevenue,
      recentOrders: recentOrders || [],
      layout: 'admin-layout',
      searchVal: ''
    });
  } catch (err) {
    console.error('Admin Dashboard Error:', err);
    res.status(500).render('error', { title: 'Admin Error', message: 'Gagal memuat statistik dashboard.', error: err });
  }
});

// --- CATEGORIES MANAGEMENT ---

// GET /admin/categories - List categories
router.get('/categories', async (req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.render('admin/categories', {
      title: 'Manajemen Kategori',
      categories,
      searchVal: ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Admin Error', message: 'Gagal memuat kategori.', error: err });
  }
});

// POST /admin/categories/add
router.post('/categories/add', async (req, res) => {
  const { name, description } = req.body;
  try {
    const { error } = await supabaseAdmin
      .from('categories')
      .insert({ name, description });

    if (error) throw error;
    req.session.success_msg = 'Kategori berhasil ditambahkan!';
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal menambahkan kategori.';
    res.redirect('/admin/categories');
  }
});

// POST /admin/categories/edit/:id
router.post('/categories/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const { error } = await supabaseAdmin
      .from('categories')
      .update({ name, description })
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Kategori berhasil diperbarui!';
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal memperbarui kategori.';
    res.redirect('/admin/categories');
  }
});

// POST /admin/categories/delete/:id
router.post('/categories/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Kategori berhasil dihapus!';
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal menghapus kategori.';
    res.redirect('/admin/categories');
  }
});

// --- PRODUCTS MANAGEMENT ---

// GET /admin/products - List products
router.get('/products', async (req, res) => {
  try {
    const { data: products, error: prodError } = await supabaseAdmin
      .from('products')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });

    const { data: categories, error: catError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (prodError) throw prodError;
    if (catError) throw catError;

    res.render('admin/products', {
      title: 'Manajemen Produk',
      products,
      categories,
      searchVal: ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Admin Error', message: 'Gagal memuat data produk.', error: err });
  }
});

// POST /admin/products/add
router.post('/products/add', upload.single('image'), async (req, res) => {
  const { name, category_id, price, stock, description } = req.body;
  try {
    let image_url = '';
    
    // If file is uploaded, push to Supabase Storage
    if (req.file) {
      const uploadedUrl = await uploadToSupabase(req.file);
      if (uploadedUrl) {
        image_url = uploadedUrl;
      }
    }

    // Fallback Mock URL if upload fails or no image is selected
    if (!image_url) {
      image_url = 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=600';
    }

    const { error } = await supabaseAdmin
      .from('products')
      .insert({
        name,
        category_id: category_id || null,
        price: parseFloat(price) || 0,
        stock: parseInt(stock) || 0,
        description,
        image_url
      });

    if (error) throw error;
    req.session.success_msg = 'Produk berhasil ditambahkan!';
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal menambahkan produk: ' + err.message;
    res.redirect('/admin/products');
  }
});

// POST /admin/products/edit/:id
router.post('/products/edit/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, category_id, price, stock, description } = req.body;
  try {
    const updateFields = {
      name,
      category_id: category_id || null,
      price: parseFloat(price) || 0,
      stock: parseInt(stock) || 0,
      description
    };

    // If new file uploaded, update image
    if (req.file) {
      const uploadedUrl = await uploadToSupabase(req.file);
      if (uploadedUrl) {
        updateFields.image_url = uploadedUrl;
      }
    }

    const { error } = await supabaseAdmin
      .from('products')
      .update(updateFields)
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Produk berhasil diperbarui!';
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal memperbarui produk: ' + err.message;
    res.redirect('/admin/products');
  }
});

// POST /admin/products/delete/:id
router.post('/admin/products/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Produk berhasil dihapus!';
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal menghapus produk.';
    res.redirect('/admin/products');
  }
});

// --- ORDERS MANAGEMENT ---

// GET /admin/orders
router.get('/orders', async (req, res) => {
  try {
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.render('admin/orders', {
      title: 'Manajemen Pesanan',
      orders,
      searchVal: ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Admin Error', message: 'Gagal memuat pesanan.', error: err });
  }
});

// POST /admin/orders/status/:id
router.post('/orders/status/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Status pesanan berhasil diperbarui!';
    res.redirect('/admin/orders');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal memperbarui status pesanan.';
    res.redirect('/admin/orders');
  }
});

// --- USERS MANAGEMENT ---

// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.render('admin/users', {
      title: 'Manajemen Pengguna',
      users,
      searchVal: ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Admin Error', message: 'Gagal memuat data pengguna.', error: err });
  }
});

// POST /admin/users/role/:id
router.post('/users/role/:id', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    // Update role in public.users table
    const { error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('id', id);

    if (error) throw error;
    req.session.success_msg = 'Role pengguna berhasil diperbarui!';
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal memperbarui role pengguna.';
    res.redirect('/admin/users');
  }
});

// POST /admin/users/delete/:id
router.post('/users/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Delete from auth.users (cascades automatically to public.users via DB foreign key)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (error) throw error;
    req.session.success_msg = 'Pengguna berhasil dihapus!';
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Gagal menghapus pengguna: ' + err.message;
    res.redirect('/admin/users');
  }
});

module.exports = router;
