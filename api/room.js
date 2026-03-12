// Combined endpoint - handles both POST (activity) and GET (status)
export default function handler(req, res) {
  // Initialize history array if not exists
  if (!global.activityHistory) {
    global.activityHistory = [];
  }
  if (!global.lastState) {
    global.lastState = 'sleeping';
  }
  if (!global.lastStateChange) {
    global.lastStateChange = Date.now();
  }

  // POST /api/room - Receive activity ping from VPS
  if (req.method === 'POST') {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    global.lastActivity = Date.now();
    global.lastTool = req.body.tool || 'unknown';
    return res.status(200).json({ success: true, timestamp: global.lastActivity });
  }

  // GET /api/room - Check current status
  if (req.method === 'GET') {
    const now = Date.now();
    const lastActive = global.lastActivity || 0;
    const inactiveTime = now - lastActive;
    
    let state = 'sleeping';
    if (inactiveTime < 1 * 60 * 1000) {
      state = 'working';
    } else if (inactiveTime < 20 * 60 * 1000) {
      state = 'coffee';
    }

    // Track state changes
    if (state !== global.lastState) {
      const duration = now - global.lastStateChange;
      global.activityHistory.unshift({
        state: global.lastState,
        startedAt: global.lastStateChange,
        endedAt: now,
        duration: duration
      });
      // Keep only last 10 entries
      global.activityHistory = global.activityHistory.slice(0, 10);
      
      global.lastState = state;
      global.lastStateChange = now;
    }

    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      state,
      lastActive,
      inactiveTime,
      lastTool: global.lastTool || 'none',
      dublinTime: new Date().toLocaleTimeString('en-IE', { 
        timeZone: 'Europe/Dublin',
        hour: '2-digit',
        minute: '2-digit'
      }),
      history: global.activityHistory
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
