const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const { createKasJournal, deleteKasJournal } = require('./kas');

// Helper: add stock for purchase items (products.stock + warehouse_stock)
async function addPurchaseStock(conn, items, warehouseId) {
    for (const item of items) {
        const qty = parseFloat(item.quantity);
        const [[prod]] = await conn.query('SELECT buy_content FROM products WHERE id = ?', [item.product_id]);
        const buyContent = parseFloat(prod?.buy_content) || 1;
        const totalQty = qty * buyContent;
        // Add global stock
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [totalQty, item.product_id]);
        // Add warehouse stock
        if (warehouseId) {
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = stock + ?`,
                [warehouseId, item.product_id, totalQty, totalQty]
            );
        }
    }
}

// Helper: restore (subtract) stock for purchase items (products.stock + warehouse_stock)
async function removePurchaseStock(conn, items, warehouseId) {
    for (const item of items) {
        const qty = parseFloat(item.quantity);
        const [[prod]] = await conn.query('SELECT buy_content FROM products WHERE id = ?', [item.product_id]);
        const buyContent = parseFloat(prod?.buy_content) || 1;
        const totalQty = qty * buyContent;
        // Remove global stock
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [totalQty, item.product_id]);
        // Remove warehouse stock
        if (warehouseId) {
            await conn.query(
                `INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, -?)
                 ON DUPLICATE KEY UPDATE stock = stock - ?`,
                [warehouseId, item.product_id, totalQty, totalQty]
            );
        }
    }
}

// GET all purchases
router.get('/', auth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = [], params = [];
        if (status) { where.push('p.status = ?'); params.push(status); }
        const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT p.*, u.username as created_by_name
             FROM purchases p LEFT JOIN users u ON p.created_by = u.id
             ${whereSQL} ORDER BY p.date DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM purchases p ${whereSQL}`, params);
        res.json({ success: true, data: rows, total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pembelian.' });
    }
});

// GET single purchase with items
router.get('/:id', auth, async (req, res) => {
    try {
        const [purchases] = await pool.query('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
        if (!purchases.length) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan.' });
        const [items] = await pool.query(
            `SELECT pi.*, p.name as product_name, p.code as product_code
             FROM purchase_items pi JOIN products p ON pi.product_id = p.id
             WHERE pi.purchase_id = ?`, [req.params.id]
        );
        res.json({ success: true, data: { ...purchases[0], items } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail pembelian.' });
    }
});

// POST create purchase
router.post('/', auth, async (req, res) => {
    const { po_number, date, supplier_name, supplier_address, status, notes, items, warehouse_id } = req.body;
    if (!po_number || !date || !supplier_name || !items || !items.length)
        return res.status(400).json({ success: false, message: 'Data pembelian tidak lengkap.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0);
        const purchaseStatus = status || 'DRAFT';

        const [result] = await conn.query(
            `INSERT INTO purchases (po_number, date, supplier_name, supplier_address, subtotal, total, status, notes, created_by, warehouse_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [po_number, date, supplier_name, supplier_address || null, subtotal, subtotal, purchaseStatus, notes || null, req.session.user.id, warehouse_id || null]
        );
        const purchaseId = result.insertId;

        for (const item of items) {
            const itemSubtotal = parseFloat(item.unit_price) * parseFloat(item.quantity);
            await conn.query(
                'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [purchaseId, item.product_id, item.quantity, item.unit_price, itemSubtotal]
            );
        }

        // Only add stock if status is RECEIVED
        if (purchaseStatus === 'RECEIVED') {
            await addPurchaseStock(conn, items, warehouse_id);
            // Potong saldo kas otomatis
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'KELUAR', ?, ?, ?, ?)`,
                [po_number, date, supplier_name, `Pembelian ${po_number}`, subtotal, req.session.user.id]
            );
            // Auto-create journal entry
            await createKasJournal(conn, {
                date, description: `Pembelian ${po_number}`, reference: po_number,
                amount: subtotal, type: 'KELUAR', userId: req.session.user.id, isPurchase: true
            });
        }

        await conn.commit();
        res.json({ success: true, message: 'Pembelian berhasil disimpan.', id: purchaseId });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Nomor PO sudah ada.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pembelian.' });
    } finally {
        conn.release();
    }
});

// PUT update purchase status
router.put('/:id/status', auth, async (req, res) => {
    const { status } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [old] = await conn.query('SELECT status, warehouse_id FROM purchases WHERE id = ?', [req.params.id]);
        if (!old.length) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan.' });

        const oldStatus = old[0].status;
        const warehouseId = old[0].warehouse_id;

        await conn.query('UPDATE purchases SET status = ? WHERE id = ?', [status, req.params.id]);

        const [items] = await conn.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [req.params.id]);

        // Get purchase details for kas
        const [[purchaseData]] = await conn.query('SELECT po_number, date, supplier_name, total FROM purchases WHERE id = ?', [req.params.id]);

        // Transition to RECEIVED: add stock + potong kas
        if (status === 'RECEIVED' && oldStatus !== 'RECEIVED') {
            await addPurchaseStock(conn, items, warehouseId);
            await conn.query(
                `INSERT INTO kas (reference, date, type, counterparty, description, amount, created_by)
                 VALUES (?, ?, 'KELUAR', ?, ?, ?, ?)`,
                [purchaseData.po_number, purchaseData.date, purchaseData.supplier_name, `Pembelian ${purchaseData.po_number}`, purchaseData.total, req.session.user.id]
            );
            // Auto-create journal entry
            await createKasJournal(conn, {
                date: purchaseData.date, description: `Pembelian ${purchaseData.po_number}`, reference: purchaseData.po_number,
                amount: parseFloat(purchaseData.total), type: 'KELUAR', userId: req.session.user.id, isPurchase: true
            });
        }
        // Transition from RECEIVED to something else (e.g. CANCELLED): remove stock + kembalikan kas
        else if (oldStatus === 'RECEIVED' && status !== 'RECEIVED') {
            await removePurchaseStock(conn, items, warehouseId);
            await deleteKasJournal(conn, purchaseData.po_number);
            await conn.query('DELETE FROM kas WHERE reference = ? AND type = ?', [purchaseData.po_number, 'KELUAR']);
        }

        await conn.commit();
        res.json({ success: true, message: 'Status pembelian diperbarui.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
    } finally {
        conn.release();
    }
});

// DELETE purchase — restore stock if was RECEIVED
router.delete('/:id', auth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[purchase]] = await conn.query('SELECT status, warehouse_id FROM purchases WHERE id = ?', [req.params.id]);
        if (!purchase) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan.' });

        // If was RECEIVED, restore stock + kembalikan kas
        if (purchase.status === 'RECEIVED') {
            const [items] = await conn.query('SELECT * FROM purchase_items WHERE purchase_id = ?', [req.params.id]);
            await removePurchaseStock(conn, items, purchase.warehouse_id);
            const [[purchaseData]] = await conn.query('SELECT po_number FROM purchases WHERE id = ?', [req.params.id]);
            if (purchaseData) {
                await deleteKasJournal(conn, purchaseData.po_number);
                await conn.query('DELETE FROM kas WHERE reference = ? AND type = ?', [purchaseData.po_number, 'KELUAR']);
            }
        }
        await conn.query('DELETE FROM purchase_items WHERE purchase_id = ?', [req.params.id]);
        await conn.query('DELETE FROM purchases WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ success: true, message: 'Pembelian berhasil dihapus.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menghapus pembelian.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
