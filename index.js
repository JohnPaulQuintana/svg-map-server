const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

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

app.get("/", (req, res) => {
  res.send("API is working now!")
})

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
