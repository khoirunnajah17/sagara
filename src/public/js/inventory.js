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

    // Sync stock button
    const btnSync = document.getElementById('btnSyncStock');
    if (btnSync) btnSync.addEventListener('click', syncStock);

    // Dynamic label update
    document.getElementById('fUnit').addEventListener('change', updateStockLabel);
    document.getElementById('fBuyUnit').addEventListener('change', updateStockLabel);
    document.getElementById('fSellUnit').addEventListener('change', updateStockLabel);
    document.getElementById('fBuyContent').addEventListener('input', updateStockLabel);
    document.getElementById('fSellContent').addEventListener('input', updateStockLabel);

    // Auto-convert comma to dot for decimal inputs
    ['fBuyContent', 'fSellContent', 'fStock', 'fCost', 'fSell'].forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
            this.value = this.value.replace(/,/g, '.');
        });
    });
})();

async function syncStock() {
    if (!confirm('Sinkronkan stok produk dengan total stok di semua gudang?')) return;
    try {
        const res = await apiFetch('/api/inventory/sync-stock', { method: 'POST' });
        showToast(res.message || 'Stok berhasil disinkronkan.');
        loadInventory();
    } catch (e) { showToast(e.message, 'error'); }
}

function updateStockLabel() {
    const u = document.getElementById('fUnit').value;
    const bu = document.getElementById('fBuyUnit').value;
    const su = document.getElementById('fSellUnit').value;
    document.getElementById('labelStockUnit').textContent = `(${u})`;
    document.getElementById('labelBuyUnit').textContent = `(1 ${bu} = ? ${u})`;
    document.getElementById('labelSellUnit').textContent = `(1 ${su} = ? ${u})`;
    const bc = document.getElementById('fBuyContent').value || '1';
    const sc = document.getElementById('fSellContent').value || '1';
    document.getElementById('contentHint').textContent = `Beli 1 ${bu} → stok +${bc} ${u} | Jual 1 ${su} → stok -${sc} ${u}`;
}

async function loadInventory() {
    const search   = document.getElementById('filterSearch').value.trim();
    const category = document.getElementById('filterCategory').value.trim();
    let qs = '?';
    if (search)   qs += `search=${encodeURIComponent(search)}&`;
    if (category) qs += `category=${encodeURIComponent(category)}&`;
        try {
                const { data } = await apiFetch(`/api/inventory${qs}`);
                const tbody = document.getElementById('inventoryTable');
                let grandQty = 0;
                let grandTotal = 0;
                tbody.innerHTML = data.length
                        ? data.map(p => {
                                const u = p.unit || 'kg';
                                const bu = p.buy_unit || u;
                                const su = p.sell_unit || 'pcs';
                                const bc = parseFloat(p.buy_content) || 1;
                                const sc = parseFloat(p.sell_content) || 1;
                                const stock = parseFloat(p.stock) || 0;
                                const harga = parseFloat(p.cost_price) || 0;
                                const total = stock * harga;
                                grandQty += stock;
                                grandTotal += total;
                                return `
                                <tr>
                                    <td><code>${p.code}</code></td>
                                    <td>${p.name}</td>
                                    <td>${p.category || '-'}</td>
                                    <td>${u}</td>
                                    <td class="text-right">${formatNum(bc)} ${u}/${bu}</td>
                                    <td class="text-right">${formatNum(sc)} ${u}/${su}</td>
                                    <td class="text-right">
                                        <span class="${stock<=5?'badge badge-danger':stock<=10?'badge badge-warning':''}">${formatNum(stock)} ${u}</span>
                                    </td>
                                    <td class="text-right">${formatRupiah(harga)}</td>
                                    <td class="text-right">${formatRupiah(total)}</td>
                                    <td class="text-center" style="white-space:nowrap">
                                        <button class="btn btn-outline btn-sm" onclick="openModal(${p.id})">✏️</button>
                                        <button class="btn btn-warning btn-sm" onclick="openStockModal(${p.id},'${p.name.replace(/'/g,"\\'")}')">📦</button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️</button>
                                    </td>
                                </tr>`;
                        }).join('')
                        : '<tr><td colspan="10" style="text-align:center;padding:24px;color:#757575">Tidak ada produk</td></tr>';
                // Update grand total di tfoot
                document.getElementById('grandQty').textContent = formatNum(grandQty);
                document.getElementById('grandTotal').textContent = formatRupiah(grandTotal);
        } catch (e) { showToast(e.message, 'error'); }
}

