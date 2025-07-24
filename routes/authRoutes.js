const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const nodemailer = require("nodemailer");
const crypto = require('crypto');
require('dotenv').config();
const jwt = require("jsonwebtoken");
const User = require('../models/UserOtp');
const Inquiry = require('../models/email');
const PackageController=require('../controllers/packageController')

// Rate limiting configuration
const otpLimiter = rateLimit({
  message: 'Too many OTP requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 login attempts per hour
  message: 'Too many login attempts, please try again later'
});

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || "subhamtours3@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "cnwl mruv aluf ekhy",
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
});

// Verify email connection
transporter.verify((error) => {
  if (error) {
    console.error('Mail server error:', error);
  } else {
    console.log('Mail server ready');
  }
});

// OTP Storage (in-memory for simplicity, use Redis in production)
const otpStorage = new Map();

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// OTP Email Template
const otpEmailTemplate = (otp) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
    <div style="max-width: 600px; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 12px rgba(0,0,0,0.1);">
      <h2 style="background:#007BFF; color: white; padding: 12px; border-radius: 5px; text-align: center; font-size: 20px;">
        Your One-Time Password (OTP)
      </h2>
      <p style="font-size: 16px; color: #333;">
        Your verification code is: <strong>${otp}</strong>
      </p>
      <p style="font-size: 14px; color: #666;">
        This code will expire in 5 minutes. Please do not share it with anyone.
      </p>
    </div>
  </div>
`;

// Send OTP Email
const sendOTPEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || "no-reply@subham.com",
      to: email,
      subject: "Your Verification Code",
      html: otpEmailTemplate(otp)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send OTP to ${email}:`, error);
    return false;
  }
};

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || "T2s$w9qZ8@uG5#1!pR";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT Token Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

// Routes
router.post('/send-mail-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  // Check if user already exists
  try {
    
   

    // Generate and store OTP
    const otp = generateOTP();
    otpStorage.set(email, {
      otp,
      expiresAt: Date.now() + 300000 // 5 minutes
    });

    // Send OTP via email
    const sent = await sendOTPEmail(email, otp);

    if (sent) {
      res.json({ success: true, message: "OTP sent successfully" });
    } else {
      res.status(500).json({ success: false, error: "Failed to send OTP" });
    }
  } catch (error) {
    console.error("Error checking user existence:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server error while checking user existence" 
    });
  }
});

router.post('/verify-mail-otp', async (req, res) => {
  const { email, otp, name, phone } = req.body;

  // Validate required fields
  if (!email || !otp || !name || !phone) {
    return res.status(400).json({ 
      success: false, 
      error: "Email, OTP, name, and phone are required",
      missingFields: {
        email: !email,
        otp: !otp,
        name: !name,
        phone: !phone
      }
    });
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid email format" 
    });
  }

  // Verify OTP
  const storedOtp = otpStorage.get(email);
  if (!storedOtp) {
    return res.status(400).json({ 
      success: false, 
      error: "OTP not found or expired" 
    });
  }

  if (Date.now() > storedOtp.expiresAt) {
    otpStorage.delete(email);
    return res.status(400).json({ 
      success: false, 
      error: "OTP expired" 
    });
  }

  if (storedOtp.otp !== otp) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid OTP" 
    });
  }

  // OTP is valid, check if user exists
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // User exists - generate token and return user data
      const token = generateToken(existingUser._id);
      
      // Clear OTP after successful verification
      otpStorage.delete(email);

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        token,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
        },
        isNewUser: false, // Indicates existing user
      });
    }

    // User doesn't exist - create new user
    const userData = { 
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim()
    };

    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Generate JWT token
    const token = generateToken(savedUser._id);

    // Clear OTP after successful registration
    otpStorage.delete(email);

    return res.status(201).json({
      success: true,
      message: "OTP verified and user registered successfully",
      token,
      user: {
        _id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        phone: savedUser.phone,
      },
      isNewUser: true,
    });
  } catch (dbError) {
    console.error("Database error:", dbError);
    return res.status(500).json({
      success: false,
      error: "Failed to process user registration",
    });
  }
});

