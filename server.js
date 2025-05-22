const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const {lookup} = require('geoip-lite');
const app = express();


const PORT = 3000;

const servers = [
  'http://localhost:4000',
  'http://localhost:4001'
];

let current = 0;

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
const isLocal = ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.');
if (!isLocal) {
  console.log(ip);
  console.log(lookup(ip));
} else {
  console.log('Local IP detected. Skipping GeoIP lookup.');
}
  const target = servers[current];
  current = (current + 1) % servers.length;
  // Call and return the proxy middleware
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true
  });
  proxy(req, res, next);
});

app.listen(PORT, () => {
  console.log(`load balancer on http://localhost:${PORT}`);
});
