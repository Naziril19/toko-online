const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// Require authentication for all order routes
router.use(requireAuth);

// GET /orders/checkout - Render Checkout Form Page
router.get('/checkout', async (req, res) => {
  try {
    // 1. Get user cart
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (cartError || !cart) {
      req.session.error_msg = 'Keranjang belanja Anda kosong.';
      return res.redirect('/cart');
    }

    // 2. Fetch cart items
    const { data: cartItems, error: itemsError } = await supabaseAdmin
      .from('cart_items')
      .select('*, products(*)')
      .eq('cart_id', cart.id);

    if (itemsError || !cartItems || cartItems.length === 0) {
      req.session.error_msg = 'Keranjang belanja Anda kosong.';
      return res.redirect('/cart');
    }

    // Calculate total price
    let totalPrice = 0;
    cartItems.forEach(item => {
      if (item.products) {
        totalPrice += item.products.price * item.quantity;
      }
    });

    res.render('checkout', {
      title: 'Checkout Pembayaran',
      cartItems,
      totalPrice,
      searchVal: ''
    });
  } catch (err) {
    console.error('Error during checkout rendering:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal membuka halaman checkout.',
      error: err
    });
  }
});

// POST /orders/checkout - Process Checkout Form Submissions
router.post('/checkout', async (req, res) => {
  const { shipping_name, shipping_phone, shipping_address, payment_method } = req.body;

  if (!shipping_name || !shipping_phone || !shipping_address || !payment_method) {
    req.session.error_msg = 'Harap isi semua data pengiriman dan pembayaran.';
    return res.redirect('/orders/checkout');
  }

  try {
    // 1. Get user cart
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (cartError || !cart) {
      req.session.error_msg = 'Keranjang belanja tidak ditemukan.';
      return res.redirect('/cart');
    }

    // 2. Fetch cart items and products
    const { data: cartItems, error: itemsError } = await supabaseAdmin
      .from('cart_items')
      .select('*, products(*)')
      .eq('cart_id', cart.id);

    if (itemsError || !cartItems || cartItems.length === 0) {
      req.session.error_msg = 'Keranjang belanja Anda kosong.';
      return res.redirect('/cart');
    }

    // 3. Double-check stock availability and calculate total price
    let totalPrice = 0;
    for (const item of cartItems) {
      if (!item.products) {
        req.session.error_msg = 'Terdapat produk yang tidak valid di keranjang Anda.';
        return res.redirect('/cart');
      }
      if (item.products.stock < item.quantity) {
        req.session.error_msg = `Stok produk "${item.products.name}" tidak mencukupi (Tersisa: ${item.products.stock}). Silakan perbarui keranjang Anda.`;
        return res.redirect('/cart');
      }
      totalPrice += item.products.price * item.quantity;
    }

    // 4. Create Order row
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: req.user.id,
        total_price: totalPrice,
        payment_method,
        status: 'Menunggu Pembayaran',
        shipping_name,
        shipping_phone,
        shipping_address
      })
      .select()
      .single();

    if (orderError || !order) {
      throw orderError || new Error('Gagal membuat order baru.');
    }

    // 5. Transfer items to order_items & update product stock
    for (const item of cartItems) {
      // Create order item
      const { error: oItemError } = await supabaseAdmin
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.products.price
        });

      if (oItemError) throw oItemError;

      // Subtract stock
      const newStock = item.products.stock - item.quantity;
      const { error: stockError } = await supabaseAdmin
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id);

      if (stockError) throw stockError;
    }

    // 6. Delete all cart items
    const { error: clearCartError } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id);

    if (clearCartError) throw clearCartError;

    req.session.success_msg = 'Pesanan berhasil dibuat! Silakan lakukan pembayaran.';
    res.redirect('/orders');
  } catch (err) {
    console.error('Error during checkout processing:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Terjadi kesalahan saat memproses checkout.',
      error: err
    });
  }
});

// GET /orders - User Order History Page
router.get('/', async (req, res) => {
  try {
    // Fetch orders for logged-in user
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    res.render('orders', {
      title: 'Riwayat Pesanan',
      orders: orders || [],
      searchVal: ''
    });
  } catch (err) {
    console.error('Error fetching order history:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat riwayat pesanan.',
      error: err
    });
  }
});

module.exports = router;
