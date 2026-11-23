// Importera moduler
const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// Hjälpfunktion för att ta bort en fil
const deleteFileIfExists = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("❌ Kunde inte radera fil:", filePath, error);
  }
};

// Hjälpfunktion för att lägga till video- och PDF-URL
const formatVideoResponse = (video, req) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  return {
    ...video,
    video_url: video.filename
      ? `${baseUrl}/uploads/videos/${video.filename}`
      : null,

    pdf_url: video.pdf_filename
      ? `${baseUrl}/uploads/pdfs/${video.pdf_filename}`
      : null,
  };
};

// Ladda upp en ny video och en valfri PDF
exports.uploadVideo = async (req, res) => {
  const { sectionId, title, description } = req.body;

  /*
    När upload.fields används får vi:

    req.files.video[0]
    req.files.pdf[0]
  */

  const videoFile = req.files?.video?.[0];
  const pdfFile = req.files?.pdf?.[0];

  if (!videoFile) {
    return res.status(400).json({
      message: "Ingen videofil bifogad.",
    });
  }

  if (!sectionId || !title) {
    // Radera uppladdade filer om obligatoriska fält saknas
    deleteFileIfExists(videoFile.path);

    if (pdfFile) {
      deleteFileIfExists(pdfFile.path);
    }

    return res.status(400).json({
      message: "Titel och sektion krävs.",
    });
  }

  try {
    const videoFilename = videoFile.filename;
    const pdfFilename = pdfFile ? pdfFile.filename : null;

    const [result] = await pool.query(
      `INSERT INTO videos
        (section_id, title, description, filename, pdf_filename)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sectionId,
        title,
        description || "",
        videoFilename,
        pdfFilename,
      ]
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(201).json({
      message: pdfFile
        ? "Videon och PDF-filen har laddats upp."
        : "Videon har laddats upp.",
      id: result.insertId,
      video_url: `${baseUrl}/uploads/videos/${videoFilename}`,
      pdf_filename: pdfFilename,
      pdf_url: pdfFilename
        ? `${baseUrl}/uploads/pdfs/${pdfFilename}`
        : null,
    });
  } catch (err) {
    // Ta bort filerna om databassparningen misslyckas
    deleteFileIfExists(videoFile.path);

    if (pdfFile) {
      deleteFileIfExists(pdfFile.path);
    }

    console.error("❌ Fel vid video- och PDF-uppladdning:", err);

    return res.status(500).json({
      message: "Serverfel",
      error: err.message,
    });
  }
};

// Hämta alla videor med sektion- och nivåinformation
exports.getAllVideos = async (req, res) => {
  try {
    const [videos] = await pool.query(`
      SELECT
        v.id,
        v.section_id,
        v.title,
        v.description,
        v.filename,
        v.pdf_filename,
        v.uploaded_at,
        s.name AS section_name,
        s.level
      FROM videos v
      JOIN sections s ON v.section_id = s.id
      ORDER BY v.uploaded_at DESC
    `);

    const videosWithUrl = videos.map((video) =>
      formatVideoResponse(video, req)
    );

    return res.status(200).json(videosWithUrl);
  } catch (err) {
    console.error("❌ Fel vid hämtning av videor:", err);

    return res.status(500).json({
      message: "Kunde inte hämta videor.",
      error: err.message,
    });
  }
};

// Uppdatera titel och beskrivning för en video
exports.updateVideo = async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({
      message: "Titel krävs.",
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE videos
       SET title = ?, description = ?
       WHERE id = ?`,
      [title, description || "", id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Videon hittades inte.",
      });
    }

    return res.status(200).json({
      message: "Videon har uppdaterats.",
    });
  } catch (err) {
    console.error("❌ Fel vid uppdatering av video:", err);

    return res.status(500).json({
      message: "Serverfel",
      error: err.message,
    });
  }
};

