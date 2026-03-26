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
            const { data, grand } = await apiFetch('/api/sales/summary');
            document.getElementById('channelStats').innerHTML = `
              <table style="width:100%;font-size:13px;border-collapse:collapse">
                <thead><tr style="background:#f5f7fa"><th style="padding:8px;text-align:left">Channel</th><th style="padding:8px;text-align:right">Transaksi</th><th style="padding:8px;text-align:right">Total</th></tr></thead>
                <tbody>
                  <tr><td style="padding:8px">${channelBadge('DIRECT')} Langsung</td><td style="text-align:right;padding:8px">${data.DIRECT.count}</td><td style="text-align:right;padding:8px">${formatRupiah(data.DIRECT.total)}</td></tr>
                  <tr><td style="padding:8px">${channelBadge('SHOPEE')} Shopee</td><td style="text-align:right;padding:8px">${data.SHOPEE.count}</td><td style="text-align:right;padding:8px">${formatRupiah(data.SHOPEE.total)}</td></tr>
                  <tr><td style="padding:8px">${channelBadge('TOKOPEDIA')} Tokopedia</td><td style="text-align:right;padding:8px">${data.TOKOPEDIA.count}</td><td style="text-align:right;padding:8px">${formatRupiah(data.TOKOPEDIA.total)}</td></tr>
                  <tr style="font-weight:700;border-top:2px solid #e0e0e0"><td style="padding:8px">Total</td><td style="text-align:right;padding:8px">${grand.count}</td><td style="text-align:right;padding:8px">${formatRupiah(grand.total)}</td></tr>
                </tbody>
              </table>`;
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
})();
