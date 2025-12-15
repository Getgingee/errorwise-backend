/**
 * Error Library Controller
 * 
 * Handles browsing, searching, and saving errors to the library.
 * 
 * @ticket Error Library - Save solved issues as templates for reuse
 * @endpoints
 *   GET  /api/library - Browse/search library
 *   GET  /api/library/popular - Get popular entries
 *   GET  /api/library/categories - Get all categories
 *   GET  /api/library/:id - Get single entry
 *   POST /api/library/save - Save user template
 *   POST /api/library/:id/feedback - Submit helpful/not helpful
 *   GET  /api/library/match - Find matching solution for error
 */

const { Op } = require('sequelize');
const ErrorLibrary = require('../models/ErrorLibrary');
const ErrorQuery = require('../models/ErrorQuery');
const sequelize = require('../config/database');

// ============================================================================
// BROWSE & SEARCH
// ============================================================================

/**
 * Browse/search the error library
 * GET /api/library
 * Query params: category, q (search), page, limit, difficulty
 */
exports.browseLibrary = async (req, res) => {
  try {
    const {
      category,
      q,
      page = 1,
      limit = 20,
      difficulty,
      sort = 'popular' // popular, recent, helpful
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      isActive: true,
      type: 'system' // Only show system entries in browse (user templates are private by default)
    };
    
    // Category filter
    if (category && category !== 'all') {
      where.category = category;
    }
    
    // Difficulty filter
    if (difficulty) {
      where.difficulty = difficulty;
    }
    
    // Search filter
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { errorMessage: { [Op.iLike]: `%${q}%` } },
        { errorCode: { [Op.iLike]: `%${q}%` } },
        { explanation: { [Op.iLike]: `%${q}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('tags'), 'text'),
          { [Op.iLike]: `%${q}%` }
        )
      ];
    }
    
    // Sorting
    let order;
    switch (sort) {
      case 'recent':
        order = [['createdAt', 'DESC']];
        break;
      case 'helpful':
        order = [['helpfulCount', 'DESC'], ['viewCount', 'DESC']];
        break;
      case 'popular':
      default:
        order = [['viewCount', 'DESC'], ['useCount', 'DESC']];
    }
    
    const { count, rows } = await ErrorLibrary.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      attributes: [
        'id', 'errorCode', 'title', 'errorMessage', 'category', 
        'subcategory', 'explanation', 'difficulty', 'viewCount',
        'useCount', 'helpfulCount', 'tags', 'platforms', 'createdAt'
      ]
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Library browse error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to browse library'
    });
  }
};

/**
 * Get popular library entries
 * GET /api/library/popular
 */
exports.getPopular = async (req, res) => {
  try {
    const { limit = 10, category } = req.query;
    
    const where = {
      isActive: true,
      type: 'system'
    };
    
    if (category && category !== 'all') {
      where.category = category;
    }
    
    const entries = await ErrorLibrary.findAll({
      where,
      order: [
        ['viewCount', 'DESC'],
        ['helpfulCount', 'DESC']
      ],
      limit: parseInt(limit),
      attributes: [
        'id', 'errorCode', 'title', 'errorMessage', 'category',
        'explanation', 'difficulty', 'viewCount', 'helpfulCount', 'tags'
      ]
    });
    
    res.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Get popular error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get popular entries'
    });
  }
};

/**
 * Get all categories with counts
 * GET /api/library/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await ErrorLibrary.findAll({
      where: { isActive: true, type: 'system' },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category'],
      raw: true
    });
    
    // Add friendly labels
    const categoryLabels = {
      payment: { label: 'Payment Errors', icon: '💳' },
      website: { label: 'Website Errors', icon: '🌐' },
      gaming: { label: 'Gaming Errors', icon: '🎮' },
      mobile: { label: 'Mobile/App Errors', icon: '📱' },
      software: { label: 'Software Errors', icon: '💻' },
      network: { label: 'Network Errors', icon: '📶' },
      database: { label: 'Database Errors', icon: '🗄️' },
      authentication: { label: 'Login Errors', icon: '🔐' },
      api: { label: 'API Errors', icon: '🔌' },
      general: { label: 'General Errors', icon: '❓' }
    };
    
    const formattedCategories = categories.map(cat => ({
      id: cat.category,
      ...categoryLabels[cat.category] || { label: cat.category, icon: '📁' },
      count: parseInt(cat.count)
    }));
    
    res.json({
      success: true,
      data: formattedCategories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
};

/**
 * Get single library entry
 * GET /api/library/:id
 */
exports.getEntry = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry || !entry.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Increment view count
    await entry.increment('viewCount');
    
    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get entry'
    });
  }
};

// ============================================================================
// SMART MATCHING
// ============================================================================

/**
 * Find matching solution for an error message
 * GET /api/library/match
 * Query params: error (the error message)
 */
exports.findMatch = async (req, res) => {
  try {
    const { error: errorMessage } = req.query;
    
    if (!errorMessage || errorMessage.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an error message'
      });
    }
    
    const searchTerm = errorMessage.toLowerCase().trim();
    
    // Try exact error code match first
    const errorCodeMatch = searchTerm.match(/\b([0-9a-z_-]+(?:error)?[0-9a-z_-]*)\b/gi);
    
    let matches = [];
    
    if (errorCodeMatch) {
      for (const code of errorCodeMatch.slice(0, 3)) {
        const exactMatch = await ErrorLibrary.findAll({
          where: {
            isActive: true,
            [Op.or]: [
              { errorCode: { [Op.iLike]: `%${code}%` } },
              { errorMessage: { [Op.iLike]: `%${code}%` } }
            ]
          },
          limit: 5,
          order: [['helpfulCount', 'DESC']]
        });
        matches.push(...exactMatch);
      }
    }
    
    // If no exact matches, do fuzzy search
    if (matches.length === 0) {
      // Extract key words (remove common words)
      const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'error', 'message', 'failed', 'cannot', 'could', 'not', 'your', 'has', 'have', 'been'];
      const keywords = searchTerm
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word))
        .slice(0, 5);
      
      if (keywords.length > 0) {
        matches = await ErrorLibrary.findAll({
          where: {
            isActive: true,
            [Op.or]: keywords.map(kw => ({
              [Op.or]: [
                { title: { [Op.iLike]: `%${kw}%` } },
                { errorMessage: { [Op.iLike]: `%${kw}%` } },
                { explanation: { [Op.iLike]: `%${kw}%` } },
                sequelize.where(
                  sequelize.cast(sequelize.col('tags'), 'text'),
                  { [Op.iLike]: `%${kw}%` }
                )
              ]
            }))
          },
          limit: 10,
          order: [['helpfulCount', 'DESC'], ['viewCount', 'DESC']]
        });
      }
    }
    
    // Remove duplicates
    const uniqueMatches = [...new Map(matches.map(m => [m.id, m])).values()];
    
    res.json({
      success: true,
      data: uniqueMatches.slice(0, 5),
      matchCount: uniqueMatches.length
    });
  } catch (error) {
    console.error('Find match error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find matches'
    });
  }
};

// ============================================================================
// USER TEMPLATES
// ============================================================================

/**
 * Save a solved error as a user template
 * POST /api/library/save
 * Body: { errorQueryId } or { title, errorMessage, explanation, solution, category }
 */
exports.saveTemplate = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { errorQueryId, title, errorMessage, explanation, solution, category, tags, isPublic } = req.body;
    
    let templateData;
    
    // If saving from an existing query
    if (errorQueryId) {
      const query = await ErrorQuery.findOne({
        where: { id: errorQueryId, userId }
      });
      
      if (!query) {
        return res.status(404).json({
          success: false,
          error: 'Query not found'
        });
      }
      
      templateData = {
        type: 'user',
        userId,
        title: title || `Saved: ${query.errorMessage.substring(0, 50)}...`,
        errorMessage: query.errorMessage,
        explanation: query.explanation,
        solution: query.solution || 'See explanation above',
        category: query.errorCategory || 'general',
        tags: query.tags || [],
        isPublic: false
      };
    } else {
      // Creating new template manually
      if (!title || !errorMessage || !explanation || !solution) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: title, errorMessage, explanation, solution'
        });
      }
      
      templateData = {
        type: 'user',
        userId,
        title,
        errorMessage,
        explanation,
        solution,
        category: category || 'general',
        tags: tags || [],
        isPublic: isPublic || false
      };
    }
    
    const template = await ErrorLibrary.create(templateData);
    
    res.status(201).json({
      success: true,
      message: 'Template saved successfully',
      data: template
    });
  } catch (error) {
    console.error('Save template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save template'
    });
  }
};

/**
 * Get user's saved templates
 * GET /api/library/my-templates
 */
exports.getMyTemplates = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { count, rows } = await ErrorLibrary.findAndCountAll({
      where: { userId, type: 'user' },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get my templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get templates'
    });
  }
};

/**
 * Delete a user template
 * DELETE /api/library/:id
 */
exports.deleteTemplate = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const template = await ErrorLibrary.findOne({
      where: { id, userId, type: 'user' }
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    await template.destroy();
    
    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
};

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Submit feedback on a library entry
 * POST /api/library/:id/feedback
 * Body: { helpful: true/false }
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body;
    
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Please specify if the solution was helpful (true/false)'
      });
    }
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    if (helpful) {
      await entry.increment('helpfulCount');
    } else {
      await entry.increment('notHelpfulCount');
    }
    
    res.json({
      success: true,
      message: 'Thank you for your feedback!'
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
};

/**
 * Mark a solution as used (applied)
 * POST /api/library/:id/use
 */
exports.markUsed = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    await entry.increment('useCount');
    
    res.json({
      success: true,
      message: 'Usage recorded'
    });
  } catch (error) {
    console.error('Mark used error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record usage'
    });
  }
};

// ============================================================================
// ADMIN FUNCTIONS - Seed and Bulk Add
// ============================================================================

/**
 * Seed library with pre-built error solutions
 * POST /api/library/admin/seed
 */
exports.seedLibrary = async (req, res) => {
  try {
    // Check if user is admin
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Pre-built error solutions
    const errorEntries = [
      // PAYMENT ERRORS
      {
        type: 'system',
        category: 'payment',
        errorCode: 'CARD_DECLINED',
        title: 'Credit Card Declined',
        errorMessage: 'Your card was declined. Please try a different payment method.',
        explanation: 'This error occurs when your bank or card issuer refuses to authorize the transaction.',
        solution: '1. Check if you have sufficient balance\n2. Verify card details are correct\n3. Contact your bank\n4. Try a different payment method',
        commonCauses: ['Insufficient funds', 'Card expired', 'International transactions blocked'],
        tags: ['payment', 'card', 'declined', 'bank'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'payment',
        errorCode: 'UPI_TIMEOUT',
        title: 'UPI Payment Timeout',
        errorMessage: 'UPI payment timed out. Please try again.',
        explanation: 'The UPI payment request expired before completion.',
        solution: '1. Open your UPI app\n2. Check if payment is pending\n3. Wait 2-3 minutes before retrying\n4. Amount auto-refunds if deducted incorrectly',
        commonCauses: ['Slow internet', 'UPI app not opened in time', 'Server busy'],
        tags: ['upi', 'payment', 'timeout', 'gpay', 'phonepe'],
        difficulty: 'easy'
      },
      // WEBSITE ERRORS
      {
        type: 'system',
        category: 'website',
        errorCode: '404',
        title: 'Page Not Found (404 Error)',
        errorMessage: '404 - Page Not Found',
        explanation: 'The webpage you are trying to visit does not exist at that URL.',
        solution: '1. Check the URL for typos\n2. Go to homepage and navigate from there\n3. Use website search\n4. Try Google searching for the page',
        commonCauses: ['URL typed incorrectly', 'Page deleted or moved', 'Broken link'],
        tags: ['404', 'not found', 'missing page'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'website',
        errorCode: '500',
        title: 'Internal Server Error (500)',
        errorMessage: '500 Internal Server Error',
        explanation: 'The website server encountered an unexpected problem.',
        solution: '1. Wait a few minutes and refresh\n2. Clear browser cache\n3. Try different device or network\n4. Check if website is down for everyone',
        commonCauses: ['Server overload', 'Website update in progress', 'Database issue'],
        tags: ['500', 'server error', 'website down'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'website',
        errorCode: 'SSL_ERROR',
        title: 'SSL Certificate Error',
        errorMessage: 'Your connection is not private',
        explanation: 'The website security certificate has a problem.',
        solution: '1. Check if your device date/time are correct\n2. Try with https:// explicitly\n3. Do not enter personal info on this site\n4. Wait and try later',
        commonCauses: ['Expired SSL certificate', 'Wrong date/time on device', 'Untrusted certificate'],
        tags: ['ssl', 'https', 'certificate', 'not secure'],
        difficulty: 'medium'
      },
      // GAMING ERRORS
      {
        type: 'system',
        category: 'gaming',
        errorCode: 'BGMI_SERVER_BUSY',
        title: 'BGMI/PUBG Server is Busy',
        errorMessage: 'Server is busy. Please try again later.',
        explanation: 'Game servers are overloaded with too many players.',
        solution: '1. Wait 5-10 minutes\n2. Restart the game\n3. Check for updates\n4. Try during off-peak hours',
        commonCauses: ['New update released', 'In-game event', 'Peak hours'],
        tags: ['bgmi', 'pubg', 'server', 'busy'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'gaming',
        errorCode: 'FREE_FIRE_NETWORK',
        title: 'Free Fire Network Error',
        errorMessage: 'Network connection error',
        explanation: 'Free Fire cannot connect to its servers.',
        solution: '1. Switch between WiFi and mobile data\n2. Restart router\n3. Close other apps\n4. Clear Free Fire cache',
        commonCauses: ['Weak internet', 'ISP issues', 'Game server problems'],
        tags: ['free fire', 'network', 'connection'],
        difficulty: 'easy'
      },
      // MOBILE ERRORS
      {
        type: 'system',
        category: 'mobile',
        errorCode: 'APP_CRASH',
        title: 'App Keeps Crashing',
        errorMessage: 'Unfortunately, [App] has stopped',
        explanation: 'The app encountered an error it could not recover from.',
        solution: '1. Force close and reopen\n2. Clear app cache\n3. Check for updates\n4. Restart phone\n5. Reinstall app',
        commonCauses: ['Corrupted cache', 'App bug', 'Insufficient storage'],
        tags: ['crash', 'stopped', 'app', 'android'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'mobile',
        errorCode: 'PLAYSTORE_PENDING',
        title: 'Play Store Download Pending',
        errorMessage: 'Download pending...',
        explanation: 'Play Store is waiting to download the app.',
        solution: '1. Check internet connection\n2. Cancel other pending downloads\n3. Clear Play Store cache\n4. Check download settings',
        commonCauses: ['Other downloads in queue', 'WiFi-only setting', 'Insufficient storage'],
        tags: ['play store', 'download', 'pending'],
        difficulty: 'easy'
      },
      // NETWORK ERRORS
      {
        type: 'system',
        category: 'network',
        errorCode: 'DNS_NXDOMAIN',
        title: 'DNS Error - Site Not Found',
        errorMessage: 'DNS_PROBE_FINISHED_NXDOMAIN',
        explanation: 'Your browser cannot find the website address.',
        solution: '1. Check URL spelling\n2. Flush DNS cache\n3. Change DNS to 8.8.8.8 or 1.1.1.1\n4. Restart router',
        commonCauses: ['Typo in URL', 'DNS server issues', 'Domain expired'],
        tags: ['dns', 'nxdomain', 'site not found'],
        difficulty: 'medium'
      },
      {
        type: 'system',
        category: 'network',
        errorCode: 'NO_INTERNET',
        title: 'Connected But No Internet',
        errorMessage: 'WiFi connected but no internet access',
        explanation: 'Device connected to router but router is not connected to internet.',
        solution: '1. Restart router (unplug 30 seconds)\n2. Forget and reconnect WiFi\n3. Restart device\n4. Reset network settings',
        commonCauses: ['Router needs restart', 'IP conflict', 'ISP outage'],
        tags: ['no internet', 'wifi', 'connected'],
        difficulty: 'easy'
      },
      // AUTHENTICATION ERRORS
      {
        type: 'system',
        category: 'authentication',
        errorCode: 'INVALID_CREDENTIALS',
        title: 'Invalid Username or Password',
        errorMessage: 'The username or password is incorrect',
        explanation: 'Login credentials do not match what is stored.',
        solution: '1. Check caps lock is off\n2. Verify correct email/username\n3. Use Forgot Password\n4. Try different login method',
        commonCauses: ['Caps lock on', 'Typo', 'Using wrong account'],
        tags: ['login', 'password', 'username'],
        difficulty: 'easy'
      },
      {
        type: 'system',
        category: 'authentication',
        errorCode: 'OTP_EXPIRED',
        title: 'OTP Expired',
        errorMessage: 'The OTP has expired. Please request a new one.',
        explanation: 'One-Time Passwords are valid only for 5-10 minutes.',
        solution: '1. Click Resend OTP\n2. Enter immediately after receiving\n3. Check device time is correct\n4. Check SMS spam folder',
        commonCauses: ['Took too long', 'Using old OTP', 'Wrong device time'],
        tags: ['otp', 'expired', 'verification'],
        difficulty: 'easy'
      },
      // SOFTWARE ERRORS
      {
        type: 'system',
        category: 'software',
        errorCode: 'DLL_MISSING',
        title: 'DLL File Missing',
        errorMessage: 'MSVCR110.dll is missing from your computer',
        explanation: 'Program needs Microsoft Visual C++ libraries.',
        solution: '1. Download Visual C++ Redistributable from Microsoft\n2. Install both x86 and x64 versions\n3. Restart PC',
        commonCauses: ['Missing runtime', 'Incomplete installation'],
        tags: ['dll', 'missing', 'vcredist'],
        difficulty: 'medium'
      },
      // API ERRORS
      {
        type: 'system',
        category: 'api',
        errorCode: 'CORS_ERROR',
        title: 'CORS Policy Error',
        errorMessage: 'Blocked by CORS policy',
        explanation: 'Browser blocking request to different domain for security.',
        solution: '1. Add CORS headers to API\n2. Use cors npm package\n3. Use a CORS proxy for testing',
        commonCauses: ['API missing CORS headers', 'Wrong domain configuration'],
        tags: ['cors', 'api', 'blocked'],
        difficulty: 'medium'
      }
    ];

    let created = 0;
    let skipped = 0;

    for (const entry of errorEntries) {
      const existing = await ErrorLibrary.findOne({
        where: { errorCode: entry.errorCode, type: 'system' }
      });

      if (existing) {
        skipped++;
        continue;
      }

      await ErrorLibrary.create(entry);
      created++;
    }

    const totalCount = await ErrorLibrary.count({ where: { type: 'system' } });

    res.json({
      success: true,
      message: 'Library seeded successfully',
      stats: {
        created,
        skipped,
        total: totalCount
      }
    });
  } catch (error) {
    console.error('Seed library error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed library'
    });
  }
};

/**
 * Bulk add entries from JSON
 * POST /api/library/admin/bulk-add
 * Body: { entries: [...] }
 */
exports.bulkAddEntries = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { entries } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Entries array is required'
      });
    }

    let created = 0;
    let failed = 0;
    const errors = [];

    for (const entry of entries) {
      try {
        // Validate required fields
        if (!entry.title || !entry.errorMessage || !entry.explanation || !entry.solution) {
          errors.push({ entry: entry.title || 'Unknown', error: 'Missing required fields' });
          failed++;
          continue;
        }

        // Check for duplicate
        if (entry.errorCode) {
          const existing = await ErrorLibrary.findOne({
            where: { errorCode: entry.errorCode, type: 'system' }
          });
          if (existing) {
            errors.push({ entry: entry.title, error: 'Duplicate error code' });
            failed++;
            continue;
          }
        }

        await ErrorLibrary.create({
          type: 'system',
          ...entry
        });
        created++;
      } catch (err) {
        errors.push({ entry: entry.title || 'Unknown', error: err.message });
        failed++;
      }
    }

    res.json({
      success: true,
      message: 'Bulk add completed',
      stats: {
        submitted: entries.length,
        created,
        failed
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk add entries'
    });
  }
};

// ============================================================================
// LEARNING LIBRARY FUNCTIONS
// ============================================================================

// Load learning service
let libraryLearning = null;
try {
  libraryLearning = require('../services/libraryLearningService');
} catch (e) {
  console.warn('Library learning service not available');
}

/**
 * Get learning statistics
 * GET /api/library/admin/learning/stats
 */
exports.getLearningStats = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const stats = libraryLearning.getLearningStats();
    
    // Get library totals
    const libraryStats = await ErrorLibrary.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN type = \'system\' THEN 1 ELSE 0 END')), 'system'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN type = \'user\' THEN 1 ELSE 0 END')), 'user']
      ],
      raw: true
    });

    res.json({
      success: true,
      learning: stats,
      library: libraryStats[0] || { total: 0, system: 0, user: 0 },
      config: libraryLearning.CONFIG
    });
  } catch (error) {
    console.error('Get learning stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learning stats'
    });
  }
};

/**
 * Process verification queue manually
 * POST /api/library/admin/learning/process-queue
 */
exports.processLearningQueue = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const result = await libraryLearning.processVerificationQueue();

    res.json({
      success: true,
      message: 'Queue processed successfully',
      result
    });
  } catch (error) {
    console.error('Process queue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process queue'
    });
  }
};

/**
 * Manually approve a learning entry
 * POST /api/library/admin/learning/approve
 * Body: { pattern: "...", approve: true/false }
 */
exports.approveLearningEntry = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const { errorData, approve } = req.body;

    if (!errorData) {
      return res.status(400).json({
        success: false,
        error: 'Error data is required'
      });
    }

    if (approve) {
      // Manually add to library
      const entry = await libraryLearning.addToLibrary({
        originalError: errorData.errorMessage,
        errorType: errorData.errorType,
        language: errorData.language,
        category: errorData.category,
        pattern: errorData.pattern,
        aiResponses: [{
          explanation: errorData.explanation,
          solution: errorData.solution,
          codeExample: errorData.codeExample || '',
          confidence: errorData.confidence || 0.8
        }],
        sources: errorData.sources || [],
        helpfulVotes: 0,
        occurrences: 1
      }, 'manual-admin');

      res.json({
        success: true,
        message: 'Entry approved and added to library',
        entry: entry ? { id: entry.id, title: entry.title } : null
      });
    } else {
      res.json({
        success: true,
        message: 'Entry rejected'
      });
    }
  } catch (error) {
    console.error('Approve entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve entry'
    });
  }
};

// ============================================================================
// USER SOLUTIONS - Separate from system library
// ============================================================================

/**
 * Save user's own solution
 * POST /api/library/user/solutions
 * Body: { errorData: { errorMessage, errorType, category, language }, solutionData: { solution, explanation, notes, sourceUrl, tags } }
 */
exports.saveUserSolution = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { errorData, solutionData } = req.body;

    if (!errorData?.errorMessage || !solutionData?.solution) {
      return res.status(400).json({
        success: false,
        error: 'Error message and solution are required'
      });
    }

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const result = await libraryLearning.saveUserSolution(userId, errorData, solutionData);

    res.json({
      success: true,
      message: result.created ? 'Solution saved' : 'Solution updated',
      entry: {
        id: result.entry.id,
        title: result.entry.title,
        isUserSaved: true,
        label: 'Your Solution'
      }
    });
  } catch (error) {
    console.error('Save user solution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save solution'
    });
  }
};

/**
 * Get user's saved solutions
 * GET /api/library/user/solutions
 * Query: { category, search, limit }
 */
exports.getUserSolutions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, search, limit } = req.query;

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const solutions = await libraryLearning.getUserSolutions(userId, {
      category,
      search,
      limit: parseInt(limit) || 50
    });

    res.json({
      success: true,
      data: solutions.map(s => ({
        ...s.toJSON(),
        isUserSaved: true,
        label: 'Your Solution'
      })),
      count: solutions.length
    });
  } catch (error) {
    console.error('Get user solutions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get solutions'
    });
  }
};

/**
 * Get combined library search (user + system)
 * GET /api/library/user/combined-search
 * Query: { q }
 */
exports.getCombinedLibrary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const results = await libraryLearning.getCombinedLibrary(userId, q);

    res.json({
      success: true,
      data: {
        userSolutions: results.userSolutions,
        systemSolutions: results.systemSolutions,
        userCount: results.userSolutions.length,
        systemCount: results.systemSolutions.length
      }
    });
  } catch (error) {
    console.error('Combined library search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search library'
    });
  }
};

/**
 * Delete user's solution
 * DELETE /api/library/user/solutions/:id
 */
exports.deleteUserSolution = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    if (!libraryLearning) {
      return res.status(503).json({
        success: false,
        error: 'Learning service not available'
      });
    }

    const result = await libraryLearning.deleteUserSolution(userId, id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      message: 'Solution deleted'
    });
  } catch (error) {
    console.error('Delete user solution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete solution'
    });
  }
};

// ============================================================================
// USER-SPECIFIC LEARNING LIBRARY - Personal knowledge base per user
// ============================================================================

const UserLearningLibrary = require('../models/UserLearningLibrary');

/**
 * Get user's personal learning library
 * GET /api/user/learning-library
 * Query params: category, search, page, limit, sort
 */
exports.getUserLearningLibrary = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      category,
      search,
      page = 1,
      limit = 20,
      sort = 'recent' // recent, popular, top-rated
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId };
    
    // Filter by category
    if (category && category !== 'all') {
      where.category = category;
    }
    
    // Filter by status
    where.status = 'active';
    
    // Search
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { errorMessage: { [Op.iLike]: `%${search}%` } },
        { explanation: { [Op.iLike]: `%${search}%` } },
        { solution: { [Op.iLike]: `%${search}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('tags'), 'text'),
          { [Op.iLike]: `%${search}%` }
        )
      ];
    }
    
    // Sorting
    let order;
    switch (sort) {
      case 'popular':
        order = [['referenceCount', 'DESC']];
        break;
      case 'top-rated':
        order = [['userRating', 'DESC'], ['referenceCount', 'DESC']];
        break;
      case 'recent':
      default:
        order = [['createdAt', 'DESC']];
    }
    
    const { count, rows } = await UserLearningLibrary.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      attributes: [
        'id', 'title', 'errorMessage', 'category', 'subcategory', 
        'explanation', 'difficulty', 'referenceCount', 'userRating',
        'lastReferencedAt', 'isVerified', 'tags', 'createdAt'
      ]
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      },
      meta: {
        hasMore: offset + rows.length < count
      }
    });
    
  } catch (error) {
    console.error('Get user learning library error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learning library'
    });
  }
};

