/* kasir.js – POS / Cashier Mode */
let products = [];
let cart = [];
let activeCategory = '';
let payType = 'CASH';
let customersList = [];

(async () => {
    const user = await requireLogin();
    if (!user) return;
    await Promise.all([loadProducts(), loadCustomers()]);
    renderCategories();
    renderProducts();
    startClock();

    document.getElementById('searchProduct').addEventListener('input', renderProducts);

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.key === 'F2') { e.preventDefault(); document.getElementById('searchProduct').focus(); }
        if (e.key === 'F4') { e.preventDefault(); document.getElementById('payAmount').focus(); }
        if (e.key === 'F8') { e.preventDefault(); processPayment(); }
        if (e.key === 'Escape') { closeReceipt(); }
    });

    // Load held transaction
    const held = localStorage.getItem('pos_held');
    if (held) {
        try {
            const data = JSON.parse(held);
            cart = data.cart || [];
            document.getElementById('customerName').value = data.customer || 'Pelanggan Umum';
            renderCart();
            localStorage.removeItem('pos_held');
            showToast('Transaksi ditahan berhasil dimuat.');
        } catch {}
    }
})();

async function loadProducts() {
    try {
        const { data } = await apiFetch('/api/inventory');
        products = data;
    } catch (e) { showToast('Gagal memuat produk: ' + e.message, 'error'); }
}

function renderCategories() {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    const el = document.getElementById('categories');
    el.innerHTML = `<button class="cat-btn active" onclick="setCategory('')">Semua</button>` +
        cats.map(c => `<button class="cat-btn" onclick="setCategory('${c.replace(/'/g,"\\'")}')">${c}</button>`).join('');
}

function setCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderProducts();
}
window.setCategory = setCategory;

function renderProducts() {
    const search = document.getElementById('searchProduct').value.toLowerCase().trim();
    let filtered = products;
    if (activeCategory) filtered = filtered.filter(p => p.category === activeCategory);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || p.code.toLowerCase().includes(search));

    const grid = document.getElementById('productGrid');
    grid.innerHTML = filtered.length ? filtered.map(p => {
        const stock = parseFloat(p.stock) || 0;
        const u = p.unit || 'kg';
        const su = p.sell_unit || 'pcs';
        const sc = parseFloat(p.sell_content) || 1;
        const oos = stock <= 0;
        const img = p.image ? `<img src="${p.image}" alt="">` : `<img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect fill='%230f3460' width='80' height='80'/><text x='40' y='45' text-anchor='middle' fill='%23555' font-size='28'>📦</text></svg>" alt="">`;
        return `
        <div class="product-card ${oos?'out-of-stock':''}" onclick="addToCart(${p.id})">
          ${img}
          <div class="p-name">${p.name}</div>
          <div class="p-price">${formatRupiah(p.sell_price)}/${su}</div>
          <div class="p-stock">${oos?'Habis':`Stok: ${formatNum(stock)} ${u}`}</div>
        </div>`;
    }).join('') : '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#555">Produk tidak ditemukan</div>';
}

function addToCart(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const existing = cart.find(c => c.product_id === productId);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            product_id: p.id,
            code: p.code,
            name: p.name,
            price: parseFloat(p.sell_price),
            unit: p.unit || 'kg',
            sell_unit: p.sell_unit || 'pcs',
            sell_content: parseFloat(p.sell_content) || 1,
            qty: 1
        });
    }
    renderCart();
}
window.addToCart = addToCart;

function renderCart() {
    const el = document.getElementById('cartItems');
    if (!cart.length) {
        el.innerHTML = '<div class="empty-cart"><div class="ec-icon">🛒</div><p>Keranjang kosong<br>Klik produk untuk menambahkan</p></div>';
        updateSummary();
        return;
    }
    el.innerHTML = cart.map((item, i) => `
      <div class="cart-item">
        <div class="ci-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-price">${formatRupiah(item.price)}/${item.sell_unit}</div>
        </div>
        <div class="ci-qty">
          <button onclick="changeQty(${i},-1)">−</button>
          <input value="${item.qty}" onchange="setQty(${i},this.value)" oninput="this.value=this.value.replace(/,/g,'.')">
          <button onclick="changeQty(${i},1)">+</button>
        </div>
        <div class="ci-total">${formatRupiah(item.price * item.qty)}</div>
        <button class="ci-del" onclick="removeItem(${i})">✕</button>
      </div>`).join('');
    updateSummary();
}

