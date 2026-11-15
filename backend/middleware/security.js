'use strict';

// Security headers and the cross-origin rule for a server that faces the internet.

// Browser hardening headers. Nothing sensitive may be cached, so API answers are marked no-store.
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
}

// Which other websites may call the API from a browser. In production the screens are served by this
// same server, so nothing else is needed. CORS_ORIGINS="https://erp.example.com,https://other" adds sites;
// without it only the local development addresses are accepted.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

function allowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return configured.length ? configured : (process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS);
}

function corsOptions() {
  return {
    origin(origin, cb) {
      // no Origin header: same-origin page, a server-to-server call or a script - not a cross-site browser request
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins().includes(origin));
    },
    maxAge: 600,
  };
}

module.exports = { securityHeaders, corsOptions, allowedOrigins };
