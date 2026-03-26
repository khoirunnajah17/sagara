/* sales.js */
let activeChannel = 'ALL';
let productsList  = [];
let currentPage   = 1;

(async () => {
    await requireLogin();
    const [{ data: products }] = await Promise.all([apiFetch('/api/inventory'), loadSales(), loadSummary()]);
    productsList = products;

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeChannel = btn.dataset.channel;
            document.getElementById('shopeeHeader').classList.toggle('channel-active', activeChannel === 'SHOPEE');
            document.getElementById('tokopediaHeader').classList.toggle('channel-active', activeChannel === 'TOKOPEDIA');
            loadSales();
        });
    });

    document.getElementById('btnAdd').addEventListener('click',     openSaleModal);
    document.getElementById('modalClose').addEventListener('click',  closeSaleModal);
    document.getElementById('modalCancel').addEventListener('click', closeSaleModal);
    document.getElementById('modalSave').addEventListener('click',   saveSale);
    document.getElementById('btnAddItem').addEventListener('click',  addItemRow);
    document.getElementById('detailClose').addEventListener('click', () => document.getElementById('detailModal').classList.remove('show'));
    document.getElementById('btnSearch').addEventListener('click',   loadSales);
    document.getElementById('filterStatus').addEventListener('change', loadSales);
})();

async function loadSummary() {
    try {
        const { data, grand } = await apiFetch('/api/sales/summary');
        document.getElementById('sumAll').textContent      = formatRupiah(grand.total);
        document.getElementById('sumDirect').textContent   = formatRupiah(data.DIRECT.total);
        document.getElementById('sumShopee').textContent   = formatRupiah(data.SHOPEE.total);
        document.getElementById('sumTokopedia').textContent= formatRupiah(data.TOKOPEDIA.total);
    } catch {}
}

async function loadSales(page = 1) {
    currentPage = page;
    const status = document.getElementById('filterStatus').value;
    let qs = `?page=${page}&limit=15`;
    if (activeChannel !== 'ALL') qs += `&channel=${activeChannel}`;
    if (status) qs += `&status=${status}`;
    try {
        const { data, total, limit } = await apiFetch(`/api/sales${qs}`);
        const tbody = document.getElementById('salesTable');
        tbody.innerHTML = data.length
            ? data.map(s => `
                <tr>
                  <td><strong>${s.invoice_number}</strong></td>
                  <td>${formatDate(s.date)}</td>
                  <td>${s.customer_name}</td>
                  <td>${channelBadge(s.channel)}</td>
                  <td>${s.platform_order_id || '-'}</td>
                  <td class="text-right">${formatRupiah(s.total)}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="viewSale(${s.id})">👁</button>
                    <button class="btn btn-warning btn-sm" onclick="changeStatus(${s.id},'${s.status}')">🔄</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSale(${s.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="8" style="text-align:center;padding:24px;color:#757575">Tidak ada data</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadSales(${page-1})">‹</button>`;
    for (let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" onclick="loadSales(${i})">${i}</button>`;
    html+=`<button ${page===pages?'disabled':''} onclick="loadSales(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function openSaleModal() {
    document.getElementById('fInvoice').value  = 'INV-' + Date.now();
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fCustomer').value = '';
    document.getElementById('fChannel').value  = activeChannel !== 'ALL' ? activeChannel : 'DIRECT';
    document.getElementById('fDiscount').value = 0;
    document.getElementById('fShipping').value = 0;
    document.getElementById('fStatus').value   = 'DRAFT';
    document.getElementById('fNotes').value    = '';
    document.getElementById('itemRows').innerHTML = '';
    document.getElementById('grandTotal').textContent = 'Rp 0';
    togglePlatformId();
    addItemRow();
    document.getElementById('saleModal').classList.add('show');
}
function closeSaleModal() { document.getElementById('saleModal').classList.remove('show'); }

function togglePlatformId() {
    const ch = document.getElementById('fChannel').value;
    const grp = document.getElementById('platformGroup');
    grp.style.display = (ch === 'SHOPEE' || ch === 'TOKOPEDIA') ? 'block' : 'none';
}
// Expose globally for inline onchange
window.togglePlatformId = togglePlatformId;

function productOptions() {
    return '<option value="">-- Pilih Produk --</option>' +
        productsList.map(p => `<option value="${p.id}" data-price="${p.sell_price}">${p.code} – ${p.name} (Stok: ${p.stock})</option>`).join('');
}

function addItemRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select onchange="setPrice(this)">${productOptions()}</select></td>
      <td><input type="number" min="1" value="1" oninput="calcTotal()"></td>
      <td><input type="number" min="0" value="0" oninput="calcTotal()"></td>
      <td class="text-right"><span>Rp 0</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();calcTotal()">✕</button></td>`;
    document.getElementById('itemRows').appendChild(tr);
}

function setPrice(sel) {
    const opt   = sel.options[sel.selectedIndex];
    const price = opt ? (parseFloat(opt.dataset.price) || 0) : 0;
    const row   = sel.closest('tr');
    row.querySelectorAll('input')[1].value = price;
    calcTotal();
}
window.setPrice = setPrice;

function calcTotal() {
    let subtotal = 0;
    document.querySelectorAll('#itemRows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input');
        const qty = parseInt(inputs[0].value) || 0;
        const prc = parseFloat(inputs[1].value) || 0;
        const sub = qty * prc;
        tr.querySelector('span').textContent = formatRupiah(sub);
        subtotal += sub;
    });
    const discount  = parseFloat(document.getElementById('fDiscount').value) || 0;
    const shipping  = parseFloat(document.getElementById('fShipping').value) || 0;
    const total     = subtotal - discount + shipping;
    document.getElementById('grandTotal').textContent = formatRupiah(total);
}
window.calcTotal = calcTotal;

async function saveSale() {
    const invoice  = document.getElementById('fInvoice').value.trim();
    const date     = document.getElementById('fDate').value;
    const customer = document.getElementById('fCustomer').value.trim();
    const channel  = document.getElementById('fChannel').value;
    const platformId = document.getElementById('fPlatformId') ? document.getElementById('fPlatformId').value.trim() : '';
    const discount  = parseFloat(document.getElementById('fDiscount').value) || 0;
    const shipping  = parseFloat(document.getElementById('fShipping').value) || 0;
    const status    = document.getElementById('fStatus').value;
    const notes     = document.getElementById('fNotes').value.trim();

    if (!invoice || !date || !customer) return showToast('Invoice, tanggal, dan pelanggan wajib diisi.', 'error');

    const rows  = document.querySelectorAll('#itemRows tr');
    const items = [];
    rows.forEach(tr => {
        const sel    = tr.querySelector('select');
        const inputs = tr.querySelectorAll('input');
        if (sel.value) items.push({ product_id: parseInt(sel.value), quantity: parseInt(inputs[0].value)||1, unit_price: parseFloat(inputs[1].value)||0 });
    });
    if (!items.length) return showToast('Tambahkan minimal 1 item produk.', 'error');

    try {
        await apiFetch('/api/sales', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invoice_number: invoice, date, customer_name: customer, channel, platform_order_id: platformId||null, discount, shipping_cost: shipping, status, notes, items }) });
        showToast('Penjualan berhasil disimpan.');
        closeSaleModal();
        loadSales(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}