/**
 * Get categories in user's learning library
 * GET /api/user/learning-library/categories
 */
exports.getUserLearningCategories = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const categories = await UserLearningLibrary.findAll({
      where: { userId, status: 'active' },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('userRating')), 'avgRating']
      ],
      group: ['category'],
      raw: true,
      order: [[sequelize.literal('count'), 'DESC']]
    });
    
    res.json({
      success: true,
      categories
    });
    
  } catch (error) {
    console.error('Get user learning categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
};

/**
 * Get single learning entry
 * GET /api/user/learning-library/:id
 */
exports.getUserLearningEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const entry = await UserLearningLibrary.findOne({
      where: { id, userId }
    });
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Update last referenced time
    await entry.update({
      lastReferencedAt: new Date(),
      referenceCount: entry.referenceCount + 1
    });
    
    res.json({
      success: true,
      data: entry
    });
    
  } catch (error) {
    console.error('Get user learning entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get entry'
    });
  }
};

/**
 * Add to user's personal learning library
 * POST /api/user/learning-library
 * Body: { errorMessage, explanation, solution, title, category, ... }
 */
exports.addToUserLearningLibrary = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      errorMessage,
      explanation,
      solution,
      title,
      category = 'general',
      subcategory,
      language,
      framework,
      difficulty = 'intermediate',
      timeToSolve,
      source = 'personal',
      sourceUrl,
      tags = [],
      codeExample,
      commonCauses = [],
      preventionTips = [],
      notes
    } = req.body;
    
    if (!errorMessage || !solution) {
      return res.status(400).json({
        success: false,
        error: 'Error message and solution are required'
      });
    }
    
    try {
      const entry = await UserLearningLibrary.create({
        userId,
        title: title || errorMessage.substring(0, 100),
        errorMessage: errorMessage.substring(0, 2000),
        explanation: explanation || '',
        solution: solution.substring(0, 5000),
        category: category || 'general',
        subcategory,
        language,
        framework,
        difficulty,
        timeToSolve,
        source,
        sourceUrl,
        tags: tags || [],
        codeExample: codeExample || null,
        commonCauses: commonCauses || [],
        preventionTips: preventionTips || [],
        notes: notes || null,
        status: 'active',
        userRating: 5,
        isVerified: false
      });
      
      res.status(201).json({
        success: true,
        message: 'Added to your learning library',
        data: entry
      });
      
    } catch (error) {
      console.error('Create learning entry error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create entry'
      });
    }
    
  } catch (error) {
    console.error('Add to learning library error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add to learning library'
    });
  }
};

