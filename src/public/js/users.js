/* users.js */
let allAccess   = [];
let activeRole  = 'admin';

const MENUS = [
    { key: 'dashboard',  label: 'Dashboard' },
    { key: 'accounts',   label: 'Bagan Akun' },
    { key: 'journal',    label: 'Jurnal Umum' },
    { key: 'sales',      label: 'Penjualan' },
    { key: 'purchases',  label: 'Pembelian' },
    { key: 'inventory',  label: 'Persediaan' },
    { key: 'kas',        label: 'Kas' },
    { key: 'hutang',     label: 'Hutang' },
    { key: 'reports',    label: 'Laporan Keuangan' },
    { key: 'users',      label: 'Kelola Pengguna' },
];

(async () => {
    const user = await requireLogin();
    if (!user || user.role !== 'admin') {
        showToast('Hanya admin yang dapat mengakses halaman ini.', 'error');
        window.location.href = '/dashboard.html';
        return;
    }

    await Promise.all([loadUsers(), loadRoleAccess(), loadCustomers()]);

    document.getElementById('btnAdd').addEventListener('click',       () => openUserModal());
    document.getElementById('modalClose').addEventListener('click',    closeUserModal);
    document.getElementById('modalCancel').addEventListener('click',   closeUserModal);
    document.getElementById('modalSave').addEventListener('click',     saveUser);
    document.getElementById('btnSaveAccess').addEventListener('click', saveRoleAccess);

    document.getElementById('accessClose').addEventListener('click',  closeAccessModal);
    document.getElementById('accessSave').addEventListener('click',   saveUserAccess);
    document.getElementById('accessReset').addEventListener('click',  resetUserAccess);

    document.querySelectorAll('.role-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRole = btn.dataset.role;
            renderAccessTable();
        });
    });
})();

// ──────────────── USERS CRUD ────────────────

async function loadUsers() {
    try {
        const { data } = await apiFetch('/api/users');
        const tbody = document.getElementById('usersTable');
        tbody.innerHTML = data.length
            ? data.map(u => `
                <tr${!u.is_active ? ' style="opacity:0.5"' : ''}>
                  <td>${u.id}</td>
                  <td><strong>${u.username}</strong></td>
                  <td>${u.email}</td>
                  <td><span class="badge ${u.role==='admin'?'badge-info':'badge-default'}">${u.role.toUpperCase()}</span></td>
                  <td>${u.is_active ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-danger">Nonaktif</span>'}</td>
                  <td>${formatDate(u.created_at)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onclick="openUserModal(${u.id})">✏️</button>
                    <button class="btn btn-warning btn-sm" onclick="openAccessModal(${u.id},'${u.username.replace(/'/g,"\\'")}')">🔑 Akses</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${u.username}')">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="7" style="text-align:center;padding:24px;color:#757575">Tidak ada pengguna</td></tr>';
    } catch (e) { showToast(e.message, 'error'); }
}

let editingUser = null;
async function openUserModal(id) {
    editingUser = id || null;
    if (id) {
        try {
            const { data } = await apiFetch('/api/users');
            const user = data.find(u => u.id === id);
            if (!user) return showToast('Pengguna tidak ditemukan.', 'error');
            document.getElementById('userId').value    = user.id;
            document.getElementById('fUsername').value  = user.username;
            document.getElementById('fEmail').value    = user.email;
            document.getElementById('fRole').value     = user.role;
            document.getElementById('fPassword').value = '';
            document.getElementById('fActive').checked = !!user.is_active;
            document.getElementById('activeGroup').style.display = 'block';
            document.getElementById('lblPassword').textContent = 'Password (kosongkan jika tidak diubah)';
        } catch (e) { showToast(e.message, 'error'); return; }
    } else {
        document.getElementById('userId').value    = '';
        document.getElementById('fUsername').value  = '';
        document.getElementById('fEmail').value    = '';
        document.getElementById('fRole').value     = 'user';
        document.getElementById('fPassword').value = '';
        document.getElementById('fActive').checked = true;
        document.getElementById('activeGroup').style.display = 'none';
        document.getElementById('lblPassword').textContent = 'Password *';
    }
    document.getElementById('modalTitle').textContent = id ? 'Edit Pengguna' : 'Tambah Pengguna';
    document.getElementById('userModal').classList.add('show');
}
function closeUserModal() { document.getElementById('userModal').classList.remove('show'); }

async function saveUser() {
    const id       = document.getElementById('userId').value;
    const username = document.getElementById('fUsername').value.trim();
    const email    = document.getElementById('fEmail').value.trim();
    const password = document.getElementById('fPassword').value;
    const role     = document.getElementById('fRole').value;
    const is_active = document.getElementById('fActive').checked;

    if (!username || !email) return showToast('Username dan email wajib diisi.', 'error');
    if (!id && !password) return showToast('Password wajib diisi untuk pengguna baru.', 'error');
    if (password && password.length < 6) return showToast('Password minimal 6 karakter.', 'error');

    const payload = { username, email, role, is_active };
    if (password) payload.password = password;

    try {
        if (id) {
            await apiFetch(`/api/users/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        } else {
            await apiFetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        }
        showToast('Pengguna berhasil disimpan.');
        closeUserModal();
        loadUsers();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteUser(id, username) {
    if (!await confirmDialog(`Hapus pengguna "${username}"?`)) return;
    try {
        await apiFetch(`/api/users/${id}`, { method:'DELETE' });
        showToast('Pengguna dihapus.', 'warning');
        loadUsers();
    } catch (e) { showToast(e.message, 'error'); }
}

// ──────────────── ROLE ACCESS ────────────────

async function loadRoleAccess() {
    try {
        const { data } = await apiFetch('/api/users/role-access');
        allAccess = data;
        renderAccessTable();
    } catch (e) { showToast(e.message, 'error'); }
}

function renderAccessTable() {
    const tbody = document.getElementById('accessTable');
    tbody.innerHTML = MENUS.map(m => {
        const a = allAccess.find(r => r.role === activeRole && r.menu === m.key) || {};
        return `<tr>
          <td><strong>${m.label}</strong></td>
          <td><input type="checkbox" data-menu="${m.key}" data-perm="can_view"   ${a.can_view   ? 'checked' : ''}></td>
          <td><input type="checkbox" data-menu="${m.key}" data-perm="can_create" ${a.can_create  ? 'checked' : ''}></td>
          <td><input type="checkbox" data-menu="${m.key}" data-perm="can_edit"   ${a.can_edit    ? 'checked' : ''}></td>
          <td><input type="checkbox" data-menu="${m.key}" data-perm="can_delete" ${a.can_delete  ? 'checked' : ''}></td>
        </tr>`;
    }).join('');
}

async function saveRoleAccess() {
    const permissions = MENUS.map(m => {
        const row = document.querySelector(`input[data-menu="${m.key}"][data-perm="can_view"]`).closest('tr');
        return {
            menu:       m.key,
            can_view:   row.querySelector('[data-perm="can_view"]').checked,
            can_create: row.querySelector('[data-perm="can_create"]').checked,
            can_edit:   row.querySelector('[data-perm="can_edit"]').checked,
            can_delete: row.querySelector('[data-perm="can_delete"]').checked,
        };
    });
    try {
        await apiFetch(`/api/users/role-access/${activeRole}`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ permissions })
        });
        showToast(`Akses role "${activeRole}" berhasil disimpan.`);
        await loadRoleAccess();
    } catch (e) { showToast(e.message, 'error'); }
}

