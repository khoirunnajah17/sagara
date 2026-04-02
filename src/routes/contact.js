const express = require('express');
const router = express.Router();
const db = require('../config/db');

// POST /api/contact - Submit contact message (public, no auth)
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;
    if (!name || !phone || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Harap isi semua field yang wajib' });
    }
    await db.query(
      'INSERT INTO contact_messages (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, phone, email || null, subject, message]
    );
    res.json({ success: true, message: 'Pesan berhasil dikirim' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal mengirim pesan' });
  }
});

// GET /api/contact - List messages (admin only)
router.get('/', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const [rows] = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/contact/:id/read - Mark as read
router.put('/:id/read', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    await db.query('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/contact/:id - Delete message
router.delete('/:id', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    await db.query('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/contact/unread-count - Unread message count
router.get('/unread-count', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM contact_messages WHERE is_read = 0');
    res.json({ success: true, count: rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
