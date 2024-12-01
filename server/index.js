const express = require('express');
const bodyParser = require('body-parser');
const db = require('./database');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const paymentRoute = require('./payment');
const multer = require('multer');
const FormData = require('form-data');
const axios = require("axios");
const dayjs = require("dayjs");
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const JWT_SECRET = 'hellohackerman';

const upload = multer({ storage: multer.memoryStorage() });

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL');
});


app.post('/api/bookings', (req, res) => {
  const { field, date, startTime, endTime, timeUsed, name, phone } = req.body;
  console.log(field, date, startTime, endTime, timeUsed, name, phone);

  const checkQuery = `
SELECT * FROM reserve WHERE field = ? AND date = ? AND (startTime < ? AND endTime > ?)
  `;
  db.query(checkQuery, [field, date, endTime, startTime], (err, results) => {
    if (err) return res.status(500).send(err);
    if (results.length > 0) {
      return res.status(400).send({ message: 'เวลานี้ถูกจองแล้ว' });
    }

    const query = `INSERT INTO reserve (field, date, startTime, endTime, timeUsed, name, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.query(query, [field, date, startTime, endTime, timeUsed, name, phone], (err, result) => {
      if (err) return res.status(500).send(err);
      res.status(201).send({ message: 'จองสำเร็จ', bookingId: result.insertId });
    });
  });
});

app.get('/api/bookings', (req, res) => {
  const sql = 'SELECT * FROM reserve';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      res.status(500).send('Error fetching bookings');
    } else {
      if (Array.isArray(results)) {
        res.json(results);
      } else {
        res.json([]);
      }
    }
  });
});


app.post('/api/member/register', (req, res) => {
  const { name, phone, password } = req.body;
  console.log('Request body:', req.body);

  if (!name || !phone || !password) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const checkQuery = 'SELECT * FROM users WHERE phone = ?';
  db.query(checkQuery, [phone], (err, existingUser) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเช็คเบอร์โทร' });
    }

    if (existingUser.length > 0) {
      return res.status(409).json({ message: 'เบอร์โทรนี้ถูกใช้ไปแล้ว' });
    }

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้ารหัสรหัสผ่าน' });
      }

      const insertQuery = 'INSERT INTO users (name, phone, password) VALUES (?, ?, ?)';
      db.query(insertQuery, [name, phone, hash], (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
        }
        return res.status(201).json({ message: 'ลงทะเบียนสำเร็จ', userId: result.insertId });
      });
    });
  });
});


app.post('/api/member/login', (req, res) => {
  const { phone, password } = req.body;

  const query = 'SELECT * FROM users WHERE phone = ?';
  db.query(query, [phone], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Server error' });
    }
    if (result.length === 0) {
      return res.status(401).json({ message: 'Invalid phone or password' });
    }
    // ตรวจรหัสผ่าน
    const user = result[0];
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: 'Server error' });
      }
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid phone or password' });
      }
      const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
      return res.status(200).json({ message: 'Login successful', name: user.name, token });
    });
  });
});

app.use('/api/payment', paymentRoute);

app.post('/api/payment/upload-slip', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดไฟล์สลิป' });
    }
    const { amount } = req.body;
    const branchId = "30828";
    const apiKey = "SLIPOKE0E8CPS";

    const form = new FormData();
    form.append('files', req.file.buffer, { filename: req.file.originalname });
    form.append('amount', amount);
    form.append('log', 'true');

    const response = await axios.post(
      `https://api.slipok.com/api/line/apikey/${branchId}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          "x-authorization": apiKey,
        },
      }
    );

    const slipData = response.data.data;
    console.log(slipData);

    res.status(200).json({ message: 'อัปโหลดสลิปสำเร็จ', slipData });
  } catch (err) {
    console.error(err);
    if (axios.isAxiosError(err) && err.response) {
      const statusCode = err.response.status;
      const errorMessage = err.response.data?.message || 'เกิดข้อผิดพลาด';
      console.log(`Error ${statusCode}: ${errorMessage}`);
      return res.status(statusCode).json({ message: errorMessage });
    }
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปโหลดสลิป' });
  }
});

app.get('/api/tickets', (req, res) => {
  const sql = 'SELECT * FROM reserve WHERE phone = ?';
  const phone = req.query.phone;

  db.query(sql, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      res.status(500).send('Error fetching bookings');
    } else {
      if (Array.isArray(results)) {
        res.json(results);
      } else {
        res.json([]);
      }
    }
  });
});

app.post("/api/verify-qrcode", (req, res) => {
  const { qrcode } = req.body;

  if (!qrcode) {
    return res.status(400).json({ success: false, message: "QR Code is required" });
  }

  try {
    const decodedData = decodeURIComponent(qrcode);
    const bookingInfo = JSON.parse(decodedData);
    console.log(bookingInfo);

    const { field, date, startTime, endTime } = bookingInfo;

    // สร้างวันที่และเวลาจากข้อมูลใน QR Code
    const qrStartDateTime = dayjs(`${date} ${startTime}`);
    const qrEndDateTime = dayjs(`${date} ${endTime}`);
    const currentTime = dayjs();

    // ตรวจสอบว่า date, startTime, และ endTime ตรงกับปัจจุบันหรือไม่
    if (!qrStartDateTime.isValid() || !qrEndDateTime.isValid()) {
      return res.status(400).json({ success: false, message: "Invalid QR Code format" });
    }

    // ตรวจสอบว่าเวลาปัจจุบันอยู่ในช่วงระหว่าง startTime และ endTime หรือไม่
    if (currentTime.isBetween(qrStartDateTime, qrEndDateTime, null, '[)')) {
      return res.status(200).json({ success: true, message: "วันที่และเวลาถูกต้อง", bookingInfo });
    } else {
      return res.status(400).json({ success: false, message: "วันที่หรือเวลาไม่ถูกต้อง" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});


app.listen(3001, () => {
  console.log('Server running on port 3001');
});
