/* kas.js */
let currentPage = 1;

(async () => {
    await requireLogin();
    await Promise.all([loadKas(), loadSummary()]);

    document.getElementById('btnAdd').addEventListener('click',     openModal);
    document.getElementById('modalClose').addEventListener('click',  closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSave').addEventListener('click',   saveKas);
    document.getElementById('filterType').addEventListener('change', loadKas);
})();

async function loadSummary() {
    try {
        const { data } = await apiFetch('/api/kas/summary');
        document.getElementById('sumMasuk').textContent  = formatRupiah(data.masuk.total);
        document.getElementById('sumKeluar').textContent = formatRupiah(data.keluar.total);
        document.getElementById('sumSaldo').textContent  = formatRupiah(data.saldo);
    } catch {}
}

async function loadKas(page = 1) {
    currentPage = page;
    const type = document.getElementById('filterType').value;
    let qs = `?page=${page}&limit=15`;
    if (type) qs += `&type=${type}`;
    try {
        const { data, total, limit } = await apiFetch(`/api/kas${qs}`);
        const tbody = document.getElementById('kasTable');
        tbody.innerHTML = data.length
            ? data.map(k => `
                <tr>
                  <td><strong>${k.reference}</strong></td>
                  <td>${formatDate(k.date)}</td>
                  <td>${k.type === 'MASUK'
                      ? '<span class="badge badge-success">Masuk</span>'
                      : '<span class="badge badge-danger">Keluar</span>'}</td>
                  <td>${k.counterparty}</td>
                  <td>${k.description || '-'}</td>
                  <td class="text-right">${k.type === 'KELUAR' ? '-' : ''}${formatRupiah(k.amount)}</td>
                  <td class="text-center">
                    <button class="btn btn-danger btn-sm" onclick="deleteKas(${k.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="7" style="text-align:center;padding:24px;color:#757575">Tidak ada data</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadKas(${page-1})">‹</button>`;
    for (let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" onclick="loadKas(${i})">${i}</button>`;
    html+=`<button ${page===pages?'disabled':''} onclick="loadKas(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function openModal() {
    document.getElementById('fRef').value  = 'KAS-' + Date.now();
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fType').value = 'MASUK';
    document.getElementById('fAmount').value = '';
    document.getElementById('fCounterparty').value = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('kasModal').classList.add('show');
}
function closeModal() { document.getElementById('kasModal').classList.remove('show'); }

async function saveKas() {
    const reference    = document.getElementById('fRef').value.trim();
    const date         = document.getElementById('fDate').value;
    const type         = document.getElementById('fType').value;
    const amount       = parseFloat(document.getElementById('fAmount').value) || 0;
    const counterparty = document.getElementById('fCounterparty').value.trim();
    const description  = document.getElementById('fDesc').value.trim();

    if (!reference || !date || !type || !counterparty || !amount)
        return showToast('Referensi, tanggal, tipe, pihak, dan jumlah wajib diisi.', 'error');

    try {
        await apiFetch('/api/kas', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ reference, date, type, counterparty, description, amount }) });
        showToast('Transaksi kas berhasil disimpan.');
        closeModal();
        loadKas(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteKas(id) {
    if (!await confirmDialog('Hapus transaksi kas ini?')) return;
    try {
        await apiFetch(`/api/kas/${id}`, { method:'DELETE' });
        showToast('Transaksi kas dihapus.', 'warning');
        loadKas(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}
