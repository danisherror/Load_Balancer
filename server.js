const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { lookup } = require('geoip-lite');
const http = require('http');

const app = express();
const PORT = 3000;

const servers = [
  'http://localhost:4000',
  'http://localhost:4001'
];

let current = 0;

// Utility function to check server availability
function checkServerHealth(serverUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${serverUrl}/health`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', (err) => {
      console.log(`[DOWN] ${serverUrl} - ${err.message}`);
      resolve(false);
    });

    req.setTimeout(1000, () => {
      console.log(`[TIMEOUT] ${serverUrl} - Server did not respond in time`);
      req.destroy();
      resolve(false);
    });
  });
}

// Middleware to handle routing with health check
app.use(async (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  console.log("Client IP:", ip);

  if (!ip.startsWith('::1') && !ip.startsWith('127.') && !ip.startsWith('192.168.')) {
    console.log("Geo Info:", lookup(ip));
  } else {
    console.log("Local IP detected. Skipping GeoIP lookup.");
  }

  // Try to find a healthy server
  let attempts = 0;
  let target;

  while (attempts < servers.length) {
    const index = (current + attempts) % servers.length;
    const server = servers[index];
    const healthy = await checkServerHealth(server);

    if (healthy) {
      target = server;
      current = (index + 1) % servers.length;
      break;
    } else {
      console.log(`[SKIP] Skipping ${server} — server is not healthy`);
    }

    attempts++;
  }

  if (!target) {
    console.log("[ERROR] No available servers. Returning 503.");
    res.status(503).send("All servers are down. Please try again later.");
    return;
  }

  console.log(`[ROUTE] Routing request to ${target}`);

  // Proxy the request
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true
  });

  proxy(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Load balancer running at http://localhost:${PORT}`);
});
