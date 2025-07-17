const express = require('express');
const router = express.Router();
const { sendOTP } = require('../otpService');
const UserOTP = require('../models/UserOtp');
const bcrypt = require('bcryptjs');
const twilio = require('twilio');
const crypto = require('crypto');

// Send OTP



// In-memory storage for OTPs (consider Redis in production)
const otpStorage = new Map();

// Load credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

// Generate secure 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Validate and format phone number
function formatPhone(phone) {
  // Remove all non-digit characters
  const cleaned = `${phone}`.replace(/\D/g, '');
  
  // Handle Indian numbers (add country code if missing)
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  
  // If already has country code
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  
  // For other international numbers
  if (cleaned.length > 10 && !cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  
  return null;
}

// Send OTP endpoint with rate limiting
router.post('/send-otp',  async (req, res) => {
  try {
    const { name,phone,email } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number is required' 
      });
    }

    const formattedNumber = formatPhone(phone);
    if (!formattedNumber) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number format. Please use 10-digit Indian number or international format' 
      });
    }

    // Check if recent OTP exists and hasn't expired
    const existingOTP = otpStorage.get(formattedNumber);
    if (existingOTP && existingOTP.expiresAt > Date.now()) {
      return res.status(429).json({
        success: false,
        error: 'OTP already sent. Please wait before requesting a new one'
      });
    }

    const otp = generateOTP();
    const ttl = 5 * 60 * 1000; // 5 minutes

    otpStorage.set(formattedNumber, { 
      otp, 
      expiresAt: Date.now() + ttl,
      attempts: 0 // Track verification attempts
    });

    // Send OTP via Twilio
    await client.messages.create({
      body: `Your verification code is: ${otp}. Valid for 5 minutes.`,
      to: formattedNumber,
      from: twilioPhone
    });

    // In development, return the OTP for testing
    const response = { 
      success: true, 
      message: 'OTP sent successfully' 
    };
    
    if (process.env.NODE_ENV === 'development') {
      response.debug = { otp };
    }

    res.json(response);
  } catch (err) {
    console.error('Error sending OTP:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send OTP',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp,name,email } = req.body;

    const newUser={
      phone,otp,name,email
    }
    if (!phone || !otp) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number and OTP are required' 
      });
    }

    const formattedNumber = formatPhone(phone);
    if (!formattedNumber) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number format' 
      });
    }

    const storedData = otpStorage.get(formattedNumber);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        error: 'OTP not found or expired' 
      });
    }

    const user = await newUser.save();
    // Check attempts
    if (storedData.attempts >= 3) {
      otpStorage.delete(formattedNumber);
      return res.status(400).json({
        success: false,
        error: 'Too many attempts. Please request a new OTP',
        data:user
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(formattedNumber);
      return res.status(400).json({ 
        success: false,
        error: 'OTP expired' 
      });
    }

    if (storedData.otp === otp) {
      otpStorage.delete(formattedNumber);
      return res.json({ 
        success: true, 
        message: 'OTP verified successfully' 
      });
    } else {
      // Increment failed attempts
      storedData.attempts += 1;
      otpStorage.set(formattedNumber, storedData);
      
      return res.status(400).json({ 
        success: false,
        error: 'Invalid OTP',
        attemptsLeft: 3 - storedData.attempts
      });
    }
  } catch (err) {
    console.error('Error verifying OTP:', err);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;