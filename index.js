const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { JSDOM } = require("jsdom");

const app = express();
const PORT = 3000;

app.use(cors()); // allow all origins, you can restrict later

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

function extractAllGIds(svgString, excludeList = []) {
  const dom = new JSDOM(svgString, { contentType: "image/svg+xml" });
  const document = dom.window.document;

  const gElements = Array.from(document.querySelectorAll("g[id]"));

  // Filter out IDs in the exclude list
  const ids = gElements
    .map(g => g.id)
    .filter(id => !excludeList.includes(id));

  return ids;
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
  const exclude = [
    "walkway_path", "design_admin", "design_mapbg", "stage", "tesda1", "GROUND FLOOR",
    "vector_motor_icon", "vector_motor_icon_2", "vector_motor_icon_3",
    "vector_car_icon", "vector_car_icon_2", "vector_car_icon_3", "vector_car_icon_4",
    "vector_tric_icon", "main_gate", "vector_pedestrian_gate_icon", "vector_pedestrian_gate_icon_2",
    "pedestrian_gate", "KIOSK UI", "vector_kiosk_icon", "STAIRS AB1 B", "STAIRS AB1 C", "STAIRS AB2 B",
    "vector_stairs1_ab2", "Path", "vector_car_icon_5"
  ];
  const gIds = extractAllGIds(svgString, exclude);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SVG map server running on http://0.0.0.0:${PORT}`);
});
