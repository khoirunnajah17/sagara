/* reports.js */
let activeReport = 'balance-sheet';

(async () => {
    await requireLogin();

    document.querySelectorAll('.tab-btn[data-report]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-report]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeReport = btn.dataset.report;
            document.getElementById('dateFilter').style.display =
                (activeReport === 'income-statement' || activeReport === 'sales-report' || activeReport === 'sales-per-user') ? 'flex' : 'none';
            document.getElementById('yearFilter').style.display =
                (activeReport === 'monthly') ? 'flex' : 'none';
            loadReport();
        });
    });

    document.getElementById('btnFilter').addEventListener('click', loadReport);
    document.getElementById('btnFilterYear').addEventListener('click', loadReport);
    document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
    document.getElementById('btnPrint').addEventListener('click', () => window.print());
    loadReport();
})();

async function loadReport() {
    const container = document.getElementById('reportContent');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#757575">Memuat...</div>';
    try {
        if (activeReport === 'balance-sheet')    await renderBalanceSheet(container);
        else if (activeReport === 'income-statement') await renderIncomeStatement(container);
        else if (activeReport === 'trial-balance')    await renderTrialBalance(container);
        else if (activeReport === 'monthly')          await renderMonthlyReport(container);
        else if (activeReport === 'sales-report')     await renderSalesReport(container);
        else if (activeReport === 'sales-per-user')    await renderSalesPerUser(container);
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#e53935">Gagal memuat laporan: ${e.message}</div>`;
    }
}

async function renderBalanceSheet(container) {
    const { data } = await apiFetch('/api/reports/balance-sheet');

    const rows = (list) => list.map(a => `
        <tr>
          <td style="padding:8px 14px">${a.code}</td>
          <td style="padding:8px 14px">${a.name}</td>
          <td style="padding:8px 14px;text-align:right">${formatRupiah(a.balance)}</td>
        </tr>`).join('');

    container.innerHTML = `
      <div style="max-width:860px">
        <h2 style="text-align:center;margin-bottom:4px">NERACA</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">Per ${new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <!-- ASET -->
          <div class="card">
            <h4 style="margin-bottom:12px;color:#1a237e">ASET</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr style="background:#f5f7fa"><th style="padding:8px 14px;text-align:left">Kode</th><th style="padding:8px 14px;text-align:left">Nama</th><th style="padding:8px 14px;text-align:right">Saldo</th></tr></thead>
              <tbody>${rows(data.assets)}</tbody>
              <tfoot><tr style="border-top:2px solid #1a237e;font-weight:700"><td colspan="2" style="padding:8px 14px">Total Aset</td><td style="padding:8px 14px;text-align:right">${formatRupiah(data.totalAssets)}</td></tr></tfoot>
            </table>
          </div>
          <!-- KEWAJIBAN + EKUITAS -->
          <div>
            <div class="card" style="margin-bottom:16px">
              <h4 style="margin-bottom:12px;color:#1a237e">KEWAJIBAN</h4>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead><tr style="background:#f5f7fa"><th style="padding:8px 14px;text-align:left">Kode</th><th style="padding:8px 14px;text-align:left">Nama</th><th style="padding:8px 14px;text-align:right">Saldo</th></tr></thead>
                <tbody>${rows(data.liabilities)}</tbody>
                <tfoot><tr style="border-top:2px solid #1a237e;font-weight:700"><td colspan="2" style="padding:8px 14px">Total Kewajiban</td><td style="padding:8px 14px;text-align:right">${formatRupiah(data.totalLiabilities)}</td></tr></tfoot>
              </table>
            </div>
            <div class="card">
              <h4 style="margin-bottom:12px;color:#1a237e">EKUITAS</h4>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead><tr style="background:#f5f7fa"><th style="padding:8px 14px;text-align:left">Kode</th><th style="padding:8px 14px;text-align:left">Nama</th><th style="padding:8px 14px;text-align:right">Saldo</th></tr></thead>
                <tbody>${rows(data.equities)}</tbody>
                <tfoot><tr style="border-top:2px solid #1a237e;font-weight:700"><td colspan="2" style="padding:8px 14px">Total Ekuitas</td><td style="padding:8px 14px;text-align:right">${formatRupiah(data.totalEquity)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
        <div style="margin-top:16px;text-align:right;font-size:14px;font-weight:700;background:#e8eaf6;padding:12px 20px;border-radius:8px">
          Total Kewajiban + Ekuitas = ${formatRupiah(data.totalLiabilities + data.totalEquity)}
        </div>
      </div>`;
}

