require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    error: 'Something went wrong!' 
  });
});

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(process.env.PORT || 8080, () => {
      console.log("server listening on port " + process.env.PORT);
      console.log("db connected");
    });
  })
  .catch((e) => {
    console.log(e, "error");
  });