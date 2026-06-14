const express = require("express");
const router = express.Router();
const SupportTicket = require("../models/SupportTicket");
const authenticateUser = require("../middleware/auth");

// All support endpoints require authentication
router.use(authenticateUser);

/**
 * Helper to generate a unique ticket reference code (similar to frontend localStorage fallback)
 */
const generateRefCode = (type) => {
  const prefix = type === "contact" ? "TKT-" : type === "bug" ? "BUG-" : "FTR-";
  const num = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}${num}`;
};

/**
 * @route   POST /api/support/contact
 * @desc    Submit a general support/contact ticket
 * @access  Private
 */
router.post("/contact", async (req, res) => {
  try {
    const { subject, category, message, title, description } = req.body;
    
    // Resolve fields from standard form body keys or JSON API keys
    const finalTitle = title || subject || (category ? `Support Ticket: ${category}` : "General Support");
    const finalDescription = description || message;

    if (!finalTitle || !finalDescription) {
      return res.status(400).json({ error: "Subject/Title and Message/Description are required." });
    }

    const refCode = generateRefCode("contact");
    const ticket = new SupportTicket({
      userId: req.user.id,
      type: "contact",
      title: `${finalTitle} (${refCode})`,
      description: category ? `[Category: ${category}]\n\n${finalDescription}` : finalDescription,
      status: "open"
    });

    await ticket.save();

    return res.status(201).json({
      message: "Support ticket submitted successfully.",
      referenceCode: refCode,
      ticket: {
        id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.createdAt
      }
    });
  } catch (err) {
    console.error("Error creating contact ticket:", err);
    return res.status(500).json({ error: "Failed to submit support ticket." });
  }
});

/**
 * @route   POST /api/support/bug
 * @desc    Submit a bug report
 * @access  Private
 */
router.post("/bug", async (req, res) => {
  try {
    const { title, steps, severity, description } = req.body;

    const finalTitle = title || "System Glitch Bug Report";
    let finalDescription = description;

    if (!finalDescription) {
      if (!steps || !severity) {
        return res.status(400).json({ error: "Bug title, severity, and steps to reproduce are required." });
      }
      finalDescription = `Severity: ${severity}\n\nSteps to Reproduce:\n${steps}`;
    }

    const refCode = generateRefCode("bug");
    const ticket = new SupportTicket({
      userId: req.user.id,
      type: "bug",
      title: `${finalTitle} (${refCode})`,
      description: finalDescription,
      status: "open"
    });

    await ticket.save();

    return res.status(201).json({
      message: "Bug report submitted successfully.",
      referenceCode: refCode,
      ticket: {
        id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.createdAt
      }
    });
  } catch (err) {
    console.error("Error creating bug report:", err);
    return res.status(500).json({ error: "Failed to submit bug report." });
  }
});

/**
 * @route   POST /api/support/feature
 * @desc    Submit a feature request
 * @access  Private
 */
router.post("/feature", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Feature title and description are required." });
    }

    const refCode = generateRefCode("feature");
    const ticket = new SupportTicket({
      userId: req.user.id,
      type: "feature",
      title: `${title} (${refCode})`,
      description: description,
      status: "open"
    });

    await ticket.save();

    return res.status(201).json({
      message: "Feature request submitted successfully.",
      referenceCode: refCode,
      ticket: {
        id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.createdAt
      }
    });
  } catch (err) {
    console.error("Error creating feature request:", err);
    return res.status(500).json({ error: "Failed to submit feature request." });
  }
});

module.exports = router;
