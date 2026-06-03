// Main client-side script for E-Commerce Store

document.addEventListener('DOMContentLoaded', () => {
  // Theme Management
  initTheme();

  // Initialize event listeners
  initCartListeners();
  initSearchSuggestion();
});

// 1. Theme (Dark / Light Mode)
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(currentTheme);

  themeToggle.addEventListener('click', () => {
    const activeTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
  });
}

function updateThemeIcon(theme) {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  
  const icon = themeToggle.querySelector('i');
  if (!icon) return;

  if (theme === 'dark') {
    icon.className = 'bi bi-sun-fill text-warning';
  } else {
    icon.className = 'bi bi-moon-fill text-primary';
  }
}

// 2. Loading Overlay
function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('active');
}

// 3. Custom Toast Notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container-custom');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container-custom';
    container.className = 'toast-container-custom';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `custom-toast ${type}`;
  
  const iconClass = type === 'success' ? 'bi bi-check-circle-fill text-success' : 'bi bi-exclamation-triangle-fill text-danger';
  
  toast.innerHTML = `
    <div class="d-flex align-items-center">
      <i class="${iconClass} me-3" style="font-size: 1.25rem;"></i>
      <span>${message}</span>
    </div>
    <button type="button" class="btn-close ms-3" style="font-size: 0.75rem;" onclick="this.parentElement.remove()"></button>
  `;

  container.appendChild(toast);

  // Trigger CSS transition
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto-remove toast after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 4. Cart Logic via API Fetch
function initCartListeners() {
  // Listen for "Add to Cart" forms/buttons
  const addToCartForms = document.querySelectorAll('.add-to-cart-form');
  addToCartForms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = form.dataset.productId;
      const qtyInput = form.querySelector('.qty-input');
      const quantity = qtyInput ? parseInt(qtyInput.value) : 1;

      await addToCart(productId, quantity);
    });
  });
}

async function addToCart(productId, quantity = 1) {
  showLoading();
  try {
    const response = await fetch('/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productId, quantity })
    });

    const data = await response.json();
    hideLoading();

    if (response.ok) {
      showToast(data.message || 'Produk ditambahkan ke keranjang!', 'success');
      // Update navbar cart badge count
      updateCartBadge(data.cartCount);
    } else {
      if (response.status === 401) {
        showToast('Silakan login terlebih dahulu untuk berbelanja.', 'error');
        setTimeout(() => {
          window.location.href = '/auth/login';
        }, 1500);
      } else {
        showToast(data.message || 'Gagal menambahkan produk.', 'error');
      }
    }
  } catch (err) {
    hideLoading();
    console.error('Error adding to cart:', err);
    showToast('Terjadi kesalahan koneksi.', 'error');
  }
}

function updateCartBadge(count) {
  const badges = document.querySelectorAll('.cart-badge');
  badges.forEach(badge => {
    badge.textContent = count;
    if (count > 0) {
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  });
}

// Update Cart Quantity directly in Cart Page
async function updateCartItem(productId, quantity) {
  if (quantity < 1) return;
  showLoading();
  try {
    const response = await fetch('/cart/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productId, quantity })
    });

    const data = await response.json();
    hideLoading();

    if (response.ok) {
      showToast('Keranjang berhasil diperbarui!', 'success');
      updateCartBadge(data.cartCount);
      // Reload page to re-calculate subtotals/totals easily
      window.location.reload();
    } else {
      showToast(data.message || 'Gagal memperbarui kuantitas.', 'error');
    }
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('Terjadi kesalahan.', 'error');
  }
}

// Delete Item from Cart Page
async function removeCartItem(productId) {
  Swal.fire({
    title: 'Hapus Item?',
    text: 'Apakah Anda yakin ingin menghapus produk ini dari keranjang belanja?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#2563EB',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  }).then(async (result) => {
    if (result.isConfirmed) {
      showLoading();
      try {
        const response = await fetch('/cart/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ productId })
        });

        const data = await response.json();
        hideLoading();

        if (response.ok) {
          showToast('Produk dihapus dari keranjang.', 'success');
          updateCartBadge(data.cartCount);
          window.location.reload();
        } else {
          showToast(data.message || 'Gagal menghapus produk.', 'error');
        }
      } catch (err) {
        hideLoading();
        console.error(err);
        showToast('Terjadi kesalahan.', 'error');
      }
    }
  });
}

// 5. Real-Time Search suggestions on Catalog
function initSearchSuggestion() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', debounce((e) => {
    const query = e.target.value.trim();
    if (query.length < 2) return;
    
    // Realtime search client-side filtering or redirects could go here
    // In this app, we perform real-time search redirects or simple filter refresh.
  }, 300));
}

// Helper Debounce Function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Admin deletion wrappers with SweetAlert
function confirmDelete(title, text, confirmCallback) {
  Swal.fire({
    title: title || 'Apakah Anda yakin?',
    text: text || 'Tindakan ini tidak dapat dibatalkan!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  }).then((result) => {
    if (result.isConfirmed) {
      confirmCallback();
    }
  });
}
