/* gudang.js – Warehouse & Stock Transfer Management */
let warehouses = [];
let whProducts = [];
let allStock = [];

(async () => {
    await loadAll();

    // Warehouse modal
    document.getElementById('btnAddWarehouse').addEventListener('click', () => openWhModal());
    document.getElementById('whModalClose').addEventListener('click', closeWhModal);
    document.getElementById('whModalCancel').addEventListener('click', closeWhModal);
    document.getElementById('whModalSave').addEventListener('click', saveWarehouse);

    // Set stock modal
    document.getElementById('btnSetStock').addEventListener('click', openSetStockModal);
    document.getElementById('ssModalClose').addEventListener('click', closeSetStockModal);
    document.getElementById('ssModalCancel').addEventListener('click', closeSetStockModal);
    document.getElementById('ssModalSave').addEventListener('click', saveSetStock);
    document.getElementById('ssStock').addEventListener('input', function() { this.value = this.value.replace(/,/g, '.'); });

    // Transfer modal
    document.getElementById('btnNewTransfer').addEventListener('click', openTransferModal);
    document.getElementById('trModalClose').addEventListener('click', closeTransferModal);
    document.getElementById('trModalCancel').addEventListener('click', closeTransferModal);
    document.getElementById('trModalSave').addEventListener('click', submitTransfer);
    document.getElementById('btnAddItem').addEventListener('click', addTransferItem);

    // Detail modal
    document.getElementById('dtModalClose').addEventListener('click', closeDetailModal);
    document.getElementById('dtModalCancel').addEventListener('click', closeDetailModal);

    // Filters
    document.getElementById('filterWarehouse').addEventListener('change', renderStock);
    document.getElementById('filterProduct').addEventListener('input', renderStock);
})();

async function loadAll() {
    try {
        const [whRes, prodRes, stockRes] = await Promise.all([
            apiFetch('/api/warehouse'),
            apiFetch('/api/inventory'),
            apiFetch('/api/warehouse/stock/all')
        ]);
        warehouses = whRes.data;
        whProducts = prodRes.data;
        allStock = stockRes.data;
        renderWarehouses();
        renderStock();
        loadTransfers();
        populateWarehouseFilters();
    } catch (e) { showToast(e.message, 'error'); }
}

async function loadStockData() {
    try {
        const res = await apiFetch('/api/warehouse/stock/all');
        allStock = res.data;
        renderStock();
    } catch (e) { showToast(e.message, 'error'); }
}

function populateWarehouseFilters() {
    const filterWh = document.getElementById('filterWarehouse');
    const current = filterWh.value;
    filterWh.innerHTML = '<option value="">Semua Gudang</option>' +
        warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    filterWh.value = current;
}

