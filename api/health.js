// GET /api/health - System health check endpoint
// Reads lastActivity from Blob (same key as room.js) so it works across cold starts.
// Skips the inactivity-degraded check during Dublin overnight hours (00:00–08:00).

const BLOB_KEY = 'activity-history.json';

async function getLastActivity() {
  let blobModule;
  try {
    blobModule = await import('@vercel/blob');
  } catch (e) {
    return 0;
  }
  try {
    const blob = await blobModule.get(BLOB_KEY);
    if (!blob) return 0;
    const text = await blob.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) return 0; // legacy format
    return data.lastActivity || 0;
  } catch (e) {
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();
  const lastActive = await getLastActivity();
  const inactiveTime = now - lastActive;

  // Suppress degraded status during Dublin overnight hours when inactivity is expected
  const dublinHour = parseInt(
    new Date().toLocaleTimeString('en-IE', {
      timeZone: 'Europe/Dublin',
      hour: '2-digit',
      hour12: false
    }).split(':')[0],
    10
  );
  const isOvernight = dublinHour >= 0 && dublinHour < 8;
  const inactivityThreshold = isOvernight ? Infinity : 30 * 60 * 1000;

  const health = inactiveTime > inactivityThreshold ? 'degraded' : 'healthy';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({
    status: health,
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : null,
    checks: {
      api: 'ok',
      activity: lastActive ? 'ok' : 'no_data',
      lastActivity: lastActive ? new Date(lastActive).toISOString() : null,
      inactiveMs: inactiveTime
    },
    version: '1.0.0',
    environment: process.env.VERCEL_ENV || 'development'
  });
}