/**
 * Update user's learning library entry
 * PUT /api/user/learning-library/:id
 */
exports.updateUserLearningEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;
    
    const entry = await UserLearningLibrary.findOne({
      where: { id, userId }
    });
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Only allow updating certain fields
    const allowedUpdates = [
      'title', 'explanation', 'solution', 'category', 'subcategory',
      'difficulty', 'tags', 'codeExample', 'commonCauses',
      'preventionTips', 'notes', 'userRating', 'isVerified', 'status'
    ];
    
    const fieldsToUpdate = {};
    for (const key of allowedUpdates) {
      if (key in updates) {
        fieldsToUpdate[key] = updates[key];
      }
    }
    
    await entry.update(fieldsToUpdate);
    
    res.json({
      success: true,
      message: 'Entry updated',
      data: entry
    });
    
  } catch (error) {
    console.error('Update learning entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update entry'
    });
  }
};

/**
 * Delete from user's learning library
 * DELETE /api/user/learning-library/:id
 */
exports.deleteFromUserLearningLibrary = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const entry = await UserLearningLibrary.findOne({
      where: { id, userId }
    });
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Soft delete
    await entry.update({ status: 'archived' });
    
    res.json({
      success: true,
      message: 'Entry deleted'
    });
    
  } catch (error) {
    console.error('Delete learning entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete entry'
    });
  }
};

