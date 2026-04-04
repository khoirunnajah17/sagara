/* journal.js */
let accountsList = [];
let currentPage  = 1;

(async () => {
    await requireLogin();
    const [{ data: accounts }] = await Promise.all([ apiFetch('/api/accounts'), loadJournals() ]);
    accountsList = accounts;
    populateLedgerSelect(accounts);

    document.getElementById('btnAdd').addEventListener('click',     openJournalModal);
    document.getElementById('modalClose').addEventListener('click',  closeJournalModal);
    document.getElementById('modalCancel').addEventListener('click', closeJournalModal);
    document.getElementById('modalSave').addEventListener('click',   saveJournal);
    document.getElementById('btnAddRow').addEventListener('click',   addJournalRow);

    document.getElementById('btnLedger').addEventListener('click',  () => document.getElementById('ledgerModal').classList.add('show'));
    document.getElementById('ledgerClose').addEventListener('click', () => document.getElementById('ledgerModal').classList.remove('show'));
    document.getElementById('detailClose').addEventListener('click', () => document.getElementById('detailModal').classList.remove('show'));
    document.getElementById('ledgerAccount').addEventListener('change', loadLedger);
})();

async function loadJournals(page = 1) {
    currentPage = page;
    try {
        const { data, total, limit } = await apiFetch(`/api/journal?page=${page}&limit=15`);
        const tbody = document.getElementById('journalTable');
        tbody.innerHTML = data.length
            ? data.map(j => `
                <tr>
                  <td>${j.id}</td>
                  <td>${formatDate(j.date)}</td>
                  <td>${j.description}</td>
                  <td>${j.reference || '-'}</td>
                  <td>${j.created_by_name || '-'}</td>
                  <td class="text-center">
                    <button class="btn btn-outline btn-sm" onclick="viewJournal(${j.id})">👁</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteJournal(${j.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#757575">Belum ada jurnal</td></tr>';
        renderPagination(total, page, limit);
    } catch (e) { showToast(e.message, 'error'); }
}

function renderPagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let html = `<button ${page===1?'disabled':''} onclick="loadJournals(${page-1})">‹</button>`;
    for (let i = 1; i <= pages; i++)
        html += `<button class="${i===page?'active':''}" onclick="loadJournals(${i})">${i}</button>`;
    html += `<button ${page===pages?'disabled':''} onclick="loadJournals(${page+1})">›</button>`;
    pg.innerHTML = html;
}

function populateLedgerSelect(accounts) {
    const sel = document.getElementById('ledgerAccount');
    sel.innerHTML = '<option value="">-- Pilih Akun --</option>' +
        accounts.map(a => `<option value="${a.id}">${a.code} – ${a.name}</option>`).join('');
}

async function loadLedger() {
    const id = document.getElementById('ledgerAccount').value;
    if (!id) return;
    try {
        const { account, data } = await apiFetch(`/api/journal/ledger/account/${id}`);
        let bal = 0;
        const rows = data.map(d => {
            bal += parseFloat(d.debit) - parseFloat(d.credit);
            return `<tr>
              <td>${formatDate(d.date)}</td><td>${d.description}</td>
              <td class="text-right">${d.debit>0?formatRupiah(d.debit):'-'}</td>
              <td class="text-right">${d.credit>0?formatRupiah(d.credit):'-'}</td>
              <td class="text-right">${formatRupiah(bal)}</td>
            </tr>`;
        });
        document.getElementById('ledgerContent').innerHTML = `
          <h4 style="margin-bottom:10px">${account.code} – ${account.name}</h4>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f7fa">
              <th style="padding:8px">Tanggal</th><th style="padding:8px">Keterangan</th>
              <th style="padding:8px;text-align:right">Debit</th><th style="padding:8px;text-align:right">Kredit</th>
              <th style="padding:8px;text-align:right">Saldo</th>
            </tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>`;
    } catch (e) { showToast(e.message, 'error'); }
}

function openJournalModal() {
    document.getElementById('fDate').valueAsDate = new Date();
    document.getElementById('fRef').value  = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('journalRows').innerHTML = '';
    document.getElementById('totDebit').textContent  = 'Rp 0';
    document.getElementById('totCredit').textContent = 'Rp 0';
    document.getElementById('balanceError').style.display = 'none';
    addJournalRow(); addJournalRow();
    document.getElementById('journalModal').classList.add('show');
}
function closeJournalModal() { document.getElementById('journalModal').classList.remove('show'); }

function accountOptions(selectedId) {
    return accountsList.map(a => `<option value="${a.id}" ${a.id==selectedId?'selected':''}>${a.code} – ${a.name}</option>`).join('');
}

function addJournalRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select onchange="updateTotals()">${accountOptions()}</select></td>
      <td><input type="number" min="0" value="0" oninput="updateTotals()"></td>
      <td><input type="number" min="0" value="0" oninput="updateTotals()"></td>
      <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();updateTotals()">✕</button></td>`;
    document.getElementById('journalRows').appendChild(tr);
}

function updateTotals() {
    let d = 0, c = 0;
    document.querySelectorAll('#journalRows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input');
        d += parseFloat(inputs[0].value) || 0;
        c += parseFloat(inputs[1].value) || 0;
    });
    document.getElementById('totDebit').textContent  = formatRupiah(d);
    document.getElementById('totCredit').textContent = formatRupiah(c);
    document.getElementById('balanceError').style.display = Math.abs(d-c) > 0.01 ? 'block' : 'none';
}

