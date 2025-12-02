// db.js
const { Pool } = require("pg");

const pool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",         
  password: "root", // 
  database: "emergency_waitlist", 
});

module.exports = pool;
