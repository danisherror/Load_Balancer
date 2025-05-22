const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

const PORT = 3000;

const servers = [
  'http://localhost:4000',
  'http://localhost:4001'
];

let current = 0;

app.use((req, res, next) => {
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
