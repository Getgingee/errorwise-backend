/**
 * Support System Controller
 * Handles Feedback, Contact Messages, and Help Center Tickets
 */

const pool = require('../config/db');

/**
 * ============================================
 * FEEDBACK ENDPOINTS
 * ============================================
 */

// Submit feedback
exports.submitFeedback = async (req, res) => {
  try {
    const { feedback_type, subject, message, rating } = req.body;
    const user_id = req.user?.id || null;
    const user_email = req.user?.email || req.body.email;
    const user_name = req.user?.username || req.body.name;

    // Validation
    if (!feedback_type || !message) {
      return res.status(400).json({
        success: false,
        message: 'Feedback type and message are required'
      });
    }

    // Validate message length
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long (max 5000 characters)'
      });
    }

    const validTypes = ['feature_request', 'bug_report', 'general_feedback', 'improvement_suggestion'];
    if (!validTypes.includes(feedback_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback type. Must be one of: ' + validTypes.join(', ')
      });
    }

    // Get user agent and IP
    const user_agent = req.get('user-agent');
    const ip_address = req.ip || req.connection.remoteAddress;

    const result = await pool.query(
      `INSERT INTO Feedback 
        (user_id, user_email, user_name, feedback_type, subject, message, rating, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, feedback_type, status, created_at`,
      [user_id, user_email, user_name, feedback_type, subject, message, rating, user_agent, ip_address]
    );

    console.log('✅ Feedback submitted:', result.rows[0].id);

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback! We appreciate your input and will review it shortly.',
      feedback: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's feedback history (authenticated)
exports.getUserFeedback = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT id, feedback_type, subject, message, rating, status, created_at, updated_at
       FROM Feedback
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM Feedback WHERE user_id = $1',
      [user_id]
    );

    res.json({
      success: true,
      feedback: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching user feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message
    });
  }
};

// Get all feedback (admin only)
exports.getAllFeedback = async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;

    let query = `SELECT f.*, u.username, u.email as registered_email
                 FROM Feedback f
                 LEFT JOIN Users u ON f.user_id = u.id
                 WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND f.status = $${paramCount++}`;
      params.push(status);
    }

    if (type) {
      query += ` AND f.feedback_type = $${paramCount++}`;
      params.push(type);
    }

    query += ` ORDER BY f.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      feedback: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching all feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message
    });
  }
};

/**
 * ============================================
 * CONTACT MESSAGES ENDPOINTS
 * ============================================
 */

// Submit contact message
exports.submitContactMessage = async (req, res) => {
  try {
    const { name, email, phone, company, subject, message, message_type = 'general' } = req.body;
    const user_id = req.user?.id || null;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Name validation
    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters long'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Message validation
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long (max 5000 characters)'
      });
    }

    const validTypes = ['general', 'sales', 'support', 'partnership', 'enterprise'];
    if (!validTypes.includes(message_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message type. Must be one of: ' + validTypes.join(', ')
      });
    }

    const user_agent = req.get('user-agent');
    const ip_address = req.ip || req.connection.remoteAddress;

    const result = await pool.query(
      `INSERT INTO ContactMessages 
        (user_id, name, email, phone, company, subject, message, message_type, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, message_type, status, created_at`,
      [user_id, name, email, phone, company, subject, message, message_type, user_agent, ip_address]
    );

    console.log('✅ Contact message submitted:', result.rows[0].id);

    // TODO: Send notification email to support team
    // await sendContactNotification(result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Thank you for contacting us! We\'ll get back to you within 24 hours.',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error submitting contact message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact message. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all contact messages (admin only)
exports.getAllContactMessages = async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;

    let query = `SELECT c.*, u.username
                 FROM ContactMessages c
                 LEFT JOIN Users u ON c.user_id = u.id
                 WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND c.status = $${paramCount++}`;
      params.push(status);
    }

    if (type) {
      query += ` AND c.message_type = $${paramCount++}`;
      params.push(type);
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      messages: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact messages',
      error: error.message
    });
  }
};

// Update contact message status (admin only)
exports.updateContactMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to, reply_text, priority } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramCount++}`);
      params.push(assigned_to);
    }

    if (priority) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

    if (reply_text) {
      updates.push(`reply_text = $${paramCount++}`, `replied_at = CURRENT_TIMESTAMP`);
      params.push(reply_text);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    params.push(id);
    const query = `UPDATE ContactMessages SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    res.json({
      success: true,
      message: 'Contact message updated successfully',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating contact message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact message',
      error: error.message
    });
  }
};

/**
 * ============================================
 * HELP CENTER TICKETS ENDPOINTS
 * ============================================
 */

// Generate unique ticket number
const generateTicketNumber = () => {
  const prefix = 'HC';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Create help center ticket
exports.createHelpTicket = async (req, res) => {
  try {
    const { category, subject, description } = req.body;
    const user_id = req.user?.id || null;
    const user_email = req.user?.email || req.body.email;
    const user_name = req.user?.username || req.body.name;

    // Validation
    if (!category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Category, subject, and description are required'
      });
    }

    if (!user_email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const validCategories = [
      'getting_started', 'api_integration', 'billing_subscriptions',
      'troubleshooting', 'security_privacy', 'account_management',
      'technical_issue', 'feature_request', 'other'
    ];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    const ticket_number = generateTicketNumber();
    const user_agent = req.get('user-agent');
    const ip_address = req.ip || req.connection.remoteAddress;

    const result = await pool.query(
      `INSERT INTO HelpCenterTickets 
        (ticket_number, user_id, user_email, user_name, category, subject, description, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, ticket_number, category, subject, status, created_at`,
      [ticket_number, user_id, user_email, user_name, category, subject, description, user_agent, ip_address]
    );

    // TODO: Send confirmation email to user
    // await sendTicketConfirmationEmail(result.rows[0]);

    res.status(201).json({
      success: true,
      message: `Your support ticket ${ticket_number} has been created. We'll respond within 24 hours.`,
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating help ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create help ticket',
      error: error.message
    });
  }
};

