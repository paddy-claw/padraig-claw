// Combined endpoint - handles both POST (activity) and GET (status)
// Uses Vercel Blob for persistent activity history (with fallback to memory)

let blobModule;
try {
  blobModule = await import('@vercel/blob');
} catch (e) {
  console.log('Blob module not available:', e.message);
}

const BLOB_KEY = 'activity-history.json';
const MAX_HISTORY = 20;

// In-memory fallback (used if blob fails)
if (!global.activityHistory) {
  global.activityHistory = [];
}
if (!global.currentSession) {
  global.currentSession = {
    state: 'sleeping',
    startedAt: Date.now()
  };
}

async function loadHistoryFromBlob() {
  if (!blobModule) return global.activityHistory;
  
  try {
    const blob = await blobModule.get(BLOB_KEY);
    if (!blob) return [];
    const text = await blob.text();
    return JSON.parse(text);
  } catch (e) {
    console.log('Blob load failed, using memory:', e.message);
    return global.activityHistory;
  }
}

async function saveHistoryToBlob(history) {
  if (!blobModule) {
    global.activityHistory = history;
    return;
  }
  
  try {
    await blobModule.put(BLOB_KEY, JSON.stringify(history), {
      access: 'public',
      contentType: 'application/json'
    });
  } catch (e) {
    console.log('Blob save failed, using memory:', e.message);
    global.activityHistory = history;
  }
}

async function recordStateChange(newState) {
  const now = Date.now();
  
  if (global.currentSession.state === newState) {
    return;
  }
  
  let history = await loadHistoryFromBlob();
  
  const endedSession = {
    state: global.currentSession.state,
    startedAt: global.currentSession.startedAt,
    endedAt: now,
    duration: now - global.currentSession.startedAt
  };
  
  history.unshift(endedSession);
  
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
  
  await saveHistoryToBlob(history);
  
  global.currentSession = {
    state: newState,
    startedAt: now
  };
}

export default async function handler(req, res) {
  try {
    // POST /api/room - Receive activity ping from VPS
    if (req.method === 'POST') {
      const secret = req.headers['x-webhook-secret'];
      if (secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const now = Date.now();
      const body = req.body || {};
      
      const baseState = body.state || 'working';
      const intensity = body.intensity || 0;
      const combinedState = intensity > 0 ? `${baseState},${intensity}` : baseState;
      
      recordStateChange(baseState).catch(console.error);
      
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
      
      let combinedState = global.state;
      if (!combinedState || inactiveTime > 20 * 60 * 1000) {
        combinedState = 'sleeping';
      } else if (inactiveTime > 1 * 60 * 1000 && !combinedState.includes('coffee')) {
        combinedState = 'coffee';
      }

      const history = await loadHistoryFromBlob();

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
        }),
        history,
        _blobAvailable: !!blobModule
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ 
      error: 'Internal error', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
