const nodemailer = require("nodemailer");

// Strict Environment Validation
if (process.env.NODE_ENV !== "test") {
  const requiredEnvVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"];
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      throw new Error(`[SMTP CRITICAL] Missing required environment variable: ${varName}. Server cannot start.`);
    }
  }
}

console.log("[SMTP] Initializing global email service...");

let activeTransporter = createTransporterInstance();

function createTransporterInstance() {
  return nodemailer.createTransport({
    pool: false, // Force a fresh connection per email (avoids stale sockets in cloud environments)
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10s connection timeout
    greetingTimeout: 10000,   // 10s greeting timeout
    socketTimeout: 15000,     // 15s socket inactivity timeout
    tls: {
      minVersion: "TLSv1.2"      // Enforce modern TLS standard (TLSv1.2+)
    },
    connectionOptions: {
      family: 4 // Bypass broken cloud IPv6 environments by forcing IPv4
    }
  });
}

/**
 * Dispatch an email with retry mechanism and essential logging.
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
      console.log(`[SMTP] sendMail started: Attempt ${attempt}/${retries} to: ${mailOptions.to}`);
      
      const info = await activeTransporter.sendMail({
        from: process.env.FROM_EMAIL,
        ...mailOptions
      });

      console.log(`✓ [SMTP] sendMail completed: Email sent successfully to ${mailOptions.to}. Message ID: ${info.messageId}`);
      return info;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [SMTP] sendMail failed: Attempt ${attempt} failed for recipient ${mailOptions.to}:`, {
        message: err.message,
        code: err.code,
        command: err.command,
        response: err.response
      });

      // Detect connection-level errors to trigger self-healing transporter recreation
      const isConnectionError = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(err.code) || 
                                err.message.toLowerCase().includes('timeout') ||
                                err.message.toLowerCase().includes('socket');

      if (isConnectionError) {
        console.log(`🔄 [SMTP] Connection error detected (${err.code || 'timeout'}). Recreating transporter instance...`);
        activeTransporter = createTransporterInstance();
      }

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
  get transporter() {
    return activeTransporter;
  },
  sendEmail
};
