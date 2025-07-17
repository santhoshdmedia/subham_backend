const crypto = require("crypto");
const twilio = require("twilio");
const User = require("../models/UserOtp");

// Load credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

// In-memory storage for OTPs (consider Redis in production)
const otpStorage = new Map();

// Generate secure 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Validate and format phone number
function formatPhone(phone) {
  // Remove all non-digit characters
  const cleaned = `${phone}`.replace(/\D/g, "");

  // Handle Indian numbers (add country code if missing)
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  // If already has country code
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  // For other international numbers
  if (cleaned.length > 10 && !cleaned.startsWith("+")) {
    return `+${cleaned}`;
  }

  return null;
}

exports.health = async (req, res, next) => {
  try {
    const response = {
      success: true,
      message: "healthy",
    };
    res.json(response);
  } catch (error) {
    next(err);
  }
};

exports.sendOTP = async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "Phone number is required",
      });
    }

    const formattedNumber = formatPhone(phone);
    if (!formattedNumber) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid phone number format. Please use 10-digit Indian number or international format",
      });
    }
    

    // Check if recent OTP exists and hasn't expired
    const existingOTP = otpStorage.get(formattedNumber);
    if (existingOTP && existingOTP.expiresAt > Date.now()) {
      return res.status(429).json({
        success: false,
        error: "OTP already sent. Please wait before requesting a new one",
      });
    }

    const otp = generateOTP();
    const ttl = 5 * 60 * 1000; // 5 minutes

    otpStorage.set(formattedNumber, {
      otp,
      expiresAt: Date.now() + ttl,
      attempts: 0, // Track verification attempts
      userData: { name, phone, email }, // Store user data for later
    });

    // Send OTP via Twilio
    await client.messages.create({
      body: `Your verification code is: ${otp}. Valid for 5 minutes.`,
      to: formattedNumber,
      from: twilioPhone,
    });

    // In development, return the OTP for testing
    const response = {
      success: true,
      message: "OTP sent successfully",
    };

    if (process.env.NODE_ENV === "development") {
      response.debug = { otp };
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { phone, otp, name, email, password } = req.body;

    // Validate required fields
    if (!phone || !otp || !password) { 
      return res.status(400).json({
        success: false,
        error: "Phone number, OTP and password are required",
      });
    }

    const formattedNumber = formatPhone(phone);
    if (!formattedNumber) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format",
      });
    }

    const storedData = otpStorage.get(formattedNumber);
    if (!storedData) {
      return res.status(400).json({
        success: false,
        error: "OTP not found or expired",
      });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      otpStorage.delete(formattedNumber);
      return res.status(400).json({
        success: false,
        error: "Too many attempts. Please request a new OTP",
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(formattedNumber);
      return res.status(400).json({
        success: false,
        error: "OTP expired",
      });
    }

    if (storedData.otp !== otp) {
      // Increment failed attempts
      storedData.attempts += 1;
      otpStorage.set(formattedNumber, storedData);

      return res.status(400).json({
        success: false,
        error: "Invalid OTP",
        attemptsLeft: 3 - storedData.attempts,
      });
    }
    // OTP verified successfully
    try {
      const userData = { name, email, phone, password }; // Include password

      // Check if user exists by phone or email
      const existingUser = await User.findOne({
        $or: [{ phone: userData.phone }, { email: userData.email }],
      });

      otpStorage.delete(formattedNumber);

      if (existingUser) {
        return res.status(400).json({ // Changed to 400 since duplicate isn't a success
          success: false,
          error: "User already exists with this phone/email",
        });
      }

      // Create new user - password will be hashed by pre-save hook
      const newUser = new User(userData);
      const savedUser = await newUser.save();

      return res.json({
        success: true,
        message: "OTP verified and user registered successfully",
        user: {
          _id: savedUser._id,
          name: savedUser.name,
          email: savedUser.email,
          phone: savedUser.phone,
          // Don't send back password
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
        error: "Failed to process user data",
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.Login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide email and password"
      });
    }

    // 2. Check if user exists and password is correct
    const user = await User.findOne({ email: email.toLowerCase().trim() })
                          .select('+password'); // Explicitly include password

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        error: "Incorrect email or password"
      });
    }

    // 3. If everything ok, send token/success response
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt
    };

    // Here you would typically generate a JWT token
    // const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      // token, // Include if using JWT
      user: userResponse
    });

  } catch (err) {
    next(err);
  }
};
