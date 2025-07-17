const emailService = require('../utils/Emailservices');

const path = require('path');
const ejs = require('ejs');
const fs = require('fs/promises');

exports.confirmBooking = async (req, res) => {
    try {
        const { 
            customerEmail, 
            customerName, 
            tourName, 
            bookingDate, 
            bookingReference, 
            participants = 1 
        } = req.body;

        // Validate inputs
        const requiredFields = { customerEmail, customerName, tourName, bookingDate, bookingReference };
        const missingFields = Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingFields.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Render email template
        const templatePath = path.join(__dirname, '../template/bookingConfirmation.ejs');
        
        try {
            // Check if template exists
            await fs.access(templatePath);
        } catch (err) {
            console.error('Template file not found:', templatePath);
            return res.status(500).json({
                success: false,
                error: 'Email template configuration error'
            });
        }

        const formattedDate = new Date(bookingDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const emailHtml = await ejs.renderFile(
            templatePath,
            {
                customerName,
                tourName,
                bookingDate: formattedDate,
                bookingReference,
                participants,
                currentYear: new Date().getFullYear(),
                companyName: process.env.COMPANY_NAME || 'Adventure Tours',
                bookingPortalUrl: process.env.BOOKING_PORTAL_URL || 'https://yourwebsite.com/bookings',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                // Helpers
                formatCurrency: (amount) => {
                    return new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR'
                    }).format(amount);
                }
            },
            {
                root: path.join(__dirname, '../templates'),
                cache: process.env.NODE_ENV === 'production'
            }
        );

        // Send email
        const mailOptions = {
            from: `"${process.env.COMPANY_NAME || 'Adventure Tours'}" <${process.env.EMAIL_FROM || 'noreply@example.com'}>`,
            to: customerEmail,
            subject: `Booking Confirmation: ${tourName} (Ref: ${bookingReference})`,
            html: emailHtml,
            text: `Dear ${customerName},\n\nYour booking for "${tourName}" on ${formattedDate} is confirmed!\n\nBooking Reference: ${bookingReference}\nParticipants: ${participants}\n\nThank you for choosing us!`,
            priority: 'high'
        };

        const sendResult = await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'Booking confirmed and confirmation email sent',
            bookingReference,
            messageId: sendResult.messageId
        });

    } catch (error) {
        console.error('Booking confirmation error:', error);
        res.status(500).json({ 
            success: false, 
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Failed to process booking' 
        });
    }
};