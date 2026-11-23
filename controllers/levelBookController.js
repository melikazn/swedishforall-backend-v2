const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

exports.uploadLevelBook = async (req, res) => {
  const { level, title } = req.body;

  if (!level || !title || !req.file) {
    return res.status(400).json({ message: "Nivå, titel och PDF krävs." });
  }

  try {
    const filePath = `/uploads/books/${req.file.filename}`;

    await pool.query(
      "INSERT INTO level_books (level, title, file_path) VALUES (?, ?, ?)",
      [level, title, filePath]
    );

    return res.status(201).json({
      message: "Boken har laddats upp.",
      book: { level, title, file_path: filePath },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Kunde inte ladda upp boken.",
      error: error.message,
    });
  }
};