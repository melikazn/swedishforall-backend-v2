// Importera nödvändiga moduler
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Sökvägar till uppladdningsmapparna
const videoFolder = path.join(
  __dirname,
  "..",
  "uploads",
  "videos"
);

const pdfFolder = path.join(
  __dirname,
  "..",
  "uploads",
  "pdfs"
);

// Skapa mapparna om de inte redan finns
fs.mkdirSync(videoFolder, { recursive: true });
fs.mkdirSync(pdfFolder, { recursive: true });

// Konfigurera lagringen
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Videofilen sparas i uploads/videos
    if (file.fieldname === "video") {
      return cb(null, videoFolder);
    }

    // PDF-filen sparas i uploads/pdfs
    if (file.fieldname === "pdf") {
      return cb(null, pdfFolder);
    }

    return cb(
      new Error(`Ogiltigt filfält: ${file.fieldname}`)
    );
  },

  filename: function (req, file, cb) {
    // Gör filnamnet unikt
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1000000000) +
      "-" +
      file.originalname;

    cb(null, uniqueName);
  },
});

// Kontrollera filformat
const fileFilter = function (req, file, cb) {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  // Kontrollera videofilen
  if (file.fieldname === "video") {
    const allowedVideoFormats = [
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
    ];

    if (allowedVideoFormats.includes(extension)) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Endast MP4, MOV, AVI, MKV och WEBM stöds för videofilen."
      )
    );
  }

  // Kontrollera PDF-filen
  if (file.fieldname === "pdf") {
    if (
      extension === ".pdf" &&
      file.mimetype === "application/pdf"
    ) {
      return cb(null, true);
    }

    return cb(
      new Error("Endast PDF-filer är tillåtna.")
    );
  }

  return cb(
    new Error(`Filfältet ${file.fieldname} är inte tillåtet.`)
  );
};

// Skapa Multer-middleware
const upload = multer({
  storage,

  limits: {
    // Maxstorlek per fil: 1 GB
    fileSize: 1000 * 1024 * 1024,

    // Maximalt en video och en PDF
    files: 2,
  },

  fileFilter,
});

// Exportera middleware
module.exports = upload;