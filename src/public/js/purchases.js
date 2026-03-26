/* purchases.js */
let productsList = [];
let currentPage  = 1;

(async () => {
    await requireLogin();
    const [{ data: products }] = await Promise.all([apiFetch('/api/inventory'), loadPurchases()]);
    productsList = products;

    document.getElementById('btnAdd').addEventListener('click',     openPOModal);
    document.getElementById('modalClose').addEventListener('click',  closePOModal);
    document.getElementById('modalCancel').addEventListener('click', closePOModal);
    document.getElementById('modalSave').addEventListener('click',   savePO);
    document.getElementById('btnAddItem').addEventListener('click',  addItemRow);
    document.getElementById('detailClose').addEventListener('click', () => document.getElementById('detailModal').classList.remove('show'));
    document.getElementById('filterStatus').addEventListener('change', loadPurchases);
})();

async function loadPurchases(page = 1) {
    currentPage = page;
    const status = document.getElementById('filterStatus').value;
    let qs = `?page=${page}&limit=15`;
    if (status) qs += `&status=${status}`;
    try {
        const { data, total, limit } = await apiFetch(`/api/purchases${qs}`);
        const tbody = document.getElementById('purchasesTable');
        tbody.innerHTML = data.length
            ? data.map(p => `
                <tr>
                  <td><strong>${p.po_number}</strong></td>
                  <td>${formatDate(p.date)}</td>
                  <td>${p.supplier_name}</td>
                  <td class="text-right">${formatRupiah(p.total)}</td>
                  <td>${statusBadge(p.status)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="viewPO(${p.id})">👁</button>
                    <button class="btn btn-warning btn-sm" onclick="changeStatus(${p.id},'${p.status}')">🔄</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePO(${p.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#757575">Tidak ada data</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadPurchases(${page-1})">‹</button>`;
    for (let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" onclick="loadPurchases(${i})">${i}</button>`;
    html+=`<button ${page===pages?'disabled':''} onclick="loadPurchases(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function productOptions() {
    return '<option value="">-- Pilih Produk --</option>' +
        productsList.map(p => `<option value="${p.id}" data-cost="${p.cost_price}">${p.code} – ${p.name}</option>`).join('');
}

function openPOModal() {
    document.getElementById('fPO').value       = 'PO-' + Date.now();
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fSupplier').value = '';
    document.getElementById('fStatus').value   = 'DRAFT';
    document.getElementById('fNotes').value    = '';
    document.getElementById('itemRows').innerHTML = '';
    document.getElementById('grandTotal').textContent = 'Rp 0';
    addItemRow();
    document.getElementById('poModal').classList.add('show');
}
function closePOModal() { document.getElementById('poModal').classList.remove('show'); }

function addItemRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select onchange="setCost(this)">${productOptions()}</select></td>
      <td><input type="number" min="1" value="1" oninput="calcTotal()"></td>
      <td><input type="number" min="0" value="0" oninput="calcTotal()"></td>
      <td class="text-right"><span>Rp 0</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();calcTotal()">✕</button></td>`;
    document.getElementById('itemRows').appendChild(tr);
}
window.addItemRow = addItemRow;

function setCost(sel) {
    const opt  = sel.options[sel.selectedIndex];
    const cost = opt ? (parseFloat(opt.dataset.cost) || 0) : 0;
    sel.closest('tr').querySelectorAll('input')[1].value = cost;
    calcTotal();
}
window.setCost = setCost;

function calcTotal() {
    let total = 0;
    document.querySelectorAll('#itemRows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input');
        const sub = (parseInt(inputs[0].value)||0) * (parseFloat(inputs[1].value)||0);
        tr.querySelector('span').textContent = formatRupiah(sub);
        total += sub;
    });
    document.getElementById('grandTotal').textContent = formatRupiah(total);
}
window.calcTotal = calcTotal;

async function savePO() {
    const po_number    = document.getElementById('fPO').value.trim();
    const date         = document.getElementById('fDate').value;
    const supplier     = document.getElementById('fSupplier').value.trim();
    const status       = document.getElementById('fStatus').value;
    const notes        = document.getElementById('fNotes').value.trim();
    if (!po_number || !date || !supplier) return showToast('No. PO, tanggal, dan supplier wajib diisi.', 'error');

    const rows  = document.querySelectorAll('#itemRows tr');
    const items = [];
    rows.forEach(tr => {
        const sel    = tr.querySelector('select');
        const inputs = tr.querySelectorAll('input');
        if (sel.value) items.push({ product_id: parseInt(sel.value), quantity: parseInt(inputs[0].value)||1, unit_price: parseFloat(inputs[1].value)||0 });
    });
    if (!items.length) return showToast('Tambahkan minimal 1 item produk.', 'error');

    try {
        await apiFetch('/api/purchases', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ po_number, date, supplier_name: supplier, status, notes, items }) });
        showToast('PO berhasil disimpan.');
        closePOModal();
        loadPurchases(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function viewPO(id) {
    try {
        const { data } = await apiFetch(`/api/purchases/${id}`);
        const itemRows = data.items.map(i => `<tr>
          <td>${i.product_code} – ${i.product_name}</td>
          <td class="text-right">${i.quantity}</td>
          <td class="text-right">${formatRupiah(i.unit_price)}</td>
          <td class="text-right">${formatRupiah(i.subtotal)}</td>
        </tr>`).join('');
        document.getElementById('detailContent').innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
            <div><strong>No. PO:</strong> ${data.po_number}</div>
            <div><strong>Tanggal:</strong> ${formatDate(data.date)}</div>
            <div><strong>Supplier:</strong> ${data.supplier_name}</div>
            <div><strong>Status:</strong> ${statusBadge(data.status)}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f7fa"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Harga</th><th style="padding:8px;text-align:right">Subtotal</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="text-align:right;margin-top:12px;font-size:16px;font-weight:700">Total: ${formatRupiah(data.total)}</div>`;
        document.getElementById('detailModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

async function changeStatus(id, currentStatus) {
    const statuses = ['DRAFT','ORDERED','RECEIVED','CANCELLED'];
    const next = prompt(`Status saat ini: ${currentStatus}\nPilih status baru:\n${statuses.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nMasukkan nomor:`);
    const idx = parseInt(next) - 1;
    if (isNaN(idx) || !statuses[idx]) return;
    try {
        await apiFetch(`/api/purchases/${id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: statuses[idx] }) });
        showToast('Status diperbarui.');
        loadPurchases(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function deletePO(id) {
    if (!await confirmDialog('Hapus PO ini?')) return;
    try {
        await apiFetch(`/api/purchases/${id}`, { method:'DELETE' });
        showToast('PO dihapus.', 'warning');
        loadPurchases(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}
