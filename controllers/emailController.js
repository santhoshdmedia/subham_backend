const nodemailer = require('nodemailer');

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      },
});

exports.sendOTP = async (req, res, next) => {
  try {
    const { email, name = 'User' } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format"
      });
    }

    // Check for recent OTP
    const existingOTP = otpStorage.get(email);
    if (existingOTP && existingOTP.expiresAt > Date.now()) {
      const remainingTime = Math.ceil((existingOTP.expiresAt - Date.now()) / 1000 / 60);
      return res.status(429).json({
        success: false,
        error: `Please wait ${remainingTime} minutes before requesting a new OTP`
      });
    }

    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes expiry

    otpStorage.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      verified: false
    });

    // Send OTP via email
    await emailTransporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your One-Time Password (OTP)',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; text-align: center;">OTP Verification</h2>
          <p>Hello ${name},</p>
          <p>Your verification code is:</p>
          <div style="background: #f8fafc; padding: 15px; text-align: center; margin: 20px 0; font-size: 24px; letter-spacing: 5px; color: #1e293b;">
            <strong>${otp}</strong>
          </div>
          <p>This code will expire in <strong>5 minutes</strong>.</p>
          <p style="color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      `
    });

    // Response
    const response = {
      success: true,
      message: "OTP sent to your email",
      email: email // Return masked email in production
    };

    // Show OTP in development for testing
    if (process.env.NODE_ENV === 'development') {
      response.debug = { otp };
      response.email = email; // Show full email in dev
    } else {
      // Mask email in production (e.g., "u****@example.com")
      const [username, domain] = email.split('@');
      response.email = `${username[0]}****@${domain}`;
    }

    res.json(response);

  } catch (err) {
    console.error('Email OTP sending error:', err);
    res.status(500).json({
      success: false,
      error: "Failed to send OTP. Please try again later."
    });
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp, name, password } = req.body;

    // Validate required fields
    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        error: "Email, OTP and password are required",
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    // Retrieve stored OTP data
    const storedData = otpStorage.get(email);
    if (!storedData) {
      return res.status(400).json({
        success: false,
        error: "OTP not found or expired. Please request a new OTP",
      });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      otpStorage.delete(email);
      return res.status(429).json({ // 429 Too Many Requests
        success: false,
        error: "Maximum OTP attempts reached. Please request a new OTP",
      });
    }

    // Check expiration
    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(email);
      return res.status(400).json({
        success: false,
        error: "OTP expired. Please request a new OTP",
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      // Increment failed attempts
      storedData.attempts += 1;
      otpStorage.set(email, storedData);

      return res.status(400).json({
        success: false,
        error: "Invalid OTP",
        attemptsLeft: 3 - storedData.attempts,
      });
    }

    // OTP verified successfully - proceed with user registration
    try {
      // Check for existing user
      const existingUser = await User.findOne({
        $or: [{ email }, { phone: storedData.userData?.phone }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: existingUser.email === email 
            ? "User with this email already exists" 
            : "User with this phone number already exists",
        });
      }

      // Create new user
      const newUser = new User({
        name: name || storedData.userData?.name,
        email,
        phone: storedData.userData?.phone,
        password // Will be hashed by pre-save hook
      });

      const savedUser = await newUser.save();

      // Clean up OTP storage
      otpStorage.delete(email);

      // Generate auth token if needed
      const token = savedUser.generateAuthToken();

      return res.json({
        success: true,
        message: "OTP verified and user registered successfully",
        user: {
          _id: savedUser._id,
          name: savedUser.name,
          email: savedUser.email,
          phone: savedUser.phone,
        },
        token, // Include JWT if using token-based auth
        isNewUser: true,
      });

    } catch (dbError) {
      console.error("Database error:", dbError);
      
      // Handle duplicate key errors
      if (dbError.code === 11000) {
        const duplicateField = Object.keys(dbError.keyPattern)[0];
        return res.status(409).json({
          success: false,
          error: `User with this ${duplicateField} already exists`,
        });
      }

      // Handle validation errors
      if (dbError.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: Object.values(dbError.errors).map(err => err.message).join(', ')
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to process user registration",
      });
    }

  } catch (err) {
    console.error("OTP verification error:", err);
    next(err);
  }
};