const nodemailer = require("nodemailer");
require('dotenv').config();

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USE || "subhamtours3@gmail.com",
    pass: process.env.EMAIL_PASSWOR || "edum ydap xbhj lpf",
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
});

// Verify connection
transporter.verify((error) => {
  if (error) {
    console.error('Mail server error:', error);
  } else {
    console.log('Mail server ready');
  }
});

// Email Templates
const templates = {
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
const emailService = {
  sendInquiryNotification: async (values) => {
    try {
      const mailOptions = {
        from: `"${values.name}" <${values.email}>`,
        to: process.env.ADMIN_EMAIL || "santhoshmkr0723@gmail.com",
        subject: `New Inquiry from ${values.name}`,
        html: templates.inquiryNotification(values)
      };
      
      const info = await transporter.sendMail(mailOptions);
      console.log('Inquiry notification sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Error sending inquiry notification:', error);
      return false;
    }
  },

  sendConfirmationEmail: async (email, name) => {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || "devconsole@gmail.com",
        to: email,
        subject: "Thank you for your inquiry",
        html: templates.confirmationEmail(name)
      };
      
      const info = await transporter.sendMail(mailOptions);
      console.log('Confirmation email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      return false;
    }
  },

  handleInquiry: async (req, res) => {
    const { email, name, phone, message } = req.body;
    
    try {
      // Send to admin
      await emailService.sendInquiryNotification({ email, name, phone, message });
      
      // Send to user
      await emailService.sendConfirmationEmail(email, name);
      
      res.json({ success: true, message: "Emails sent successfully" });
    } catch (error) {
      console.error('Inquiry processing error:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process inquiry" 
      });
    }
  }
};

module.exports = emailService;