function changeQty(index, delta) {
    const item = cart[index];
    const newQty = parseFloat(item.qty) + delta;
    if (newQty <= 0) { cart.splice(index, 1); }
    else { item.qty = newQty; }
    renderCart();
}
window.changeQty = changeQty;

function setQty(index, val) {
    const qty = parseFloat(String(val).replace(/,/g, '.')) || 0;
    if (qty <= 0) { cart.splice(index, 1); }
    else { cart[index].qty = qty; }
    renderCart();
}
window.setQty = setQty;

function removeItem(index) {
    cart.splice(index, 1);
    renderCart();
}
window.removeItem = removeItem;

function clearCart() {
    if (cart.length && !confirm('Bersihkan semua item?')) return;
    cart = [];
    document.getElementById('discountInput').value = 0;
    document.getElementById('payAmount').value = '';
    renderCart();
}
window.clearCart = clearCart;

function setPayType(type) {
    payType = type;
    document.getElementById('btnCash').style.background = type === 'CASH' ? '#4caf50' : 'transparent';
    document.getElementById('btnCash').style.color = type === 'CASH' ? '#fff' : '#4caf50';
    document.getElementById('btnHutang').style.background = type === 'HUTANG' ? '#ff9800' : 'transparent';
    document.getElementById('btnHutang').style.color = type === 'HUTANG' ? '#fff' : '#ff9800';
    document.getElementById('cashSection').style.display = type === 'CASH' ? 'block' : 'none';
    document.getElementById('hutangSection').style.display = type === 'HUTANG' ? 'block' : 'none';
    document.getElementById('btnPay').textContent = type === 'CASH' ? '💵 BAYAR CASH (F8)' : '📋 SIMPAN HUTANG (F8)';
    document.getElementById('btnPay').style.background = type === 'CASH' ? '#e94560' : '#ff9800';
    updateSummary();
}
window.setPayType = setPayType;

function updateSummary() {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = parseFloat(String(document.getElementById('discountInput').value).replace(/,/g, '.')) || 0;
    const total = subtotal - discount;

    document.getElementById('subtotalDisplay').textContent = formatRupiah(subtotal);
    document.getElementById('totalDisplay').textContent = formatRupiah(total);

    if (payType === 'CASH') {
        const paid = parseFloat(String(document.getElementById('payAmount').value).replace(/,/g, '.')) || 0;
        const change = paid - total;
        document.getElementById('changeDisplay').textContent = formatRupiah(Math.max(0, change));
        document.getElementById('changeDisplay').style.color = change >= 0 && paid > 0 ? '#4caf50' : '#e94560';
        document.getElementById('btnPay').disabled = !cart.length || total <= 0 || paid < total;
    } else {
        const dp = parseFloat(String(document.getElementById('dpAmount').value).replace(/,/g, '.')) || 0;
        const sisa = Math.max(0, total - dp);
        document.getElementById('hutangDisplay').textContent = formatRupiah(sisa);
        document.getElementById('btnPay').disabled = !cart.length || total <= 0;
    }
}
window.updateSummary = updateSummary;

