const nodemailer = require("nodemailer");
const dns = require("dns");

console.log("[SMTP] Initializing global email service transporter...");
console.log("[SMTP] Host:", process.env.SMTP_HOST || "smtp.gmail.com");
console.log("[SMTP] Port:", process.env.SMTP_PORT || 587);
console.log("[SMTP] User:", process.env.SMTP_USER || "Not Configured");
console.log("[SMTP] Password Configured:", process.env.SMTP_PASS ? "YES" : "NO");
console.log("[SMTP] Secure (implicit TLS):", Number(process.env.SMTP_PORT || 587) === 465);

// Asynchronously resolve DNS on startup to audit network connectivity
dns.lookup(process.env.SMTP_HOST || "smtp.gmail.com", { all: true }, (err, addresses) => {
  if (err) {
    console.warn("⚠️ [SMTP] DNS resolution failed for SMTP host:", err.message);
  } else {
    console.log("[SMTP] DNS resolution for SMTP host successful:", addresses);
  }
});

const transporter = nodemailer.createTransport({
  pool: true, // Reuse SMTP connections instead of opening a new TCP socket per email
  maxConnections: 5,
  maxMessages: 100,
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT || 587) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 15000, // 15 seconds connection timeout (handles cloud network latency)
  greetingTimeout: 15000,   // 15 seconds greeting timeout
  socketTimeout: 20000,     // 20 seconds socket inactivity timeout
  tls: {
    minVersion: "TLSv1.2"      // Enforce secure TLS version for modern providers like Gmail
  },
  connectionOptions: {
    family: 4 // Enforce IPv4 to bypass cloud environments with broken/unconfigured IPv6 routing
  }
});

// Verify connection on service initialization
transporter.verify((error, success) => {
  if (error) {
    console.warn("⚠️ [SMTP] Transporter connection verification failed:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
  } else {
    console.log("🚀 [SMTP] Transporter connection verified and ready to dispatch emails.");
  }
});

/**
 * Dispatch an email with transparent retry mechanism and detailed logging.
 * 
 * @param {Object} mailOptions Options to pass to nodemailer sendMail (from, to, subject, html, text)
 * @param {number} retries Maximum retry attempts (default: 3)
 * @param {number} delay Base backoff delay in ms (default: 2000ms)
 * @returns {Promise<Object>} Sent mail info object
 */
async function sendEmail(mailOptions, retries = 3, delay = 2000) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[SMTP] Attempt ${attempt}/${retries} to send email to: ${mailOptions.to}`);
      
      const info = await transporter.sendMail({
        from: process.env.FROM_EMAIL || '"FlowNest" <no-reply@flow-nest.com>',
        ...mailOptions
      });

      console.log(`✓ [SMTP] Email sent successfully to ${mailOptions.to}. Message ID: ${info.messageId}`);
      return info;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [SMTP] Attempt ${attempt} failed for recipient ${mailOptions.to}:`, {
        message: err.message,
        code: err.code,
        command: err.command,
        response: err.response
      });

      if (attempt < retries) {
        const backoff = delay * Math.pow(2, attempt - 1);
        console.log(`[SMTP] Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  // All retries failed
  console.error(`❌ [SMTP] All ${retries} attempts failed to send email to ${mailOptions.to}:`, {
    message: lastError.message,
    code: lastError.code,
    command: lastError.command,
    response: lastError.response,
    stack: lastError.stack
  });
  throw lastError;
}

module.exports = {
  transporter,
  sendEmail
};