// Get user's help tickets
exports.getUserHelpTickets = async (req, res) => {
  try {
    const user_id = req.user?.id;
    const user_email = req.user?.email || req.query.email;

    if (!user_id && !user_email) {
      return res.status(400).json({
        success: false,
        message: 'User ID or email required'
      });
    }

    let query = `SELECT id, ticket_number, category, subject, status, priority, created_at, updated_at, resolved_at
                 FROM HelpCenterTickets
                 WHERE `;
    const params = [];

    if (user_id) {
      query += 'user_id = $1';
      params.push(user_id);
    } else {
      query += 'user_email = $1';
      params.push(user_email);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      tickets: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching user help tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch help tickets',
      error: error.message
    });
  }
};

// Get specific ticket details
exports.getHelpTicket = async (req, res) => {
  try {
    const { ticketNumber } = req.params;

    const ticketResult = await pool.query(
      `SELECT * FROM HelpCenterTickets WHERE ticket_number = $1`,
      [ticketNumber]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = ticketResult.rows[0];

    // Get responses
    const responsesResult = await pool.query(
      `SELECT * FROM HelpCenterTicketResponses 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC`,
      [ticket.id]
    );

    res.json({
      success: true,
      ticket: {
        ...ticket,
        responses: responsesResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching help ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch help ticket',
      error: error.message
    });
  }
};

// Add response to ticket
exports.addTicketResponse = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { message } = req.body;
    const user_id = req.user?.id || null;
    const responder_email = req.user?.email || req.body.email;
    const responder_name = req.user?.username || req.body.name;
    const is_staff = req.user?.role === 'admin' || false;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get ticket ID
    const ticketResult = await pool.query(
      'SELECT id FROM HelpCenterTickets WHERE ticket_number = $1',
      [ticketNumber]
    );

    if (ticketResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket_id = ticketResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO HelpCenterTicketResponses 
        (ticket_id, user_id, responder_email, responder_name, is_staff, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ticket_id, user_id, responder_email, responder_name, is_staff, message]
    );

    // Update ticket status if it was closed
    await pool.query(
      `UPDATE HelpCenterTickets 
       SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END 
       WHERE ticket_number = $1`,
      [ticketNumber]
    );

    res.status(201).json({
      success: true,
      message: 'Response added successfully',
      response: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding ticket response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response',
      error: error.message
    });
  }
};

