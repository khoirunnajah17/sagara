const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');
const admin   = require('../middleware/admin');

const ALL_MENUS = ['dashboard','accounts','journal','sales','purchases','inventory','kas','hutang','reports','users'];

// ──────────────── MY ACCESS (must be before /:id routes) ────

// GET access for current logged-in user (user_access first, fallback role_access)
router.get('/my-access', auth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const role   = req.session.user.role;
        const [userRows] = await pool.query('SELECT * FROM user_access WHERE user_id = ?', [userId]);
        let access = {};
        if (userRows.length) {
            userRows.forEach(r => { access[r.menu] = { can_view: !!r.can_view, can_create: !!r.can_create, can_edit: !!r.can_edit, can_delete: !!r.can_delete }; });
        } else {
            const [roleRows] = await pool.query('SELECT * FROM role_access WHERE role = ?', [role]);
            roleRows.forEach(r => { access[r.menu] = { can_view: !!r.can_view, can_create: !!r.can_create, can_edit: !!r.can_edit, can_delete: !!r.can_delete }; });
        }
        res.json({ success: true, data: access, role });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil akses.' });
    }
});

// GET all role_access (admin only)
router.get('/role-access', auth, admin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM role_access ORDER BY role, menu');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data akses role.' });
    }
});

// PUT update role_access defaults (admin only)
router.put('/role-access/:role', auth, admin, async (req, res) => {
    const { role } = req.params;
    const { permissions } = req.body;
    if (!permissions || !Array.isArray(permissions))
        return res.status(400).json({ success: false, message: 'Data permissions tidak valid.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM role_access WHERE role = ?', [role]);
        for (const p of permissions) {
            await conn.query(
                'INSERT INTO role_access (role, menu, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                [role, p.menu, p.can_view ? 1 : 0, p.can_create ? 1 : 0, p.can_edit ? 1 : 0, p.can_delete ? 1 : 0]
            );
        }
        await conn.commit();
        res.json({ success: true, message: `Akses default role "${role}" berhasil diperbarui.` });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui akses role.' });
    } finally {
        conn.release();
    }
});

// ──────────────── USERS CRUD ────────────────

// GET all users (admin only)
router.get('/', auth, admin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY id'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pengguna.' });
    }
});

// POST create user (admin only) — auto-initialize user_access from role_access
router.post('/', auth, admin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({ success: false, message: 'Username, email, dan password wajib diisi.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const hashed = await bcrypt.hash(password, 10);
        const [result] = await conn.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashed, role || 'user']
        );
        const userId = result.insertId;
        const [defaults] = await conn.query('SELECT * FROM role_access WHERE role = ?', [role || 'user']);
        for (const d of defaults) {
            await conn.query(
                'INSERT INTO user_access (user_id, menu, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, d.menu, d.can_view, d.can_create, d.can_edit, d.can_delete]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Pengguna berhasil ditambahkan.', id: userId });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Username atau email sudah digunakan.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal menambahkan pengguna.' });
    } finally {
        conn.release();
    }
});

// PUT update user (admin only)
router.put('/:id', auth, admin, async (req, res) => {
    const { username, email, role, is_active, password } = req.body;
    try {
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET username=?, email=?, role=?, is_active=?, password=? WHERE id=?',
                [username, email, role, is_active ? 1 : 0, hashed, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username=?, email=?, role=?, is_active=? WHERE id=?',
                [username, email, role, is_active ? 1 : 0, req.params.id]
            );
        }
        res.json({ success: true, message: 'Pengguna berhasil diperbarui.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'Username atau email sudah digunakan.' });
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui pengguna.' });
    }
});

// DELETE user (admin only, cannot delete self)
router.delete('/:id', auth, admin, async (req, res) => {
    if (parseInt(req.params.id) === req.session.user.id)
        return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun sendiri.' });
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Pengguna berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus pengguna.' });
    }
});

// ──────────────── PER-USER ACCESS ────────────────

// GET access for a specific user (admin only)
router.get('/:id/access', auth, admin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM user_access WHERE user_id = ? ORDER BY menu', [req.params.id]);
        const access = {};
        rows.forEach(r => { access[r.menu] = { can_view: !!r.can_view, can_create: !!r.can_create, can_edit: !!r.can_edit, can_delete: !!r.can_delete }; });
        res.json({ success: true, data: access });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil akses pengguna.' });
    }
});

// PUT update access for a specific user (admin only)
router.put('/:id/access', auth, admin, async (req, res) => {
    const userId = req.params.id;
    const { permissions } = req.body;
    if (!permissions || !Array.isArray(permissions))
        return res.status(400).json({ success: false, message: 'Data permissions tidak valid.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM user_access WHERE user_id = ?', [userId]);
        for (const p of permissions) {
            await conn.query(
                'INSERT INTO user_access (user_id, menu, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, p.menu, p.can_view ? 1 : 0, p.can_create ? 1 : 0, p.can_edit ? 1 : 0, p.can_delete ? 1 : 0]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Akses pengguna berhasil diperbarui.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui akses pengguna.' });
    } finally {
        conn.release();
    }
});

// POST reset user access to role defaults (admin only)
router.post('/:id/access/reset', auth, admin, async (req, res) => {
    const userId = req.params.id;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[user]] = await conn.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' }); }
        await conn.query('DELETE FROM user_access WHERE user_id = ?', [userId]);
        const [defaults] = await conn.query('SELECT * FROM role_access WHERE role = ?', [user.role]);
        for (const d of defaults) {
            await conn.query(
                'INSERT INTO user_access (user_id, menu, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, d.menu, d.can_view, d.can_create, d.can_edit, d.can_delete]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Akses direset ke default role.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: 'Gagal mereset akses.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
