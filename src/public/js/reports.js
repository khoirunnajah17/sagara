/* reports.js */
let activeReport = 'balance-sheet';

(async () => {
    await requireLogin();

    document.querySelectorAll('.tab-btn[data-report]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-report]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeReport = btn.dataset.report;
            document.getElementById('dateFilter').style.display = activeReport === 'income-statement' ? 'flex' : 'none';
            loadReport();
        });
    });

    document.getElementById('btnFilter').addEventListener('click', loadReport);
    loadReport();
})();

async function loadReport() {
    const container = document.getElementById('reportContent');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#757575">Memuat...</div>';
    try {
        if (activeReport === 'balance-sheet')    await renderBalanceSheet(container);
        else if (activeReport === 'income-statement') await renderIncomeStatement(container);
        else if (activeReport === 'trial-balance')    await renderTrialBalance(container);
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
