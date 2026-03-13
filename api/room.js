// Combined endpoint - handles both POST (activity) and GET (status)
// Uses Vercel Blob as primary persistent store for all state.
// globals are NOT trusted as primary source — Blob is loaded on every invocation.

let blobModule;
try {
  blobModule = await import('@vercel/blob');
} catch (e) {
  console.log('Blob module not available:', e.message);
}

const BLOB_KEY = 'activity-history.json';
const MAX_HISTORY = 20;

// In-memory cache for the current invocation only
let memState = null;

function defaultState() {
  return {
    currentSession: { state: 'sleeping', startedAt: Date.now() },
    lastActivity: 0,
    lastTool: 'none',
    lastCombinedState: 'sleeping',
    history: []
  };
}

async function loadState() {
  if (!blobModule) return memState || defaultState();
  try {
    const blob = await blobModule.get(BLOB_KEY);
    if (!blob) return defaultState();
    const text = await blob.text();
    const parsed = JSON.parse(text);
    // Migrate legacy format (plain array stored before this change)
    if (Array.isArray(parsed)) {
      return { ...defaultState(), history: parsed };
    }
    return parsed;
  } catch (e) {
    console.log('Blob load failed, using memory cache:', e.message);
    return memState || defaultState();
  }
}

async function saveState(state) {
  memState = state;
  if (!blobModule) return;
  try {
    await blobModule.put(BLOB_KEY, JSON.stringify(state), {
      access: 'public',
      contentType: 'application/json'
    });
  } catch (e) {
    console.log('Blob save failed:', e.message);
  }
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

      const state = await loadState();

      // Record completed session if state changed
      if (state.currentSession.state !== baseState) {
        const ended = {
          state: state.currentSession.state,
          startedAt: state.currentSession.startedAt,
          endedAt: now,
          duration: now - state.currentSession.startedAt
        };
        state.history = [ended, ...state.history].slice(0, MAX_HISTORY);
        state.currentSession = { state: baseState, startedAt: now };
      }

      state.lastActivity = now;
      state.lastTool = body.tool || 'unknown';
      state.lastCombinedState = combinedState;

      await saveState(state);

      return res.status(200).json({ success: true, timestamp: now, state: combinedState });
    }

    // GET /api/room - Check current status
    if (req.method === 'GET') {
      const now = Date.now();
      const state = await loadState();

      const lastActive = state.lastActivity || 0;
      const inactiveTime = now - lastActive;

      let combinedState = state.lastCombinedState || state.currentSession.state;
      if (!lastActive || inactiveTime > 20 * 60 * 1000) {
        combinedState = 'sleeping';
      } else if (inactiveTime > 1 * 60 * 1000 && !combinedState.includes('coffee')) {
        combinedState = 'coffee';
      }

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return res.status(200).json({
        state: combinedState,
        lastActive,
        inactiveTime,
        lastTool: state.lastTool || 'none',
        dublinTime: new Date().toLocaleTimeString('en-IE', {
          timeZone: 'Europe/Dublin',
          hour: '2-digit',
          minute: '2-digit'
        }),
        history: state.history,
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
