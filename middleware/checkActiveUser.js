const pool = require("../config/db");

const checkActiveUser = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      "SELECT role, status, active_until FROM users WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Användaren hittades inte." });
    }

    const user = rows[0];

    // Admin har alltid åtkomst
    if (user.role === "admin") {
      return next();
    }

    // Blockerad användare
    if (user.status === "blocked") {
      return res.status(403).json({
        message: "Ditt konto är blockerat. Kontakta admin.",
      });
    }

    // Pending användare
    if (user.status !== "active") {
      return res.status(403).json({
        message: "Ditt konto väntar på aktivering. Kontakta admin via WhatsApp.",
      });
    }

    // Active men datumet har gått ut
    if (user.active_until && new Date(user.active_until) < new Date()) {
      await pool.query(
        "UPDATE users SET status = 'pending', active_until = NULL WHERE id = ?",
        [userId]
      );

      return res.status(403).json({
        message: "Din åtkomst har gått ut. Kontakta admin för att förnya.",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Fel vid kontroll av kontoåtkomst.",
      error: error.message,
    });
  }
};

module.exports = checkActiveUser;