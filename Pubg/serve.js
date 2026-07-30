// Minimal static file server — run with: node serve.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8123;
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    const file = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`ZONE ROYALE running at http://localhost:${PORT}`));
