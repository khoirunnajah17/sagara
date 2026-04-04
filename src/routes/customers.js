const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const admin  = require('../middleware/admin');

// GET all customers (admin only)
router.get('/', auth, admin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, phone, email, is_verified, created_at FROM customers ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data pelanggan.' });
    }
});

// GET pending count (for notification badge)
router.get('/pending-count', auth, admin, async (req, res) => {
    try {
        const [[row]] = await pool.query('SELECT COUNT(*) as count FROM customers WHERE is_verified = 0');
        res.json({ success: true, count: row.count });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal.' });
    }
});

// PUT verify customer (admin only)
router.put('/:id/verify', auth, admin, async (req, res) => {
    try {
        await pool.query('UPDATE customers SET is_verified = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Pelanggan berhasil diverifikasi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal memverifikasi pelanggan.' });
    }
});

// PUT reject / unverify customer (admin only)
router.put('/:id/reject', auth, admin, async (req, res) => {
    try {
        await pool.query('UPDATE customers SET is_verified = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Verifikasi pelanggan dicabut.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal.' });
    }
});

// DELETE customer (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
    try {
        await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Pelanggan berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus pelanggan.' });
    }
});

module.exports = router;