// Email Templates
const emailTemplates = {
  inquiryNotification: (values) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
      <div style="max-width: 600px; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 12px rgba(0,0,0,0.1);">
        <h2 style="background:#007BFF; color: white; padding: 12px; border-radius: 5px; text-align: center; font-size: 20px;">
          📩 New Inquiry Notification
        </h2>
        <p style="font-size: 16px; color: #333;">
          <strong>Name:</strong> ${values.name}<br>
          <strong>Email:</strong> ${values.email}<br>
          <strong>Phone:</strong> ${values.phone || 'Not provided'}<br>
          <strong>Message:</strong><br> ${values.message}
        </p>
        <hr style="border: 0; border-top: 1px solid #ddd;">
        <p style="text-align: center; font-size: 14px; color: #666;">
          Thank you for reaching out! Our team will get back to you soon.
        </p>
      </div>
    </div>
  `,

  confirmationEmail: (name = 'User') => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
      <div style="max-width: 600px; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 3px 12px rgba(0,0,0,0.1);">
        <h2 style="color: #007BFF; text-align: center;">Thank you, ${name}!</h2>
        <p>We've received your inquiry and will respond within 24 hours.</p>
      </div>
    </div>
  `
};

// Email Service Functions
const sendInquiryNotification = async (values) => {
  if (!values?.name?.trim() || !values?.email?.trim() || !values?.message?.trim()) {
    throw new Error('Missing required fields: name, email, or message');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(values.email.trim())) {
    throw new Error('Invalid email address format');
  }

  const sanitizeInput = (input) => {
    if (!input) return '';
    return input.toString()
      .replace(/[\r\n]/g, '')
      .replace(/<[^>]*>?/gm, '')
      .trim();
  };

  const safeName = sanitizeInput(values.name);
  const safeEmail = sanitizeInput(values.email);
  const safeMessage = sanitizeInput(values.message);
  const safePhone = values.phone ? sanitizeInput(values.phone) : 'Not provided';

  const fromEmail = process.env.EMAIL_FROM || 'no-reply@example.com';
  if (!emailRegex.test(fromEmail)) {
    throw new Error('Invalid sender email configuration');
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Notification System'}" <${fromEmail}>`,
    to: process.env.ADMIN_EMAIL || "subhamtours3@gmail.com",
    subject: `New Inquiry: ${safeName.substring(0, 50)}`,
    html: emailTemplates.inquiryNotification({
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      message: safeMessage.substring(0, 1000)
    }),
    replyTo: `"${safeName}" <${safeEmail}>`,
    headers: {
      'X-Priority': '1',
      'X-Mailer': 'NodeMailer'
    }
  };

  try {
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${mailOptions.to}`, {
      messageId: info.messageId,
      envelope: info.envelope
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info),
      recipient: mailOptions.to
    };
  } catch (error) {
    console.error('Email send failed:', {
      error: error.message,
      stack: error.stack,
      recipient: mailOptions.to,
      time: new Date().toISOString()
    });
    throw new Error(`Failed to send notification: ${error.message}`);
  }
};

const sendConfirmationEmail = async (email, name) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || "subhamtours3@gmail.com",
      to: email,
      subject: "Thank you for your inquiry",
      html: emailTemplates.confirmationEmail(name)
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return false;
  }
};

// Email Routes
router.post('/send-inquiry', async (req, res) => {
  const { email, name, phone, message, package } = req.body;
  
  try {
    const newInquiry = new Inquiry({
      name,
      email,
      phone: phone || undefined,
      message,
      package
    });
    const savedInquiry = await newInquiry.save();
    console.log('Inquiry saved to database:', savedInquiry._id);

    await sendInquiryNotification({ email, name, phone, message, package });
    await sendConfirmationEmail(email, name);
    
    res.json({ success: true, message: "Emails sent successfully" });
  } catch (error) {
    console.error('Inquiry processing error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to process inquiry" 
    });
  }
});

router.get('/inquiries', verifyToken, async (req, res) => {
  try {
    const inquiries = await Inquiry.find()
      .sort({ createdAt: -1 })
      .select('-__v');
    
    res.json({ success: true, inquiries });
  } catch (error) {
    console.error('Failed to fetch inquiries:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch inquiries" 
    });
  }
});

router.patch('/inquiries/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Valid status is required (new, in_progress, or resolved)"
      });
    }

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found"
      });
    }

    inquiry.status = status;
    const updatedInquiry = await inquiry.save();

    res.json({
      success: true,
      message: "Inquiry status updated successfully",
      inquiry: {
        _id: updatedInquiry._id,
        name: updatedInquiry.name,
        status: updatedInquiry.status,
        updatedAt: updatedInquiry.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating inquiry status:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: "Invalid inquiry ID format"
      });
    }

    res.status(500).json({
      success: false,
      error: "Server error while updating inquiry status",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

router.get('/package',PackageController.getAllPackages)
router.get('/package/:id',PackageController.getPackageById)

module.exports = router;