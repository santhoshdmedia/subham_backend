const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // For self-signed certificates
      }
    });

    this.verifyConnection();
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('Mail transporter is ready');
    } catch (error) {
      console.error('Mail transporter error:', error);
    }
  }

  async renderTemplate(templateName, data) {
    try {
      const templatePath = path.join(__dirname, 'templates', `${templateName}.ejs`);
      return await ejs.renderFile("../template/bookingConfirmation", data);
    } catch (error) {
      console.error('Template rendering error:', error);
      throw new Error(`Failed to render ${templateName} template`);
    }
  }

  async sendEmail(mailOptions) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.EMAIL_SENDER_NAME}" <${process.env.EMAIL_USERNAME}>`,
        ...mailOptions
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBookingConfirmation(bookingData) {
    const { customerEmail, customerName, tourName, bookingDate, bookingReference, participants } = bookingData;
    
    const html = await this.renderTemplate('bookingConfirmation', {
      customerName,
      tourName,
      bookingDate: new Date(bookingDate).toLocaleDateString(),
      bookingReference,
      participants,
      year: new Date().getFullYear(),
      companyName: 'sailsubham'
    });

    const text = `Dear ${customerName},\n\n`
      + `Your booking for "${tourName}" on ${new Date(bookingDate).toLocaleDateString()} is confirmed!\n\n`
      + `Booking Reference: ${bookingReference}\n`
      + `Participants: ${participants}\n\n`
      + `Thank you for choosing us!\n\n`
      + `Best regards,\n`
      + 'Adventure Tours';

    return this.sendEmail({
      to: customerEmail,
      subject: `Booking Confirmation: ${tourName}`,
      text,
      html,
      priority: 'high'
    });
  }
}

module.exports = new EmailService();