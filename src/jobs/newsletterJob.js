/**
 * Newsletter Job - Automated Weekly Newsletter
 * Sends product updates, new features, and tips to subscribers
 * 
 * Security: XSS protection, secure tokens, no PII logging
 * Compliance: Unsubscribe links in all emails
 */

const cron = require('node-cron');
const crypto = require('crypto');
const pool = require('../config/db');
const emailService = require('../utils/emailService');

// Track last newsletter send to prevent duplicates
let lastNewsletterSendDate = null;

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, char => map[char]);
}

/**
 * Mask email for logging (privacy)
 */
function maskEmail(email) {
  if (!email) return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 2 
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : '**';
  return `${maskedLocal}@${domain}`;
}

/**
 * Get active newsletter subscribers with pagination
 * @param {Object|number} options - Either options object {limit, offset} or legacy limit number
 * @param {number} legacyOffset - Legacy offset parameter (for backward compatibility)
 * @returns {Object|Array} Returns {subscribers, total} for object call, or array for legacy
 */
async function getActiveSubscribers(options = {}, legacyOffset = 0) {
  try {
    // Support both new object style and legacy positional args
    let limit, offset, returnObject = false;
    
    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      limit = options.limit || 100;
      offset = options.offset || 0;
      returnObject = true;
    } else {
      // Legacy positional arguments
      limit = typeof options === 'number' ? options : 100;
      offset = legacyOffset;
    }
    
    // Get subscribers
    const result = await pool.query(`
      SELECT id, email, name, subscription_type, unsubscribe_token, created_at
      FROM newslettersubscriptions 
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    if (returnObject) {
      // Get total count for pagination
      const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM newslettersubscriptions WHERE status = 'active'
      `);
      const total = parseInt(countResult.rows[0].count, 10);
      
      return {
        subscribers: result.rows,
        total
      };
    }
    
    // Legacy: return just the array
    return result.rows;
  } catch (error) {
    console.error('❌ Error fetching subscribers');
    if (typeof options === 'object') {
      return { subscribers: [], total: 0 };
    }
    return [];
  }
}

/**
 * Get total subscriber count
 */