// ═══════════════════════════════════════════════════════════════
// WAREHOUSES
// ═══════════════════════════════════════════════════════════════
function renderWarehouses() {
    const tbody = document.getElementById('warehouseTable');
    if (!warehouses.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#757575">Belum ada gudang</td></tr>';
        return;
    }
    tbody.innerHTML = warehouses.map(w => {
        const prodCount = allStock.filter(s => s.warehouse_id === w.id && parseFloat(s.stock) > 0).length;
        return `<tr>
            <td><strong>${w.name}</strong></td>
            <td>${w.address || '-'}</td>
            <td>${w.phone || '-'}</td>
            <td class="text-center">${w.is_active ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-danger">Nonaktif</span>'}</td>
            <td class="text-right">${prodCount} produk</td>
            <td class="text-center" style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="openWhModal(${w.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteWarehouse(${w.id})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function openWhModal(id) {
    const wh = id ? warehouses.find(w => w.id === id) : null;
    document.getElementById('whId').value = wh ? wh.id : '';
    document.getElementById('whName').value = wh ? wh.name : '';
    document.getElementById('whAddress').value = wh ? wh.address || '' : '';
    document.getElementById('whPhone').value = wh ? wh.phone || '' : '';
    document.getElementById('whModalTitle').textContent = wh ? 'Edit Gudang' : 'Tambah Gudang';
    document.getElementById('warehouseModal').classList.add('show');
}
window.openWhModal = openWhModal;

function closeWhModal() { document.getElementById('warehouseModal').classList.remove('show'); }

async function saveWarehouse() {
    const id = document.getElementById('whId').value;
    const name = document.getElementById('whName').value.trim();
    if (!name) return showToast('Nama gudang wajib diisi.', 'error');
    const body = {
        name,
        address: document.getElementById('whAddress').value.trim(),
        phone: document.getElementById('whPhone').value.trim()
    };
    try {
        if (id) {
            await apiFetch(`/api/warehouse/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } else {
            await apiFetch('/api/warehouse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        }
        showToast('Gudang berhasil disimpan.');
        closeWhModal();
        await loadAll();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteWarehouse(id) {
    if (!await confirmDialog('Hapus gudang ini?')) return;
    try {
        await apiFetch(`/api/warehouse/${id}`, { method: 'DELETE' });
        showToast('Gudang dihapus.', 'warning');
        await loadAll();
    } catch (e) { showToast(e.message, 'error'); }
}
window.deleteWarehouse = deleteWarehouse;

// ═══════════════════════════════════════════════════════════════
// STOCK PER WAREHOUSE
// ═══════════════════════════════════════════════════════════════
function renderStock() {
    const tbody = document.getElementById('stockTable');
    const whFilter = document.getElementById('filterWarehouse').value;
    const pFilter = document.getElementById('filterProduct').value.toLowerCase().trim();

    let data = allStock;
    if (whFilter) data = data.filter(s => s.warehouse_id == whFilter);
    if (pFilter) data = data.filter(s => s.product_name.toLowerCase().includes(pFilter) || s.product_code.toLowerCase().includes(pFilter));

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#757575">Tidak ada data stok</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(s => {
        const stock = parseFloat(s.stock) || 0;
        return `<tr>
            <td><strong>${s.warehouse_name}</strong></td>
            <td><code>${s.product_code}</code></td>
            <td>${s.product_name}</td>
            <td>${s.unit || 'kg'}</td>
            <td class="text-right">
                <span class="${stock <= 5 ? 'badge badge-danger' : stock <= 10 ? 'badge badge-warning' : ''}">
                    ${formatNum(stock)} ${s.unit || 'kg'}
                </span>
            </td>
            <td class="text-right">${formatNum(parseFloat(s.total_stock) || 0)} ${s.unit || 'kg'}</td>
        </tr>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════
// SET STOCK MODAL
// ═══════════════════════════════════════════════════════════════
function openSetStockModal() {
    const ssWh = document.getElementById('ssWarehouse');
    ssWh.innerHTML = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    const ssProd = document.getElementById('ssProduct');
    ssProd.innerHTML = whProducts.map(p => `<option value="${p.id}">${p.code} – ${p.name}</option>`).join('');
    document.getElementById('ssStock').value = '0';
    document.getElementById('setStockModal').classList.add('show');
}
function closeSetStockModal() { document.getElementById('setStockModal').classList.remove('show'); }

async function saveSetStock() {
    const warehouse_id = document.getElementById('ssWarehouse').value;
    const product_id = document.getElementById('ssProduct').value;
    const stock = parseFloat(document.getElementById('ssStock').value.replace(/,/g, '.')) || 0;
    if (!warehouse_id || !product_id) return showToast('Pilih gudang dan produk.', 'error');
    try {
        await apiFetch('/api/warehouse/stock/set', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouse_id, product_id, stock })
        });
        showToast('Stok gudang berhasil diperbarui.');
        closeSetStockModal();
        await loadStockData();
    } catch (e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// STOCK TRANSFERS
// ═══════════════════════════════════════════════════════════════
async function loadTransfers() {
    try {
        const { data } = await apiFetch('/api/warehouse/transfers/list');
        const tbody = document.getElementById('transferTable');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#757575">Belum ada transfer</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(t => {
            const statusMap = { DRAFT: 'default', CONFIRMED: 'success', CANCELLED: 'danger' };
            const statusLabel = { DRAFT: 'Draft', CONFIRMED: 'Dikonfirmasi', CANCELLED: 'Dibatalkan' };
            return `<tr>
                <td><code>${t.transfer_number}</code></td>
                <td>${formatDate(t.date)}</td>
                <td>${t.from_warehouse_name}</td>
                <td>${t.to_warehouse_name}</td>
                <td class="text-center">${t.item_count} item</td>
                <td class="text-center"><span class="badge badge-${statusMap[t.status] || 'default'}">${statusLabel[t.status] || t.status}</span></td>
                <td>${t.created_by_name || '-'}</td>
                <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="viewTransfer(${t.id})">👁️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTransfer(${t.id})">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { showToast(e.message, 'error'); }
}

// Transfer Modal
function openTransferModal() {
    document.getElementById('trDate').value = new Date().toISOString().slice(0, 10);
    const opts = warehouses.filter(w => w.is_active).map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    document.getElementById('trFrom').innerHTML = opts;
    document.getElementById('trTo').innerHTML = opts;
    document.getElementById('trNotes').value = '';
    document.getElementById('transferItems').innerHTML = '';
    addTransferItem();
    document.getElementById('transferModal').classList.add('show');
}
function closeTransferModal() { document.getElementById('transferModal').classList.remove('show'); }

let itemCounter = 0;
function addTransferItem() {
    itemCounter++;
    const div = document.createElement('div');
    div.className = 'form-row';
    div.id = `trItem_${itemCounter}`;
    div.style.alignItems = 'flex-end';
    div.innerHTML = `
        <div class="form-group" style="flex:3">
            <label>Produk</label>
            <select class="form-control tr-product">
                ${whProducts.map(p => `<option value="${p.id}">${p.code} – ${p.name} (${formatNum(parseFloat(p.stock))} ${p.unit})</option>`).join('')}
            </select>
        </div>
        <div class="form-group" style="flex:1">
            <label>Qty</label>
            <input class="form-control tr-qty" type="text" inputmode="decimal" value="1" placeholder="0">
        </div>
        <div class="form-group" style="flex:0 0 36px">
            <button class="btn btn-danger btn-sm" type="button" onclick="removeTransferItem('trItem_${itemCounter}')" style="margin-bottom:2px">✕</button>
        </div>`;
    // Comma to dot
    div.querySelector('.tr-qty').addEventListener('input', function() { this.value = this.value.replace(/,/g, '.'); });
    document.getElementById('transferItems').appendChild(div);
}
window.addTransferItem = addTransferItem;

function removeTransferItem(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
window.removeTransferItem = removeTransferItem;

async function submitTransfer() {
    const from_warehouse_id = document.getElementById('trFrom').value;
    const to_warehouse_id = document.getElementById('trTo').value;
    const date = document.getElementById('trDate').value;
    const notes = document.getElementById('trNotes').value.trim();

    if (from_warehouse_id === to_warehouse_id) return showToast('Gudang asal dan tujuan harus berbeda.', 'error');

    const rows = document.querySelectorAll('#transferItems .form-row');
    if (!rows.length) return showToast('Tambahkan minimal 1 item.', 'error');

    const items = [];
    for (const row of rows) {
        const product_id = row.querySelector('.tr-product').value;
        const quantity = parseFloat(row.querySelector('.tr-qty').value.replace(/,/g, '.'));
        if (!quantity || quantity <= 0) return showToast('Quantity harus > 0.', 'error');
        items.push({ product_id, quantity });
    }

    try {
        await apiFetch('/api/warehouse/transfers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_warehouse_id, to_warehouse_id, date, notes, items })
        });
        showToast('Transfer berhasil dibuat.');
        closeTransferModal();
        await loadAll();
        switchTab('transfers');
    } catch (e) { showToast(e.message, 'error'); }
}

async function viewTransfer(id) {
    try {
        const { data } = await apiFetch(`/api/warehouse/transfers/${id}`);
        document.getElementById('detailTitle').textContent = `Transfer ${data.transfer_number}`;
        const statusLabel = { DRAFT: 'Draft', CONFIRMED: 'Dikonfirmasi', CANCELLED: 'Dibatalkan' };
        document.getElementById('detailBody').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:14px">
                <div><strong>No. Transfer:</strong> ${data.transfer_number}</div>
                <div><strong>Tanggal:</strong> ${formatDate(data.date)}</div>
                <div><strong>Dari:</strong> ${data.from_warehouse_name}</div>
                <div><strong>Ke:</strong> ${data.to_warehouse_name}</div>
                <div><strong>Status:</strong> ${statusLabel[data.status] || data.status}</div>
                <div><strong>Dibuat oleh:</strong> ${data.created_by_name || '-'}</div>
                ${data.notes ? `<div style="grid-column:1/3"><strong>Catatan:</strong> ${data.notes}</div>` : ''}
            </div>
            <table>
                <thead><tr><th>Kode</th><th>Produk</th><th>Satuan</th><th class="text-right">Qty</th></tr></thead>
                <tbody>
                    ${data.items.map(i => `<tr>
                        <td><code>${i.product_code}</code></td>
                        <td>${i.product_name}</td>
                        <td>${i.unit || 'kg'}</td>
                        <td class="text-right">${formatNum(parseFloat(i.quantity))}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        document.getElementById('detailModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}
window.viewTransfer = viewTransfer;

function closeDetailModal() { document.getElementById('detailModal').classList.remove('show'); }

async function deleteTransfer(id) {
    if (!await confirmDialog('Hapus transfer ini? Stok akan dikembalikan ke gudang asal.')) return;
    try {
        await apiFetch(`/api/warehouse/transfers/${id}`, { method: 'DELETE' });
        showToast('Transfer dihapus.', 'warning');
        await loadAll();
    } catch (e) { showToast(e.message, 'error'); }
}
window.deleteTransfer = deleteTransfer;
