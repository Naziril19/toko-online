const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// GET /products - Catalog Page
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const fromOffset = (page - 1) * limit;
    const toOffset = fromOffset + limit - 1;

    const { search, category, min_price, max_price, sort } = req.query;

    // 1. Fetch categories for filters sidebar
    const { data: categories, error: catError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (catError) throw catError;

    // 2. Build product query
    let query = supabaseAdmin
      .from('products')
      .select('*, categories(name)', { count: 'exact' });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq('category_id', category);
    }

    if (min_price) {
      query = query.gte('price', parseFloat(min_price));
    }

    if (max_price) {
      query = query.lte('price', parseFloat(max_price));
    }

    // Sorting
    if (sort === 'price_asc') {
      query = query.order('price', { ascending: true });
    } else if (sort === 'price_desc') {
      query = query.order('price', { ascending: false });
    } else if (sort === 'stock') {
      query = query.order('stock', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false }); // Newest
    }

    // Apply pagination range
    query = query.range(fromOffset, toOffset);

    const { data: products, count, error: prodError } = await query;
    if (prodError) throw prodError;

    const totalPages = Math.ceil((count || 0) / limit);

    res.render('products', {
      title: 'Katalog Produk',
      products,
      categories,
      count,
      currentPage: page,
      totalPages,
      query: req.query,
      searchVal: search || ''
    });
  } catch (err) {
    console.error('Error fetching catalog products:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat katalog produk.',
      error: err
    });
  }
});

// GET /products/:id - Product Detail Page
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch single product and its category info
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('*, categories(*)')
      .eq('id', id)
      .single();

    if (prodError || !product) {
      return res.status(404).render('error', {
        title: 'Produk Tidak Ditemukan',
        message: 'Produk yang Anda cari tidak tersedia.',
        error: { status: 404 }
      });
    }

    // 2. Fetch related products (same category, excluding current product)
    const { data: relatedProducts, error: relatedError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .limit(4);

    res.render('product-detail', {
      title: product.name,
      product,
      relatedProducts: relatedError ? [] : relatedProducts,
      searchVal: ''
    });
  } catch (err) {
    console.error('Error fetching product details:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat detail produk.',
      error: err
    });
  }
});

module.exports = router;
