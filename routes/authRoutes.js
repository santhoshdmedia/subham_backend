const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const packageControlller = require('../controllers/packageController')
const rateLimit = require('express-rate-limit');
const nodemailer = require("nodemailer");
const crypto = require('crypto');
require('dotenv').config();
const User =require('../models/UserOtp');
const Inquiry=require('../models/email');

// Rate limiting configuration
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 OTP requests per windowMs
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
    user:  process.env.EMAIL_USER|| "subhamtours3@gmail.",
    pass:  process.env.EMAIL_PASSWORD||"cnwl mruv aluf ekhy",
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

// Routes
router.post('/send-mail-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

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
});

router.post('/verify-mail-otp', async (req, res) => {
  const { email, otp, name, phone, password } = req.body;

  // Validate required fields
  if (!email || !otp || !name || !phone || !password) {
    return res.status(400).json({ 
      success: false, 
      error: "Email, OTP, name, phone and password are required" 
    });
  }
 

  // Verify OTP first
  const storedOtp = otpStorage.get(email);
  if (!storedOtp) {
    return res.status(400).json({ success: false, error: "OTP not found or expired" });
  }

  if (Date.now() > storedOtp.expiresAt) {
    otpStorage.delete(email);
    return res.status(400).json({ success: false, error: "OTP expired" });
  }

  if (storedOtp.otp !== otp) {
    return res.status(400).json({ success: false, error: "Invalid OTP" });
  }

  // OTP is valid, proceed with registration
  try {
    const userData = { name, email, phone, password };

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this phone/email",
      });
    }

    // Create new user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Clear OTP after successful registration
    otpStorage.delete(email);

    return res.json({
      success: true,
      message: "OTP verified and user registered successfully",
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
    if (dbError.code === 11000) {
      const duplicateField = Object.keys(dbError.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `User with this ${duplicateField} already exists`,
      });
    }
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
  // Validate inputs first
  if (!values?.name?.trim() || !values?.email?.trim() || !values?.message?.trim()) {
    throw new Error('Missing required fields: name, email, or message');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(values.email.trim())) {
    throw new Error('Invalid email address format');
  }

  // Sanitize inputs
  const sanitizeInput = (input) => {
    if (!input) return '';
    return input.toString()
      .replace(/[\r\n]/g, '')
      .replace(/<[^>]*>?/gm, '') // Basic HTML stripping
      .trim();
  };

  const safeName = sanitizeInput(values.name);
  const safeEmail = sanitizeInput(values.email);
  const safeMessage = sanitizeInput(values.message);
  const safePhone = values.phone ? sanitizeInput(values.phone) : 'Not provided';

  // Validate email from env
  const fromEmail = process.env.EMAIL_FROM || 'no-reply@example.com';
  if (!emailRegex.test(fromEmail)) {
    throw new Error('Invalid sender email configuration');
  }

  // Prepare email options
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Notification System'}" <${fromEmail}>`,
    to: process.env.ADMIN_EMAIL || "subhamtours3@gmail.com",
    subject: `New Inquiry: ${safeName.substring(0, 50)}`, // Limit length
    html: emailTemplates.inquiryNotification({
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      message: safeMessage.substring(0, 1000) // Limit message length
    }),
    replyTo: `"${safeName}" <${safeEmail}>`,
    headers: {
      'X-Priority': '1', // High priority
      'X-Mailer': 'NodeMailer'
    }
  };

  try {
    // Verify connection first
    await transporter.verify();
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Log success (consider using a proper logger in production)
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
    // Enhanced error logging
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

// Routes
router.post('/send-otp', otpLimiter, authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/login', authLimiter, authController.Login);
router.get('/health', authController.health);

// package route
router.post('/add', packageControlller.createPackage);
router.get('/package', packageControlller.getAllPackages);
router.get('/package/:id',packageControlller.getPackageById)

// Email Routes
router.post('/send-inquiry', async (req, res) => {
  const { email, name, phone, message,package } = req.body;
  
  try {
     const newInquiry = new Inquiry({
      name,
      email,
      phone: phone || undefined, // Store as undefined if not provided
      message,
      package
    });
      const savedInquiry = await newInquiry.save();
   console.log('Inquiry saved to database:', savedInquiry._id);

    // Send to admin
    await sendInquiryNotification({ email, name, phone, message,package });
    
    // Send to user
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
// Add this with your other routes
router.get('/inquiries', async (req, res) => {
  try {
    const inquiries = await Inquiry.find()
      .sort({ createdAt: -1 })
      .select('-__v'); // Exclude version key
    
    res.json({ success: true, inquiries });
  } catch (error) {
    console.error('Failed to fetch inquiries:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch inquiries" 
    });
  }
  // Update inquiry status
router.patch('/inquiries/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate input
    if (!status || !['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Valid status is required (new, in_progress, or resolved)"
      });
    }

    // Check if inquiry exists
    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found"
      });
    }

    // Update status
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
    
    // Handle different error types
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
});


module.exports = router;