// Get all help tickets (admin only)
exports.getAllHelpTickets = async (req, res) => {
  try {
    const { status, category, priority, limit = 50, offset = 0 } = req.query;

    let query = `SELECT h.*, 
                        (SELECT COUNT(*) FROM HelpCenterTicketResponses WHERE ticket_id = h.id) as response_count
                 FROM HelpCenterTickets h
                 WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND h.status = $${paramCount++}`;
      params.push(status);
    }

    if (category) {
      query += ` AND h.category = $${paramCount++}`;
      params.push(category);
    }

    if (priority) {
      query += ` AND h.priority = $${paramCount++}`;
      params.push(priority);
    }

    query += ` ORDER BY h.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      tickets: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching all help tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch help tickets',
      error: error.message
    });
  }
};

// Update help ticket (admin only)
exports.updateHelpTicket = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { status, priority, assigned_to, resolution_notes } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);

      if (status === 'resolved') {
        updates.push('resolved_at = CURRENT_TIMESTAMP');
      } else if (status === 'closed') {
        updates.push('closed_at = CURRENT_TIMESTAMP');
      }
    }

    if (priority) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramCount++}`);
      params.push(assigned_to);
    }

    if (resolution_notes) {
      updates.push(`resolution_notes = $${paramCount++}`);
      params.push(resolution_notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    params.push(ticketNumber);
    const query = `UPDATE HelpCenterTickets SET ${updates.join(', ')} WHERE ticket_number = $${paramCount} RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      message: 'Ticket updated successfully',
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating help ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket',
      error: error.message
    });
  }
};

/**
 * ============================================
 * HELP CENTER ARTICLES ENDPOINTS
 * ============================================
 */

// Get all help articles
exports.getHelpArticles = async (req, res) => {
  try {
    const { category, search, limit = 50 } = req.query;

    let query = `SELECT id, category, title, meta_description, slug, tags, view_count, helpful_count, created_at, updated_at
                 FROM HelpCenterArticles
                 WHERE is_published = true`;
    const params = [];
    let paramCount = 1;

    if (category) {
      query += ` AND category = $${paramCount++}`;
      params.push(category);
    }

    if (search) {
      query += ` AND (title ILIKE $${paramCount} OR content ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY view_count DESC, created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      articles: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching help articles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch help articles',
      error: error.message
    });
  }
};

// Get single help article
exports.getHelpArticle = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await pool.query(
      `SELECT * FROM HelpCenterArticles WHERE slug = $1 AND is_published = true`,
      [slug]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Increment view count
    await pool.query(
      'UPDATE HelpCenterArticles SET view_count = view_count + 1 WHERE slug = $1',
      [slug]
    );

    res.json({
      success: true,
      article: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching help article:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch article',
      error: error.message
    });
  }
};

// Mark article as helpful/not helpful
exports.rateHelpArticle = async (req, res) => {
  try {
    const { slug } = req.params;
    const { helpful } = req.body; // true or false

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Helpful field must be a boolean'
      });
    }

    const field = helpful ? 'helpful_count' : 'not_helpful_count';

    const result = await pool.query(
      `UPDATE HelpCenterArticles SET ${field} = ${field} + 1 WHERE slug = $1 RETURNING ${field}`,
      [slug]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      message: 'Thank you for your feedback!'
    });
  } catch (error) {
    console.error('Error rating help article:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate article',
      error: error.message
    });
  }
};

module.exports = exports;