// Radera video, PDF och databaspost
exports.deleteVideo = async (req, res) => {
  const { id } = req.params;

  try {
    // Hämta både video- och PDF-filnamn
    const [[video]] = await pool.query(
      `SELECT filename, pdf_filename
       FROM videos
       WHERE id = ?`,
      [id]
    );

    if (!video) {
      return res.status(404).json({
        message: "Videon hittades inte.",
      });
    }

    // Radera posten från databasen
    await pool.query(
      "DELETE FROM videos WHERE id = ?",
      [id]
    );

    // Sökväg till videofilen
    const videoPath = path.join(
      __dirname,
      "..",
      "uploads",
      "videos",
      video.filename
    );

    deleteFileIfExists(videoPath);

    // Radera PDF-filen om den finns
    if (video.pdf_filename) {
      const pdfPath = path.join(
        __dirname,
        "..",
        "uploads",
        "pdfs",
        video.pdf_filename
      );

      deleteFileIfExists(pdfPath);
    }

    return res.status(200).json({
      message: "Videon och tillhörande PDF har raderats.",
    });
  } catch (err) {
    console.error("❌ Fel vid borttagning av video:", err);

    return res.status(500).json({
      message: "Serverfel",
      error: err.message,
    });
  }
};

// Hämta alla videor för en viss sektion
exports.getVideosBySectionId = async (req, res) => {
  const sectionId = req.params.id;

  try {
    const [videos] = await pool.query(
      `
      SELECT
        v.id,
        v.section_id,
        v.title,
        v.description,
        v.filename,
        v.pdf_filename,
        v.uploaded_at,
        s.name AS section_name,
        s.level
      FROM videos v
      JOIN sections s ON v.section_id = s.id
      WHERE v.section_id = ?
      ORDER BY v.uploaded_at DESC
      `,
      [sectionId]
    );

    const videosWithUrl = videos.map((video) =>
      formatVideoResponse(video, req)
    );

    return res.status(200).json(videosWithUrl);
  } catch (err) {
    console.error(
      "❌ Fel vid hämtning av sektionens videor:",
      err
    );

    return res.status(500).json({
      message: "Kunde inte hämta videor för sektionen.",
      error: err.message,
    });
  }
};

// Hämta videor baserat på sectionId i query-parametern
exports.getVideosBySection = async (req, res) => {
  const sectionId = req.query.sectionId;

  if (!sectionId) {
    return res.status(400).json({
      message: "Sektionens ID krävs.",
    });
  }

  try {
    const [videos] = await pool.query(
      `
      SELECT
        v.*,
        s.name AS section_name,
        s.level
      FROM videos v
      JOIN sections s ON v.section_id = s.id
      WHERE v.section_id = ?
      ORDER BY v.uploaded_at DESC
      `,
      [sectionId]
    );

    const formattedVideos = videos.map((video) =>
      formatVideoResponse(video, req)
    );

    return res.status(200).json(formattedVideos);
  } catch (err) {
    console.error(
      "❌ Fel vid hämtning av videor för sektionen:",
      err
    );

    return res.status(500).json({
      message: "Kunde inte hämta videor.",
      error: err.message,
    });
  }
};

// Hämta alla videor för en viss nivå
exports.getVideosByLevel = async (req, res) => {
  const { level } = req.params;

  try {
    const [videos] = await pool.query(
      `
      SELECT
        v.*,
        s.name AS section_name,
        s.level
      FROM videos v
      JOIN sections s ON v.section_id = s.id
      WHERE s.level = ?
      ORDER BY v.uploaded_at DESC
      `,
      [level]
    );

    const formattedVideos = videos.map((video) =>
      formatVideoResponse(video, req)
    );

    return res.status(200).json(formattedVideos);
  } catch (err) {
    console.error(
      "❌ Fel vid hämtning av videor per nivå:",
      err
    );

    return res.status(500).json({
      message: "Kunde inte hämta videor för vald nivå.",
      error: err.message,
    });
  }
};