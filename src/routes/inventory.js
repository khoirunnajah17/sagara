const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Auto-create uploads folder
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config for product images
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'product-' + Date.now() + ext);
    }
});
const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) cb(null, true);
        else cb(new Error('Format file tidak didukung.'));
    }
});

// Multer error handler middleware
function handleUpload(fieldName) {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ success: false, message: 'Upload error: ' + err.message });
            } else if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
            next();
        });
    };
}

// GET all products
router.get('/', auth, async (req, res) => {
    try {
        const { search, category } = req.query;
        let where = [], params = [];
        if (search)   { where.push('(name LIKE ? OR code LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        if (category) { where.push('category = ?'); params.push(category); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(`SELECT * FROM products ${whereSQL} ORDER BY name`, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data produk.' });
    }
});

// GET single product
router.get('/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil produk.' });
    }
});

// POST create product
router.post('/', auth, handleUpload('image'), async (req, res) => {
    const { code, name, category, unit, buy_unit, sell_unit, buy_content, sell_content, stock, cost_price, sell_price } = req.body;
    if (!code || !name)
        return res.status(400).json({ success: false, message: 'Kode dan nama produk wajib diisi.' });
    try {
        const image = req.file ? '/uploads/' + req.file.filename : null;
        const [result] = await pool.query(
            'INSERT INTO products (code, name, category, unit, buy_unit, sell_unit, buy_content, sell_content, stock, cost_price, sell_price, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [code, name, category || null, unit || 'kg', buy_unit || unit || 'kg', sell_unit || 'pcs', parseFloat(buy_content || 1), parseFloat(sell_content || 1), parseFloat(stock || 0), parseFloat(cost_price || 0), parseFloat(sell_price || 0), image]
        );
        res.json({ success: true, message: 'Produk berhasil ditambahkan.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode produk sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal menambahkan produk.' });
    }
});

// PUT update product
router.put('/:id', auth, handleUpload('image'), async (req, res) => {
    const { code, name, category, unit, buy_unit, sell_unit, buy_content, sell_content, stock, cost_price, sell_price } = req.body;
    try {
        let image = undefined;
        if (req.file) {
            image = '/uploads/' + req.file.filename;
            const [old] = await pool.query('SELECT image FROM products WHERE id = ?', [req.params.id]);
            if (old[0] && old[0].image) {
                const oldPath = path.join(__dirname, '../public', old[0].image);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }
        const fields = ['code=?', 'name=?', 'category=?', 'unit=?', 'buy_unit=?', 'sell_unit=?', 'buy_content=?', 'sell_content=?', 'stock=?', 'cost_price=?', 'sell_price=?'];
        const params = [code, name, category, unit, buy_unit || unit || 'kg', sell_unit || 'pcs', parseFloat(buy_content || 1), parseFloat(sell_content || 1), parseFloat(stock), parseFloat(cost_price), parseFloat(sell_price)];
        if (image !== undefined) { fields.push('image=?'); params.push(image); }
        params.push(req.params.id);
        await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id=?`, params);
        res.json({ success: true, message: 'Produk berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Kode produk sudah ada.' });
        res.status(500).json({ success: false, message: 'Gagal memperbarui produk.' });
    }
});

// PUT adjust stock — also syncs warehouse_stock for the first/default warehouse
router.put('/:id/stock', auth, async (req, res) => {
    const { adjustment, notes, warehouse_id } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const adj = parseFloat(adjustment) || 0;
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [adj, req.params.id]);

        // Determine warehouse: use provided, or default to first warehouse
        let whId = warehouse_id;
        if (!whId) {
            const [whs] = await conn.query('SELECT id FROM warehouses ORDER BY id LIMIT 1');
            if (whs.length) whId = whs[0].id;
        }
        if (whId) {
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = stock + ?`,
                [whId, req.params.id, adj, adj]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Stok berhasil disesuaikan.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyesuaikan stok.' });
    } finally {
        conn.release();
    }
});

// POST recalculate all product stock from warehouse_stock totals
router.post('/sync-stock', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // Update products.stock = SUM of warehouse_stock for each product
        await conn.query(`
            UPDATE products p
            LEFT JOIN (
                SELECT product_id, COALESCE(SUM(stock), 0) AS total
                FROM warehouse_stock
                GROUP BY product_id
            ) ws ON ws.product_id = p.id
            SET p.stock = COALESCE(ws.total, 0)
        `);
        await conn.commit();
        res.json({ success: true, message: 'Stok produk berhasil disinkronkan dengan stok gudang.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyinkronkan stok.' });
    } finally {
        conn.release();
    }
});

// DELETE product
router.delete('/:id', auth, async (req, res) => {
    try {
        const [old] = await pool.query('SELECT image FROM products WHERE id = ?', [req.params.id]);
        if (old[0] && old[0].image) {
            const oldPath = path.join(__dirname, '../public', old[0].image);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Produk berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus produk.' });
    }
});

module.exports = router;
