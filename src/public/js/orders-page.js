/* orders-page.js – Kelola Pesanan Online */
(async () => {
    await requireLogin();

    loadOrderStats();
    loadOrders();

    // Auto-refresh every 20 seconds
    setInterval(() => {
        loadOrderStats();
        loadOrders();
    }, 20000);

    // Filter buttons
    document.querySelectorAll('.order-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.order-filter-btn').forEach(b => {
                b.classList.remove('active');
                b.classList.add('btn-outline');
                b.classList.remove('btn-warning');
            });
            btn.classList.add('active');
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-warning');
            loadOrders();
        });
    });

    // Search
    let searchTimer;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadOrders(), 400);
    });

    // Date filter
    document.getElementById('dateFrom').addEventListener('change', () => loadOrders());
    document.getElementById('dateTo').addEventListener('change', () => loadOrders());

    // Export CSV
    document.getElementById('btnExport').addEventListener('click', exportCSV);
})();

async function loadOrderStats() {
    try {
        const { data } = await apiFetch('/api/orders/stats');
        document.getElementById('statPending').textContent = data.PENDING || 0;
        document.getElementById('statConfirmed').textContent = data.CONFIRMED || 0;
        document.getElementById('statDone').textContent = data.DONE || 0;
        document.getElementById('statCancelled').textContent = data.CANCELLED || 0;
    } catch (e) { console.error(e); }
}

let allOrders = [];

async function loadOrders() {
    const activeBtn = document.querySelector('.order-filter-btn.active');
    const status = activeBtn ? activeBtn.dataset.status : '';
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;

    try {
        const qs = status ? `?status=${status}` : '';
        const { data } = await apiFetch(`/api/orders${qs}`);
        allOrders = data;

        let filtered = data;

        // Search filter
        if (search) {
            filtered = filtered.filter(o =>
                (o.order_number || '').toLowerCase().includes(search) ||
                (o.customer_name || '').toLowerCase().includes(search) ||
                (o.customer_phone || '').toLowerCase().includes(search)
            );
        }

        // Date filter
        if (dateFrom) {
            filtered = filtered.filter(o => o.created_at && o.created_at.slice(0, 10) >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(o => o.created_at && o.created_at.slice(0, 10) <= dateTo);
        }

        renderOrders(filtered);
    } catch (e) {
        console.error(e);
        document.getElementById('ordersTable').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e53935;padding:20px">Gagal memuat pesanan</td></tr>';
    }
}

function renderOrders(data) {
    const tbody = document.getElementById('ordersTable');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#999">Tidak ada pesanan</td></tr>';
        return;
    }

    const statusMap = { PENDING: 'badge-warning', CONFIRMED: 'badge-info', DONE: 'badge-success', CANCELLED: 'badge-danger' };
    const statusLabel = { PENDING: 'Menunggu', CONFIRMED: 'Dikonfirmasi', DONE: 'Selesai', CANCELLED: 'Dibatalkan' };

    tbody.innerHTML = data.map(o => {
        const time = new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        let actions = '';
        if (o.status === 'PENDING') {
            actions = `
                <button class="btn btn-success btn-sm" onclick="updateOrderStatus(${o.id},'CONFIRMED')" title="Konfirmasi">✓</button>
                <button class="btn btn-danger btn-sm" onclick="updateOrderStatus(${o.id},'CANCELLED')" title="Batalkan">✗</button>`;
        } else if (o.status === 'CONFIRMED') {
            actions = `
                <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${o.id},'DONE')" title="Selesai">✓ Selesai</button>
                <button class="btn btn-danger btn-sm" onclick="updateOrderStatus(${o.id},'CANCELLED')" title="Batalkan">✗</button>`;
        } else {
            actions = '<span style="color:#999;font-size:12px">—</span>';
        }

        return `<tr style="${o.status === 'PENDING' ? 'background:#fff8e1' : ''}">
            <td style="padding:8px 12px">
                <a href="#" onclick="showDetail(${o.id});return false" style="font-weight:600;color:var(--primary);text-decoration:none">${o.order_number}</a>
            </td>
            <td style="padding:8px 12px">${o.customer_name}<br><span style="font-size:11px;color:#999">${o.customer_phone}</span></td>
            <td style="padding:8px 12px;font-size:12px;max-width:220px">${o.items_summary || '-'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#666">${o.notes || '-'}</td>
            <td style="padding:8px 12px;text-align:right;font-weight:600">${formatRupiah(o.total)}</td>
            <td style="padding:8px 12px"><span class="badge ${statusMap[o.status]}">${statusLabel[o.status] || o.status}</span></td>
            <td style="padding:8px 12px;font-size:12px;color:#666">${time}</td>
            <td style="padding:8px 12px;text-align:center;white-space:nowrap">${actions}
                <button class="btn btn-outline btn-sm" onclick="showDetail(${o.id})" title="Detail" style="margin-left:2px">👁</button>
            </td>
        </tr>`;
    }).join('');
}