async function renderIncomeStatement(container) {
    const from = document.getElementById('filterFrom').value;
    const to   = document.getElementById('filterTo').value;
    let qs = '?';
    if (from) qs += `from=${from}&`;
    if (to)   qs += `to=${to}&`;
    const { data } = await apiFetch(`/api/reports/income-statement${qs}`);

    const rows = (list) => list.map(a => `
        <tr>
          <td style="padding:8px 14px">${a.code}</td>
          <td style="padding:8px 14px">${a.name}</td>
          <td style="padding:8px 14px;text-align:right">${formatRupiah(a.balance)}</td>
        </tr>`).join('');

    const netColor = data.netIncome >= 0 ? '#2e7d32' : '#c62828';
    container.innerHTML = `
      <div class="card" style="max-width:640px;margin:0 auto">
        <h2 style="text-align:center;margin-bottom:4px">LAPORAN LABA RUGI</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">
          ${from&&to?`Periode ${formatDate(from)} s/d ${formatDate(to)}`:'Semua Periode'}
        </p>
        <h4 style="margin-bottom:8px;color:#1a237e">PENDAPATAN</h4>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <thead><tr style="background:#f5f7fa"><th style="padding:8px 14px;text-align:left">Kode</th><th style="padding:8px 14px;text-align:left">Nama</th><th style="padding:8px 14px;text-align:right">Jumlah</th></tr></thead>
          <tbody><tr><td colspan="2" style="padding:8px 14px">Pendapatan Penjualan</td><td style="text-align:right;padding:8px 14px">${formatRupiah(data.totalRevenue)}</td></tr></tbody>
          <tfoot><tr style="font-weight:700;border-top:2px solid #1a237e"><td colspan="2" style="padding:8px 14px">Total Pendapatan</td><td style="padding:8px 14px;text-align:right">${formatRupiah(data.totalRevenue)}</td></tr></tfoot>
        </table>
        <h4 style="margin-bottom:8px;color:#1a237e">BEBAN</h4>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <thead><tr style="background:#f5f7fa"><th style="padding:8px 14px;text-align:left">Kode</th><th style="padding:8px 14px;text-align:left">Nama</th><th style="padding:8px 14px;text-align:right">Jumlah</th></tr></thead>
          <tbody>${rows(data.expenses)}</tbody>
          <tfoot><tr style="font-weight:700;border-top:2px solid #1a237e"><td colspan="2" style="padding:8px 14px">Total Beban</td><td style="padding:8px 14px;text-align:right">${formatRupiah(data.totalExpense)}</td></tr></tfoot>
        </table>
        <div style="background:${data.netIncome>=0?'#e8f5e9':'#ffebee'};border-radius:8px;padding:14px 20px;display:flex;justify-content:space-between;font-size:16px;font-weight:700">
          <span style="color:${netColor}">${data.netIncome>=0?'LABA BERSIH':'RUGI BERSIH'}</span>
          <span style="color:${netColor}">${formatRupiah(Math.abs(data.netIncome))}</span>
        </div>
      </div>`;
}

