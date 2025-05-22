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
const requestCount = {
  'http://localhost:4000': 0,
  'http://localhost:4001': 0
};

const healthyServers = new Set();

// Health check function (ping /health endpoint)
function checkServerHealth(serverUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${serverUrl}/health`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Background task to update healthy server list every 5 seconds
function updateHealthStatus() {
  servers.forEach(async (server) => {
    const healthy = await checkServerHealth(server);
    if (healthy) {
      if (!healthyServers.has(server)) {
        console.log(`[UP] ${server} is now healthy.`);
      }
      healthyServers.add(server);
    } else {
      if (healthyServers.has(server)) {
        console.log(`[DOWN] ${server} is now unreachable.`);
      }
      healthyServers.delete(server);
    }
  });
}

setInterval(updateHealthStatus, 5000);
updateHealthStatus(); // run once on startup

// Route: /status — show number of requests per server
app.get('/status', (req, res) => {
  res.json({
    requestCount,
    healthyServers: Array.from(healthyServers)
  });
});

// Proxy middleware
app.use(async (req, res, next) => {
  if (req.path === '/status') return next();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  console.log("Client IP:", ip);

  if (!ip.startsWith('::1') && !ip.startsWith('127.') && !ip.startsWith('192.168.')) {
    console.log("Geo Info:", lookup(ip));
  } else {
    console.log("Local IP detected. Skipping GeoIP lookup.");
  }

  const healthyList = Array.from(healthyServers);
  if (healthyList.length === 0) {
    console.log("[ERROR] No available servers. Returning 503.");
    return res.status(503).send("All servers are down. Please try again later.");
  }

  const index = current % healthyList.length;
  const target = healthyList[index];
  current++;

  requestCount[target]++;
  console.log(`[ROUTE] Routing to ${target}. Total: ${requestCount[target]}`);

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true
  });

  proxy(req, res, next);
});

app.listen(PORT, () => {
  console.log(`✅ Load balancer running at http://localhost:${PORT}`);
});
