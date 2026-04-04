const router = require('express').Router();
const pool   = require('../config/db');

// GET /api/catalog — Public product listing (no auth)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, code, name, category, unit, stock, sell_price, image FROM products ORDER BY name'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memuat katalog.' });
    }
});

module.exports = router;
