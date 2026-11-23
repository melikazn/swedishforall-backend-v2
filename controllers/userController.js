// Importera moduler
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 
const pool = require("../config/db");
const crypto = require("crypto"); 
const { getMessage } = require("../helpers/languageHelper"); 
const { sendRegistrationConfirmation } = require("../services/emailService");

// Registrera ny användare
exports.registerUser = async (req, res) => {
  const { name, email, password, language = "sv" } = req.body;
  const lang = ["sv", "en", "fa"].includes(language) ? language : "sv";

  try {
    // Hasha användarens lösenord med bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generera en unik hemlighet som används för JWT-signering 
    const jwtSecret = crypto.randomBytes(64).toString("hex");

    // Spara användaren i databasen
    await pool.query(
      "INSERT INTO users (name, email, password, jwt_secret, status) VALUES (?, ?, ?, ?, 'pending')",
      [name, email, hashedPassword, jwtSecret]
    );

    let confirmationEmailSent = false;
    try {
      confirmationEmailSent = await sendRegistrationConfirmation({
        name,
        email,
        language: lang,
      });
    } catch (emailError) {
      // A mail outage must never undo a completed registration.
      console.error("Could not send registration confirmation email:", emailError.message);
    }

    // Skicka bekräftelsemeddelande
    res.status(201).json({
      message: getMessage("userRegistered", lang),
      confirmationEmailSent,
    });
  } catch (error) {
    res.status(500).json({ message: getMessage("errorRegistering", lang), error: error.message });
  }
};

//  Logga in användare
exports.loginUser = async (req, res) => {
  const lang = req.user?.language || "sv";
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

    if (rows.length === 0) {
      return res.status(400).json({ message: getMessage("userNotFound", lang) });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: getMessage("invalidPassword", lang) });
    }

    if (user.role === "admin") {
      user.status = "active";
      user.active_until = null;

      await pool.query(
        "UPDATE users SET status = 'active', active_until = NULL WHERE id = ?",
        [user.id]
      );
    }

    if (
      user.role !== "admin" &&
      user.status === "active" &&
      user.active_until &&
      new Date(user.active_until) < new Date()
    ) {
      user.status = "pending";
      user.active_until = null;

      await pool.query(
        "UPDATE users SET status = 'pending', active_until = NULL WHERE id = ?",
        [user.id]
      );
    }

    const daysLeft =
      user.role === "admin"
        ? null
        : exports.calculateDaysLeft(user.active_until);

    const membershipType =
      user.role === "admin"
        ? "admin"
        : user.status === "active" && !user.active_until
        ? "lifetime"
        : user.status === "active"
        ? "limited"
        : user.status;

    const token = jwt.sign({ userId: user.id }, user.jwt_secret, {
      expiresIn: "7d",
    });

    return res.status(200).json({
      message: getMessage("loginSuccess", lang),
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        level: user.level,
        role: user.role,
        status: user.status,
        active_until: user.active_until,
        days_left: daysLeft,
        membership_type: membershipType,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: getMessage("errorLoggingIn", lang),
      error: error.message,
    });
  }
};

// Hämta inloggad användares profil
exports.getUserProfile = async (req, res) => {
  const lang = req.user.language || "sv";

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, level, role, status, active_until, profile_image
       FROM users 
       WHERE id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Användaren hittades inte." });
    }

    const user = rows[0];

    return res.status(200).json({
      ...user,
      days_left:
        user.role === "admin"
          ? null
          : exports.calculateDaysLeft(user.active_until),
      membership_type:
        user.role === "admin"
          ? "admin"
          : user.status === "active" && !user.active_until
          ? "lifetime"
          : user.status === "active"
          ? "limited"
          : user.status,
    });
  } catch (error) {
    console.error("Fel vid hämtning av profil:", error);
    return res.status(500).json({
      message: getMessage("errorFetchingProfile", lang),
      error: error.message,
    });
  }
};
// admin aktiverar användarens account
exports.updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status, days, lifetime } = req.body;

  try {
    const allowedStatuses = ["pending", "active", "blocked"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Ogiltig status." });
    }

    let activeUntil = null;

    if (status === "active" && !lifetime) {
      const numberOfDays = Number(days);

      if (!numberOfDays || numberOfDays < 1) {
        return res.status(400).json({
          message: "Ange antal dagar eller välj livstid.",
        });
      }

      activeUntil = new Date();
      activeUntil.setDate(activeUntil.getDate() + numberOfDays);
    }

    await pool.query(
      "UPDATE users SET status = ?, active_until = ? WHERE id = ? AND role != 'admin'",
      [status, activeUntil, userId]
    );

    return res.status(200).json({
      message: "Användarstatus har uppdaterats.",
      status,
      active_until: activeUntil,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Kunde inte uppdatera användarstatus.",
      error: error.message,
    });
  }
};


// reset password
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const [rows] = await pool.query(
      `SELECT id, reset_password_expires
       FROM users
       WHERE reset_password_token = ?`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        message: "Ogiltig återställningslänk.",
      });
    }

    const user = rows[0];

    if (new Date(user.reset_password_expires) < new Date()) {
      return res.status(400).json({
        message: "Återställningslänken har gått ut.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users
       SET password = ?,
           reset_password_token = NULL,
           reset_password_expires = NULL
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    return res.status(200).json({
      message: "Lösenordet har uppdaterats.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Kunde inte uppdatera lösenordet.",
      error: error.message,
    });
  }
};

// days left
exports.calculateDaysLeft = (activeUntil) => {
  if (!activeUntil) return null;

  const now = new Date();
  const expiry = new Date(activeUntil);

  const diffTime = expiry - now;

  const daysLeft = Math.ceil(
    diffTime / (1000 * 60 * 60 * 24)
  );

  return daysLeft > 0 ? daysLeft : 0;
};
