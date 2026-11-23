
// Skapar en ny router-instans för att definiera och organisera alla user-relaterade endpoints

const express = require("express");

const router = express.Router();

// Middleware för autentisering och rollkontroll

const authMiddleware = require("../middleware/authMiddleware");

const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const upload = require("../middleware/imageUpload"); 

const checkActiveUser = require("../middleware/checkActiveUser"); 

// Importerar kontrollfunktioner från alla controllers

const {

  registerUser,

  loginUser,

  updateUserStatus,

  resetPassword,

  calculateDaysLeft

} = require("../controllers/userController");

const {

  getQuestionsForTest,

} = require("../controllers/questionController");

const {

  startTestTimer,

  submitTest,

  getTestResultsForUser

} = require("../controllers/testResultController");

const {

  sendMessageToAdmin,

  replyToThread,

  getMessageThread,

  getUserMessages,

  getAllMessages

} = require("../controllers/globalMessageController");

const { 

  uploadProfileImage, 

  deleteProfileImage, 

  getUserProfile 

} = require("../controllers/userProfileController");

const {

  createPost,

  getAllPosts,

  votePost,

  getAllForumPosts,

  getPostWithAnswers,

  answerPost,

} = require("../controllers/forumController");

const { 

  getNotifications, 

  markAsRead, 

  getNotificationById 

} = require("../controllers/notificationController");

const { 

  getTestsBySectionId

 } = require("../controllers/testController");

const {

  addFavoriteWord,

  removeFavoriteWord,

  getFavoriteWords,

  isFavoriteWord,

  addFavoriteVideo,

  removeFavoriteVideo,

  getFavoriteVideos,

  isFavoriteVideo

} = require("../controllers/favoriteController");

const {  

  changePassword 

} = require("../controllers/passwordController");

const {

  getWordById,

  submitVocabularyQuiz,

  getVocabularyQuizResults,

  getVocabularyQuiz,

  searchVocabulary,

  getLettersByLevel,

  getWordsByLevelAndLetter, 

  getBestVocabularyResultsPerLevel, 

  getVocabularyProgressByLevel,

  getFullVocabularyQuizByLevel

} = require("../controllers/vocabularyController");

const {

  getCategories,

  getCategoryById,

  getSectionById,

  getSectionsForUser,

  getSectionsByCategory

} = require("../controllers/sectionController");

const { 

  getVideosByLevel, 

  getVideosBySection 

} = require("../controllers/videoController");

// Registrering och inloggning

router.post("/register", registerUser);

router.post("/login", loginUser);

// Profil och notisar

router.get("/profile", authMiddleware, getUserProfile);

router.post("/profile/image", authMiddleware, upload.single("profileImage"), uploadProfileImage);

router.delete("/profile/image", authMiddleware, deleteProfileImage);

router.get("/notifications", authMiddleware, getNotifications);

router.put("/notifications/:id/read", authMiddleware,  markAsRead);

router.get("/notifications/:id", authMiddleware,  getNotificationById);

// Test

router.get("/tests/:testId/questions", authMiddleware,  checkActiveUser, getQuestionsForTest);

router.post("/tests/:testId/start", authMiddleware, checkActiveUser,  startTestTimer);

router.get("/sections/:id/tests", authMiddleware, checkActiveUser,  getTestsBySectionId);

router.post("/tests/:testId/submit", authMiddleware, checkActiveUser,  submitTest);

router.get("/my-results", authMiddleware,   getTestResultsForUser);

// Video

router.get("/videos/by-section", authMiddleware,  checkActiveUser,  getVideosBySection);

router.get("/videos/by-level/:level", authMiddleware, checkActiveUser,  getVideosByLevel);

// forum
router.post("/forum", authMiddleware, checkActiveUser, createPost);
router.get("/forum", optionalAuthMiddleware, getAllPosts);
router.get("/forum/:postId", optionalAuthMiddleware, getPostWithAnswers);
router.post("/forum/:postId/answer", authMiddleware, checkActiveUser, answerPost);
router.post("/forum/:postId/vote", authMiddleware, checkActiveUser, votePost);

// messages
router.post("/messages", authMiddleware, checkActiveUser, sendMessageToAdmin);
router.get("/messages", authMiddleware, checkActiveUser, getUserMessages);
router.get("/messages/all", authMiddleware, checkActiveUser, getAllMessages);
router.get("/messages/thread/:messageId", authMiddleware, checkActiveUser, getMessageThread);
router.post("/messages/thread/:messageId", authMiddleware, checkActiveUser, replyToThread);

// Favoriter

router.post("/favorites/words/:wordId", authMiddleware, addFavoriteWord);

router.delete("/favorites/words/:wordId", authMiddleware, removeFavoriteWord);

router.get("/favorites/words", authMiddleware, getFavoriteWords);

router.get("/favorites/words/:wordId", authMiddleware, isFavoriteWord);

router.post("/favorites/videos/:videoId", authMiddleware,  checkActiveUser, addFavoriteVideo);

router.delete("/favorites/videos/:videoId", authMiddleware,  checkActiveUser, removeFavoriteVideo);

router.get("/favorites/videos", authMiddleware, checkActiveUser,  getFavoriteVideos);

router.get("/favorites/videos/:videoId", authMiddleware, checkActiveUser,  isFavoriteVideo);

// Lösenord

router.post("/change-password", authMiddleware, changePassword);

// Ordförråd

router.get("/vocabulary/letters", authMiddleware, getLettersByLevel);

router.get("/vocabulary", optionalAuthMiddleware, getWordsByLevelAndLetter);

router.get("/vocabulary/detail/:id", getWordById);

router.get("/vocabulary/search", searchVocabulary);

// Ordförråd för icke-inloggade

router.get("/guestvocabulary/letters", getLettersByLevel);

router.get("/guestvocabulary", optionalAuthMiddleware, getWordsByLevelAndLetter);

router.get("/guestvocabulary/detail/:id", getWordById);

router.get("/guestvocabulary/search", searchVocabulary);

// Ordförråd-quiz

router.get("/vocabulary/quiz", authMiddleware, getVocabularyQuiz);

router.get("/vocabulary/quiz/full", authMiddleware, getFullVocabularyQuizByLevel);

router.post("/vocabulary/quiz", authMiddleware, submitVocabularyQuiz);

router.get("/vocabulary/quiz-results", authMiddleware, getVocabularyQuizResults);

router.get("/vocabulary/quiz-best", authMiddleware, getBestVocabularyResultsPerLevel);

router.get("/vocabulary/quiz-history", authMiddleware, getVocabularyProgressByLevel);

// Sektioner och kategorier

router.get("/sections/by-category", authMiddleware, getSectionsByCategory);

router.get("/sections", authMiddleware, getSectionsForUser);

router.get("/sections/:id", authMiddleware, getSectionById);

router.get("/categories", authMiddleware, getCategories);

router.get("/categories/:id", authMiddleware, getCategoryById);


// reset password

router.put("/reset-password/:token", resetPassword);

// Exporterar router så att den kan användas i servern 

module.exports = router; 