// server.js
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === PostgreSQL connection ===
const pool = new Pool({
  user: 'postgres',      // default superuser
  host: 'localhost',
  database: 'attendance_db',
  password: 'postgres',  // use the password you set in installer
  port: 5432,
});

// Get students
app.get('/api/students', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, roll FROM students ORDER BY id;');
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// Save attendance
app.post('/api/attendance', async (req, res) => {
  const { course, session_date, records } = req.body;
  if (!course || !session_date || !Array.isArray(records)) return res.status(400).json({ error: 'missing fields' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = `
      INSERT INTO attendance (student_id, course, session_date, status)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (student_id, course, session_date) DO UPDATE SET status = EXCLUDED.status;
    `;
    for (const r of records) {
      await client.query(q, [r.student_id, course, session_date, r.status]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'db error' });
  } finally {
    client.release();
  }
});

// Report
app.get('/api/report', async (req, res) => {
  try {
    const sql = `
      SELECT s.name, s.roll,
             COUNT(a.id) FILTER (WHERE a.status='Present') AS present,
             COUNT(a.id) AS total,
             ROUND(COUNT(a.id) FILTER (WHERE a.status='Present')::numeric / NULLIF(COUNT(a.id),0) * 100, 2) AS percentage
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id
      GROUP BY s.id, s.name, s.roll
      ORDER BY s.id;
    `;
    const r = await pool.query(sql);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
