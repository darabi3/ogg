import http from "http";
import { spawn } from "child_process";

const TOKEN = process.env.TOKEN || "";
const HOSTS = (process.env.ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const okHost = h => HOSTS.some(x => h === x || h.endsWith("." + x));

http.createServer((req, res) => {
  if (req.method === "GET") { res.writeHead(200); return res.end("ok"); }
  if (req.method !== "POST" || req.url !== "/voice") { res.writeHead(404); return res.end(); }
  if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(); }

  let body = "";
  req.on("data", c => { body += c; if (body.length > 10000) req.destroy(); });
  req.on("end", () => {
    let src, secs;
    try {
      const j = JSON.parse(body);
      const u = new URL(j.url);
      if (!/^https?:$/.test(u.protocol) || !okHost(u.hostname.toLowerCase())) throw 0;
      src = u.href;
      secs = Math.min(Math.max(Number(j.seconds) || 0, 0), 600);
    } catch { res.writeHead(400); return res.end(); }

    const args = ["-protocol_whitelist", "http,https,tcp,tls,crypto", "-i", src, "-vn"];
    if (secs) args.push("-t", String(secs));
    args.push("-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "48k", "-application", "voip", "-f", "ogg", "pipe:1");

    const ff = spawn("ffmpeg", args);
    const chunks = [];
    ff.stdout.on("data", c => chunks.push(c));
    ff.on("error", () => { res.writeHead(500); res.end(); });
    ff.on("close", code => {
      const out = Buffer.concat(chunks);
      if (code !== 0 || !out.length) { res.writeHead(502); return res.end(); }
      res.writeHead(200, { "content-type": "audio/ogg", "content-length": out.length });
      res.end(out);
    });
    setTimeout(() => ff.kill("SIGKILL"), 60000);
  });
}).listen(process.env.PORT || 10000);
