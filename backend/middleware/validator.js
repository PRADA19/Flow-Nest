// ==========================================
// CUSTOM SCHEMA VALIDATION LAYER (SaaS Hardening)
// ==========================================

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const validateDate = (dateStr) => {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
};

// Sanitization & assertion helper schemas
const SCHEMAS = {
  authRegister: {
    name: { type: "string", required: true, min: 2, max: 50 },
    email: { type: "email", required: true },
    password: { type: "string", required: true, min: 6, max: 100 }
  },
  authLogin: {
    email: { type: "email", required: true },
    password: { type: "string", required: true }
  },
  taskPost: {
    title: { type: "string", required: true, min: 3, max: 100 },
    dueDate: { type: "date", required: false },
    priority: { type: "enum", required: false, values: ["low", "medium", "high"] },
    tags: { type: "array", required: false }
  },
  taskPut: {
    title: { type: "string", required: false, min: 3, max: 100 },
    dueDate: { type: "date", required: false },
    priority: { type: "enum", required: false, values: ["low", "medium", "high"] },
    tags: { type: "array", required: false },
    completed: { type: "boolean", required: false }
  },
  aiChat: {
    message: { type: "string", required: true, min: 1, max: 2000 }
  }
};

const validateBody = (schemaName) => {
  return (req, res, next) => {
    const schema = SCHEMAS[schemaName];
    if (!schema) return next();

    const incoming = req.body || {};
    const sanitized = {};
    const errors = [];

    // 1. Audit incoming keys: strip out any parameter not explicitly declared in schema
    for (const key in schema) {
      const rule = schema[key];
      let val = incoming[key];

      // Check required
      if (rule.required && (val === undefined || val === null || val === "")) {
        errors.push(`Field '${key}' is required.`);
        continue;
      }

      if (val !== undefined && val !== null) {
        // String checks
        if (rule.type === "string") {
          if (typeof val !== "string") {
            errors.push(`Field '${key}' must be a string.`);
            continue;
          }
          val = val.trim();
          if (rule.min && val.length < rule.min) {
            errors.push(`Field '${key}' must be at least ${rule.min} characters.`);
          }
          if (rule.max && val.length > rule.max) {
            errors.push(`Field '${key}' cannot exceed ${rule.max} characters.`);
          }
        }
        // Email checks
        else if (rule.type === "email") {
          if (typeof val !== "string" || !validateEmail(val)) {
            errors.push(`Field '${key}' must be a valid email address.`);
            continue;
          }
        }
        // Date checks
        else if (rule.type === "date") {
          if (!validateDate(val)) {
            errors.push(`Field '${key}' must be a valid ISO Date.`);
            continue;
          }
        }
        // Enum checks
        else if (rule.type === "enum") {
          if (!rule.values.includes(val)) {
            errors.push(`Field '${key}' must be one of: ${rule.values.join(", ")}.`);
            continue;
          }
        }
        // Array checks
        else if (rule.type === "array") {
          if (!Array.isArray(val)) {
            errors.push(`Field '${key}' must be an array.`);
            continue;
          }
          // Sanitize arrays to string elements
          val = val.map(el => String(el).trim()).filter(Boolean);
        }
        // Boolean checks
        else if (rule.type === "boolean") {
          if (typeof val !== "boolean") {
            errors.push(`Field '${key}' must be a boolean value.`);
            continue;
          }
        }

        // Store sanitized field
        sanitized[key] = val;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Overwrite req.body with the sanitized and stripped payload (Mass Assignment Protection)
    req.body = sanitized;
    next();
  };
};

module.exports = {
  validateBody
};
