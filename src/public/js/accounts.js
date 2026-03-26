/* accounts.js */
let allAccounts = [];

(async () => {
    await requireLogin();
    loadAccounts();

    document.getElementById('btnAdd').addEventListener('click', () => openModal());
    document.getElementById('modalClose').addEventListener('click',  closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSave').addEventListener('click',   saveAccount);
    document.getElementById('filterType').addEventListener('change', renderTable);
})();

async function loadAccounts() {
    try {
        const { data } = await apiFetch('/api/accounts');
        allAccounts = data;
        renderTable();
    } catch (e) { showToast(e.message, 'error'); }
}

function renderTable() {
    const typeFilter = document.getElementById('filterType').value;
    const filtered   = typeFilter ? allAccounts.filter(a => a.type === typeFilter) : allAccounts;
    const typeLabel  = { ASSET:'Aset', LIABILITY:'Kewajiban', EQUITY:'Ekuitas', REVENUE:'Pendapatan', EXPENSE:'Beban' };
    const typeBadge  = { ASSET:'info', LIABILITY:'warning', EQUITY:'success', REVENUE:'default', EXPENSE:'danger' };
    document.getElementById('accountsTable').innerHTML = filtered.length
        ? filtered.map(a => `
            <tr>
              <td><code>${a.code}</code></td>
              <td>${a.name}</td>
              <td><span class="badge badge-${typeBadge[a.type]||'default'}">${typeLabel[a.type]||a.type}</span></td>
              <td class="text-right">${formatRupiah(a.balance)}</td>
              <td class="text-center">
                <button class="btn btn-outline btn-sm" onclick="openModal(${a.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteAccount(${a.id})">🗑️</button>
              </td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center;color:#757575;padding:24px">Tidak ada data</td></tr>';
}

function openModal(id) {
    const acc = id ? allAccounts.find(a => a.id === id) : null;
    document.getElementById('accountId').value  = acc ? acc.id : '';
    document.getElementById('fCode').value      = acc ? acc.code : '';
    document.getElementById('fName').value      = acc ? acc.name : '';
    document.getElementById('fType').value      = acc ? acc.type : 'ASSET';
    document.getElementById('fBalance').value   = acc ? acc.balance : 0;
    document.getElementById('modalTitle').textContent = acc ? 'Edit Akun' : 'Tambah Akun';
    document.getElementById('accountModal').classList.add('show');
}
function closeModal() { document.getElementById('accountModal').classList.remove('show'); }

async function saveAccount() {
    const id      = document.getElementById('accountId').value;
    const payload = {
        code:    document.getElementById('fCode').value.trim(),
        name:    document.getElementById('fName').value.trim(),
        type:    document.getElementById('fType').value,
        balance: parseFloat(document.getElementById('fBalance').value) || 0
    };
    if (!payload.code || !payload.name) return showToast('Kode dan nama wajib diisi.', 'error');
    try {
        if (id) { await apiFetch(`/api/accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
        else     { await apiFetch('/api/accounts',      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
        showToast('Akun berhasil disimpan.');
        closeModal();
        loadAccounts();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAccount(id) {
    if (!await confirmDialog('Hapus akun ini?')) return;
    try {
        await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
        showToast('Akun dihapus.', 'warning');
        loadAccounts();
    } catch (e) { showToast(e.message, 'error'); }
}
