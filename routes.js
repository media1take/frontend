const path = require('path');
const { createProxyServer } = require('http-proxy');

module.exports = function attachFrontendRoutes(app, options = {}) {
  const FRONTEND_DIR = options.frontendDir || path.join(__dirname);

  // Serve static files FIRST (before route handlers) so .js, .css, images work
  app.use(require('express').static(FRONTEND_DIR));
  
  // Serve specific subdirectories at root-relative paths for asset access
  const homeDir = path.join(FRONTEND_DIR, 'home');
  app.use('/home', require('express').static(homeDir));

  // Root endpoint serves the homepage directly
  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'home', 'index.html')));

  // Clean endpoints for all pages (hide file paths) - using regex to prevent matching /chat.js
  app.get(/^\/home$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'home', 'index.html')));
  app.get(/^\/home\/$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'home', 'index.html')));
  app.get(/^\/home\/index\.html$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'home', 'index.html')));

  app.get(/^\/chat$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'chat', 'chat.html')));
  app.get(/^\/chat\/$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'chat', 'chat.html')));

  app.get(/^\/video$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'video', 'video.html')));
  app.get(/^\/video\/$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'video', 'video.html')));

  app.get(/^\/community$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'community', 'community.html')));
  app.get(/^\/community\/$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'community', 'community.html')));

  app.get(/^\/blog$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'blog', 'blog.html')));
  app.get(/^\/blog\/$/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'blog', 'blog.html')));

  // Clean policy endpoints (replaces .html extensions)
  app.get('/terms', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms.html')));
  app.get('/terms/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms.html')));

  app.get('/privacy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'privacy.html')));
  app.get('/privacy/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'privacy.html')));

  app.get('/guidelines', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'guidelines.html')));
  app.get('/guidelines/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'guidelines.html')));

  // Debug page
  app.get('/debug', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'debug.html')));
  app.get('/debug/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'debug.html')));

  // Backward compatibility: keep .html extensions working for old links
  app.get('/terms.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms.html')));
  app.get('/privacy.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'privacy.html')));
  app.get('/guidelines.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'guidelines.html')));
  app.get('/debug.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'debug.html')));

  // Block direct access to other HTML files
  app.get(/\.html$/i, (req, res) => res.status(404).send('Not found'));

  // Serve a small runtime config JS so the client knows where to connect
  app.get('/config.js', (req, res) => {
    const signalingPath = process.env.SIGNALING_PATH || '/signaling';

    if (process.env.PROXY_SIGNALLING === 'true') {
      res.setHeader('Content-Type', 'application/javascript');
      res.send(`window.__BACKEND_URL = window.location.origin; window.__SIGNALING_PATH = '${signalingPath}';`);
      return;
    }

    let backend = process.env.BACKEND_URL;

    if (!backend) {
      const host = req.get('host');
      const forwardedHost = req.get('x-forwarded-host') || req.headers['x-forwarded-host'] || null;
      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const effectiveHost = forwardedHost || host;

      if (effectiveHost && effectiveHost.includes('app.github.dev')) {
        backend = `${protocol}://${effectiveHost.replace('-8000.', '-3000.')}`;
      } else if (effectiveHost && effectiveHost.includes(':8000')) {
        backend = `${protocol}://${effectiveHost.replace(':8000', ':3000')}`;
      } else if (effectiveHost) {
        backend = `${protocol}://${effectiveHost}:3000`;
      } else {
        backend = `${protocol}://localhost:3000`;
      }
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.send(`window.__BACKEND_URL = '${backend}'; window.__SIGNALING_PATH = '${signalingPath}';`);
  });

  // If PROXY_SIGNALLING=true, create a proxy for /signaling -> backend
  if (process.env.PROXY_SIGNALLING === 'true') {
    const target = process.env.BACKEND_URL || 'http://localhost:3000';
    const proxy = createProxyServer({ target, ws: true, changeOrigin: true, xfwd: true });

    proxy.on('error', (err, req, res) => {
      console.error('[proxy] error', err && err.message);
      try {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad gateway (proxy error)');
      } catch (e) {}
    });

    app.use('/signaling', (req, res) => {
      proxy.web(req, res, { target: `${target}/signaling` });
    });

    console.log('[proxy] /signaling is proxied to', `${target}/signaling`);
  }
};
