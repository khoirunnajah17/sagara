/* dashboard.js */
(async () => {
    await requireLogin();

    async function loadDashboard() {
        try {
            const { data } = await apiFetch('/api/reports/dashboard');
            document.getElementById('statAsset').textContent    = formatRupiah(data.totalAsset);
            document.getElementById('statRevenue').textContent  = formatRupiah(data.totalRevenue);
            document.getElementById('statPurchase').textContent = formatRupiah(data.totalPurchase);
            document.getElementById('statLow').textContent      = data.lowStock + ' produk';
        } catch (e) { console.error(e); }
    }

    async function loadChannelStats() {
        try {
            const { grand } = await apiFetch('/api/sales/summary');
            document.getElementById('channelStats').innerHTML = `
              <div style="font-size:15px;padding:12px">
                <div style="font-weight:700">Total Penjualan</div>
                <div style="font-size:20px;margin-top:8px">${formatRupiah(grand.total)}</div>
                <div style="color:#757575;font-size:13px;margin-top:4px">${grand.count} transaksi</div>
              </div>`;
        } catch (e) { console.error(e); }
    }

    async function loadRecentSales() {
        try {
            const { data } = await apiFetch('/api/reports/dashboard');
            const tbody = document.getElementById('recentSales');
            if (!data.recentSales || !data.recentSales.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#757575">Belum ada data</td></tr>'; return; }
            tbody.innerHTML = data.recentSales.map(s => `
              <tr>
                <td>${s.invoice_number}</td>
                <td>${s.customer_name}</td>
                <td class="text-right">${formatRupiah(s.total)}</td>
                <td>${statusBadge(s.status)}</td>
              </tr>`).join('');
        } catch (e) { console.error(e); }
    }

    loadDashboard();
    loadChannelStats();
    loadRecentSales();
    loadLowStock();
    loadOrders();
    loadOrderNotif();

    // Auto-refresh orders every 15 seconds
    setInterval(() => {
        loadOrderNotif();
        if (document.querySelector('.order-filter-btn.active')?.dataset.status === '' ||
            document.querySelector('.order-filter-btn.active')?.dataset.status === 'PENDING') {
            loadOrders();
        }
    }, 15000);

    // Order filter buttons
    document.querySelectorAll('.order-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.order-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadOrders(btn.dataset.status);
        });
    });

    // Order bell click
    document.getElementById('orderBell').addEventListener('click', () => {
        document.getElementById('orderAlert').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
})();

async function loadLowStock() {
    try {
        const { data } = await apiFetch('/api/reports/low-stock');
        const badge = document.getElementById('notifBadge');
        const alert = document.getElementById('lowStockAlert');
        const list = document.getElementById('lowStockList');
        if (!data.length) {
            badge.style.display = 'none';
            alert.style.display = 'none';
            return;
        }
        badge.textContent = data.length;
        badge.style.display = 'flex';
        alert.style.display = 'flex';
        list.innerHTML = data.map(p =>
            `<div style="margin-bottom:3px">• <strong>${p.name}</strong> (${p.code}) — sisa <span style="color:#c62828;font-weight:700">${formatNum(p.stock)}</span> ${p.unit || 'unit'}</div>`
        ).join('');
        // Click bell scrolls to alert
        document.getElementById('notifBell').addEventListener('click', () => {
            alert.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    } catch (e) { console.error(e); }
}

// ── Order Notifications ──────────────────────────────────────
let lastPendingCount = 0;

async function loadOrderNotif() {
    try {
        const { count } = await apiFetch('/api/orders/pending-count');
        const badge = document.getElementById('orderBadge');
        const alertEl = document.getElementById('orderAlert');

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';

            // New order came in!
            if (count > lastPendingCount && lastPendingCount >= 0) {
                playNotifSound();
                alertEl.style.display = 'flex';
            }
        } else {
            badge.style.display = 'none';
            alertEl.style.display = 'none';
        }
        lastPendingCount = count;
    } catch (e) { console.error(e); }
}

function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        // Two-tone notification
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
}

async function loadOrders(status) {
    if (status === undefined) {
        const active = document.querySelector('.order-filter-btn.active');
        status = active ? active.dataset.status : '';
    }
    try {
        const qs = status ? `?status=${status}` : '';
        const { data } = await apiFetch(`/api/orders${qs}`);
        const tbody = document.getElementById('ordersTable');
        const alertList = document.getElementById('orderAlertList');

        // Update alert with pending orders
        const pending = data.filter(o => o.status === 'PENDING');
        if (pending.length > 0) {
            document.getElementById('orderAlert').style.display = 'flex';
            alertList.innerHTML = pending.map(o =>
                `<div style="margin-bottom:3px">• <strong>${o.order_number}</strong> — ${o.customer_name} (${o.customer_phone}) — ${formatRupiah(o.total)}</div>`
            ).join('');
        }

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">Tidak ada pesanan</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(o => {
            const time = new Date(o.created_at).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
            const statusMap = { PENDING:'badge-warning', CONFIRMED:'badge-info', DONE:'badge-success', CANCELLED:'badge-danger' };
            const statusLabel = { PENDING:'Menunggu', CONFIRMED:'Dikonfirmasi', DONE:'Selesai', CANCELLED:'Dibatalkan' };
            const actions = o.status === 'PENDING'
                ? `<button class="btn btn-success btn-sm" onclick="updateOrderStatus(${o.id},'CONFIRMED')">✓ Konfirmasi</button>
                   <button class="btn btn-danger btn-sm" onclick="updateOrderStatus(${o.id},'CANCELLED')">✗ Batal</button>`
                : o.status === 'CONFIRMED'
                ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${o.id},'DONE')">✓ Selesai</button>
                   <button class="btn btn-danger btn-sm" onclick="updateOrderStatus(${o.id},'CANCELLED')">✗ Batal</button>`
                : '<span style="color:#999;font-size:12px">—</span>';

            return `<tr style="${o.status==='PENDING'?'background:#fff8e1':''}">
              <td style="padding:8px 12px;font-weight:600">${o.order_number}</td>
              <td style="padding:8px 12px">${o.customer_name}<br><span style="font-size:11px;color:#999">${o.customer_phone}</span></td>
              <td style="padding:8px 12px;font-size:12px;max-width:200px">${o.items_summary || '-'}</td>
              <td style="padding:8px 12px;font-size:12px;color:#666">${o.notes || '-'}</td>
              <td style="padding:8px 12px;text-align:right;font-weight:600">${formatRupiah(o.total)}</td>
              <td style="padding:8px 12px"><span class="badge ${statusMap[o.status]}">${statusLabel[o.status]||o.status}</span></td>
              <td style="padding:8px 12px;font-size:12px;color:#666">${time}</td>
              <td style="padding:8px 12px;text-align:center;white-space:nowrap">${actions}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('ordersTable').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e53935;padding:20px">Gagal memuat pesanan</td></tr>';
    }
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
        loadOrderNotif();
    } catch (e) {
        showToast('Gagal update status: ' + e.message, 'error');
    }
}
