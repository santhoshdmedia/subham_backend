const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

const sendOTP = async (phoneNumber) => {
  const otp = generateOTP();
  
  try {
    await client.messages.create({
      body: `Your OTP is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return { success: true, otp };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return { success: false };
  }
};

module.exports = { generateOTP, sendOTP };