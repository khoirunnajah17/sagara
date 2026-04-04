// home.js — Retail Catalog Homepage
let allProducts = [];
let activeCategory = 'all';

async function loadProducts() {
    try {
        const res = await fetch('/api/catalog');
        const data = await res.json();
        if (!data.success) return;
        allProducts = data.data;
        buildCategoryFilters();
        renderProducts();
    } catch (err) {
        console.error('Gagal memuat produk:', err);
    }
}

function buildCategoryFilters() {
    const cats = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    const container = document.getElementById('categoryFilters');
    container.innerHTML = cats.map(c =>
        `<button class="cat-filter-btn" data-cat="${c}">${c}</button>`
    ).join('');
    // bind clicks
    document.querySelectorAll('.cat-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.cat;
            renderProducts();
        });
    });
}

function renderProducts() {
    const search = (document.getElementById('heroSearch').value || '').toLowerCase();
    const sort = document.getElementById('sortSelect').value;

    let filtered = allProducts.filter(p => {
        const matchCat = activeCategory === 'all' || p.category === activeCategory;
        const matchSearch = !search ||
            p.name.toLowerCase().includes(search) ||
            p.code.toLowerCase().includes(search) ||
            (p.category || '').toLowerCase().includes(search);
        return matchCat && matchSearch;
    });

    // Sort
    filtered.sort((a, b) => {
        switch (sort) {
            case 'name_desc':   return b.name.localeCompare(a.name);
            case 'price_low':   return a.sell_price - b.sell_price;
            case 'price_high':  return b.sell_price - a.sell_price;
            default:            return a.name.localeCompare(b.name);
        }
    });

    const grid = document.getElementById('productGrid');
    const empty = document.getElementById('emptyState');
    document.getElementById('resultCount').textContent = `${filtered.length} produk ditemukan`;

    if (!filtered.length) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    grid.innerHTML = filtered.map(p => {
        const price = formatRupiah(p.sell_price);
        const stockBadge = p.stock > 10
            ? '<span class="stock-badge in-stock">Stok Tersedia</span>'
            : p.stock > 0
                ? `<span class="stock-badge low-stock">Sisa ${p.stock}</span>`
                : '<span class="stock-badge out-stock">Habis</span>';
        const categoryTag = p.category ? `<span class="product-category-tag">${p.category}</span>` : '';
        const initials = p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const colors = ['#1e88e5', '#43a047', '#fb8c00', '#e53935', '#8e24aa', '#00acc1', '#6d4c41'];
        const color = colors[p.id % colors.length];
        const thumbContent = p.image
            ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover">`
            : `<span class="product-initials">${initials}</span>`;
        const thumbStyle = p.image ? '' : `style="background:${color}"`;

        return `
        <div class="product-card ${p.stock === 0 ? 'out-of-stock' : ''}">
            <div class="product-thumb" ${thumbStyle}>
                ${thumbContent}
                ${categoryTag}
            </div>
            <div class="product-info">
                <div class="product-code">${p.code}</div>
                <h3 class="product-name">${p.name}</h3>
                <div class="product-meta">
                    ${stockBadge}
                    <span class="product-unit">${p.unit}</span>
                </div>
                <div class="product-price-row">
                    <div class="product-price">${price}</div>
                    ${p.stock > 0 ? `<button class="btn btn-primary btn-sm btn-cart" onclick="addToCart(${p.id})">🛒 Tambah</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function formatRupiah(num) {
    return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function applySearch() {
    renderProducts();
}

// Enter key search
document.getElementById('heroSearch').addEventListener('keyup', e => {
    if (e.key === 'Enter') applySearch();
    // live search on type
    renderProducts();
});

// ── Cart ────────────────────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('sagara_cart') || '[]');
let loggedInCustomer = null;

function saveCart() {
    localStorage.setItem('sagara_cart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('cartCount').textContent = count;
    document.getElementById('cartCount').style.display = count ? 'flex' : 'none';
}

function addToCart(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) {
        if (existing.qty >= product.stock) return;
        existing.qty++;
    } else {
        cart.push({ id: product.id, name: product.name, price: parseFloat(product.sell_price), qty: 1, stock: product.stock, image: product.image });
    }
    saveCart();
    renderCart();
    const fab = document.getElementById('cartFab');
    fab.classList.add('cart-fab-bounce');
    setTimeout(() => fab.classList.remove('cart-fab-bounce'), 400);
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    saveCart();
    renderCart();
}

function updateCartQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) { removeFromCart(productId); return; }
    if (item.qty > item.stock) item.qty = item.stock;
    saveCart();
    renderCart();
}

function toggleCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    const open = drawer.classList.toggle('open');
    overlay.classList.toggle('open', open);
    if (open) renderCart();
}

function renderCart() {
    const body = document.getElementById('cartBody');
    const footer = document.getElementById('cartFooter');
    if (!cart.length) {
        body.innerHTML = '<div class="catalog-empty" style="padding:30px 0"><div class="empty-icon">🛒</div><p>Keranjang kosong</p></div>';
        footer.style.display = 'none';
        updateCartBadge();
        return;
    }
    footer.style.display = 'block';
    body.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatRupiah(item.price)}</div>
        </div>
        <div class="cart-item-actions">
          <button class="btn btn-outline btn-sm" onclick="updateCartQty(${item.id},-1)">−</button>
          <span class="cart-item-qty">${item.qty}</span>
          <button class="btn btn-outline btn-sm" onclick="updateCartQty(${item.id},1)">+</button>
          <button class="btn btn-danger btn-sm" onclick="removeFromCart(${item.id})">✕</button>
        </div>
      </div>
    `).join('');
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    document.getElementById('cartTotal').textContent = formatRupiah(total);
    // Show/hide checkout vs login message
    const isCustomer = loggedInCustomer && loggedInCustomer.type === 'customer';
    document.getElementById('cartLoginMsg').style.display = isCustomer ? 'none' : 'block';
    document.getElementById('cartCheckoutForm').style.display = isCustomer ? 'block' : 'none';
    updateCartBadge();
}

async function submitOrder() {
    if (!loggedInCustomer) { window.location.href = '/index.html'; return; }
    if (loggedInCustomer.type === 'admin') { alert('Login sebagai pelanggan untuk melakukan pemesanan.'); return; }
    if (!cart.length) { alert('Keranjang kosong.'); return; }

    const notes = document.getElementById('custNotes').value.trim();
    const items = cart.map(i => ({ product_id: i.id, qty: i.qty, price: i.price }));
    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes, items })
        });
        const data = await res.json();
        if (!data.success) { alert(data.message); return; }
        alert(`Pesanan berhasil! No. Order: ${data.order_number}\nTotal: ${formatRupiah(data.total)}\n\nTerima kasih ${loggedInCustomer.name}!`);
        cart = [];
        saveCart();
        renderCart();
        toggleCart();
        document.getElementById('custNotes').value = '';
        loadProducts();
    } catch (err) {
        alert('Gagal mengirim pesanan. Coba lagi.');
    }
}

// ── Customer Auth ───────────────────────────────────────────
async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    loggedInCustomer = null;
    updateNavbar();
    renderCart();
}

function updateNavbar() {
    const isCustomer = loggedInCustomer && loggedInCustomer.type === 'customer';
    const isAdmin = loggedInCustomer && loggedInCustomer.type === 'admin';
    document.getElementById('navGuest').style.display = (!loggedInCustomer) ? 'flex' : 'none';
    document.getElementById('navCustomer').style.display = isCustomer ? 'flex' : 'none';
    document.getElementById('navAdmin').style.display = isAdmin ? 'flex' : 'none';
    if (isCustomer) document.getElementById('custNameDisplay').textContent = loggedInCustomer.name;
    if (isAdmin) document.getElementById('adminNameDisplay').textContent = loggedInCustomer.username;
}

async function checkSession() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            if (data.type === 'customer') {
                loggedInCustomer = { ...data.customer, type: 'customer' };
            } else {
                loggedInCustomer = { ...data.user, type: 'admin' };
            }
            updateNavbar();
        }
    } catch {}
}

// Init
checkSession();
updateCartBadge();
loadProducts();
