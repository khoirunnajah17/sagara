const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');

// POST /api/customer-auth/register
router.post('/register', async (req, res) => {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password)
        return res.status(400).json({ success: false, message: 'Nama, No. HP, dan password wajib diisi.' });
    if (password.length < 6)
        return res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });
    try {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO customers (name, phone, email, password, is_verified) VALUES (?, ?, ?, ?, 0)',
            [name, phone, email || null, hashed]
        );
        res.json({ success: true, message: 'Pendaftaran berhasil! Akun Anda menunggu verifikasi admin.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'No. HP sudah terdaftar.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal registrasi.' });
    }
});

// POST /api/customer-auth/login
router.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password)
        return res.status(400).json({ success: false, message: 'No. HP dan password wajib diisi.' });
    try {
        const [rows] = await pool.query('SELECT * FROM customers WHERE phone = ? LIMIT 1', [phone]);
        if (!rows.length)
            return res.status(401).json({ success: false, message: 'No. HP atau password salah.' });
        const customer = rows[0];
        const match = await bcrypt.compare(password, customer.password);
        if (!match)
            return res.status(401).json({ success: false, message: 'No. HP atau password salah.' });
        if (!customer.is_verified)
            return res.status(403).json({ success: false, message: 'Akun belum diverifikasi. Silakan tunggu persetujuan admin.' });
        req.session.customer = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email };
        res.json({ success: true, message: 'Login berhasil.', customer: req.session.customer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal login.' });
    }
});

// POST /api/customer-auth/logout
router.post('/logout', (req, res) => {
    delete req.session.customer;
    res.json({ success: true, message: 'Logout berhasil.' });
});

// GET /api/customer-auth/me
router.get('/me', (req, res) => {
    if (req.session && req.session.customer)
        return res.json({ success: true, customer: req.session.customer });
    return res.status(401).json({ success: false, message: 'Belum login.' });
});

module.exports = router;
