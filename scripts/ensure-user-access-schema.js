const pool = require("../config/db");

/**
 * Keeps older local databases compatible with the account-access features.
 * Existing users receive active status so a schema upgrade never locks them out.
 */
async function ensureUserAccessSchema() {
  const [columns] = await pool.query("SHOW COLUMNS FROM users");
  const columnNames = new Set(columns.map((column) => column.Field));

  if (!columnNames.has("status")) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN status ENUM('pending', 'active', 'blocked') NOT NULL DEFAULT 'active' AFTER role"
    );
    console.log("Added users.status for account access.");
  }

  if (!columnNames.has("active_until")) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN active_until DATETIME NULL AFTER status"
    );
    console.log("Added users.active_until for account access.");
  }
}

module.exports = ensureUserAccessSchema;

if (require.main === module) {
  ensureUserAccessSchema()
    .then(() => pool.end())
    .catch((error) => {
      console.error("Could not update the users table:", error.message);
      process.exitCode = 1;
    });
}
