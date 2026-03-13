// Combined endpoint - handles both POST (activity) and GET (status)
// Uses Vercel Blob for persistent activity history

import { get, put } from '@vercel/blob';

const BLOB_KEY = 'activity-history.json';
const MAX_HISTORY = 20;

// In-memory cache for current session (resets on deploy, but we persist to blob)
if (!global.currentSession) {
  global.currentSession = {
    state: 'sleeping',
    startedAt: Date.now()
  };
}

async function loadHistoryFromBlob() {
  try {
    const blob = await get(BLOB_KEY);
    if (!blob) return [];
    const text = await blob.text();
    return JSON.parse(text);
  } catch (e) {
    console.log('Failed to load history from blob:', e.message);
    return [];
  }
}

async function saveHistoryToBlob(history) {
  try {
    await put(BLOB_KEY, JSON.stringify(history), {
      access: 'public',
      contentType: 'application/json'
    });
  } catch (e) {
    console.log('Failed to save history to blob:', e.message);
  }
}

async function recordStateChange(newState) {
  const now = Date.now();
  
  // Don't record if state hasn't changed
  if (global.currentSession.state === newState) {
    return;
  }
  
  // Load current history from blob
  let history = await loadHistoryFromBlob();
  
  // End current session and add to history
  const endedSession = {
    state: global.currentSession.state,
    startedAt: global.currentSession.startedAt,
    endedAt: now,
    duration: now - global.currentSession.startedAt
  };
  
  history.unshift(endedSession);
  
  // Keep only last N entries
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
  
  // Save to blob
  await saveHistoryToBlob(history);
  
  // Update in-memory current session
  global.currentSession = {
    state: newState,
    startedAt: now
  };
}

export default async function handler(req, res) {
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
    
    // Record state change for history tracking (async, don't wait)
    recordStateChange(baseState).catch(console.error);
    
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

    // Load history from blob
    const history = await loadHistoryFromBlob();

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
      }),
      history
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