async function getSubscriberCount() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM newslettersubscriptions WHERE status = 'active'
    `);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    return 0;
  }
}

/**
 * Get recent platform updates/changelog
 */
function getRecentUpdates() {
  return [
    {
      title: '🚀 AI-Powered Error Analysis',
      description: 'Our AI now provides even more accurate solutions with 99.2% accuracy rate.',
      date: new Date().toLocaleDateString()
    },
    {
      title: '⚡ Faster Response Times',
      description: 'Error analysis now completes in under 2 seconds on average.',
      date: new Date().toLocaleDateString()
    },
    {
      title: '📱 Mobile-Friendly Interface',
      description: 'Enjoy a seamless experience on any device with our responsive design.',
      date: new Date().toLocaleDateString()
    }
  ];
}

/**
 * Get helpful tips for the newsletter
 */
function getWeeklyTips() {
  const tips = [
    {
      title: 'Copy the Full Error',
      content: 'For best results, copy the entire error message including any error codes. This helps our AI provide more accurate solutions.'
    },
    {
      title: 'Include Context',
      content: 'If you are getting an error while doing something specific, mention what you were trying to do. Context helps!'
    },
    {
      title: 'Check Your Error History',
      content: 'Pro tip: Your dashboard keeps a history of all errors you have analyzed. Great for recurring issues!'
    },
    {
      title: 'Rate Solutions',
      content: 'Found a solution helpful? Rate it! Your feedback helps improve our AI for everyone.'
    },
    {
      title: 'Try the Error Library',
      content: 'Before analyzing a new error, check our Error Library. Someone might have already solved it!'
    }
  ];
  
  return tips[Math.floor(Math.random() * tips.length)];
}

/**
 * Generate newsletter HTML with XSS protection
 */
function generateNewsletterHTML(subscriber, updates, tip) {
  const safeName = escapeHtml(subscriber.name) || 'ErrorWise User';
  const unsubscribeToken = subscriber.unsubscribe_token;
  const unsubscribeUrl = `https://errorwise.tech/unsubscribe/${encodeURIComponent(unsubscribeToken)}`;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ErrorWise Weekly Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 0 0 20px 20px;">
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 12px; border-radius: 12px; margin-bottom: 15px;">
        <span style="font-size: 28px;">📬</span>
      </div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
        Your Weekly Update
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
        What's new at ErrorWise
      </p>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px; background-color: #1e293b; margin: 20px; border-radius: 16px;">
      
      <p style="color: #e2e8f0; font-size: 16px; margin: 0 0 25px 0;">
        Hi ${safeName}! 👋
      </p>
      
      <p style="color: #94a3b8; font-size: 15px; margin: 0 0 30px 0; line-height: 1.6;">
        Here's what's been happening at ErrorWise this week. We're constantly working to make error solving easier for you!
      </p>
      
      <!-- Updates Section -->
      <div style="margin-bottom: 30px;">
        <h2 style="color: #22d3ee; font-size: 18px; margin: 0 0 20px 0;">
          🆕 What's New
        </h2>
        
        ${updates.map(update => `
          <div style="background: linear-gradient(135deg, rgba(34, 211, 238, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%); border: 1px solid rgba(34, 211, 238, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 15px;">
            <h3 style="color: #f1f5f9; font-size: 16px; margin: 0 0 8px 0;">
              ${escapeHtml(update.title)}
            </h3>
            <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.5;">
              ${escapeHtml(update.description)}
            </p>
          </div>
        `).join('')}
      </div>
      
      <!-- Tip of the Week -->
      <div style="background: linear-gradient(135deg, rgba(250, 204, 21, 0.1) 0%, rgba(251, 146, 60, 0.1) 100%); border: 1px solid rgba(250, 204, 21, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
        <h2 style="color: #fbbf24; font-size: 16px; margin: 0 0 12px 0;">
          💡 Tip of the Week
        </h2>
        <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 8px 0;">
          ${escapeHtml(tip.title)}
        </h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.5;">
          ${escapeHtml(tip.content)}
        </p>
      </div>
      
      <!-- Stats -->
      <div style="display: flex; justify-content: space-around; margin-bottom: 30px; text-align: center;">
        <div style="flex: 1;">
          <div style="color: #22d3ee; font-size: 28px; font-weight: bold;">99.2%</div>
          <div style="color: #64748b; font-size: 12px;">Accuracy Rate</div>
        </div>
        <div style="flex: 1;">
          <div style="color: #a855f7; font-size: 28px; font-weight: bold;">&lt;2s</div>
          <div style="color: #64748b; font-size: 12px;">Response Time</div>
        </div>
        <div style="flex: 1;">
          <div style="color: #22c55e; font-size: 28px; font-weight: bold;">500K+</div>
          <div style="color: #64748b; font-size: 12px;">Errors Solved</div>
        </div>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://errorwise.tech/dashboard" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 600; font-size: 16px;">
          Solve an Error Now →
        </a>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="padding: 30px; text-align: center;">
      <div style="margin-bottom: 20px;">
        <a href="https://errorwise.tech" style="color: #64748b; text-decoration: none; margin: 0 10px; font-size: 13px;">Website</a>
        <span style="color: #475569;">|</span>
        <a href="https://errorwise.tech/dashboard" style="color: #64748b; text-decoration: none; margin: 0 10px; font-size: 13px;">Dashboard</a>
        <span style="color: #475569;">|</span>
        <a href="mailto:support@errorwise.tech" style="color: #64748b; text-decoration: none; margin: 0 10px; font-size: 13px;">Support</a>
      </div>
      
      <p style="color: #475569; font-size: 12px; margin: 0 0 15px 0;">
        You're receiving this because you subscribed to ErrorWise updates.
      </p>
      
      <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline; font-size: 12px;">
        Unsubscribe from these emails
      </a>
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          © ${new Date().getFullYear()} ErrorWise. All rights reserved.
        </p>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text version with unsubscribe link
 */
