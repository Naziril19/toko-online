const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// Apply requireAuth to all routes in this file
router.use(requireAuth);

// Helper function to get cart count
async function getCartCount(userId) {
  try {
    const { data: cart, error } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !cart) return 0;

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('cart_items')
      .select('quantity')
      .eq('cart_id', cart.id);

    if (itemsError || !items) return 0;

    return items.reduce((sum, item) => sum + item.quantity, 0);
  } catch (err) {
    console.error('Error counting cart items:', err);
    return 0;
  }
}

// GET /cart - View Cart Page
router.get('/', async (req, res) => {
  try {
    // 1. Get or create cart for user
    let { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (cartError) throw cartError;

    if (!cart) {
      // Create new cart
      const { data: newCart, error: createError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: req.user.id })
        .select()
        .single();
      
      if (createError) throw createError;
      cart = newCart;
    }

    // 2. Fetch cart items with product details
    const { data: cartItems, error: itemsError } = await supabaseAdmin
      .from('cart_items')
      .select('*, products(*)')
      .eq('cart_id', cart.id);

    if (itemsError) throw itemsError;

    // Calculate total price and count
    let totalPrice = 0;
    let totalItems = 0;
    
    cartItems.forEach(item => {
      if (item.products) {
        totalPrice += item.products.price * item.quantity;
        totalItems += item.quantity;
      }
    });

    res.render('cart', {
      title: 'Keranjang Belanja',
      cartItems,
      totalPrice,
      totalItems,
      searchVal: ''
    });
  } catch (err) {
    console.error('Error rendering cart:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat keranjang belanja.',
      error: err
    });
  }
});

// POST /cart/add - Add product to cart (API)
router.post('/add', async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity) || 1;

  if (!productId) {
    return res.status(400).json({ success: false, message: 'ID Produk diperlukan.' });
  }

  try {
    // 1. Fetch product to check stock
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    if (product.stock < qty) {
      return res.status(400).json({ success: false, message: `Stok tidak mencukupi. Tersisa ${product.stock} unit.` });
    }

    // 2. Get or create cart
    let { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (cartError) throw cartError;

    if (!cart) {
      const { data: newCart, error: createError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: req.user.id })
        .select()
        .single();
      if (createError) throw createError;
      cart = newCart;
    }

    // 3. Check if product already exists in cart_items
    const { data: existingItem, error: itemError } = await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (itemError) throw itemError;

    if (existingItem) {
      const newQty = existingItem.quantity + qty;
      if (product.stock < newQty) {
        return res.status(400).json({ success: false, message: `Gagal menambah jumlah. Total di keranjang (${newQty}) melebihi stok (${product.stock}).` });
      }

      const { error: updateError } = await supabaseAdmin
        .from('cart_items')
        .update({ quantity: newQty })
        .eq('id', existingItem.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('cart_items')
        .insert({
          cart_id: cart.id,
          product_id: productId,
          quantity: qty
        });

      if (insertError) throw insertError;
    }

    const cartCount = await getCartCount(req.user.id);
    return res.status(200).json({ success: true, message: 'Produk ditambahkan ke keranjang!', cartCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan internal server.' });
  }
});

// POST /cart/update - Update quantity of cart item (API)
router.post('/update', async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity);

  if (!productId || isNaN(qty) || qty < 1) {
    return res.status(400).json({ success: false, message: 'Parameter tidak valid.' });
  }

  try {
    // Check product stock
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    if (product.stock < qty) {
      return res.status(400).json({ success: false, message: `Stok tidak mencukupi. Maksimal: ${product.stock}` });
    }

    // Get user's cart
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ success: false, message: 'Keranjang belanja tidak ditemukan.' });
    }

    // Update quantity
    const { error: updateError } = await supabaseAdmin
      .from('cart_items')
      .update({ quantity: qty })
      .eq('cart_id', cart.id)
      .eq('product_id', productId);

    if (updateError) throw updateError;

    const cartCount = await getCartCount(req.user.id);
    return res.status(200).json({ success: true, message: 'Jumlah berhasil diperbarui.', cartCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui kuantitas.' });
  }
});

// POST /cart/remove - Remove item from cart (API)
router.post('/remove', async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ success: false, message: 'ID Produk diperlukan.' });
  }

  try {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ success: false, message: 'Keranjang tidak ditemukan.' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)
      .eq('product_id', productId);

    if (deleteError) throw deleteError;

    const cartCount = await getCartCount(req.user.id);
    return res.status(200).json({ success: true, message: 'Produk dihapus dari keranjang.', cartCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus produk.' });
  }
});

module.exports = router;