async function updateOrderStatus(id, status) {
    const labels = { CONFIRMED: 'Konfirmasi pesanan ini?', DONE: 'Tandai pesanan selesai?', CANCELLED: 'Batalkan pesanan ini? Stok akan dikembalikan.' };
    if (!confirm(labels[status] || 'Ubah status?')) return;
    try {
        await apiFetch(`/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        showToast(status === 'CONFIRMED' ? 'Pesanan dikonfirmasi!' : status === 'DONE' ? 'Pesanan selesai!' : 'Pesanan dibatalkan.', status === 'CANCELLED' ? 'warning' : 'success');
        loadOrders();
        loadOrderStats();
    } catch (e) {
        showToast('Gagal update status: ' + e.message, 'error');
    }
}

async function showDetail(id) {
    try {
        const { data } = await apiFetch(`/api/orders/${id}`);
        const o = data;
        const time = new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusLabel = { PENDING: 'Menunggu', CONFIRMED: 'Dikonfirmasi', DONE: 'Selesai', CANCELLED: 'Dibatalkan' };
        const statusMap = { PENDING: 'badge-warning', CONFIRMED: 'badge-info', DONE: 'badge-success', CANCELLED: 'badge-danger' };

        document.getElementById('detailTitle').textContent = 'Pesanan ' + o.order_number;

        let itemsHtml = o.items.map((item, i) => `
            <tr>
                <td style="padding:6px 10px">${i + 1}</td>
                <td style="padding:6px 10px">${item.product_name || '-'}<br><span style="font-size:11px;color:#999">${item.product_code || ''}</span></td>
                <td style="padding:6px 10px;text-align:center">${item.qty}</td>
                <td style="padding:6px 10px;text-align:right">${formatRupiah(item.price)}</td>
                <td style="padding:6px 10px;text-align:right;font-weight:600">${formatRupiah(item.subtotal)}</td>
            </tr>`).join('');

        document.getElementById('detailBody').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div>
                    <div style="font-size:12px;color:#999">Pelanggan</div>
                    <div style="font-weight:600">${o.customer_name}</div>
                    <div style="font-size:13px;color:#666">${o.customer_phone}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:12px;color:#999">Waktu Order</div>
                    <div style="font-size:13px">${time}</div>
                    <div style="margin-top:4px"><span class="badge ${statusMap[o.status]}">${statusLabel[o.status] || o.status}</span></div>
                </div>
            </div>
            ${o.notes ? `<div style="background:#f5f5f5;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:13px"><strong>Catatan:</strong> ${escapeHtml(o.notes)}</div>` : ''}
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="background:#f5f5f5">
                        <th style="padding:8px 10px;text-align:left;font-size:12px">No</th>
                        <th style="padding:8px 10px;text-align:left;font-size:12px">Produk</th>
                        <th style="padding:8px 10px;text-align:center;font-size:12px">Qty</th>
                        <th style="padding:8px 10px;text-align:right;font-size:12px">Harga</th>
                        <th style="padding:8px 10px;text-align:right;font-size:12px">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                    <tr style="border-top:2px solid #ddd">
                        <td colspan="4" style="padding:10px;text-align:right;font-weight:700">Total</td>
                        <td style="padding:10px;text-align:right;font-weight:700;font-size:16px;color:var(--primary)">${formatRupiah(o.total)}</td>
                    </tr>
                </tfoot>
            </table>`;

        // Footer actions
        let footerActions = `<button class="btn btn-outline" onclick="closeDetail()">Tutup</button>
            <button class="btn btn-primary" onclick="printOrder(${o.id})" style="margin-left:8px">🖨 Cetak</button>`;
        if (o.status === 'PENDING') {
            footerActions += ` <button class="btn btn-success" onclick="closeDetail();updateOrderStatus(${o.id},'CONFIRMED')" style="margin-left:8px">✓ Konfirmasi</button>`;
        } else if (o.status === 'CONFIRMED') {
            footerActions += ` <button class="btn btn-primary" onclick="closeDetail();updateOrderStatus(${o.id},'DONE')" style="margin-left:8px">✓ Selesai</button>`;
        }
        document.getElementById('detailFooter').innerHTML = footerActions;

        document.getElementById('detailModal').style.display = 'flex';
    } catch (e) {
        showToast('Gagal memuat detail pesanan', 'error');
    }
}

function closeDetail() {
    document.getElementById('detailModal').style.display = 'none';
}

// Close modal on overlay click
document.getElementById('detailModal').addEventListener('click', function (e) {
    if (e.target === this) closeDetail();
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function printOrder(id) {
    try {
        const { data } = await apiFetch(`/api/orders/${id}`);
        const o = data;
        const time = new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusLabel = { PENDING: 'Menunggu', CONFIRMED: 'Dikonfirmasi', DONE: 'Selesai', CANCELLED: 'Dibatalkan' };

        const itemRows = o.items.map((item, i) => `
            <tr>
                <td style="padding:4px 8px;border-bottom:1px solid #eee">${i + 1}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee">${item.product_name}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${item.qty}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatRupiah(item.price)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatRupiah(item.subtotal)}</td>
            </tr>`).join('');

        const win = window.open('', '_blank', 'width=400,height=600');
        win.document.write(`<!DOCTYPE html><html><head><title>Pesanan ${o.order_number}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 13px; color: #333; }
                h2 { text-align: center; margin: 0 0 4px; font-size: 16px; }
                .subtitle { text-align: center; color: #999; font-size: 11px; margin-bottom: 16px; }
                .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin: 12px 0; }
                th { background: #f5f5f5; padding: 6px 8px; text-align: left; font-size: 11px; }
                .total { text-align: right; font-size: 16px; font-weight: 700; padding-top: 8px; border-top: 2px solid #333; }
                .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #999; }
                @media print { body { padding: 0; } }
            </style></head><body>
            <h2>Sagara Meat House</h2>
            <div class="subtitle">Pesanan Online</div>
            <hr>
            <div class="info-row"><span>No. Order:</span><strong>${o.order_number}</strong></div>
            <div class="info-row"><span>Pelanggan:</span><span>${o.customer_name} (${o.customer_phone})</span></div>
            <div class="info-row"><span>Waktu:</span><span>${time}</span></div>
            <div class="info-row"><span>Status:</span><span>${statusLabel[o.status] || o.status}</span></div>
            ${o.notes ? `<div class="info-row"><span>Catatan:</span><span>${o.notes}</span></div>` : ''}
            <table>
                <thead><tr><th>No</th><th>Produk</th><th style="text-align:center">Qty</th><th style="text-align:right">Harga</th><th style="text-align:right">Subtotal</th></tr></thead>
                <tbody>${itemRows}</tbody>
            </table>
            <div class="total">${formatRupiah(o.total)}</div>
            <div class="footer">Terima kasih telah berbelanja di Sagara Meat House</div>
            <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
    } catch (e) {
        showToast('Gagal mencetak pesanan', 'error');
    }
}

function exportCSV() {
    const activeBtn = document.querySelector('.order-filter-btn.active');
    const status = activeBtn ? activeBtn.dataset.status : '';
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;

    let filtered = [...allOrders];
    if (search) {
        filtered = filtered.filter(o =>
            (o.order_number || '').toLowerCase().includes(search) ||
            (o.customer_name || '').toLowerCase().includes(search) ||
            (o.customer_phone || '').toLowerCase().includes(search)
        );
    }
    if (dateFrom) filtered = filtered.filter(o => o.created_at && o.created_at.slice(0, 10) >= dateFrom);
    if (dateTo) filtered = filtered.filter(o => o.created_at && o.created_at.slice(0, 10) <= dateTo);

    if (!filtered.length) { showToast('Tidak ada data untuk diexport', 'warning'); return; }

    const statusLabel = { PENDING: 'Menunggu', CONFIRMED: 'Dikonfirmasi', DONE: 'Selesai', CANCELLED: 'Dibatalkan' };
    const header = ['No. Order', 'Pelanggan', 'Telepon', 'Item', 'Catatan', 'Total', 'Status', 'Waktu'];
    const rows = filtered.map(o => [
        o.order_number,
        o.customer_name,
        o.customer_phone,
        `"${(o.items_summary || '').replace(/"/g, '""')}"`,
        `"${(o.notes || '').replace(/"/g, '""')}"`,
        o.total,
        statusLabel[o.status] || o.status,
        new Date(o.created_at).toLocaleString('id-ID')
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pesanan-online-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV berhasil didownload');
}
