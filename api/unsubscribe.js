// POST /api/unsubscribe - Newsletter unsubscribe endpoint
// Removes email from the mailing list

import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};

    // Validate email
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Invalid email address',
        message: 'Please provide a valid email address'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const sanitizedEmail = sanitizeEmail(normalizedEmail);
    
    // Find and delete subscriber
    const { blobs } = await list({ prefix: 'subscribers/' });
    let deleted = false;
    
    for (const blob of blobs) {
      if (blob.pathname.includes(sanitizedEmail)) {
        await del(blob.pathname);
        deleted = true;
        break;
      }
    }

    if (deleted) {
      return res.status(200).json({
        success: true,
        message: 'You have been unsubscribed. Sorry to see you go!'
      });
    } else {
      return res.status(200).json({
        success: true,
        message: 'Email not found in our list. You may already be unsubscribed.'
      });
    }

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Failed to process unsubscribe. Please try again later.'
    });
  }
}

// Helper: Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: Sanitize email for use in filename
function sanitizeEmail(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}
