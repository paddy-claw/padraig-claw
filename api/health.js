// GET /api/health - System health check endpoint
// Returns overall status of the website and its dependencies

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();
  const lastActive = global.lastActivity || 0;
  const inactiveTime = now - lastActive;
  
  // Calculate health status
  let health = 'healthy';
  let status = 200;
  
  if (inactiveTime > 30 * 60 * 1000) {
    health = 'degraded'; // No activity for 30+ minutes
  }
  
  // Check if we have any activity recorded
  const hasActivity = !!global.lastActivity;
  
  const healthData = {
    status: health,
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : null,
    checks: {
      api: 'ok',
      activity: hasActivity ? 'ok' : 'no_data',
      lastActivity: lastActive ? new Date(lastActive).toISOString() : null,
      inactiveMs: inactiveTime
    },
    version: '1.0.0',
    environment: process.env.VERCEL_ENV || 'development'
  };

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(status).json(healthData);
}
