const express = require("express");
const fs = require("fs");
const path = require("path");
const fsExtra = require("fs-extra");
const cors = require("cors");
const { JSDOM } = require("jsdom");
const axios = require("axios");

const app = express();
const PORT = 3000;

app.use(express.json()); // parse JSON body
app.use(cors()); // allow all origins, you can restrict later

// Path to store tokens persistently
const TOKENS_FILE = path.join(__dirname, "tokens.json");

// Example: maps stored in "maps" folder
// maps/map1.svg, maps/map2.svg, etc.
const MAPS_DIR = path.join(__dirname, "maps");

// Helper to read a map and split into chunks
const CHUNK_SIZE = 5000; // number of characters per chunk

function getSvgChunks(svgString) {
  const chunks = [];
  for (let i = 0; i < svgString.length; i += CHUNK_SIZE) {
    chunks.push(svgString.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

// --- Split array into chunks ---
function chunkArray(arr, size = 1000) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

app.get("/", (req, res) => {
  res.send("API is working now!")
})


// --- Collect paths from the SVG ---
function collectAllPaths(svgString) {
  const dom = new JSDOM(svgString);
  const svg = dom.window.document.querySelector("svg");
  if (!svg) return [];

  const pathGroup = svg.querySelector("#Path");
  if (!pathGroup) return [];

  const paths = Array.from(pathGroup.querySelectorAll("rect, circle, line, path"));
  return paths.map((el) => ({
    id: el.id || null,
    x: parseFloat(el.getAttribute("x") || "0"),
    y: parseFloat(el.getAttribute("y") || "0"),
    width: parseFloat(el.getAttribute("width") || "0"),
    height: parseFloat(el.getAttribute("height") || "0"),
  }));
}

function cleanId(id) {
  // Remove all non-printable / control / invisible Unicode characters
  // \u0000-\u001F → ASCII control chars
  // \u007F → DEL
  // \u2028 \u2029 → line / paragraph separator
  const sanitizeWord = id.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, '').trim()
  console.log(sanitizeWord)
  return sanitizeWord;
}

function extractAllGIds(svgString, { exact = [], prefixes = [], regex = [] } = {}) {
  const dom = new JSDOM(svgString, { contentType: "image/svg+xml" });
  const document = dom.window.document;

  const exactSet = new Set(exact);

  return Array.from(document.querySelectorAll("path[id]"))
    .filter(path => path.closest("g")) // only paths inside <g>
    .map(path => cleanId(path.id)) // normalize Unicode
    .filter(id => {
      if (exactSet.has(id)) return false;
      if (prefixes.some(p => id.startsWith(p))) return false;
      if (regex.some(r => r.test(id))) return false;
      return true;
    });
}



// Example usage inside your endpoint
app.get("/maps/:mapId/gids", (req, res) => {
  const mapId = req.params.mapId;
  const chunkIndex = parseInt(req.query.chunk || "0"); // ?chunk=0
  const mapPath = path.join(MAPS_DIR, `${mapId}.svg`);

  if (!fs.existsSync(mapPath)) {
    return res.status(404).json({ error: "Map not found" });
  }

  const svgString = fs.readFileSync(mapPath, "utf8");
  // const exclude = [
  //   "walkway_path", "design_admin", "design_mapbg", "stage", "tesda1", "GROUND FLOOR",
  //   "vector_motor_icon", "vector_motor_icon_2", "vector_motor_icon_3",
  //   "vector_car_icon", "vector_car_icon_2", "vector_car_icon_3", "vector_car_icon_4",
  //   "vector_tric_icon", "main_gate", "vector_pedestrian_gate_icon", "vector_pedestrian_gate_icon_2",
  //   "pedestrian_gate", "KIOSK UI", "vector_kiosk_icon", "STAIRS AB1 B", "STAIRS AB1 C", "STAIRS AB2 B",
  //   "vector_stairs1_ab2", "Path", "vector_car_icon_5"
  // ];
  const excludeRegex = [
  /^vector_/,
  /^design_/,
  /^STAIRS/,
  /_icon$/,
  /^Path$/,
  /^Group\s*\d+$/i,
  /^Vector\s*\d+$/i,
  /^UP_\d+/i,
  /^UP/i,
  /^GROUND\b.*(HALL|HALLWAY|FLOOR|PLAN)/i,
  /^Room$/i,
  /^EASTWOODS$/i,
  /^Vector$/i,
  /^EASTWOODS GROUNDFLOOR$/i,
  /^Roll up window$/i,
  /^Hallway$/i,
  /^PEDESTRIANâ¨GATE_2$/i,  // fixes the weird chars
];
  const gIds = extractAllGIds(svgString, { regex: excludeRegex });
  const allPaths = collectAllPaths(svgString);

  // Split allPaths into chunks
  const pathChunks = chunkArray(allPaths, 1000); // adjust size per your performance needs

  if (chunkIndex >= pathChunks.length) {
    return res.status(400).json({ error: "Chunk index out of range" });
  }

  res.json({
    mapId,
    gIds,
    totalChunks: pathChunks.length,
    chunkIndex,
    paths: pathChunks[chunkIndex],
  });
});

// API endpoint to get SVG map
app.get("/maps/:mapId", (req, res) => {
  const mapId = req.params.mapId; // e.g., "map1"
  const chunkIndex = parseInt(req.query.chunk || "0"); // optional: ?chunk=0

  const mapPath = path.join(MAPS_DIR, `${mapId}.svg`);

  if (!fs.existsSync(mapPath)) {
    return res.status(404).json({ error: "Map not found" });
  }

  const svgString = fs.readFileSync(mapPath, "utf8");
  const chunks = getSvgChunks(svgString);

  if (chunkIndex >= chunks.length) {
    return res.status(400).json({ error: "Chunk index out of range" });
  }

  res.json({
    mapId,
    totalChunks: chunks.length,
    chunkIndex,
    chunk: chunks[chunkIndex],
  });
});

// --- Helpers for tokens ---
let savedTokens = [];
if (fsExtra.existsSync(TOKENS_FILE)) {
  savedTokens = fsExtra.readJsonSync(TOKENS_FILE);
} else {
  fsExtra.writeJsonSync(TOKENS_FILE, []);
}

function saveTokens() {
  fsExtra.writeJsonSync(TOKENS_FILE, savedTokens, { spaces: 2 });
}

// --- Endpoint to register a token ---
app.post("/register-token", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token is required" });

  if (!savedTokens.includes(token)) {
    savedTokens.push(token);
    saveTokens();
    console.log("Saved tokens:", savedTokens);
  }

  res.json({ success: true, totalTokens: savedTokens.length });
});

// --- Send notification ---
app.post("/send-notification", async (req, res) => {
  const { title = "Map Update 📍", body = "New map data available!" } = req.body || {};

  if (savedTokens.length === 0) {
    return res.status(400).json({ error: "No tokens registered" });
  }

  let sentCount = 0;
  const batchSize = 100; // Expo allows 100 messages per request

  const batches = [];
  for (let i = 0; i < savedTokens.length; i += batchSize) {
    batches.push(savedTokens.slice(i, i + batchSize));
  }

  try {
    for (const batch of batches) {
      const messages = batch.map((token) => ({
        to: token,
        sound: "default",
        title,
        body,
      }));
      const response = await axios.post("https://exp.host/--/api/v2/push/send", messages, {
        headers: { "Content-Type": "application/json" },
      });

      // Count successful messages
      sentCount += Array.isArray(response.data) ? response.data.filter(r => r.status === "ok").length : 0;
    }

    console.log(`Notifications attempted: ${savedTokens.length}, successful: ${sentCount}`);
    res.json({ success: true, attempted: savedTokens.length, sent: sentCount });
  } catch (err) {
    console.error("Failed to send notifications:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send notifications" });
  }
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`SVG map server running on http://0.0.0.0:${PORT}`);
});