let editingId = null;
let currentImage = null;
async function openModal(id) {
    editingId = id || null;
    document.getElementById('fImage').value = '';
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    if (id) {
        try {
            const { data } = await apiFetch(`/api/inventory/${id}`);
            document.getElementById('productId').value = data.id;
            document.getElementById('fCode').value     = data.code;
            document.getElementById('fName').value     = data.name;
            document.getElementById('fCategory').value = data.category || '';
            document.getElementById('fUnit').value     = data.unit || 'kg';
            document.getElementById('fBuyUnit').value    = data.buy_unit || data.unit || 'kg';
            document.getElementById('fSellUnit').value   = data.sell_unit || 'pcs';
            document.getElementById('fBuyContent').value  = data.buy_content || 1;
            document.getElementById('fSellContent').value = data.sell_content || 1;
            document.getElementById('fStock').value    = data.stock;
            document.getElementById('fCost').value     = data.cost_price;
            document.getElementById('fSell').value     = data.sell_price;
            currentImage = data.image;
            if (data.image) {
                preview.innerHTML = `<img src="${data.image}" style="max-height:80px;border-radius:6px">`;
            }
        } catch (e) { showToast(e.message, 'error'); return; }
    } else {
        document.getElementById('productId').value = '';
        document.getElementById('fCode').value = '';
        document.getElementById('fName').value = '';
        document.getElementById('fCategory').value = '';
        document.getElementById('fUnit').value = 'kg';
        document.getElementById('fBuyUnit').value = 'kg';
        document.getElementById('fSellUnit').value = 'pcs';
        document.getElementById('fBuyContent').value = 1;
        document.getElementById('fSellContent').value = 1;
        document.getElementById('fStock').value = 0;
        document.getElementById('fCost').value = 0;
        document.getElementById('fSell').value = 0;
        currentImage = null;
    }
    updateStockLabel();
    document.getElementById('modalTitle').textContent = id ? 'Edit Produk' : 'Tambah Produk';
    document.getElementById('productModal').classList.add('show');
}
function closeModal() { document.getElementById('productModal').classList.remove('show'); }

async function saveProduct() {
    const id = document.getElementById('productId').value;
    const code = document.getElementById('fCode').value.trim();
    const name = document.getElementById('fName').value.trim();
    if (!code || !name) return showToast('Kode dan nama wajib diisi.', 'error');

    const buyUnit = document.getElementById('fUnit').value;
    const formData = new FormData();
    formData.append('code', code);
    formData.append('name', name);
    formData.append('category', document.getElementById('fCategory').value.trim());
    formData.append('unit', buyUnit);
    formData.append('buy_unit', document.getElementById('fBuyUnit').value);
    formData.append('sell_unit', document.getElementById('fSellUnit').value);
    const parseDec = (v) => parseFloat(String(v).replace(/,/g, '.'));
    formData.append('buy_content', parseDec(document.getElementById('fBuyContent').value) || 1);
    formData.append('sell_content', parseDec(document.getElementById('fSellContent').value) || 1);
    formData.append('stock', parseDec(document.getElementById('fStock').value) || 0);
    formData.append('cost_price', parseDec(document.getElementById('fCost').value) || 0);
    formData.append('sell_price', parseDec(document.getElementById('fSell').value) || 0);
    const imageFile = document.getElementById('fImage').files[0];
    if (imageFile) formData.append('image', imageFile);

    try {
        const url = id ? `/api/inventory/${id}` : '/api/inventory';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, { method, credentials: 'include', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error');
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

// ═══════════════════════════════════════════════════════════════
// Tab switching (shared with gudang.js)
// ═══════════════════════════════════════════════════════════════
function switchTab(tab) {
    const panels = ['Products', 'Stock', 'Warehouses', 'Transfers'];
    panels.forEach(p => {
        const el = document.getElementById('panel' + p);
        if (el) el.style.display = (p.toLowerCase() === tab) ? '' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (btn) btn.classList.add('active');
    // Trigger loads for gudang tabs
    if (tab === 'stock' && typeof loadStockData === 'function') loadStockData();
    if (tab === 'transfers' && typeof loadTransfers === 'function') loadTransfers();
    if (tab === 'warehouses' && typeof loadAll === 'function') loadAll();
    if (tab === 'products') loadInventory();
}
window.switchTab = switchTab;
