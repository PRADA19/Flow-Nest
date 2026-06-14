const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const { authLimiter } = require("../middleware/rateLimiter");

// Setup SMTP Transporter using existing configuration settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify SMTP connection config
transporter.verify((error, success) => {
  if (error) {
    console.warn("⚠️ SMTP connection failed in auth route. Password reset emails will log to console:", error.message);
  } else {
    console.log("🚀 SMTP connection successful in auth route. Mailer is ready.");
  }
});

// Helper for validating email format
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Generate password reset token and dispatch email
 * @access  Public
 */
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email address is required." });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const genericResponse = {
      message: "If an account exists for this email, a reset link has been sent."
    };

    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Security: Generic response to prevent email enumeration
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate secure cryptographically random token string
    const token = crypto.randomBytes(32).toString("hex");

    // Invalidate/remove previous reset tokens for the same user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Store new token in PasswordResetToken collection with 1-hour validity
    const expiresAt = new Date(Date.now() + 3600000);
    const resetToken = new PasswordResetToken({
      userId: user._id,
      token,
      expiresAt
    });

    await resetToken.save();

    // Formulate reset URL using CLIENT_URL environment parameter
    const clientUrl = process.env.CLIENT_URL || "http://127.0.0.1:5500/frontend";
    const resetLink = `${clientUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.FROM_EMAIL || '"FlowNest" <no-reply@flow-nest.com>',
      to: user.email,
      subject: "Password Reset Request - FlowNest",
      html: `
        <div style="font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(255,255,255,0.08);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="font-family: 'Outfit', sans-serif; color: #8b5cf6; font-size: 28px; margin: 0;">FlowNest</h2>
            <p style="color: #94a3b8; margin: 5px 0 0 0;">Productivity & Focus System</p>
          </div>
          <h3 style="color: #f1f5f9; font-size: 20px; font-weight: 600; margin-bottom: 15px;">Reset Your Password</h3>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
            We received a request to reset your password. Click the button below to update your login credentials. This link is valid for <strong>1 hour</strong>.
          </p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${resetLink}" target="_blank" style="background: #8b5cf6; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);">
              Reset Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">
            If you did not make this request, you can safely ignore this email. Your password will remain secure and unchanged.
          </p>
          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin-bottom: 20px;">
          <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
            If the button doesn't work, copy and paste this link in your browser:<br>
            <a href="${resetLink}" style="color: #8b5cf6; word-break: break-all;">${resetLink}</a>
          </p>
        </div>
      `
    };

    // Dispatch email asynchronously
    transporter.sendMail(mailOptions).catch(err => {
      console.warn("⚠️ SMTP failed to dispatch password reset email:", err.message);
    });

    // Development Console Logging fallback
    console.log(`\n🔑 [PASSWORD RESET LINK] Sent to ${user.email}:\n👉 ${resetLink}\n`);

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error("Error in forgot-password:", err);
    return res.status(500).json({ error: "An internal error occurred. Please try again later." });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Validate token and update user password
 * @access  Public
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required." });
    }

    if (!password) {
      return res.status(400).json({ error: "New password is required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // Query password reset token
    const tokenDoc = await PasswordResetToken.findOne({ token });
    if (!tokenDoc) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    // Explicitly check expiration timestamp
    if (new Date() > tokenDoc.expiresAt) {
      await PasswordResetToken.deleteOne({ _id: tokenDoc._id });
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      return res.status(404).json({ error: "User associated with this token not found." });
    }

    // Hash new password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    // Invalidate/delete all remaining reset tokens for that user
    await PasswordResetToken.deleteMany({ userId: user._id });

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error in reset-password:", err);
    return res.status(500).json({ error: "Failed to reset password." });
  }
});

module.exports = router;
