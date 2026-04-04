const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

// POST /api/auth/login — Unified login (admin/user via username OR customer via phone)
router.post('/login', async (req, res) => {
    const { identifier, username, password } = req.body;
    const loginId = identifier || username; // support both field names
    if (!loginId || !password)
        return res.status(400).json({ success: false, message: 'Username/No. HP dan password wajib diisi.' });

    try {
        // 1) Try users table (admin/staff) by username
        const [users] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [loginId]);
        if (users.length) {
            const user = users[0];
            if (user.is_active === 0)
                return res.status(403).json({ success: false, message: 'Akun Anda nonaktif. Hubungi admin.' });
            const match = await bcrypt.compare(password, user.password);
            if (!match)
                return res.status(401).json({ success: false, message: 'Username/No. HP atau password salah.' });
            req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
            return res.json({ success: true, message: 'Login berhasil.', user: req.session.user, type: 'admin' });
        }

        // 2) Try customers table by phone
        const [customers] = await pool.query('SELECT * FROM customers WHERE phone = ? LIMIT 1', [loginId]);
        if (customers.length) {
            const customer = customers[0];
            const match = await bcrypt.compare(password, customer.password);
            if (!match)
                return res.status(401).json({ success: false, message: 'Username/No. HP atau password salah.' });
            if (!customer.is_verified)
                return res.status(403).json({ success: false, message: 'Akun belum diverifikasi. Silakan tunggu persetujuan admin.' });
            req.session.customer = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email };
            return res.json({ success: true, message: 'Login berhasil.', customer: req.session.customer, type: 'customer' });
        }

        // Not found in either table
        return res.status(401).json({ success: false, message: 'Username/No. HP atau password salah.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logout berhasil.' });
    });
});

// GET /api/auth/me — Returns session for admin OR customer
router.get('/me', (req, res) => {
    if (req.session && req.session.user)
        return res.json({ success: true, user: req.session.user, type: 'admin' });
    if (req.session && req.session.customer)
        return res.json({ success: true, customer: req.session.customer, type: 'customer' });
    return res.status(401).json({ success: false, message: 'Belum login.' });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });

    try {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashed, role || 'user']
        );
        return res.json({ success: true, message: 'Registrasi berhasil.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Username atau email sudah digunakan.' });
        console.error(err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// POST /api/auth/register-customer
router.post('/register-customer', async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !name.trim())
        return res.status(400).json({ success: false, message: 'Nama wajib diisi.' });

    try {
        const hashed = await bcrypt.hash('default123', 10);
        await pool.query(
            'INSERT INTO customers (name, phone, password, is_verified) VALUES (?, ?, ?, 1)',
            [name.trim(), phone ? phone.trim() : null, hashed]
        );
        return res.json({ success: true, message: 'Pelanggan berhasil ditambahkan.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Pelanggan sudah ada.' });
        console.error(err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// GET /api/auth/profile
router.get('/profile', async (req, res) => {
    if (!req.session || !req.session.user)
        return res.status(401).json({ success: false, message: 'Belum login.' });
    try {
        const [rows] = await pool.query('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil profil.' });
    }
});

// PUT /api/auth/profile
router.put('/profile', async (req, res) => {
    if (!req.session || !req.session.user)
        return res.status(401).json({ success: false, message: 'Belum login.' });
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email wajib diisi.' });
    try {
        await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, req.session.user.id]);
        req.session.user.email = email;
        res.json({ success: true, message: 'Profil berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Email sudah digunakan.' });
        res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
    }
});

// PUT /api/auth/change-password
router.put('/change-password', async (req, res) => {
    if (!req.session || !req.session.user)
        return res.status(401).json({ success: false, message: 'Belum login.' });
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });
    if (new_password.length < 6)
        return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
    try {
        const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.session.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        const match = await bcrypt.compare(old_password, rows[0].password);
        if (!match) return res.status(400).json({ success: false, message: 'Password lama salah.' });
        const hashed = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.session.user.id]);
        res.json({ success: true, message: 'Password berhasil diubah.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengubah password.' });
    }
});

module.exports = router;
