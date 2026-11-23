// Importerar nödvändiga moduler
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const http = require("http");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { Server } = require("socket.io");
const pool = require("./config/db");
const ensureUserAccessSchema = require("./scripts/ensure-user-access-schema");

// Läser in miljövariabler från .env-filen
dotenv.config();

// Skapar en Express-app
const app = express();

// Använder antingen port från .env eller 5000 som standard
const PORT = process.env.PORT || 5050;

// Skapar en HTTP-server som används av både Express och Socket.IO
const server = http.createServer(app);

// Initierar Socket.IO och tillåter alla domäner (
const allowedOrigins = [
  "https://swedishforall.com",
  "https://www.swedishforall.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.includes(origin) ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });

// Gör Socket.IO-instansen tillgänglig i hela appen via req.app.get("io")
app.set("io", io);

// Aktiverar CORS så frontend kan kommunicera med backend
app.use(cors(corsOptions));

// Mellanvara för att kunna läsa JSON- och URL-encoded-request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Kontroll: säkerställ att routes är korrekt exporterade som funktioner
if (typeof userRoutes !== 'function') {
  console.error("❌ userRoutes är inte en router. Kontrollera module.exports i routes/userRoutes.js");
  process.exit(1);
}
if (typeof adminRoutes !== 'function') {
  console.error("❌ adminRoutes är inte en router. Kontrollera module.exports i routes/adminRoutes.js");
  process.exit(1);
}

// Registrerar user- och admin-routes med prefix
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);

// En enkel rot-endpoint för att verifiera att API:n är igång
app.get("/", (req, res) => {
  res.send("Swedish App API is running...");
});

// Verifierar både servern och databasanslutningen utan att ändra data.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({
      status: "unavailable",
      database: "disconnected",
      message: "Databasanslutningen kunde inte upprättas.",
    });
  }
});

// Tillgängliggör alla filer i "uploads"-mappen publikt
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Hanterar nya WebSocket-anslutningar
io.on("connection", (socket) => {
  console.log("🔌 Ny användare ansluten till WebSocket: " + socket.id);

  socket.on("disconnect", () => {
    console.log("🔌 Användare frånkopplad: " + socket.id);
  });
});

// Startar servern
const startServer = async () => {
  try {
    await ensureUserAccessSchema();
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server could not start because the database schema is invalid:", error);
    process.exit(1);
  }
};

startServer();
