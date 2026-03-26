/* ============================================================
   main.js – Shared utilities for Sagara Accounting
   ============================================================ */

const API = '';

// ── Auth check (call at top of every protected page) ────────
async function requireLogin() {
    try {
        const res  = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) { window.location.href = '/index.html'; return null; }
        const user = data.user;
        const el = document.getElementById('currentUser');
        if (el) el.textContent = user.username;
        return user;
    } catch {
        window.location.href = '/index.html';
        return null;
    }
}

// ── Logout ───────────────────────────────────────────────────
async function logout() {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/index.html';
}

// ── Toast notifications ──────────────────────────────────────
function showToast(message, type = 'success') {
    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Currency formatter ───────────────────────────────────────
function formatRupiah(n) {
    return 'Rp ' + (parseFloat(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0 });
}

// ── Date formatter ───────────────────────────────────────────
function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Channel badge HTML ───────────────────────────────────────
function channelBadge(ch) {
    const map = { DIRECT: 'direct', SHOPEE: 'shopee', TOKOPEDIA: 'tokopedia' };
    const label = { DIRECT: 'Langsung', SHOPEE: 'Shopee', TOKOPEDIA: 'Tokopedia' };
    return `<span class="badge badge-${map[ch] || 'default'}">${label[ch] || ch}</span>`;
}

// ── Status badge HTML ────────────────────────────────────────
function statusBadge(s) {
    const map = {
        DRAFT: 'default', CONFIRMED: 'info', SHIPPED: 'warning', DONE: 'success',
        CANCELLED: 'danger', ORDERED: 'info', RECEIVED: 'success'
    };
    const label = {
        DRAFT: 'Draft', CONFIRMED: 'Dikonfirmasi', SHIPPED: 'Dikirim', DONE: 'Selesai',
        CANCELLED: 'Dibatalkan', ORDERED: 'Dipesan', RECEIVED: 'Diterima'
    };
    return `<span class="badge badge-${map[s] || 'default'}">${label[s] || s}</span>`;
}

// ── Generic API helpers ──────────────────────────────────────
async function apiFetch(url, options = {}) {
    const res  = await fetch(API + url, { credentials: 'include', ...options });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan.');
    return data;
}

// ── Set active nav link ──────────────────────────────────────
function setActiveNav(href) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === href);
    });
}

// ── Confirm dialog (returns promise) ────────────────────────
function confirmDialog(msg) {
    return Promise.resolve(window.confirm(msg));
}

// ── Logout button wiring ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
});
