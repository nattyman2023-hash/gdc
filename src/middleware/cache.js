/**
 * Simple in-memory response cache for production.
 * Caches GET responses for a configurable TTL.
 * Bypasses cache for admin/portal/faculty routes and authenticated users.
 */
const cache = new Map();

const DEFAULT_TTL = 60 * 1000; // 60 seconds

// Clean expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expires) cache.delete(key);
  }
}, 120 * 1000);

module.exports = function cacheMiddleware(ttl = DEFAULT_TTL) {
  return (req, res, next) => {
    // Only cache GET requests in production
    if (req.method !== 'GET' || process.env.NODE_ENV !== 'production') return next();

    // Don't cache authenticated routes
    if (req.session && req.session.user) return next();

    // Don't cache admin, portal, faculty
    if (req.path.startsWith('/admin') || req.path.startsWith('/portal') || req.path.startsWith('/faculty')) return next();

    // Don't cache health endpoint (it changes)
    if (req.path === '/health') return next();

    const key = req.originalUrl;

    // Check cache
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expires) {
      res.set('X-Cache', 'HIT');
      return res.send(cached.body);
    }

    // Cache miss - capture response
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, { body, expires: Date.now() + ttl });
      }
      res.set('X-Cache', 'MISS');
      originalSend(body);
    };

    next();
  };
};

// Clear entire cache (useful after content updates)
module.exports.clear = () => cache.clear();