// ──────────────── PER-USER ACCESS MODAL ────────────────

let accessUserId = null;

async function openAccessModal(userId, username) {
    accessUserId = userId;
    document.getElementById('accessUserName').textContent = username;
    document.getElementById('accessUserId').value = userId;
    try {
        const { data } = await apiFetch(`/api/users/${userId}/access`);
        renderUserAccessTable(data);
        document.getElementById('accessModal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}
function closeAccessModal() { document.getElementById('accessModal').classList.remove('show'); accessUserId = null; }

function renderUserAccessTable(accessData) {
    const tbody = document.getElementById('userAccessTable');
    tbody.innerHTML = MENUS.map(m => {
        const a = accessData[m.key] || {};
        return `<tr>
          <td><strong>${m.label}</strong></td>
          <td><input type="checkbox" data-ua-menu="${m.key}" data-ua-perm="can_view"   ${a.can_view   ? 'checked' : ''}></td>
          <td><input type="checkbox" data-ua-menu="${m.key}" data-ua-perm="can_create" ${a.can_create  ? 'checked' : ''}></td>
          <td><input type="checkbox" data-ua-menu="${m.key}" data-ua-perm="can_edit"   ${a.can_edit    ? 'checked' : ''}></td>
          <td><input type="checkbox" data-ua-menu="${m.key}" data-ua-perm="can_delete" ${a.can_delete  ? 'checked' : ''}></td>
        </tr>`;
    }).join('');
}

async function saveUserAccess() {
    if (!accessUserId) return;
    const permissions = MENUS.map(m => {
        const row = document.querySelector(`input[data-ua-menu="${m.key}"][data-ua-perm="can_view"]`).closest('tr');
        return {
            menu:       m.key,
            can_view:   row.querySelector('[data-ua-perm="can_view"]').checked,
            can_create: row.querySelector('[data-ua-perm="can_create"]').checked,
            can_edit:   row.querySelector('[data-ua-perm="can_edit"]').checked,
            can_delete: row.querySelector('[data-ua-perm="can_delete"]').checked,
        };
    });
    try {
        await apiFetch(`/api/users/${accessUserId}/access`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ permissions })
        });
        showToast('Akses pengguna berhasil disimpan.');
        closeAccessModal();
    } catch (e) { showToast(e.message, 'error'); }
}