function generateNewsletterText(subscriber, updates, tip) {
  const safeName = subscriber.name || 'ErrorWise User';
  const unsubscribeToken = subscriber.unsubscribe_token;
  const unsubscribeUrl = `https://errorwise.tech/unsubscribe/${unsubscribeToken}`;
  
  return `
Hi ${safeName}!

Here's what's been happening at ErrorWise this week.

🆕 WHAT'S NEW
${updates.map(u => `- ${u.title}: ${u.description}`).join('\n')}

💡 TIP OF THE WEEK
${tip.title}
${tip.content}

📊 OUR STATS
- 99.2% Accuracy Rate
- <2s Response Time  
- 500K+ Errors Solved

Ready to solve an error? Visit: https://errorwise.tech/dashboard

---
You're receiving this because you subscribed to ErrorWise updates.
Unsubscribe: ${unsubscribeUrl}

© ${new Date().getFullYear()} ErrorWise. All rights reserved.
  `;
}

/**
 * Send newsletter to a single subscriber
 */
async function sendNewsletterToSubscriber(subscriber, updates, tip) {
  try {
    const htmlContent = generateNewsletterHTML(subscriber, updates, tip);
    const textContent = generateNewsletterText(subscriber, updates, tip);
    
    await emailService.sendEmail({
      to: subscriber.email,
      subject: `📬 ErrorWise Weekly Update - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      html: htmlContent,
      text: textContent
    });
    
    // Update last email sent timestamp
    await pool.query(`
      UPDATE newslettersubscriptions 
      SET email_count = email_count + 1, 
          last_email_sent_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [subscriber.id]);
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send newsletter to ${maskEmail(subscriber.email)}`);
    return { success: false, error: error.message };
  }
}

/**
 * Send weekly newsletter to all subscribers with pagination and duplicate protection
 */
async function sendWeeklyNewsletter() {
  const today = new Date().toDateString();
  
  // Prevent duplicate sends on the same day
  if (lastNewsletterSendDate === today) {
    console.log('⚠️ Newsletter already sent today, skipping duplicate');
    return { sent: 0, failed: 0, skipped: true };
  }
  
  console.log('\n📬 Starting weekly newsletter send...');
  console.log(`📅 Date: ${new Date().toISOString()}`);
  
  try {
    const totalCount = await getSubscriberCount();
    
    if (totalCount === 0) {
      console.log('📭 No active subscribers found');
      return { sent: 0, failed: 0 };
    }
    
    console.log(`📧 Found ${totalCount} active subscribers`);
    
    const updates = getRecentUpdates();
    const tip = getWeeklyTips();
    
    let sent = 0;
    let failed = 0;
    const batchSize = 50;
    
    // Process subscribers in batches
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const subscribers = await getActiveSubscribers(batchSize, offset);
      
      for (const subscriber of subscribers) {
        const result = await sendNewsletterToSubscriber(subscriber, updates, tip);
        
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
        
        // Add small delay between emails (100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`📊 Progress: ${Math.min(offset + batchSize, totalCount)}/${totalCount}`);
    }
    
    // Mark as sent for today
    lastNewsletterSendDate = today;
    
    console.log(`\n📊 Newsletter Summary:`);
    console.log(`   ✅ Sent: ${sent}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📧 Total: ${totalCount}\n`);
    
    return { sent, failed, total: totalCount };
  } catch (error) {
    console.error('❌ Newsletter send failed');
    return { sent: 0, failed: 0, error: 'Send failed' };
  }
}

/**
 * Send welcome email to new subscriber with unsubscribe link
 */
async function sendWelcomeEmail(subscriber) {
  const safeName = escapeHtml(subscriber.name) || 'there';
  
  // Get or create unsubscribe token
  let unsubscribeToken = subscriber.unsubscribe_token;
  if (!unsubscribeToken) {
    unsubscribeToken = crypto.randomBytes(32).toString('hex');
    try {
      await pool.query(
        'UPDATE newslettersubscriptions SET unsubscribe_token = $1 WHERE id = $2',
        [unsubscribeToken, subscriber.id]
      );
    } catch (err) {
      // Continue even if token update fails
    }
  }
  
  const unsubscribeUrl = `https://errorwise.tech/unsubscribe/${encodeURIComponent(unsubscribeToken)}`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ErrorWise!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 40px 30px; text-align: center; border-radius: 0 0 20px 20px;">
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 12px; border-radius: 12px; margin-bottom: 15px;">
        <span style="font-size: 28px;">🎉</span>
      </div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
        Welcome to ErrorWise!
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
        You're now part of our community
      </p>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px; background-color: #1e293b; margin: 20px; border-radius: 16px;">
      
      <p style="color: #e2e8f0; font-size: 16px; margin: 0 0 20px 0;">
        Hi ${safeName}! 👋
      </p>
      
      <p style="color: #94a3b8; font-size: 15px; margin: 0 0 25px 0; line-height: 1.6;">
        Thanks for subscribing to ErrorWise updates! Here's what you can expect:
      </p>
      
      <!-- What to expect -->
      <div style="margin-bottom: 25px;">
        <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
          <span style="font-size: 20px; margin-right: 12px;">📬</span>
          <div>
            <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 4px 0;">Weekly Updates</h3>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">New features, improvements, and what's coming next</p>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
          <span style="font-size: 20px; margin-right: 12px;">💡</span>
          <div>
            <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 4px 0;">Pro Tips</h3>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">Get the most out of ErrorWise with helpful tips</p>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start;">
          <span style="font-size: 20px; margin-right: 12px;">🎁</span>
          <div>
            <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 4px 0;">Exclusive Content</h3>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">Early access to new features and special offers</p>
          </div>
        </div>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://errorwise.tech" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 600; font-size: 16px;">
          Start Solving Errors →
        </a>
      </div>
      
    </div>
    
    <!-- Footer with unsubscribe -->
    <div style="padding: 30px; text-align: center;">
      <p style="color: #475569; font-size: 12px; margin: 0 0 15px 0;">
        You're receiving this because you subscribed to ErrorWise updates.
      </p>
      
      <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline; font-size: 12px;">
        Unsubscribe from these emails
      </a>
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          © ${new Date().getFullYear()} ErrorWise. All rights reserved.
        </p>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
  
  const textContent = `Welcome to ErrorWise, ${safeName}!

Thanks for subscribing! You'll receive weekly updates about new features, pro tips, and exclusive content.

Start solving errors: https://errorwise.tech

---
You're receiving this because you subscribed to ErrorWise updates.
Unsubscribe: ${unsubscribeUrl}

© ${new Date().getFullYear()} ErrorWise. All rights reserved.`;
  
  try {
    await emailService.sendEmail({
      to: subscriber.email,
      subject: '🎉 Welcome to ErrorWise!',
      html: htmlContent,
      text: textContent
    });
    
    console.log(`✅ Welcome email sent to: ${maskEmail(subscriber.email)}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${maskEmail(subscriber.email)}`);
    return false;
  }
}

/**
 * Initialize newsletter cron jobs
 */
function initializeNewsletterJobs() {
  console.log('📬 Initializing newsletter jobs...');
  
  // Weekly newsletter - Every Monday at 10:00 AM UTC
  cron.schedule('0 10 * * 1', async () => {
    console.log('⏰ Weekly newsletter cron triggered');
    await sendWeeklyNewsletter();
  }, {
    timezone: 'UTC'
  });
  
  console.log('✅ Newsletter job scheduled: Every Monday at 10:00 AM UTC');
}

/**
 * Manual trigger for testing (with duplicate protection)
 */
async function triggerNewsletterManually(force = false) {
  console.log('🔧 Manual newsletter trigger...');
  
  if (force) {
    lastNewsletterSendDate = null; // Reset duplicate protection
  }
  
  return await sendWeeklyNewsletter();
}

module.exports = {
  initializeNewsletterJobs,
  sendWeeklyNewsletter,
  sendWelcomeEmail,
  triggerNewsletterManually,
  getActiveSubscribers,
  getSubscriberCount
};
