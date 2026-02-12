const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-secret-key';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./attendance.db');

// Create tables
db.serialize(() => {
  db.run(`DROP TABLE IF EXISTS users`);
  db.run(`DROP TABLE IF EXISTS timetables`);
  db.run(`DROP TABLE IF EXISTS otps`);
  db.run(`DROP TABLE IF EXISTS attendance`);

  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    type TEXT
  )`);

  db.run(`CREATE TABLE timetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    day TEXT,
    start_time TEXT,
    end_time TEXT,
    subject TEXT,
    section TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE otps (
    id TEXT PRIMARY KEY,
    teacher_id INTEGER,
    subject TEXT,
    section TEXT,
    date TEXT,
    otp TEXT,
    lat REAL,
    lng REAL,
    expires_at INTEGER,
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    teacher_id INTEGER,
    subject TEXT,
    section TEXT,
    date TEXT,
    roll_number TEXT,
    lat REAL,
    lng REAL,
    timestamp INTEGER,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  )`);
});

// Middleware to verify token
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send('Token required');
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).send('Invalid token');
    req.userId = decoded.id;
    req.userType = decoded.type;
    next();
  });
}

// Routes
app.post('/register', async (req, res) => {
  const { email, password, type } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (email, password, type) VALUES (?, ?, ?)', [email, hashedPassword, type], function(err) {
    if (err) return res.status(400).send('User already exists');
    res.send('Registration successful');
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).send('Invalid credentials');
    }
    const token = jwt.sign({ id: user.id, type: user.type }, SECRET_KEY);
    res.json({ token, dashboard: user.type === 'student' ? 'student-dashboard.html' : 'teacher-dashboard.html' });
  });
});

app.post('/add-timetable', verifyToken, (req, res) => {
  const { day, start_time, end_time, subject, section } = req.body;
  db.run('INSERT INTO timetables (user_id, day, start_time, end_time, subject, section) VALUES (?, ?, ?, ?, ?, ?)', [req.userId, day, start_time, end_time, subject, section || null], function(err) {
    if (err) return res.status(400).send('Error adding timetable');
    res.send('Timetable added');
  });
});

app.put('/timetable/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, subject, section } = req.body;
  db.run('UPDATE timetables SET start_time = ?, end_time = ?, subject = ?, section = ? WHERE id = ? AND user_id = ?', [start_time, end_time, subject, section || null, id, req.userId], function(err) {
    if (err) return res.status(400).send('Error updating timetable');
    res.send('Timetable updated');
  });
});

app.delete('/timetable/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM timetables WHERE id = ? AND user_id = ?', [id, req.userId], function(err) {
    if (err) return res.status(400).send('Error deleting timetable');
    res.send('Timetable deleted');
  });
});

app.get('/timetable', verifyToken, (req, res) => {
  db.all('SELECT * FROM timetables WHERE user_id = ?', [req.userId], (err, rows) => {
    if (err) return res.status(400).send('Error');
    res.json(rows);
  });
});

app.get('/timetable/:date', verifyToken, (req, res) => {
  const { date } = req.params;
  const day = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  db.all('SELECT * FROM timetables WHERE user_id = ? AND day = ?', [req.userId, day], (err, rows) => {
    if (err) return res.status(400).send('Error');
    res.json(rows);
  });
});

app.post('/generate-otp', verifyToken, (req, res) => {
  if (req.userType !== 'teacher') return res.status(403).send('Only teachers can generate OTP');
  const { subject, section, date, lat, lng } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires_at = Date.now() + 120000; // 2 minutes
  const id = uuidv4();
  db.run('INSERT INTO otps (id, teacher_id, subject, section, date, otp, lat, lng, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, req.userId, subject, section, date, otp, lat, lng, expires_at], function(err) {
    if (err) return res.status(400).send('Error generating OTP');
    res.json({ otp });
  });
});

app.post('/mark-attendance', verifyToken, (req, res) => {
  if (req.userType !== 'student') return res.status(403).send('Only students can mark attendance');
  const { roll_number, otp, lat, lng, subject, date } = req.body;
  db.get('SELECT * FROM otps WHERE otp = ? AND subject = ? AND date = ? AND expires_at > ?', [otp, subject, date, Date.now()], (err, otpRow) => {
    if (err || !otpRow) return res.status(400).send('Invalid or expired OTP');
    // Check location
    const distance = getDistance(lat, lng, otpRow.lat, otpRow.lng);
    if (distance > 200) return res.status(400).send('Location mismatch');
    // Check if already marked
    db.get('SELECT * FROM attendance WHERE student_id = ? AND subject = ? AND date = ?', [req.userId, subject, date], (err, att) => {
      if (att) return res.status(400).send('Already marked');
      db.run('INSERT INTO attendance (student_id, teacher_id, subject, section, date, roll_number, lat, lng, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.userId, otpRow.teacher_id, subject, otpRow.section, date, roll_number, lat, lng, Date.now()], function(err) {
        if (err) return res.status(400).send('Error marking attendance');
        res.send('Attendance marked');
      });
    });
  });
});

app.get('/attendance', verifyToken, (req, res) => {
  if (req.userType !== 'teacher') return res.status(403).send('Only teachers can view attendance');
  db.all('SELECT DISTINCT date FROM attendance WHERE teacher_id = ?', [req.userId], (err, rows) => {
    if (err) return res.status(400).send('Error');
    res.json(rows.map(r => r.date));
  });
});

app.get('/attendance/:date', verifyToken, (req, res) => {
  if (req.userType !== 'teacher') return res.status(403).send('Only teachers can view attendance');
  const { date } = req.params;
  db.all('SELECT roll_number FROM attendance WHERE teacher_id = ? AND date = ?', [req.userId, date], (err, rows) => {
    if (err) return res.status(400).send('Error');
    res.json(rows.map(r => r.roll_number));
  });
});

// Helper function to calculate distance
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});