async function viewSale(id) {
    try {
        const { data } = await apiFetch(`/api/sales/${id}`);
        const itemRows = data.items.map(i => `<tr>
          <td>${i.product_code} – ${i.product_name}</td>
          <td class="text-right">${i.quantity}</td>
          <td class="text-right">${formatRupiah(i.unit_price)}</td>
          <td class="text-right">${formatRupiah(i.subtotal)}</td>
        </tr>`).join('');
        document.getElementById('detailContent').innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
            <div><strong>Invoice:</strong> ${data.invoice_number}</div>
            <div><strong>Tanggal:</strong> ${formatDate(data.date)}</div>
            <div><strong>Pelanggan:</strong> ${data.customer_name}</div>
            <div><strong>Channel:</strong> ${channelBadge(data.channel)}</div>
            ${data.platform_order_id?`<div><strong>Platform Order ID:</strong> ${data.platform_order_id}</div>`:''}
            <div><strong>Status:</strong> ${statusBadge(data.status)}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f7fa"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Harga</th><th style="padding:8px;text-align:right">Subtotal</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="text-align:right;margin-top:12px;font-size:13px">
            <div>Subtotal: ${formatRupiah(data.subtotal)}</div>
            <div>Diskon: -${formatRupiah(data.discount)}</div>
            <div>Ongkir: +${formatRupiah(data.shipping_cost)}</div>
            <div style="font-size:16px;font-weight:700;margin-top:6px">Total: ${formatRupiah(data.total)}</div>
          </div>`;
        document.getElementById('detailModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

async function changeStatus(id, currentStatus) {
    const statuses = ['DRAFT','CONFIRMED','SHIPPED','DONE','CANCELLED'];
    const next = prompt(`Status saat ini: ${currentStatus}\nPilih status baru:\n${statuses.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nMasukkan nomor:`);
    const idx = parseInt(next) - 1;
    if (isNaN(idx) || !statuses[idx]) return;
    try {
        await apiFetch(`/api/sales/${id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: statuses[idx] }) });
        showToast('Status diperbarui.');
        loadSales(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteSale(id) {
    if (!await confirmDialog('Hapus penjualan ini? Stok akan dikembalikan.')) return;
    try {
        await apiFetch(`/api/sales/${id}`, { method:'DELETE' });
        showToast('Penjualan dihapus.', 'warning');
        loadSales(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}
