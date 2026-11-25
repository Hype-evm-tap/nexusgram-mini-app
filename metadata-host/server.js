const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const routes = {
  "/collection.json": path.join(root, "collection.json"),
  "/nft/0.json": path.join(root, "nft", "0.json")
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/health") {
    res.writeHead(200, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
    return res.end(JSON.stringify({ok:true,service:"nexusgram-nft-metadata"}));
  }
  const file = routes[pathname];
  if (!file) {
    res.writeHead(404, {"Content-Type":"application/json; charset=utf-8"});
    return res.end(JSON.stringify({error:"Not found"}));
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500, {"Content-Type":"application/json; charset=utf-8"});
      return res.end(JSON.stringify({error:"Metadata unavailable"}));
    }
    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"public, max-age=60"
    });
    res.end(data);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log("Metadata host listening on " + port));