async function saveJournal() {
    const date = document.getElementById('fDate').value;
    const desc = document.getElementById('fDesc').value.trim();
    const ref  = document.getElementById('fRef').value.trim();
    if (!date || !desc) return showToast('Tanggal dan keterangan wajib diisi.', 'error');

    const rows = document.querySelectorAll('#journalRows tr');
    const details = [];
    rows.forEach(tr => {
        const sel    = tr.querySelector('select');
        const inputs = tr.querySelectorAll('input');
        details.push({ account_id: sel.value, debit: parseFloat(inputs[0].value)||0, credit: parseFloat(inputs[1].value)||0 });
    });

    const totalD = details.reduce((s,d)=>s+d.debit,0);
    const totalC = details.reduce((s,d)=>s+d.credit,0);
    if (Math.abs(totalD-totalC)>0.01) return showToast('Debit dan kredit harus seimbang.','error');

    try {
        await apiFetch('/api/journal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date, description: desc, reference: ref, details }) });
        showToast('Jurnal berhasil disimpan.');
        closeJournalModal();
        loadJournals(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function viewJournal(id) {
    try {
        const { data } = await apiFetch(`/api/journal/${id}`);
        const rows = data.details.map(d => `
          <tr>
            <td>${d.account_code} – ${d.account_name}</td>
            <td class="text-right">${d.debit>0?formatRupiah(d.debit):'-'}</td>
            <td class="text-right">${d.credit>0?formatRupiah(d.credit):'-'}</td>
          </tr>`).join('');
        document.getElementById('detailContent').innerHTML = `
          <p style="font-size:13px;margin-bottom:12px">
            <strong>Tanggal:</strong> ${formatDate(data.date)} &nbsp;|&nbsp;
            <strong>Keterangan:</strong> ${data.description}
            ${data.reference?`&nbsp;|&nbsp;<strong>Referensi:</strong> ${data.reference}`:''}
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f7fa">
              <th style="padding:8px">Akun</th>
              <th style="padding:8px;text-align:right">Debit</th>
              <th style="padding:8px;text-align:right">Kredit</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
        document.getElementById('detailModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteJournal(id) {
    if (!await confirmDialog('Hapus jurnal ini? Saldo akun akan dikembalikan.')) return;
    try {
        await apiFetch(`/api/journal/${id}`, { method: 'DELETE' });
        showToast('Jurnal dihapus.', 'warning');
        loadJournals(currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}
