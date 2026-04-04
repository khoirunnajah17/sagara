/* hutang.js */
let currentPage = 1;

(async () => {
    await requireLogin();
    await Promise.all([loadHutang(), loadSummary()]);

    document.getElementById('btnAdd').addEventListener('click',     openModal);
    document.getElementById('modalClose').addEventListener('click',  closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSave').addEventListener('click',   saveHutang);
    document.getElementById('bayarClose').addEventListener('click',  closeBayar);
    document.getElementById('bayarCancel').addEventListener('click', closeBayar);
    document.getElementById('bayarSave').addEventListener('click',   submitBayar);
    document.getElementById('filterStatus').addEventListener('change', loadHutang);
})();

async function loadSummary() {
    try {
        const { data } = await apiFetch('/api/hutang/summary');
        document.getElementById('sumBelumLunas').textContent = data.belum_lunas.count + ' hutang';
        document.getElementById('sumSisa').textContent       = formatRupiah(data.belum_lunas.sisa);
        document.getElementById('sumLunas').textContent      = data.lunas.count + ' hutang';
    } catch {}
}

async function loadHutang(page = 1) {
    currentPage = page;
    const status = document.getElementById('filterStatus').value;
    let qs = `?page=${page}&limit=15`;
    if (status) qs += `&status=${status}`;
    try {
        const { data, total, limit } = await apiFetch(`/api/hutang${qs}`);
        const tbody = document.getElementById('hutangTable');
        tbody.innerHTML = data.length
            ? data.map(h => {
                const sisa = parseFloat(h.amount) - parseFloat(h.paid);
                const overdue = h.status === 'BELUM_LUNAS' && new Date(h.due_date) < new Date();
                return `
                <tr${overdue ? ' style="background:#fff8f8"' : ''}>
                  <td><strong>${h.reference}</strong></td>
                  <td>${formatDate(h.date)}</td>
                  <td>${formatDate(h.due_date)}${overdue ? ' <span class="badge badge-danger">Jatuh Tempo</span>' : ''}</td>
                  <td>${h.counterparty}</td>
                  <td class="text-right">${formatRupiah(h.amount)}</td>
                  <td class="text-right">${formatRupiah(h.paid)}</td>
                  <td class="text-right">${formatRupiah(sisa)}</td>
                  <td>${h.status === 'LUNAS' ? '<span class="badge badge-success">Lunas</span>' : '<span class="badge badge-warning">Belum Lunas</span>'}</td>
                  <td class="text-center" style="white-space:nowrap">
                    ${h.status === 'BELUM_LUNAS' ? `<button class="btn btn-primary btn-sm" onclick="openBayar(${h.id}, '${h.reference}', ${h.amount}, ${h.paid})">💳 Bayar</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteHutang(${h.id})">🗑️</button>
                  </td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="9" style="text-align:center;padding:24px;color:#757575">Tidak ada data</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadHutang(${page-1})">‹</button>`;
    for (let i=1;i<=pages;i++) html+=`<button class="${i===page?'active':''}" onclick="loadHutang(${i})">${i}</button>`;
    html+=`<button ${page===pages?'disabled':''} onclick="loadHutang(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function openModal() {
    document.getElementById('fRef').value  = 'HT-' + Date.now();
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fDueDate').value = '';
    document.getElementById('fAmount').value = '';
    document.getElementById('fCounterparty').value = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('hutangModal').classList.add('show');
}
function closeModal() { document.getElementById('hutangModal').classList.remove('show'); }

async function saveHutang() {
    const reference    = document.getElementById('fRef').value.trim();
    const date         = document.getElementById('fDate').value;
    const due_date     = document.getElementById('fDueDate').value;
    const amount       = parseFloat(document.getElementById('fAmount').value) || 0;
    const counterparty = document.getElementById('fCounterparty').value.trim();
    const description  = document.getElementById('fDesc').value.trim();

    if (!reference || !date || !due_date || !counterparty || !amount)
        return showToast('Referensi, tanggal, jatuh tempo, pihak, dan jumlah wajib diisi.', 'error');

    try {
        await apiFetch('/api/hutang', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ reference, date, due_date, counterparty, description, amount }) });
        showToast('Hutang berhasil ditambahkan.');
        closeModal();
        loadHutang(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}

let bayarId = null;
function openBayar(id, ref, amount, paid) {
    bayarId = id;
    const sisa = parseFloat(amount) - parseFloat(paid);
    document.getElementById('bayarInfo').innerHTML = `<strong>${ref}</strong> — Sisa hutang: <strong>${formatRupiah(sisa)}</strong>`;
    document.getElementById('fBayar').value = sisa;
    document.getElementById('fBayar').max = sisa;
    document.getElementById('bayarModal').classList.add('show');
}
function closeBayar() { document.getElementById('bayarModal').classList.remove('show'); bayarId = null; }

async function submitBayar() {
    if (!bayarId) return;
    const jumlah = parseFloat(document.getElementById('fBayar').value) || 0;
    if (jumlah <= 0) return showToast('Jumlah bayar harus lebih dari 0.', 'error');
    try {
        await apiFetch(`/api/hutang/${bayarId}/bayar`, { method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ jumlah }) });
        showToast('Pembayaran berhasil.');
        closeBayar();
        loadHutang(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteHutang(id) {
    if (!await confirmDialog('Hapus hutang ini?')) return;
    try {
        await apiFetch(`/api/hutang/${id}`, { method:'DELETE' });
        showToast('Hutang dihapus.', 'warning');
        loadHutang(currentPage);
        loadSummary();
    } catch (e) { showToast(e.message, 'error'); }
}
