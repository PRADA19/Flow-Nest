const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendEmail } = require("../services/emailService");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const { authLimiter } = require("../middleware/rateLimiter");

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
    const isLocal = clientUrl.includes("127.0.0.1") || clientUrl.includes("localhost");
    const resetLink = isLocal
      ? `${clientUrl}/pages/reset-password.html?token=${token}`
      : `${clientUrl}/reset-password?token=${token}`;

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

    try {
      const info = await sendEmail(mailOptions);
      console.log(`✓ Password reset email delivered to ${user.email}. Message ID: ${info.messageId}`);
      if (process.env.NODE_ENV !== "production") {
        console.log(`🔑 [DEVELOPMENT RESET LINK] Sent to ${user.email}:\n👉 ${resetLink}\n`);
      }
      return res.status(200).json(genericResponse);
    } catch (err) {
      console.error("❌ Password reset email failed to send:", err.message);
      return res.status(500).json({ error: "Unable to send password reset email. Please try again." });
    }
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
router.post("/reset-password", authLimiter, async (req, res) => {
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

    // Revoke all active sessions for the user on password reset
    const UserSession = require("../models/UserSession");
    const ActivityLog = require("../models/ActivityLog");
    const mongoose = require("mongoose");
    
    if (mongoose.connection.readyState === 1) {
      await UserSession.updateMany({ userId: user._id, status: "active" }, { status: "revoked" });
      
      await ActivityLog.create({
        actorId: user._id,
        action: "auth_password_reset",
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
        userAgent: req.headers["user-agent"],
        details: { email: user.email }
      }).catch(err => console.warn("Failed to log password reset:", err.message));
    }

    // Invalidate/delete all remaining reset tokens for that user
    await PasswordResetToken.deleteMany({ userId: user._id });

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error in reset-password:", err);
    return res.status(500).json({ error: "Failed to reset password." });
  }
});

router.get("/smtp-diagnostic", async (req, res) => {
  const dns = require("dns");
  const net = require("net");
  
  const diagnostics = {
    env: {
      SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
      SMTP_PORT: process.env.SMTP_PORT || "587",
      SMTP_USER: process.env.SMTP_USER || "NOT_SET",
      SMTP_PASS_EXISTS: !!process.env.SMTP_PASS,
      FROM_EMAIL: process.env.FROM_EMAIL || "NOT_SET",
      CLIENT_URL: process.env.CLIENT_URL || "NOT_SET",
      NODE_ENV: process.env.NODE_ENV || "NOT_SET",
      secure: Number(process.env.SMTP_PORT || 587) === 465
    },
    dns: {},
    connectivity: {},
    transporterVerify: null,
    testEmailSent: null,
    error: null
  };

  try {
    const host = diagnostics.env.SMTP_HOST;

    // 1. DNS Resolution Test
    try {
      diagnostics.dns.lookup = await new Promise((resolve, reject) => {
        dns.lookup(host, { all: true }, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
    } catch (dnsErr) {
      diagnostics.dns.error = dnsErr.message;
    }

    // 2. Port Connectivity Test (TCP handshake helper)
    const testPort = (port) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = "unknown";
        
        socket.setTimeout(5000);
        
        socket.on("connect", () => {
          status = "open";
          socket.destroy();
        });
        
        socket.on("timeout", () => {
          status = "timeout";
          socket.destroy();
        });
        
        socket.on("error", (err) => {
          status = `error: ${err.message}`;
        });
        
        socket.on("close", () => {
          resolve(status);
        });
        
        socket.connect(port, host);
      });
    };

    diagnostics.connectivity["587"] = await testPort(587);
    diagnostics.connectivity["465"] = await testPort(465);
    diagnostics.connectivity["25"] = await testPort(25);

    // 3. Transporter verification
    const { transporter } = require("../services/emailService");
    try {
      diagnostics.transporterVerify = await new Promise((resolve, reject) => {
        transporter.verify((err, success) => {
          if (err) reject(err);
          else resolve("success");
        });
      });
    } catch (verifyErr) {
      diagnostics.transporterVerify = `failed: ${verifyErr.message}`;
    }

    // 4. Send test email if requested
    if (req.query.sendTest === "true" && diagnostics.transporterVerify === "success") {
      const { sendEmail } = require("../services/emailService");
      try {
        const info = await sendEmail({
          to: diagnostics.env.SMTP_USER,
          subject: "FlowNest SMTP Diagnostic Email",
          html: "<p>If you see this, the production SMTP configuration is working!</p>"
        });
        diagnostics.testEmailSent = `success: ${info.messageId}`;
      } catch (sendErr) {
        diagnostics.testEmailSent = `failed: ${sendErr.message}`;
      }
    }

    return res.status(200).json({ success: true, diagnostics });
  } catch (globalErr) {
    diagnostics.error = globalErr.message;
    return res.status(500).json({ success: false, diagnostics });
  }
});

module.exports = router;