async function renderTrialBalance(container) {
    const { data, totalDebit, totalCredit } = await apiFetch('/api/reports/trial-balance');
    const typeLabel = { ASSET:'Aset', LIABILITY:'Kewajiban', EQUITY:'Ekuitas', REVENUE:'Pendapatan', EXPENSE:'Beban' };
    const rows = data.map(a => `
        <tr>
          <td style="padding:8px 12px">${a.code}</td>
          <td style="padding:8px 12px">${a.name}</td>
          <td style="padding:8px 12px">${typeLabel[a.type]||a.type}</td>
          <td style="padding:8px 12px;text-align:right">${a.total_debit>0?formatRupiah(a.total_debit):'-'}</td>
          <td style="padding:8px 12px;text-align:right">${a.total_credit>0?formatRupiah(a.total_credit):'-'}</td>
          <td style="padding:8px 12px;text-align:right">${formatRupiah(a.balance)}</td>
        </tr>`).join('');

    container.innerHTML = `
      <div class="card">
        <h2 style="text-align:center;margin-bottom:4px">NERACA SALDO</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">Per ${new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}</p>
        <div class="table-container">
          <table>
            <thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th class="text-right">Total Debit</th><th class="text-right">Total Kredit</th><th class="text-right">Saldo</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:2px solid #1a237e;background:#f5f7fa">
                <td colspan="3" style="padding:10px 12px">TOTAL</td>
                <td style="padding:10px 12px;text-align:right">${formatRupiah(totalDebit)}</td>
                <td style="padding:10px 12px;text-align:right">${formatRupiah(totalCredit)}</td>
                <td style="padding:10px 12px"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
}

// ── Monthly Sales & Purchases Report ─────────────────────────
const BULAN_NAMES = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

async function renderMonthlyReport(container) {
    const yearSel = document.getElementById('filterYear');
    const yearVal = yearSel.value || new Date().getFullYear();
    const { data } = await apiFetch(`/api/reports/monthly?year=${yearVal}`);

    // Populate year filter
    if (!yearSel.options.length || yearSel.dataset.loaded !== '1') {
        yearSel.innerHTML = data.availableYears.map(y => `<option value="${y}" ${y==data.year?'selected':''}>${y}</option>`).join('');
        if (!data.availableYears.length) yearSel.innerHTML = `<option value="${data.year}">${data.year}</option>`;
        yearSel.dataset.loaded = '1';
    }

    // Find max value for bar chart scaling
    const maxVal = Math.max(...data.months.map(m => Math.max(m.penjualan_total + m.order_total, m.pembelian_total)), 1);

    // Monthly table rows
    const monthRows = data.months.map(m => {
        const totalMasuk = m.penjualan_total + m.order_total;
        const isActive = m.penjualan_count > 0 || m.pembelian_count > 0 || m.order_count > 0;
        const labaColor = m.laba_kotor >= 0 ? '#2e7d32' : '#c62828';
        const salePct = maxVal > 0 ? (totalMasuk / maxVal * 100) : 0;
        const purchPct = maxVal > 0 ? (m.pembelian_total / maxVal * 100) : 0;
        return `
        <tr style="${!isActive ? 'opacity:0.5' : ''}">
          <td style="padding:10px 12px;font-weight:600">${BULAN_NAMES[m.bulan]}</td>
          <td style="padding:10px 12px;text-align:center">${m.penjualan_count}</td>
          <td style="padding:10px 12px;text-align:right;color:#1b5e20;font-weight:600">${formatRupiah(m.penjualan_total)}</td>
          <td style="padding:10px 12px;text-align:center">${m.order_count}</td>
          <td style="padding:10px 12px;text-align:right;color:#0d47a1;font-weight:600">${formatRupiah(m.order_total)}</td>
          <td style="padding:10px 12px;text-align:center">${m.pembelian_count}</td>
          <td style="padding:10px 12px;text-align:right;color:#b71c1c;font-weight:600">${formatRupiah(m.pembelian_total)}</td>
          <td style="padding:10px 12px;text-align:right;color:${labaColor};font-weight:700">${formatRupiah(m.laba_kotor)}</td>
          <td style="padding:10px 12px;min-width:120px">
            <div style="display:flex;flex-direction:column;gap:2px">
              <div style="background:#c8e6c9;border-radius:3px;height:8px;overflow:hidden"><div style="background:#43a047;height:100%;width:${salePct}%;border-radius:3px"></div></div>
              <div style="background:#ffcdd2;border-radius:3px;height:8px;overflow:hidden"><div style="background:#e53935;height:100%;width:${purchPct}%;border-radius:3px"></div></div>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Top products
    const topRows = data.topProducts.map((p, i) => `
        <tr>
          <td style="padding:6px 10px">${i+1}</td>
          <td style="padding:6px 10px">${p.code}</td>
          <td style="padding:6px 10px">${p.name}</td>
          <td style="padding:6px 10px;text-align:right">${formatNum(p.qty)}</td>
          <td style="padding:6px 10px;text-align:right">${formatRupiah(p.revenue)}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:14px;color:#999">-</td></tr>';

    // Top suppliers
    const supplierRows = data.topSuppliers.map((s, i) => `
        <tr>
          <td style="padding:6px 10px">${i+1}</td>
          <td style="padding:6px 10px">${s.supplier_name}</td>
          <td style="padding:6px 10px;text-align:right">${s.jumlah_po}</td>
          <td style="padding:6px 10px;text-align:right">${formatRupiah(s.total)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:14px;color:#999">-</td></tr>';

    const labaKotorColor = data.totalLabaKotor >= 0 ? '#2e7d32' : '#c62828';
    const labaKotorBg = data.totalLabaKotor >= 0 ? '#e8f5e9' : '#ffebee';

    container.innerHTML = `
      <div>
        <h2 style="text-align:center;margin-bottom:4px">MANAJEMEN PENJUALAN & PEMBELIAN BULANAN</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">Tahun ${data.year}</p>

        <!-- Summary Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px">
          <div style="background:#e8f5e9;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#2e7d32;font-weight:600;margin-bottom:4px">Total Penjualan</div>
            <div style="font-size:20px;font-weight:800;color:#1b5e20">${formatRupiah(data.totalPenjualan)}</div>
            <div style="font-size:11px;color:#4caf50;margin-top:2px">${data.totalTxSales} transaksi</div>
          </div>
          <div style="background:#e3f2fd;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#1565c0;font-weight:600;margin-bottom:4px">Order Online</div>
            <div style="font-size:20px;font-weight:800;color:#0d47a1">${formatRupiah(data.totalOrder)}</div>
            <div style="font-size:11px;color:#42a5f5;margin-top:2px">${data.totalTxOrders} order</div>
          </div>
          <div style="background:#ffebee;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#c62828;font-weight:600;margin-bottom:4px">Total Pembelian</div>
            <div style="font-size:20px;font-weight:800;color:#b71c1c">${formatRupiah(data.totalPembelian)}</div>
            <div style="font-size:11px;color:#ef5350;margin-top:2px">${data.totalTxPurchases} transaksi</div>
          </div>
          <div style="background:${labaKotorBg};border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:${labaKotorColor};font-weight:600;margin-bottom:4px">${data.totalLabaKotor >= 0 ? 'Laba Kotor' : 'Rugi Kotor'}</div>
            <div style="font-size:20px;font-weight:800;color:${labaKotorColor}">${formatRupiah(Math.abs(data.totalLabaKotor))}</div>
            <div style="font-size:11px;color:#757575;margin-top:2px">Penjualan - Pembelian</div>
          </div>
        </div>

        <!-- Monthly Table -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><span class="card-title">Ringkasan Per Bulan</span></div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th class="text-center" style="color:#2e7d32">Jual</th>
                  <th class="text-right" style="color:#2e7d32">Penjualan</th>
                  <th class="text-center" style="color:#1565c0">Order</th>
                  <th class="text-right" style="color:#1565c0">Order Online</th>
                  <th class="text-center" style="color:#c62828">Beli</th>
                  <th class="text-right" style="color:#c62828">Pembelian</th>
                  <th class="text-right">Laba Kotor</th>
                  <th>Grafik</th>
                </tr>
              </thead>
              <tbody>${monthRows}</tbody>
              <tfoot>
                <tr style="font-weight:700;border-top:2px solid #1a237e;background:#f5f7fa">
                  <td style="padding:10px 12px">TOTAL</td>
                  <td style="padding:10px 12px;text-align:center">${data.totalTxSales}</td>
                  <td style="padding:10px 12px;text-align:right;color:#1b5e20">${formatRupiah(data.totalPenjualan)}</td>
                  <td style="padding:10px 12px;text-align:center">${data.totalTxOrders}</td>
                  <td style="padding:10px 12px;text-align:right;color:#0d47a1">${formatRupiah(data.totalOrder)}</td>
                  <td style="padding:10px 12px;text-align:center">${data.totalTxPurchases}</td>
                  <td style="padding:10px 12px;text-align:right;color:#b71c1c">${formatRupiah(data.totalPembelian)}</td>
                  <td style="padding:10px 12px;text-align:right;color:${labaKotorColor}">${formatRupiah(data.totalLabaKotor)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Bar Chart Visual -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><span class="card-title">📊 Grafik Penjualan vs Pembelian</span></div>
          <div style="padding:16px;display:flex;align-items:flex-end;gap:8px;height:200px;border-bottom:2px solid #e0e0e0;margin-bottom:8px">
            ${data.months.map(m => {
                const totalMasuk = m.penjualan_total + m.order_total;
                const saleH = maxVal > 0 ? (totalMasuk / maxVal * 160) : 0;
                const purchH = maxVal > 0 ? (m.pembelian_total / maxVal * 160) : 0;
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
                  <div style="display:flex;gap:2px;align-items:flex-end;height:170px">
                    <div style="width:14px;background:#43a047;border-radius:3px 3px 0 0;height:${Math.max(saleH, 2)}px" title="Penjualan: ${formatRupiah(totalMasuk)}"></div>
                    <div style="width:14px;background:#e53935;border-radius:3px 3px 0 0;height:${Math.max(purchH, 2)}px" title="Pembelian: ${formatRupiah(m.pembelian_total)}"></div>
                  </div>
                  <div style="font-size:10px;color:#666;font-weight:600">${BULAN_NAMES[m.bulan].substring(0,3)}</div>
                </div>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:16px;justify-content:center;padding:8px;font-size:12px">
            <span><span style="display:inline-block;width:12px;height:12px;background:#43a047;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Penjualan</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:#e53935;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Pembelian</span>
          </div>
        </div>

        <!-- Bottom grid: Top Products + Top Suppliers -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="card">
            <div class="card-header"><span class="card-title">🏆 Produk Terlaris ${data.year}</span></div>
            <div class="table-container">
              <table style="font-size:13px">
                <thead><tr><th>#</th><th>Kode</th><th>Produk</th><th class="text-right">Qty</th><th class="text-right">Pendapatan</th></tr></thead>
                <tbody>${topRows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">🏪 Supplier Terbesar ${data.year}</span></div>
            <div class="table-container">
              <table style="font-size:13px">
                <thead><tr><th>#</th><th>Supplier</th><th class="text-right">PO</th><th class="text-right">Total</th></tr></thead>
                <tbody>${supplierRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
}

// ── Sales Report ─────────────────────────────────────────────
async function renderSalesReport(container) {
    const from = document.getElementById('filterFrom').value;
    const to   = document.getElementById('filterTo').value;
    let qs = '?';
    if (from) qs += `from=${from}&`;
    if (to)   qs += `to=${to}&`;
    const { data } = await apiFetch(`/api/reports/sales-report${qs}`);

    const statusBadge = (s) => {
        const map = { DONE:'badge-success', CONFIRMED:'badge-info', DRAFT:'badge-warning', PENDING:'badge-warning', SHIPPED:'badge-info', CANCELLED:'badge-danger' };
        return `<span class="badge ${map[s]||'badge-secondary'}">${s}</span>`;
    };

    const txRows = data.transactions.map(t => `
        <tr>
          <td style="padding:8px 12px">${t.nomor}</td>
          <td style="padding:8px 12px">${formatDate(t.tanggal)}</td>
          <td style="padding:8px 12px">${t.pelanggan}</td>
          <td style="padding:8px 12px"><span class="badge ${t.sumber==='Order Online'?'badge-info':'badge-success'}" style="font-size:11px">${t.sumber}</span></td>
          <td style="padding:8px 12px;text-align:right">${formatRupiah(t.total)}</td>
          <td style="padding:8px 12px;text-align:center">${statusBadge(t.status)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999">Tidak ada data penjualan</td></tr>';

    const topRows = data.topProducts.map((p, i) => `
        <tr>
          <td style="padding:6px 12px">${i+1}</td>
          <td style="padding:6px 12px">${p.code}</td>
          <td style="padding:6px 12px">${p.name}</td>
          <td style="padding:6px 12px;text-align:right">${p.qty}</td>
          <td style="padding:6px 12px;text-align:right">${formatRupiah(p.revenue)}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:14px;color:#999">-</td></tr>';

    const dailyRows = data.dailySummary.map(d => `
        <tr>
          <td style="padding:6px 12px">${formatDate(d.tanggal)}</td>
          <td style="padding:6px 12px;text-align:right">${d.jumlah_transaksi}</td>
          <td style="padding:6px 12px;text-align:right">${formatRupiah(d.total)}</td>
        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:14px;color:#999">-</td></tr>';

    container.innerHTML = `
      <div>
        <h2 style="text-align:center;margin-bottom:4px">LAPORAN PENJUALAN</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">
          ${from&&to?`Periode ${formatDate(from)} s/d ${formatDate(to)}`:'Semua Periode'}
        </p>

        <!-- Summary Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px">
          <div style="background:#e8f5e9;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#2e7d32;font-weight:600;margin-bottom:4px">Penjualan Langsung</div>
            <div style="font-size:20px;font-weight:800;color:#1b5e20">${formatRupiah(data.totalSales)}</div>
            <div style="font-size:11px;color:#4caf50;margin-top:2px">${data.salesCount} transaksi</div>
          </div>
          <div style="background:#e3f2fd;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#1565c0;font-weight:600;margin-bottom:4px">Order Online</div>
            <div style="font-size:20px;font-weight:800;color:#0d47a1">${formatRupiah(data.totalOrders)}</div>
            <div style="font-size:11px;color:#42a5f5;margin-top:2px">${data.ordersCount} order</div>
          </div>
          <div style="background:#fff3e0;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:12px;color:#e65100;font-weight:600;margin-bottom:4px">Total Penjualan</div>
            <div style="font-size:20px;font-weight:800;color:#bf360c">${formatRupiah(data.grandTotal)}</div>
            <div style="font-size:11px;color:#ff9800;margin-top:2px">${data.salesCount + data.ordersCount} total transaksi</div>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><span class="card-title">Daftar Transaksi</span></div>
          <div class="table-container">
            <table>
              <thead><tr><th>No. Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Sumber</th><th class="text-right">Total</th><th class="text-center">Status</th></tr></thead>
              <tbody>${txRows}</tbody>
              <tfoot>
                <tr style="font-weight:700;border-top:2px solid var(--primary);background:#faf5f0">
                  <td colspan="4" style="padding:10px 12px">GRAND TOTAL</td>
                  <td style="padding:10px 12px;text-align:right">${formatRupiah(data.grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Bottom grid: Top Products + Daily Summary -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="card">
            <div class="card-header"><span class="card-title">🏆 Produk Terlaris</span></div>
            <div class="table-container">
              <table style="font-size:13px">
                <thead><tr><th>#</th><th>Kode</th><th>Produk</th><th class="text-right">Qty</th><th class="text-right">Pendapatan</th></tr></thead>
                <tbody>${topRows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">📅 Ringkasan Harian</span></div>
            <div class="table-container">
              <table style="font-size:13px">
                <thead><tr><th>Tanggal</th><th class="text-right">Transaksi</th><th class="text-right">Total</th></tr></thead>
                <tbody>${dailyRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
}

// ── Sales Per User Report ────────────────────────────────────
async function renderSalesPerUser(container) {
    const from = document.getElementById('filterFrom').value;
    const to   = document.getElementById('filterTo').value;
    let qs = '?';
    if (from) qs += `from=${from}&`;
    if (to)   qs += `to=${to}&`;
    const { data } = await apiFetch(`/api/reports/sales-per-user${qs}`);

    const colors = ['#e8f5e9','#e3f2fd','#fff3e0','#fce4ec','#f3e5f5','#e0f7fa','#fff8e1','#f1f8e9'];
    const userCards = data.perUser.map((u, i) => {
        const bg = colors[i % colors.length];
        const pct = data.grandTotal > 0 ? ((parseFloat(u.total_penjualan) / data.grandTotal) * 100).toFixed(1) : 0;
        return `
        <div style="background:${bg};border-radius:10px;padding:16px">
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">${u.username || 'Tanpa User'}</div>
          <div style="font-size:11px;color:#666;margin-bottom:8px">${u.email || '-'}</div>
          <div style="font-size:22px;font-weight:800;color:#1a237e;margin-bottom:4px">${formatRupiah(u.total_penjualan)}</div>
          <div style="font-size:12px;color:#555">${u.jumlah_transaksi} transaksi · ${pct}% dari total</div>
          <div style="background:#ddd;border-radius:4px;height:6px;margin-top:8px;overflow:hidden">
            <div style="background:#1a237e;height:100%;width:${pct}%;border-radius:4px"></div>
          </div>
          <div style="font-size:11px;color:#999;margin-top:6px">${formatDate(u.tanggal_pertama)} — ${formatDate(u.tanggal_terakhir)}</div>
        </div>`;
    }).join('') || '<div style="text-align:center;padding:20px;color:#999">Tidak ada data</div>';

    // Detail table per user
    const userGroups = {};
    data.details.forEach(d => {
        const key = d.created_by_name || 'Tanpa User';
        if (!userGroups[key]) userGroups[key] = [];
        userGroups[key].push(d);
    });

    const statusBd = (s) => {
        const map = { DONE:'badge-success', CONFIRMED:'badge-info', DRAFT:'badge-warning', CANCELLED:'badge-danger' };
        return `<span class="badge ${map[s]||'badge-secondary'}">${s}</span>`;
    };

    let detailTables = '';
    for (const [user, txs] of Object.entries(userGroups)) {
        const userTotal = txs.reduce((s, t) => s + parseFloat(t.total), 0);
        const rows = txs.slice(0, 20).map(t => `
          <tr>
            <td style="padding:6px 10px">${t.invoice_number}</td>
            <td style="padding:6px 10px">${formatDate(t.date)}</td>
            <td style="padding:6px 10px">${t.customer_name}</td>
            <td style="padding:6px 10px;text-align:right">${formatRupiah(t.total)}</td>
            <td style="padding:6px 10px;text-align:center">${statusBd(t.status)}</td>
          </tr>`).join('');
        detailTables += `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-title">👤 ${user}</span>
            <span style="font-weight:700;color:var(--primary)">${txs.length} transaksi · ${formatRupiah(userTotal)}</span>
          </div>
          <div class="table-container">
            <table style="font-size:13px">
              <thead><tr><th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th class="text-right">Total</th><th class="text-center">Status</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${txs.length > 20 ? `<div style="text-align:center;padding:8px;font-size:12px;color:#999">Menampilkan 20 dari ${txs.length} transaksi</div>` : ''}
        </div>`;
    }

    container.innerHTML = `
      <div>
        <h2 style="text-align:center;margin-bottom:4px">LAPORAN PENJUALAN PER USER</h2>
        <p style="text-align:center;color:#757575;margin-bottom:20px;font-size:13px">
          ${from&&to?`Periode ${formatDate(from)} s/d ${formatDate(to)}`:'Semua Periode'}
        </p>

        <!-- Summary -->
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
          <div style="background:#1a237e;color:#fff;border-radius:10px;padding:16px;flex:1;min-width:160px;text-align:center">
            <div style="font-size:12px;opacity:.8">Total Semua User</div>
            <div style="font-size:22px;font-weight:800">${formatRupiah(data.grandTotal)}</div>
            <div style="font-size:11px;opacity:.7">${data.totalTransaksi} transaksi · ${data.perUser.length} user</div>
          </div>
        </div>

        <!-- Per User Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px">
          ${userCards}
        </div>

        <!-- Detail Tables -->
        ${detailTables}
      </div>`;
}

// ── Export CSV ────────────────────────────────────────────────
async function exportCsv() {
    try {
        let csvContent = '';
        let filename = '';

        if (activeReport === 'balance-sheet') {
            const { data } = await apiFetch('/api/reports/balance-sheet');
            filename = 'neraca.csv';
            csvContent = 'Tipe,Kode,Nama Akun,Saldo\n';
            data.assets.forEach(a => csvContent += `Aset,${a.code},"${a.name}",${a.balance}\n`);
            csvContent += `Aset,,Total Aset,${data.totalAssets}\n`;
            data.liabilities.forEach(a => csvContent += `Kewajiban,${a.code},"${a.name}",${a.balance}\n`);
            csvContent += `Kewajiban,,Total Kewajiban,${data.totalLiabilities}\n`;
            data.equities.forEach(a => csvContent += `Ekuitas,${a.code},"${a.name}",${a.balance}\n`);
            csvContent += `Ekuitas,,Total Ekuitas,${data.totalEquity}\n`;
        } else if (activeReport === 'income-statement') {
            const from = document.getElementById('filterFrom').value;
            const to   = document.getElementById('filterTo').value;
            let qs = '?';
            if (from) qs += `from=${from}&`;
            if (to)   qs += `to=${to}&`;
            const { data } = await apiFetch(`/api/reports/income-statement${qs}`);
            filename = 'laba-rugi.csv';
            csvContent = 'Kategori,Kode,Nama,Jumlah\n';
            csvContent += `Pendapatan,,Pendapatan Penjualan,${data.totalRevenue}\n`;
            data.expenses.forEach(a => csvContent += `Beban,${a.code},"${a.name}",${a.balance}\n`);
            csvContent += `Beban,,Total Beban,${data.totalExpense}\n`;
            csvContent += `,,${data.netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'},${data.netIncome}\n`;
        } else if (activeReport === 'trial-balance') {
            const { data, totalDebit, totalCredit } = await apiFetch('/api/reports/trial-balance');
            filename = 'neraca-saldo.csv';
            csvContent = 'Kode,Nama Akun,Tipe,Total Debit,Total Kredit,Saldo\n';
            const typeLabel = { ASSET:'Aset', LIABILITY:'Kewajiban', EQUITY:'Ekuitas', REVENUE:'Pendapatan', EXPENSE:'Beban' };
            data.forEach(a => csvContent += `${a.code},"${a.name}",${typeLabel[a.type]||a.type},${a.total_debit},${a.total_credit},${a.balance}\n`);
            csvContent += `,,TOTAL,${totalDebit},${totalCredit},\n`;
        } else if (activeReport === 'sales-report') {
            const from = document.getElementById('filterFrom').value;
            const to   = document.getElementById('filterTo').value;
            let qs = '?';
            if (from) qs += `from=${from}&`;
            if (to)   qs += `to=${to}&`;
            const { data } = await apiFetch(`/api/reports/sales-report${qs}`);
            filename = 'laporan-penjualan.csv';
            csvContent = 'No Invoice,Tanggal,Pelanggan,Sumber,Total,Status\n';
            data.transactions.forEach(t => csvContent += `${t.nomor},${t.tanggal},"${t.pelanggan}","${t.sumber}",${t.total},${t.status}\n`);
            csvContent += `\n,,,,Total Penjualan Langsung,${data.totalSales}\n`;
            csvContent += `,,,,Total Order Online,${data.totalOrders}\n`;
            csvContent += `,,,,GRAND TOTAL,${data.grandTotal}\n`;
        } else if (activeReport === 'monthly') {
            const yearVal = document.getElementById('filterYear').value || new Date().getFullYear();
            const { data } = await apiFetch(`/api/reports/monthly?year=${yearVal}`);
            filename = `manajemen-bulanan-${data.year}.csv`;
            csvContent = 'Bulan,Jumlah Penjualan,Total Penjualan,Jumlah Order,Total Order Online,Jumlah Pembelian,Total Pembelian,Laba Kotor\n';
            data.months.forEach(m => {
                csvContent += `${BULAN_NAMES[m.bulan]},${m.penjualan_count},${m.penjualan_total},${m.order_count},${m.order_total},${m.pembelian_count},${m.pembelian_total},${m.laba_kotor}\n`;
            });
            csvContent += `\nTOTAL,${data.totalTxSales},${data.totalPenjualan},${data.totalTxOrders},${data.totalOrder},${data.totalTxPurchases},${data.totalPembelian},${data.totalLabaKotor}\n`;
            csvContent += `\n\nProduk Terlaris ${data.year}\n`;
            csvContent += `Kode,Nama,Qty,Pendapatan\n`;
            data.topProducts.forEach(p => csvContent += `${p.code},"${p.name}",${p.qty},${p.revenue}\n`);
            csvContent += `\nSupplier Terbesar ${data.year}\n`;
            csvContent += `Supplier,Jumlah PO,Total\n`;
            data.topSuppliers.forEach(s => csvContent += `"${s.supplier_name}",${s.jumlah_po},${s.total}\n`);
        } else if (activeReport === 'sales-per-user') {
            const from = document.getElementById('filterFrom').value;
            const to   = document.getElementById('filterTo').value;
            let qs = '?';
            if (from) qs += `from=${from}&`;
            if (to)   qs += `to=${to}&`;
            const { data } = await apiFetch(`/api/reports/sales-per-user${qs}`);
            filename = 'penjualan-per-user.csv';
            csvContent = 'Username,Email,Jumlah Transaksi,Total Penjualan,Tanggal Pertama,Tanggal Terakhir\n';
            data.perUser.forEach(u => csvContent += `"${u.username||'Tanpa User'}","${u.email||'-'}",${u.jumlah_transaksi},${u.total_penjualan},${u.tanggal_pertama||''},${u.tanggal_terakhir||''}\n`);
            csvContent += `\n,,GRAND TOTAL,${data.grandTotal},,\n`;        }

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Export CSV berhasil!');
    } catch (e) {
        showToast('Gagal export: ' + e.message, 'error');
    }
}
