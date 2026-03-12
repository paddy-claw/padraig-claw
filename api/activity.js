// POST /api/activity - Webhook from Padraig's VPS
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug: log what we receive (remove after fixing)
  const receivedSecret = req.headers['x-webhook-secret'];
  const envSecret = process.env.WEBHOOK_SECRET;
  console.log('Debug:', { 
    receivedSecretLength: receivedSecret?.length, 
    envSecretLength: envSecret?.length,
    receivedSecretStart: receivedSecret?.substring(0, 20),
    envSecretStart: envSecret?.substring(0, 20),
    match: receivedSecret === envSecret 
  });

  // Verify secret token
  if (receivedSecret !== envSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Store timestamp (using global for simple in-memory storage)
  global.lastActivity = Date.now();
  global.lastTool = req.body.tool || 'unknown';
  
  res.status(200).json({ 
    success: true, 
    timestamp: global.lastActivity 
  });
}
