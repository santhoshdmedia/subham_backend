const crypto = require("crypto");
const twilio = require("twilio");
const jwt = require("jsonwebtoken");
const User = require("../models/UserOtp");

// Configuration
const JWT_SECRET = "T2s$w9qZ8@uG5#1!pR";
const JWT_EXPIRES_IN =  "30d"; // 30 days

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

// OTP storage
const otpStorage = new Map();

// Helper functions
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function formatPhone(phone) {
  const cleaned = `${phone}`.replace(/\D/g, "");
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  if (cleaned.length > 10 && !cleaned.startsWith("+")) return `+${cleaned}`;
  return null;
}

function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Controller functions
exports.health = async (req, res) => {
  res.json({ success: true, message: "healthy" });
};

exports.sendOTP = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: "Phone number is required" });
    }

    const formattedNumber = formatPhone(phone);
    if (!formattedNumber) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format. Use 10-digit Indian number or international format",
      });
    }

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
      attempts: 0,
      userData: { name, phone, email },
    });

    await client.messages.create({
      body: `Your verification code is: ${otp}. Valid for 5 minutes.`,
      to: formattedNumber,
      from: twilioPhone,
    });

    const response = { success: true, message: "OTP sent successfully" };
    if (process.env.NODE_ENV === "development") response.debug = { otp };

    res.json(response);
  } catch (err) {
    console.error("OTP send error:", err);
    res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp, name, email, password } = req.body;

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
      storedData.attempts += 1;
      otpStorage.set(formattedNumber, storedData);
      return res.status(400).json({
        success: false,
        error: "Invalid OTP",
        attemptsLeft: 3 - storedData.attempts,
      });
    }

    try {
      const userData = { name, email, phone, password };
      const existingUser = await User.findOne({
        $or: [{ phone: userData.phone }, { email: userData.email }],
      });

      otpStorage.delete(formattedNumber);

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: "User already exists with this phone/email",
        });
      }

      const newUser = new User(userData);
      const savedUser = await newUser.save();
      const token = generateToken(savedUser._id);

      return res.json({
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
      if (dbError.code === 11000) {
        return res.status(409).json({
          success: false,
          error: `User with this ${Object.keys(dbError.keyPattern)[0]} already exists`,
        });
      }
      return res.status(500).json({
        success: false,
        error: "Failed to process user data",
      });
    }
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide email and password"
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
                          .select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        error: "Incorrect email or password"
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Auth middleware
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};