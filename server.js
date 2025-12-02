// server.js
const express = require("express");
const path = require("path");
const pool = require("./db");

const app = express();
const PORT = 3000;
const AVG_SERVICE_MIN = 20; // each patient takes 10 mins on average

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Helper: simple triage rule based on pain level ----------
function calculateTriageLevel(pain) {
  if (pain >= 8) return 1;      // most urgent
  if (pain >= 5) return 2;
  return 3;
}

// ---------- Helper: queue with computed wait times ----------
async function getQueueWithWaitTimes() {
  const result = await pool.query(
    `SELECT id, name, age, triage_level_code, status, created_at
     FROM patients
     WHERE status = 'waiting'
     ORDER BY triage_level_code ASC, created_at ASC`
  );

  console.log(">>> Using AVG_SERVICE_MIN =", AVG_SERVICE_MIN);

  return result.rows.map((p, index) => {
    const wait = index * AVG_SERVICE_MIN;
    console.log("   patient", p.id, "index", index, "wait", wait);
    return {
      ...p,
      position: index + 1,
      estimated_wait_min: wait
    };
  });
}


// ---------- Test DB route (keep this, handy for debugging) ----------
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ ok: true, time: result.rows[0].now });
  } catch (err) {
    console.error("DB test error:", err);
    res.status(500).json({ ok: false, error: "DB connection failed" });
  }
});

// ---------- PATIENT: register ----------
app.post("/api/patients", async (req, res) => {
  const { name, age, symptoms, pain_level, notes } = req.body;

  if (!name || !age || !symptoms || !pain_level) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const pain = Number(pain_level);
  const ageNum = Number(age);
  if (Number.isNaN(pain) || pain < 1 || pain > 10) {
    return res.status(400).json({ error: "Pain level must be 1–10" });
  }

  const triage_level_code = calculateTriageLevel(pain);

  try {
    const result = await pool.query(
      `INSERT INTO patients
       (name, age, symptoms, pain_level, notes, triage_level_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting')
       RETURNING *`,
      [name, ageNum, symptoms, pain, notes || null, triage_level_code]
    );

    const newPatient = result.rows[0];
    res.status(201).json(newPatient);
  } catch (err) {
    console.error("Error inserting patient:", err);
    res.status(500).json({ error: "Database insert error" });
  }
});

// ---------- PATIENT: status for a single patient ----------
app.get("/api/patients/:id/status", async (req, res) => {
  const { id } = req.params;

  try {
    const queue = await getQueueWithWaitTimes();
    const patient = queue.find(p => String(p.id) === String(id));

    if (!patient) {
      return res
        .status(404)
        .json({ error: "Patient not found in waiting queue" });
    }

    res.json(patient);
  } catch (err) {
    console.error("Error computing patient status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- ADMIN: full queue list ----------
app.get("/api/patients", async (req, res) => {
  try {
    const queue = await getQueueWithWaitTimes();
    res.json(queue);
  } catch (err) {
    console.error("Error loading queue:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- ADMIN: update triage level (priority) ----------
app.patch("/api/patients/:id", async (req, res) => {
  const { id } = req.params;
  const { triage_level_code, status } = req.body;

  if (!triage_level_code && !status) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  try {
    const result = await pool.query(
      `UPDATE patients
       SET triage_level_code = COALESCE($1, triage_level_code),
           status            = COALESCE($2, status),
           updated_at        = NOW()
       WHERE id = $3
       RETURNING *`,
      [triage_level_code || null, status || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating patient:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ---------- ADMIN / GENERAL: get full patient by ID ----------
app.get("/api/patients/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, name, age, symptoms, pain_level, notes,
              triage_level_code, status, created_at, updated_at
       FROM patients
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error loading patient by id:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
