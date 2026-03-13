// Combined endpoint - handles both POST (activity) and GET (status)
// In-memory state with intensity tracking

export default function handler(req, res) {
  // POST /api/room - Receive activity ping from VPS
  if (req.method === 'POST') {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const now = Date.now();
    const body = req.body || {};
    
    // Build combined state string: "working,3" or "coffee" or "sleeping"
    const baseState = body.state || 'working';
    const intensity = body.intensity || 0;
    const combinedState = intensity > 0 ? `${baseState},${intensity}` : baseState;
    
    // Store activity state
    global.lastActivity = now;
    global.state = combinedState;
    global.lastTool = body.tool || 'unknown';
    
    return res.status(200).json({ 
      success: true, 
      timestamp: now,
      state: combinedState
    });
  }

  // GET /api/room - Check current status
  if (req.method === 'GET') {
    const now = Date.now();
    const lastActive = global.lastActivity || 0;
    const inactiveTime = now - lastActive;
    
    // Use stored combined state if recent, otherwise calculate
    let combinedState = global.state;
    if (!combinedState || inactiveTime > 20 * 60 * 1000) {
      combinedState = 'sleeping';
    } else if (inactiveTime > 1 * 60 * 1000 && !combinedState.includes('coffee')) {
      combinedState = 'coffee';
    }

    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      state: combinedState,
      lastActive,
      inactiveTime,
      lastTool: global.lastTool || 'none',
      dublinTime: new Date().toLocaleTimeString('en-IE', { 
        timeZone: 'Europe/Dublin',
        hour: '2-digit',
        minute: '2-digit'
      })
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