/**
 * Get user's learning library statistics
 * GET /api/user/learning-library/stats
 */
exports.getUserLearningStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const totalEntries = await UserLearningLibrary.count({
      where: { userId, status: 'active' }
    });
    
    const stats = await UserLearningLibrary.findAll({
      where: { userId, status: 'active' },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('userRating')), 'avgRating'],
        [sequelize.fn('SUM', sequelize.col('referenceCount')), 'totalReferences']
      ],
      group: ['category'],
      raw: true
    });
    
    const totalReferences = await UserLearningLibrary.sum('referenceCount', {
      where: { userId, status: 'active' }
    }) || 0;
    
    const avgRating = await UserLearningLibrary.findOne({
      where: { userId, status: 'active' },
      attributes: [[sequelize.fn('AVG', sequelize.col('userRating')), 'avgRating']],
      raw: true
    });
    
    res.json({
      success: true,
      data: {
        totalEntries,
        totalReferences,
        avgRating: parseFloat(avgRating?.avgRating || 0).toFixed(2),
        byCategory: stats,
        lastAdded: await UserLearningLibrary.findOne({
          where: { userId, status: 'active' },
          order: [['createdAt', 'DESC']],
          attributes: ['title', 'createdAt']
        })
      }
    });
    
  } catch (error) {
    console.error('Get user learning stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
};