async function processPayment() {
    if (document.getElementById('btnPay').disabled) return;
    const customer = document.getElementById('customerName').value.trim() || 'Pelanggan Umum';
    const customer_address = document.getElementById('customerAddress').value.trim();
    const discount = parseFloat(String(document.getElementById('discountInput').value).replace(/,/g, '.')) || 0;
    const items = cart.map(c => ({ product_id: c.product_id, quantity: c.qty, unit_price: c.price }));
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const total = subtotal - discount;
    const invoiceNum = 'INV-' + Date.now();
    const today = new Date().toISOString().slice(0, 10);

    let paid = 0;
    let dp = 0;
    if (payType === 'CASH') {
        paid = parseFloat(String(document.getElementById('payAmount').value).replace(/,/g, '.')) || 0;
    } else {
        dp = parseFloat(String(document.getElementById('dpAmount').value).replace(/,/g, '.')) || 0;
        paid = dp;
    }

    try {
        // 1. Simpan penjualan
        await apiFetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                invoice_number: invoiceNum,
                date: today,
                customer_name: customer,
                customer_address,
                channel: 'DIRECT',
                discount: discount,
                shipping_cost: 0,
                status: 'DONE',
                items
            })
        });

        // 2. Jika hutang, buat record hutang (piutang)
        if (payType === 'HUTANG') {
            const hutangAmount = total - dp;
            if (hutangAmount > 0) {
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);
                await apiFetch('/api/hutang', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        reference: 'HTG-' + invoiceNum,
                        date: today,
                        due_date: dueDate.toISOString().slice(0, 10),
                        counterparty: customer,
                        description: `Hutang penjualan ${invoiceNum}`,
                        amount: hutangAmount
                    })
                });
            }
        }

        showToast(payType === 'CASH' ? 'Transaksi cash berhasil!' : 'Transaksi hutang berhasil disimpan!');
        showReceipt(customer, cart, subtotal, discount, total, paid, payType);
        cart = [];
        document.getElementById('discountInput').value = 0;
        document.getElementById('payAmount').value = '';
        document.getElementById('dpAmount').value = 0;
        renderCart();
        await loadProducts();
        renderProducts();
    } catch (e) {
        showToast('Gagal simpan: ' + e.message, 'error');
    }
}
window.processPayment = processPayment;

