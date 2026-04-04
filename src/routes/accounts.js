const router  = require('express').Router();
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

// GET all accounts
router.get('/', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM accounts ORDER BY code');
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data akun.' });
    }
});

// GET single account
router.get('/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data akun.' });
    }
});

// POST create account
router.post('/', auth, async (req, res) => {
    const { code, name, type, balance } = req.body;
    if (!code || !name || !type)
        return res.status(400).json({ success: false, message: 'Kode, nama, dan tipe wajib diisi.' });
    try {
        const [result] = await pool.query(
            'INSERT INTO accounts (code, name, type, balance) VALUES (?, ?, ?, ?)',
            [code, name, type, balance || 0]
        );
        res.json({ success: true, message: 'Akun berhasil dibuat.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode akun sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal membuat akun.' });
    }
});

// PUT update account
router.put('/:id', auth, async (req, res) => {
    const { code, name, type, balance } = req.body;
    try {
        await pool.query(
            'UPDATE accounts SET code=?, name=?, type=?, balance=? WHERE id=?',
            [code, name, type, balance, req.params.id]
        );
        res.json({ success: true, message: 'Akun berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode akun sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal memperbarui akun.' });
    }
});

// DELETE account
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM accounts WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Akun berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus akun.' });
    }
});

module.exports = router;
