/* ============================================================
   main.js – Shared utilities for Sagara Accounting
   ============================================================ */

const API = '';

// ── Mobile sidebar toggle ────────────────────────────────────
(function initMobileSidebar() {
    document.addEventListener('DOMContentLoaded', () => {
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.header');
        if (!sidebar || !header) return;

        // Add hamburger button if not exists
        if (!document.querySelector('.sidebar-toggle')) {
            const btn = document.createElement('button');
            btn.className = 'sidebar-toggle';
            btn.innerHTML = '☰';
            btn.setAttribute('aria-label', 'Menu');
            header.prepend(btn);
        }

        // Add overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }

        // Toggle sidebar
        document.querySelector('.sidebar-toggle')?.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('show');
        });

        // Close on overlay click
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        });

        // Close on nav link click (mobile)
        sidebar.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('show');
                }
            });
        });
    });
})();

// ── Auth check (call at top of every protected page) ────────
async function requireLogin() {
    try {
        const res  = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) { window.location.href = '/index.html'; return null; }
        const user = data.user;
        const el = document.getElementById('currentUser');
        if (el) el.textContent = user.username;
        // Load role-based access and hide sidebar links
        try {
            const accessRes = await apiFetch('/api/users/my-access');
            window._userAccess = accessRes.data || {};
            applyMenuAccess(accessRes.data, user.role);
        } catch {}
        return user;
    } catch {
        window.location.href = '/index.html';
        return null;
    }
}

// ── Apply role access to sidebar ─────────────────────────────
function applyMenuAccess(access, role) {
    if (role === 'admin') return; // admin sees everything
    const menuMap = {
        '/dashboard.html': 'dashboard', '/accounts.html': 'accounts', '/journal.html': 'journal',
        '/sales.html': 'sales', '/kasir.html': 'sales', '/purchases.html': 'purchases', '/inventory.html': 'inventory',
        '/orders.html': 'orders', '/kas.html': 'kas', '/hutang.html': 'hutang', '/reports.html': 'reports', '/users.html': 'users'
    };
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        const href = a.getAttribute('href');
        const menu = menuMap[href];
        if (menu && access[menu] && !access[menu].can_view) {
            a.style.display = 'none';
        }
    });
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

// ── Number formatter (clean decimals: 106.000→106, 0.500→0.5) ──
function formatNum(n) {
    const v = parseFloat(n) || 0;
    return v % 1 === 0 ? v.toString() : parseFloat(v.toFixed(3)).toString();
}

// ── Date formatter ───────────────────────────────────────────
function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Channel badge HTML ───────────────────────────────────────
function channelBadge(ch) {
    return `<span class="badge badge-direct">Langsung</span>`;
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
    // Make username a link to profile
    const userEl = document.getElementById('currentUser');
    if (userEl && userEl.parentElement) {
        userEl.parentElement.style.cursor = 'pointer';
        userEl.parentElement.addEventListener('click', () => { window.location.href = '/profile.html'; });
    }
});
