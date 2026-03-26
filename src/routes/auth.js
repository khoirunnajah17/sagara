const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
        if (!rows.length)
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });

        req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
        return res.json({ success: true, message: 'Login berhasil.', user: req.session.user });
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

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (req.session && req.session.user)
        return res.json({ success: true, user: req.session.user });
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

module.exports = router;
