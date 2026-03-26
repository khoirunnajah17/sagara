/* inventory.js */
(async () => {
    await requireLogin();
    loadInventory();

    document.getElementById('btnAdd').addEventListener('click',      () => openModal());
    document.getElementById('modalClose').addEventListener('click',   closeModal);
    document.getElementById('modalCancel').addEventListener('click',  closeModal);
    document.getElementById('modalSave').addEventListener('click',    saveProduct);
    document.getElementById('stockClose').addEventListener('click',   closeStockModal);
    document.getElementById('stockCancel').addEventListener('click',  closeStockModal);
    document.getElementById('stockSave').addEventListener('click',    saveStock);
    document.getElementById('btnSearch').addEventListener('click',    loadInventory);
    document.getElementById('filterSearch').addEventListener('keyup', e => { if(e.key==='Enter') loadInventory(); });
})();

async function loadInventory() {
    const search   = document.getElementById('filterSearch').value.trim();
    const category = document.getElementById('filterCategory').value.trim();
    let qs = '?';
    if (search)   qs += `search=${encodeURIComponent(search)}&`;
    if (category) qs += `category=${encodeURIComponent(category)}&`;
    try {
        const { data } = await apiFetch(`/api/inventory${qs}`);
        const tbody = document.getElementById('inventoryTable');
        tbody.innerHTML = data.length
            ? data.map(p => `
                <tr>
                  <td><code>${p.code}</code></td>
                  <td>${p.name}</td>
                  <td>${p.category || '-'}</td>
                  <td>${p.unit}</td>
                  <td class="text-right">
                    <span class="${p.stock<=5?'badge badge-danger':p.stock<=10?'badge badge-warning':''}">
                      ${p.stock}
                    </span>
                  </td>
                  <td class="text-right">${formatRupiah(p.cost_price)}</td>
                  <td class="text-right">${formatRupiah(p.sell_price)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="openModal(${p.id})">✏️</button>
                    <button class="btn btn-warning btn-sm" onclick="openStockModal(${p.id},'${p.name.replace(/'/g,"\\'")}')">📦</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="8" style="text-align:center;padding:24px;color:#757575">Tidak ada produk</td></tr>';
    } catch (e) { showToast(e.message, 'error'); }
}

let editingId = null;
async function openModal(id) {
    editingId = id || null;
    if (id) {
        try {
            const { data } = await apiFetch(`/api/inventory/${id}`);
            document.getElementById('productId').value = data.id;
            document.getElementById('fCode').value     = data.code;
            document.getElementById('fName').value     = data.name;
            document.getElementById('fCategory').value = data.category || '';
            document.getElementById('fUnit').value     = data.unit;
            document.getElementById('fStock').value    = data.stock;
            document.getElementById('fCost').value     = data.cost_price;
            document.getElementById('fSell').value     = data.sell_price;
        } catch (e) { showToast(e.message, 'error'); return; }
    } else {
        document.getElementById('productId').value = '';
        document.getElementById('fCode').value = '';
        document.getElementById('fName').value = '';
        document.getElementById('fCategory').value = '';
        document.getElementById('fUnit').value = 'pcs';
        document.getElementById('fStock').value = 0;
        document.getElementById('fCost').value = 0;
        document.getElementById('fSell').value = 0;
    }
    document.getElementById('modalTitle').textContent = id ? 'Edit Produk' : 'Tambah Produk';
    document.getElementById('productModal').classList.add('show');
}
function closeModal() { document.getElementById('productModal').classList.remove('show'); }

async function saveProduct() {
    const id = document.getElementById('productId').value;
    const payload = {
        code:       document.getElementById('fCode').value.trim(),
        name:       document.getElementById('fName').value.trim(),
        category:   document.getElementById('fCategory').value.trim(),
        unit:       document.getElementById('fUnit').value.trim(),
        stock:      parseInt(document.getElementById('fStock').value) || 0,
        cost_price: parseFloat(document.getElementById('fCost').value) || 0,
        sell_price: parseFloat(document.getElementById('fSell').value) || 0,
    };
    if (!payload.code || !payload.name) return showToast('Kode dan nama wajib diisi.', 'error');
    try {
        if (id) { await apiFetch(`/api/inventory/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); }
        else     { await apiFetch('/api/inventory',       { method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); }
        showToast('Produk berhasil disimpan.');
        closeModal();
        loadInventory();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteProduct(id) {
    if (!await confirmDialog('Hapus produk ini?')) return;
    try {
        await apiFetch(`/api/inventory/${id}`, { method:'DELETE' });
        showToast('Produk dihapus.', 'warning');
        loadInventory();
    } catch (e) { showToast(e.message, 'error'); }
}

function openStockModal(id, name) {
    document.getElementById('stockProductId').value  = id;
    document.getElementById('stockProductName').textContent = name;
    document.getElementById('fAdjust').value = '';
    document.getElementById('stockModal').classList.add('show');
}
function closeStockModal() { document.getElementById('stockModal').classList.remove('show'); }

async function saveStock() {
    const id  = document.getElementById('stockProductId').value;
    const adj = parseInt(document.getElementById('fAdjust').value);
    if (isNaN(adj) || adj === 0) return showToast('Masukkan angka penyesuaian.', 'error');
    try {
        await apiFetch(`/api/inventory/${id}/stock`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ adjustment: adj }) });
        showToast('Stok berhasil disesuaikan.');
        closeStockModal();
        loadInventory();
    } catch (e) { showToast(e.message, 'error'); }
}
