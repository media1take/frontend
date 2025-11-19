require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { createProxyServer } = require('http-proxy');

const app = express();
const FRONTEND_DIR = path.join(__dirname);

// Attach routes from routes.js (keeps server.js tidy and makes the router portable)
const attachFrontendRoutes = require('./routes');
attachFrontendRoutes(app, { frontendDir: FRONTEND_DIR });

const PORT = process.env.FRONTEND_PORT || process.env.PORT || 8000;
const server = http.createServer(app);

// If proxying is enabled, ensure websocket upgrades are forwarded to the backend
if (process.env.PROXY_SIGNALLING === 'true') {
  const target = process.env.BACKEND_URL || 'http://localhost:3000';
  const proxy = createProxyServer({ target, ws: true, changeOrigin: true, xfwd: true });
  server.on('upgrade', (req, socket, head) => {
    // Only upgrade requests targeting /signaling
    if (req.url && req.url.startsWith('/signaling')) {
      proxy.ws(req, socket, head, { target: `${target}/signaling` });
    } else {
      socket.destroy();
    }
  });
}

server.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});