function showReceipt(customer, items, subtotal, discount, total, paid, type) {
    type = type || 'CASH';
    const change = type === 'CASH' ? paid - total : 0;
    const hutangAmount = type === 'HUTANG' ? total - paid : 0;
    const now = new Date();
    const rows = items.map(i => `
      <tr>
        <td>${i.name}</td>
        <td style="text-align:right">${formatNum(i.qty)}</td>
        <td style="text-align:right">${formatRupiah(i.price)}</td>
        <td style="text-align:right">${formatRupiah(i.price * i.qty)}</td>
      </tr>`).join('');

        const address = document.getElementById('customerAddress')?.value?.trim() || '';
        document.getElementById('receiptContent').innerHTML = `
            <h3>SAGARA MEAT HOUSE</h3>
            <div class="r-sub">${now.toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'})} ${now.toLocaleTimeString('id-ID')}</div>
            <div style="font-size:12px;margin-bottom:8px;border-bottom:1px dashed #ccc;padding-bottom:6px">
                <div>Pelanggan: <strong>${customer}</strong></div>
                ${address ? `<div>Alamat: <span>${address}</span></div>` : ''}
            </div>
      <table>
        <thead><tr><td><strong>Item</strong></td><td style="text-align:right"><strong>Qty</strong></td><td style="text-align:right"><strong>Harga</strong></td><td style="text-align:right"><strong>Total</strong></td></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="border-top:1px dashed #ccc;padding-top:6px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${formatRupiah(subtotal)}</span></div>
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#e94560"><span>Diskon</span><span>-${formatRupiah(discount)}</span></div>` : ''}
      </div>
      <div class="r-total">TOTAL: ${formatRupiah(total)}</div>
      <div style="font-size:12px;margin-top:6px">
        <div style="display:flex;justify-content:space-between"><span>Pembayaran</span><span style="font-weight:600;color:${type==='CASH'?'#4caf50':'#ff9800'}">${type === 'CASH' ? '💵 Cash' : '📋 Hutang'}</span></div>
        <div style="display:flex;justify-content:space-between"><span>${type==='CASH'?'Bayar':'Uang Muka'}</span><span>${formatRupiah(paid)}</span></div>
        ${type === 'CASH' ? `<div style="display:flex;justify-content:space-between;font-weight:700;color:#2e7d32"><span>Kembalian</span><span>${formatRupiah(Math.max(0, change))}</span></div>` : ''}
      </div>
      ${type === 'HUTANG' && hutangAmount > 0 ? `<div style="background:#fff3e0;border-radius:6px;padding:8px;margin-top:8px;font-size:12px;color:#e65100;font-weight:600;text-align:center">📋 HUTANG: ${formatRupiah(hutangAmount)}<br><span style="font-weight:400;font-size:11px">Jatuh tempo 30 hari</span></div>` : ''}
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#999;border-top:1px dashed #ccc;padding-top:8px">Terima kasih atas kunjungan Anda!</div>
      <div class="r-actions">
        <button style="background:#e94560;color:#fff" onclick="window.print()">🖨 Print</button>
        <button style="background:#eee;color:#333" onclick="closeReceipt()">Tutup</button>
      </div>`;
    document.getElementById('receiptModal').classList.add('show');
}

function closeReceipt() {
    document.getElementById('receiptModal').classList.remove('show');
}
window.closeReceipt = closeReceipt;

function holdTransaction() {
    if (!cart.length) return showToast('Keranjang kosong.', 'error');
    localStorage.setItem('pos_held', JSON.stringify({
        cart,
        customer: document.getElementById('customerName').value
    }));
    cart = [];
    renderCart();
    showToast('Transaksi ditahan. Buka kasir lagi untuk melanjutkan.');
}
window.holdTransaction = holdTransaction;

function startClock() {
    const el = document.getElementById('clockDisplay');
    const tick = () => { el.textContent = new Date().toLocaleTimeString('id-ID'); };
    tick();
    setInterval(tick, 1000);
}

// ── Customer Management ──────────────────────────────────────
async function loadCustomers() {
    try {
        const { data } = await apiFetch('/api/sales/customers');
        customersList = data;
    } catch (e) { console.error('Gagal memuat pelanggan:', e); }
}

function showCustomerList() {
    filterCustomers();
    document.getElementById('customerDropdown').style.display = 'block';
}
window.showCustomerList = showCustomerList;

function toggleCustomerList() {
    const dd = document.getElementById('customerDropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    if (dd.style.display === 'block') filterCustomers();
}
window.toggleCustomerList = toggleCustomerList;

function filterCustomers() {
    const q = document.getElementById('customerName').value.toLowerCase().trim();
    const filtered = q ? customersList.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))) : customersList;
    const el = document.getElementById('customerList');
    el.innerHTML = filtered.length
        ? filtered.slice(0, 15).map(c => `
            <div class="cust-item" onclick="selectCustomer('${c.name.replace(/'/g,"\\'")}','${c.phone||''}')">
              <div>${c.name}</div>
              ${c.phone ? `<div class="ci-phone">📞 ${c.phone}</div>` : ''}
            </div>`).join('')
        : '<div style="padding:12px;text-align:center;color:#555;font-size:12px">Tidak ditemukan</div>';
}
window.filterCustomers = filterCustomers;

function selectCustomer(name, phone) {
    document.getElementById('customerName').value = name;
    document.getElementById('customerDropdown').style.display = 'none';
    const info = document.getElementById('customerInfo');
    if (phone) {
        info.textContent = `📞 ${phone}`;
        info.style.display = 'block';
    } else {
        info.style.display = 'none';
    }
    // Auto-fill address if available
    const cust = customersList.find(c => c.name === name);
    document.getElementById('customerAddress').value = cust && cust.address ? cust.address : '';
}
window.selectCustomer = selectCustomer;

function addNewCustomer() {
    const name = prompt('Nama pelanggan baru:');
    if (!name || !name.trim()) return;
    const phone = prompt('No. HP (opsional):') || '';
    // Save to customers table if phone provided
    if (phone.trim()) {
        apiFetch('/api/auth/register-customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), phone: phone.trim(), password: 'default123' })
        }).then(() => {
            loadCustomers();
            showToast('Pelanggan baru ditambahkan.');
        }).catch(() => {
            // Still use the name even if save fails
            showToast('Nama disimpan (gagal simpan ke database).', 'error');
        });
    }
    document.getElementById('customerName').value = name.trim();
    document.getElementById('customerDropdown').style.display = 'none';
    if (phone) {
        document.getElementById('customerInfo').textContent = `📞 ${phone}`;
        document.getElementById('customerInfo').style.display = 'block';
    }
}
window.addNewCustomer = addNewCustomer;

// Close dropdown when clicking outside
document.addEventListener('click', e => {
    const container = document.querySelector('.cart-customer');
    if (container && !container.contains(e.target)) {
        document.getElementById('customerDropdown').style.display = 'none';
    }
});