async function resetUserAccess() {
    if (!accessUserId) return;
    if (!await confirmDialog('Reset akses pengguna ini ke default role?')) return;
    try {
        await apiFetch(`/api/users/${accessUserId}/access/reset`, { method:'POST' });
        showToast('Akses direset ke default role.');
        // Reload the modal
        const username = document.getElementById('accessUserName').textContent;
        await openAccessModal(accessUserId, username);
    } catch (e) { showToast(e.message, 'error'); }
}

// ──────────────── CUSTOMER VERIFICATION ────────────────

async function loadCustomers() {
    try {
        const { data } = await apiFetch('/api/customers');
        const tbody = document.getElementById('customersTable');
        const pending = data.filter(c => !c.is_verified).length;
        const badge = document.getElementById('pendingBadge');
        if (pending > 0) {
            badge.textContent = `${pending} menunggu verifikasi`;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
        tbody.innerHTML = data.length
            ? data.map(c => `
                <tr>
                  <td>${c.id}</td>
                  <td>${c.name}</td>
                  <td>${c.phone}</td>
                  <td>${c.email || '-'}</td>
                  <td>${c.is_verified
                      ? '<span class="badge badge-success">Terverifikasi</span>'
                      : '<span class="badge badge-warning">Menunggu</span>'}</td>
                  <td>${formatDate(c.created_at)}</td>
                  <td class="text-center" style="white-space:nowrap">
                    ${!c.is_verified
                      ? `<button class="btn btn-success btn-sm" onclick="verifyCustomer(${c.id})">✅ Verifikasi</button>`
                      : `<button class="btn btn-warning btn-sm" onclick="rejectCustomer(${c.id})">⛔ Cabut</button>`}
                    <button class="btn btn-danger btn-sm" onclick="deleteCustomer(${c.id})">🗑️</button>
                  </td>
                </tr>`).join('')
            : '<tr><td colspan="7" style="text-align:center;padding:24px;color:#757575">Belum ada pelanggan terdaftar</td></tr>';
    } catch (e) { console.error(e); }
}

async function verifyCustomer(id) {
    try {
        await apiFetch(`/api/customers/${id}/verify`, { method:'PUT' });
        showToast('Pelanggan berhasil diverifikasi.');
        loadCustomers();
    } catch (e) { showToast(e.message, 'error'); }
}

async function rejectCustomer(id) {
    if (!await confirmDialog('Cabut verifikasi pelanggan ini?')) return;
    try {
        await apiFetch(`/api/customers/${id}/reject`, { method:'PUT' });
        showToast('Verifikasi pelanggan dicabut.', 'warning');
        loadCustomers();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteCustomer(id) {
    if (!await confirmDialog('Hapus pelanggan ini?')) return;
    try {
        await apiFetch(`/api/customers/${id}`, { method:'DELETE' });
        showToast('Pelanggan dihapus.', 'warning');
        loadCustomers();
    } catch (e) { showToast(e.message, 'error'); }
}

/* ─── Logo Upload ─── */
async function uploadLogo() {
    const fileInput = document.getElementById('logoFile');
    const msgEl = document.getElementById('logoMsg');
    msgEl.style.display = 'none';
    if (!fileInput.files.length) {
        msgEl.textContent = '⚠️ Pilih file logo terlebih dahulu';
        msgEl.style.color = '#e53935';
        msgEl.style.display = 'block';
        return;
    }
    const fd = new FormData();
    fd.append('logo', fileInput.files[0]);
    try {
        const res = await fetch('/api/logo/upload', { method: 'POST', body: fd, credentials: 'include' });
        const d = await res.json();
        if (d.success) {
            msgEl.textContent = '✅ Logo berhasil diupload! Refresh halaman untuk melihat perubahan.';
            msgEl.style.color = '#43a047';
            msgEl.style.display = 'block';
            document.getElementById('currentLogo').src = d.logo + '?t=' + Date.now();
            // Update all sidebar logos on this page
            document.querySelectorAll('.sidebar-logo-img').forEach(img => img.src = d.logo + '?t=' + Date.now());
        } else {
            msgEl.textContent = '❌ ' + (d.message || 'Gagal upload');
            msgEl.style.color = '#e53935';
            msgEl.style.display = 'block';
        }
    } catch (e) {
        msgEl.textContent = '❌ Terjadi kesalahan';
        msgEl.style.color = '#e53935';
        msgEl.style.display = 'block';
    }
}
