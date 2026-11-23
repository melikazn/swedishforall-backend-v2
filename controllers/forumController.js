// ================= FORUM CONTROLLER =================

// Importera nödvändiga moduler och hjälpfunktioner
const pool = require("../config/db");
const { getMessage } = require("../helpers/languageHelper");
const { sendNotification } = require("../helpers/socketHelper");

// Skapa inlägg
exports.createPost = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.language || "sv";
  const { title, content } = req.body;

  if (!title || !content) {
    return res
      .status(400)
      .json({ message: getMessage("titleContentRequired", lang) });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO forum_posts (user_id, title, content) VALUES (?, ?, ?)",
      [userId, title, content]
    );

    const postId = result.insertId;

    const [[admin]] = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (admin) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, link, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          admin.id,
          "Nytt foruminlägg",
          `En ny fråga har publicerats: "${title}"`,
          `/admin/forum/${postId}`,
        ]
      );
    }

    res.status(201).json({
      message: getMessage("questionCreated", lang),
      id: postId,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorSaving", lang), error: err.message });
  }
};

// Hämta alla inlägg (paginerat)
exports.getAllPosts = async (req, res) => {
  const lang = req.user?.language || "sv";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const searchQuery = `%${search}%`;

  try {
    const [posts] = await pool.query(
      `
      SELECT p.id, p.title, p.content, p.created_at, p.likes, p.dislikes,
             u.name AS author, u.profile_image
      FROM forum_posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 AND p.title LIKE ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [searchQuery, limit, offset]
    );

    res.status(200).json({
      page,
      limit,
      total: posts.length,
      results: posts,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorFetching", lang), error: err.message });
  }
};

// Hämta forum + svar
exports.getAllForumPosts = async (req, res) => {
  const lang = req.user?.language || "sv";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const searchQuery = `%${search}%`;

  try {
    const [posts] = await pool.query(
      `
      SELECT p.id, p.title, p.content, p.created_at, p.likes, p.dislikes,
             u.name AS author, u.profile_image
      FROM forum_posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 AND p.title LIKE ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [searchQuery, limit, offset]
    );

    for (const post of posts) {
      const [answers] = await pool.query(
        `
        SELECT a.id, a.content, a.created_at,
               u.name AS author, u.profile_image
        FROM forum_answers a
        JOIN users u ON a.user_id = u.id
        WHERE a.post_id = ? AND a.is_deleted = 0
        ORDER BY a.created_at ASC
      `,
        [post.id]
      );

      post.answers = answers;
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM forum_posts WHERE is_deleted = 0 AND title LIKE ?`,
      [searchQuery]
    );

    res.status(200).json({
      page,
      limit,
      total,
      results: posts,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorFetching", lang), error: err.message });
  }
};

// Hämta en post
exports.getPostWithAnswers = async (req, res) => {
  const lang = req.user?.language || "sv";
  const { postId } = req.params;

  try {
    const [[post]] = await pool.query(
      `
      SELECT p.id, p.title, p.content, p.created_at,
             u.name AS author, u.profile_image
      FROM forum_posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.is_deleted = 0
    `,
      [postId]
    );

    if (!post) {
      return res.status(404).json({ message: getMessage("questionNotFound", lang) });
    }

    const [answers] = await pool.query(
      `
      SELECT a.id, a.content, a.created_at,
             u.name AS author, u.profile_image
      FROM forum_answers a
      JOIN users u ON a.user_id = u.id
      WHERE a.post_id = ? AND a.is_deleted = 0
      ORDER BY a.created_at ASC
    `,
      [postId]
    );

    res.status(200).json({ post, answers });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorFetching", lang), error: err.message });
  }
};

// Svara på post
exports.answerPost = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.language || "sv";
  const { postId } = req.params;
  const { content } = req.body;

  if (!content) {
    return res
      .status(400)
      .json({ message: getMessage("answerContentRequired", lang) });
  }

  try {
    await pool.query(
      "INSERT INTO forum_answers (post_id, user_id, content) VALUES (?, ?, ?)",
      [postId, userId, content]
    );

    const [[postOwner]] = await pool.query(
      `SELECT user_id, title FROM forum_posts WHERE id = ?`,
      [postId]
    );

    if (postOwner) {
      const msg =
        getMessage("newAnswer", lang) + ` "${postOwner.title}"`;

      await pool.query(
        `INSERT INTO notifications (user_id, message) VALUES (?, ?)`,
        [postOwner.user_id, msg]
      );

      sendNotification(postOwner.user_id, msg);
    }

    res.status(201).json({ message: getMessage("answerPublished", lang) });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorSaving", lang), error: err.message });
  }
};

// radera post
exports.deletePost = async (req, res) => {
  const lang = req.user.language || "sv";
  const { postId } = req.params;

  try {
    await pool.query(
      "UPDATE forum_posts SET is_deleted = 1 WHERE id = ?",
      [postId]
    );

    res.status(200).json({ message: getMessage("questionDeleted", lang) });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorSaving", lang), error: err.message });
  }
};

// radera svar
exports.deleteAnswer = async (req, res) => {
  const lang = req.user.language || "sv";
  const { answerId } = req.params;

  try {
    await pool.query(
      "UPDATE forum_answers SET is_deleted = 1 WHERE id = ?",
      [answerId]
    );

    res.status(200).json({ message: getMessage("answerDeleted", lang) });
  } catch (err) {
    res
      .status(500)
      .json({ message: getMessage("errorSaving", lang), error: err.message });
  }
};

// vote
exports.votePost = async (req, res) => {
  const lang = req.user?.language || "sv";
  const userId = req.user.id;
  const { postId } = req.params;
  const { type } = req.body;

  if (!["like", "dislike"].includes(type)) {
    return res.status(400).json({ message: "Ogiltig röst" });
  }

  try {
    const [existing] = await pool.query(
      "SELECT * FROM forum_votes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
    );

    if (existing.length === 0) {
      await pool.query(
        "INSERT INTO forum_votes (user_id, post_id, type) VALUES (?, ?, ?)",
        [userId, postId, type]
      );

      await pool.query(
        `UPDATE forum_posts SET ${type}s = ${type}s + 1 WHERE id = ?`,
        [postId]
      );

      return res.status(200).json({ message: "Röst registrerad" });
    }

    const old = existing[0].type;

    if (old === type) {
      await pool.query(
        "DELETE FROM forum_votes WHERE user_id = ? AND post_id = ?",
        [userId, postId]
      );

      await pool.query(
        `UPDATE forum_posts SET ${type}s = ${type}s - 1 WHERE id = ?`,
        [postId]
      );

      return res.status(200).json({ message: "Röst borttagen" });
    }

    await pool.query(
      "UPDATE forum_votes SET type = ? WHERE user_id = ? AND post_id = ?",
      [type, userId, postId]
    );

    await pool.query(
      `
      UPDATE forum_posts
      SET ${type}s = ${type}s + 1,
          ${old}s = ${old}s - 1
      WHERE id = ?
    `,
      [postId]
    );

    res.status(200).json({ message: "Röst uppdaterad" });
  } catch (err) {
    res.status(500).json({ message: "error", error: err.message });
  }
};