const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const MailController =require("../controllers/MailController")
const rateLimit = require('express-rate-limit');

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 OTP requests per windowMs
  message: 'Too many OTP requests from this IP, please try again later'
});

router.post('/send-otp', otpLimiter, authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/Login', authController.Login);
router.get('/health',authController.health)
router.post('/send-mail',MailController.confirmBooking)

module.exports = router;