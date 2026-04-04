/* profile.js */
(async () => {
    const user = await requireLogin();
    if (!user) return;

    loadProfile();
    loadNotaDesign();

    document.getElementById('btnSaveProfile').addEventListener('click', saveProfile);
    document.getElementById('btnChangePass').addEventListener('click', changePassword);

    // Nota design upload handlers
    const notaFileInput = document.getElementById('notaFileInput');
    const btnUploadNota = document.getElementById('btnUploadNota');
    const btnDeleteNota = document.getElementById('btnDeleteNota');
    const notaPreviewImg = document.getElementById('notaPreviewImg');
    const notaPlaceholder = document.getElementById('notaPlaceholder');

    notaFileInput.addEventListener('change', () => {
        const file = notaFileInput.files[0];
        if (!file) { btnUploadNota.disabled = true; return; }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File terlalu besar. Maksimal 5MB.', 'error');
            notaFileInput.value = '';
            btnUploadNota.disabled = true;
            return;
        }
        // Preview
        const reader = new FileReader();
        reader.onload = e => {
            notaPreviewImg.src = e.target.result;
            notaPreviewImg.style.display = 'block';
            notaPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
        btnUploadNota.disabled = false;
    });

    btnUploadNota.addEventListener('click', uploadNotaDesign);
    btnDeleteNota.addEventListener('click', deleteNotaDesign);
})();

async function loadProfile() {
    try {
        const { data } = await apiFetch('/api/auth/profile');
        document.getElementById('pUsername').value = data.username;
        document.getElementById('pEmail').value = data.email;
        document.getElementById('profileName').textContent = data.username;
        document.getElementById('profileRole').textContent = data.role === 'admin' ? 'Administrator' : 'Pengguna';
        document.getElementById('profileAvatar').textContent = data.username.charAt(0).toUpperCase();
    } catch (e) { showToast(e.message, 'error'); }
}

async function saveProfile() {
    const email = document.getElementById('pEmail').value.trim();
    if (!email) return showToast('Email wajib diisi.', 'error');
    try {
        await apiFetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        showToast('Profil berhasil diperbarui.');
    } catch (e) { showToast(e.message, 'error'); }
}

async function changePassword() {
    const old_password = document.getElementById('pOldPass').value;
    const new_password = document.getElementById('pNewPass').value;
    const confirm_password = document.getElementById('pConfirmPass').value;

    if (!old_password || !new_password) return showToast('Semua field wajib diisi.', 'error');
    if (new_password.length < 6) return showToast('Password baru minimal 6 karakter.', 'error');
    if (new_password !== confirm_password) return showToast('Konfirmasi password tidak cocok.', 'error');

    try {
        await apiFetch('/api/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password, new_password })
        });
        showToast('Password berhasil diubah.');
        document.getElementById('pOldPass').value = '';
        document.getElementById('pNewPass').value = '';
        document.getElementById('pConfirmPass').value = '';
    } catch (e) { showToast(e.message, 'error'); }
}

/* ── Nota Design Functions ──────────────────── */
async function loadNotaDesign() {
    try {
        const res = await fetch('/api/nota-design/exists');
        const data = await res.json();
        const img = document.getElementById('notaPreviewImg');
        const placeholder = document.getElementById('notaPlaceholder');
        const btnDelete = document.getElementById('btnDeleteNota');
        if (data.exists) {
            img.src = data.url + '?t=' + Date.now();
            img.style.display = 'block';
            placeholder.style.display = 'none';
            btnDelete.style.display = '';
        } else {
            img.style.display = 'none';
            placeholder.style.display = '';
            btnDelete.style.display = 'none';
        }
    } catch (e) { /* ignore */ }
}

async function uploadNotaDesign() {
    const fileInput = document.getElementById('notaFileInput');
    const file = fileInput.files[0];
    if (!file) return showToast('Pilih file terlebih dahulu.', 'error');

    const formData = new FormData();
    formData.append('nota', file);

    try {
        const res = await fetch('/api/nota-design/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload gagal');
        showToast('Desain nota berhasil diupload!');
        fileInput.value = '';
        document.getElementById('btnUploadNota').disabled = true;
        loadNotaDesign();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteNotaDesign() {
    if (!confirm('Hapus desain nota? Nota akan kembali ke header teks default.')) return;
    try {
        const res = await fetch('/api/nota-design', { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Gagal menghapus');
        showToast('Desain nota berhasil dihapus.');
        loadNotaDesign();
    } catch (e) { showToast(e.message, 'error'); }
}
