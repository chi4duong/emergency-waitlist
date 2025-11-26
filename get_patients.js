// get_patients.js
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// Configure connection to PostgreSQL
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',              // PG username
  password: 'root',// PG password
  database: 'emergency_waitlist' //  DB name
});

// Route: GET /patients
app.get('/patients', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM patients');
    res.json(result.rows);
    client.release();
  } catch (err) {
    console.error('Database error', err.stack);
    res.status(500).send('Server error');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
