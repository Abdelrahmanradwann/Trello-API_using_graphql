const nodemailer = require('nodemailer')

async function sendResetEmail(email, msg, subject) {
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.APP_PASSWORD
        }
    });

    const mailOptions = {
        from: process.env.APP_PASSWORD,
        to: email,
        subject: subject,
        text: msg
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Password reset email sent successfully.');
    } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
    }
}

module.exports = {
    sendResetEmail
}