/**
 * Conversational AI Service
 * Google Assistant-like conversational experience with context awareness,
 * follow-up questions, web scraping, and tier-based features
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize AI clients
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Conversation context store (use Redis in production)
const conversationContexts = new Map();

// Tier-based AI configuration (matching pricing page)
const AI_CONFIG = {
  free: {
    model: 'gemini-2.0-flash-exp',
    provider: 'gemini',
    maxTokens: 800,
    features: {
      basicExplanations: true,
      followUpQuestions: false,
      webScraping: false,
      codeExamples: false,
      multiLanguage: false
    }
  },
  pro: {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    maxTokens: 1200,
    features: {
      basicExplanations: true,
      fullExplanations: true,
      followUpQuestions: true,
      webScraping: true,
      codeExamples: true,
      fixSuggestions: true,
      multiLanguage: true,
      contextAwareness: true
    }
  },
  team: {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    maxTokens: 2000,
    features: {
      basicExplanations: true,
      fullExplanations: true,
      followUpQuestions: true,
      webScraping: true,
      codeExamples: true,
      fixSuggestions: true,
      multiLanguage: true,
      contextAwareness: true,
      advancedAnalysis: true,
      deepWebSearch: true
    }
  }
};

/**
 * Web scraping utility - scrape forums, Stack Overflow, manufacturer sites
 */
async function scrapeWebForSolutions(query, context = {}) {
  const results = [];
  
  try {
    // Build search URLs based on context
    const searchUrls = buildSearchUrls(query, context);
    
    // Scrape each URL (parallel, with timeout)
    const scrapePromises = searchUrls.slice(0, 3).map(url =>
      scrapeSingleUrl(url).catch(err => {
        console.warn(`Failed to scrape ${url}:`, err.message);
        return null;
      })
    );
    
    const scrapedData = await Promise.all(scrapePromises);
    
    // Filter and format results
    scrapedData
      .filter(data => data && data.content)
      .forEach(data => {
        results.push({
          source: data.url,
          title: data.title,
          content: data.content.substring(0, 500), // Limit content length
          relevance: calculateRelevance(data.content, query)
        });
      });
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results.slice(0, 3); // Return top 3 most relevant
    
  } catch (error) {
    console.error('Web scraping error:', error);
    return [];
  }
}

/**
 * Build search URLs based on query and context
 * Enhanced for universal queries - not just errors
 */
function buildSearchUrls(query, context) {
  const urls = [];
  const searchTerm = encodeURIComponent(query);
  
  // Detect query type
  const isErrorQuery = /error|exception|bug|issue|failed|crash/i.test(query);
  const isHowTo = /how to|how do|tutorial|guide/i.test(query);
  const isFactual = /what is|who is|when|where|why|define/i.test(query);
  
  // For error-related queries
  if (isErrorQuery) {
    // Stack Overflow
    urls.push(`https://stackoverflow.com/search?q=${searchTerm}`);
    
    // Reddit programming communities
    urls.push(`https://www.reddit.com/search/?q=${searchTerm}+programming`);
    
    // GitHub issues
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:github.com`);
  }
  
  // For how-to/tutorial queries
  if (isHowTo) {
    // Developer documentation sites
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:developer.mozilla.org+OR+site:docs.python.org+OR+site:docs.microsoft.com`);
    
    // Tutorial sites
    urls.push(`https://www.google.com/search?q=${searchTerm}+tutorial+site:dev.to+OR+site:medium.com`);
    
    // YouTube (search results page)
    urls.push(`https://www.google.com/search?q=${searchTerm}+tutorial+site:youtube.com`);
  }
  
  // For factual/informational queries
  if (isFactual) {
    // Wikipedia
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:wikipedia.org`);
    
    // Educational sites
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:britannica.com+OR+site:khanacademy.org`);
  }
  
  // Universal Google search (always include)
  urls.push(`https://www.google.com/search?q=${searchTerm}`);
  
  // News search for current events
  if (/news|latest|recent|today|2025|2024/i.test(query)) {
    urls.push(`https://www.google.com/search?q=${searchTerm}&tbm=nws`);
  }
  
  // If context includes manufacturer/model, search specific sites
  if (context.manufacturer) {
    const mfg = encodeURIComponent(context.manufacturer);
    urls.push(`https://www.google.com/search?q=${mfg}+${searchTerm}+support+forum`);
  }
  
  // Indian context - local sites and forums
  if (context.includeIndianContext) {
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:digit.in+OR+site:techenclave.com+OR+site:indianexpress.com`);
  }
  
  // Technology news and blogs
  if (/technology|tech|software|hardware|AI|programming/i.test(query)) {
    urls.push(`https://www.google.com/search?q=${searchTerm}+site:techcrunch.com+OR+site:theverge.com+OR+site:arstechnica.com`);
  }
  
  return urls;
}

/**
 * Scrape a single URL and extract relevant content
 * Enhanced to handle Google search results, Wikipedia, news sites, etc.
 */
async function scrapeSingleUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim();
    
    // Extract main content (varies by site)
    let content = '';
    
    // Google search results - extract snippets
    if (url.includes('google.com/search')) {
      const snippets = [];
      $('.g .VwiC3b, .g .IsZvec, .MjjYud').each((i, el) => {
        const snippet = $(el).text().trim();
        if (snippet && snippet.length > 20) {
          snippets.push(snippet);
        }
      });
      content = snippets.slice(0, 5).join('\n\n');
    }
    
    // Wikipedia
    if (url.includes('wikipedia.org')) {
      content = $('#mw-content-text p').first().text().trim() || 
                $('#mw-content-text').text().trim();
    }
    
    // Try different content selectors for various sites
    if (!content) {
      const contentSelectors = [
        '.post-text',           // Stack Overflow
        '.markdown',            // Reddit
        'article',              // Generic articles
        '.entry-content',       // WordPress blogs
        '.post-content',        // Medium, dev.to
        '.content',             // Common class
        'main',                 // HTML5 main
        '#content',             // Common ID
        '.article-body',        // News sites
        '[role="main"]'         // Accessibility main
      ];
      
      for (const selector of contentSelectors) {
        const el = $(selector).first();
        if (el.length) {
          content = el.text().trim();
          if (content.length > 100) break;
        }
      }
    }
    
    // Fallback to body if nothing found
    if (!content || content.length < 100) {
      content = $('body').text().trim();
    }
    
    // Clean and truncate
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .substring(0, 3000);
    
    return {
      url,
      title,
      content,
      scrapedAt: new Date()
    };
    
  } catch (error) {
    console.error(`Scrape failed for ${url}:`, error.message);
    return null;
  }
}

/**
 * Calculate relevance score for scraped content
 */
function calculateRelevance(content, query) {
  const queryTerms = query.toLowerCase().split(' ');
  const contentLower = content.toLowerCase();
  
  let score = 0;
  queryTerms.forEach(term => {
    if (term.length > 3) { // Ignore short words
      const count = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += count;
    }
  });
  
  return score;
}

/**
 * Extract context from user message
 * Enhanced to handle universal queries, not just technical errors
 */
function extractContext(message) {
  const context = {
    manufacturer: null,
    model: null,
    errorType: null,
    queryType: 'general',
    language: 'english',
    includeIndianContext: false
  };
  
  const messageLower = message.toLowerCase();
  
  // Detect query type
  if (/error|exception|bug|issue|failed|crash|not working|broken/i.test(message)) {
    context.queryType = 'error';
  } else if (/how to|how do|tutorial|guide|steps|learn/i.test(message)) {
    context.queryType = 'howto';
  } else if (/what is|who is|when|where|why|define|explain/i.test(message)) {
    context.queryType = 'factual';
  } else if (/latest|news|current|today|recent|trending/i.test(message)) {
    context.queryType = 'news';
  }
  
  // Common manufacturers (for technical queries)
  const manufacturers = ['dell', 'hp', 'lenovo', 'asus', 'acer', 'apple', 'microsoft', 'samsung'];
  manufacturers.forEach(mfg => {
    if (messageLower.includes(mfg)) {
      context.manufacturer = mfg;
    }
  });
  
  // Detect Indian context keywords
  const indianKeywords = ['india', 'indian', 'hindi', 'tamil', 'telugu', 'bangalore', 'mumbai', 'delhi', 'chennai', 'kolkata', 'hyderabad'];
  if (indianKeywords.some(keyword => messageLower.includes(keyword))) {
    context.includeIndianContext = true;
  }
  
  // Error type detection (for technical queries)
  if (messageLower.includes('driver')) context.errorType = 'driver';
  if (messageLower.includes('screen') || messageLower.includes('display')) context.errorType = 'display';
  if (messageLower.includes('wifi') || messageLower.includes('network')) context.errorType = 'network';
  if (messageLower.includes('battery')) context.errorType = 'battery';
  if (messageLower.includes('performance') || messageLower.includes('slow')) context.errorType = 'performance';
  
  return context;
}

/**
 * Determine if AI should ask follow-up questions
 * Enhanced to handle universal queries appropriately
 */
function shouldAskFollowUp(message, context, tier) {
  // Only Pro and Team tiers get follow-up questions
  if (tier === 'free') return false;
  
  // Don't ask follow-up for factual or news queries - just answer them
  if (context.queryType === 'factual' || context.queryType === 'news') {
    return false;
  }
  
  // For how-to queries, only ask if very vague
  if (context.queryType === 'howto') {
    const isVague = message.split(' ').length < 4;
    return isVague;
  }
  
  // For error queries, check if we have enough technical context
  if (context.queryType === 'error') {
    // If we already have enough context, don't ask
    if (context.manufacturer && context.errorType) return false;
    
    // Check if message is vague or needs clarification
    const needsClarification = 
      message.split(' ').length < 5 || // Very short query
      (!context.manufacturer && message.toLowerCase().includes('laptop')) ||
      (!context.errorType && message.toLowerCase().includes('error'));
    
    return needsClarification;
  }
  
  return false;
}

/**
 * Generate follow-up questions based on context
 */
function generateFollowUpQuestions(message, context) {
  const questions = [];
  
  if (!context.manufacturer && message.toLowerCase().includes('laptop')) {
    questions.push("What brand/manufacturer is your laptop? (e.g., Dell, HP, Lenovo)");
  }
  
  if (!context.model && context.manufacturer) {
    questions.push(`What's your ${context.manufacturer} laptop model number?`);
  }
  
  if (!context.errorType) {
    questions.push("What specific error or issue are you experiencing?");
  }
  
  return questions;
}

/**
 * Main conversational AI function - Google Assistant-like
 */
async function getConversationalResponse({
  userId,
  message,
  conversationId,
  tier = 'free',
  language = 'english',
  includeWebSearch = true
}) {
  try {
    // Get or create conversation context
    const contextKey = conversationId || `${userId}_${Date.now()}`;
    let conversation = conversationContexts.get(contextKey) || {
      id: contextKey,
      userId,
      messages: [],
      context: {},
      createdAt: new Date()
    };
    
    // Extract context from current message
    const newContext = extractContext(message);
    conversation.context = { ...conversation.context, ...newContext };
    
    // Add user message to history
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    // Get tier configuration
    const config = AI_CONFIG[tier] || AI_CONFIG.free;
    
    // Check if we should ask follow-up questions
    const needsFollowUp = shouldAskFollowUp(message, conversation.context, tier);
    
    if (needsFollowUp && config.features.followUpQuestions) {
      const followUpQuestions = generateFollowUpQuestions(message, conversation.context);
      
      const response = {
        conversationId: contextKey,
        type: 'follow_up',
        message: "I'd like to help you better! Could you provide some more details?",
        questions: followUpQuestions,
        context: conversation.context
      };
      
      // Save conversation
      conversation.messages.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date()
      });
      conversationContexts.set(contextKey, conversation);
      
      return response;
    }
    
    // Web scraping for Pro/Team users
    let webContext = null;
    if (config.features.webScraping && includeWebSearch) {
      webContext = await scrapeWebForSolutions(message, conversation.context);
    }
    
    // Build AI prompt with conversation history and web context
    const aiPrompt = buildConversationalPrompt({
      currentMessage: message,
      conversationHistory: conversation.messages.slice(-5), // Last 5 messages
      context: conversation.context,
      webContext,
      tier,
      language,
      includeIndianContext: conversation.context.includeIndianContext
    });
    
    // Get AI response based on tier
    let aiResponse;
    if (config.provider === 'anthropic' && anthropic) {
      aiResponse = await getClaudeResponse(aiPrompt, config);
    } else if (config.provider === 'gemini' && genAI) {
      aiResponse = await getGeminiResponse(aiPrompt, config);
    } else {
      aiResponse = getFallbackResponse(message, tier);
    }
    
    // Save AI response to conversation
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });
    
    // Clean up old conversations (keep last 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, conv] of conversationContexts.entries()) {
      if (conv.createdAt < oneHourAgo) {
        conversationContexts.delete(key);
      }
    }
    
    // Save updated conversation
    conversationContexts.set(contextKey, conversation);
    
    return {
      conversationId: contextKey,
      type: 'answer',
      message: aiResponse,
      context: conversation.context,
      sources: webContext || [],
      tier,
      model: config.model
    };
    
  } catch (error) {
    console.error('Conversational AI error:', error);
    return {
      type: 'error',
      message: 'Sorry, I encountered an error. Please try again.',
      error: error.message
    };
  }
}

/**
 * Build comprehensive prompt for AI with context
 * Enhanced to handle universal queries (not just errors)
 */
function buildConversationalPrompt({
  currentMessage,
  conversationHistory,
  context,
  webContext,
  tier,
  language,
  includeIndianContext
}) {
  // Detect query type
  const isErrorQuery = /error|exception|bug|issue|failed|crash|not working|broken/i.test(currentMessage);
  const isHowTo = /how to|how do|tutorial|guide|steps|learn/i.test(currentMessage);
  const isFactual = /what is|who is|when|where|why|define|explain/i.test(currentMessage);
  const isNews = /latest|news|current|today|recent|trending/i.test(currentMessage);
  
  let prompt = `You are ErrorWise AI, a universal knowledge assistant similar to Google Assistant.

CAPABILITIES:
- Technical troubleshooting and error resolution
- Programming tutorials and how-to guides  
- General knowledge and factual information
- Current news and trending topics
- Indian cultural and regional context awareness

CONVERSATION CONTEXT:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

USER CONTEXT:
${context.manufacturer ? `- Device: ${context.manufacturer}` : ''}
${context.model ? `- Model: ${context.model}` : ''}
${context.errorType ? `- Issue type: ${context.errorType}` : ''}
${includeIndianContext ? '- Regional context: India (consider local tech support, Indian forums, regional issues)' : ''}

${webContext && webContext.length > 0 ? `
WEB SEARCH RESULTS (from across the internet):
${webContext.map((result, i) => `
Source ${i + 1}: ${result.title}
URL: ${result.url}
${result.content}
`).join('\n')}
` : ''}

USER'S QUESTION: ${currentMessage}

QUERY TYPE: ${isErrorQuery ? 'Technical Problem/Error' : isHowTo ? 'Tutorial/How-To' : isFactual ? 'Factual Information' : isNews ? 'News/Current Events' : 'General Query'}

INSTRUCTIONS:
- Be conversational, friendly, and helpful like Google Assistant
- Answer ANY question accurately using web search results when available
${isErrorQuery ? '- Provide step-by-step troubleshooting solutions\n- Include code examples and fixes' : ''}
${isHowTo ? '- Give clear tutorial steps\n- Include practical examples and best practices' : ''}
${isFactual ? '- Provide accurate definitions and explanations\n- Cite sources when available' : ''}
${isNews ? '- Summarize latest information from search results\n- Include relevant details and context' : ''}
- ${tier === 'free' ? 'Give concise, basic explanations' : 'Provide detailed, comprehensive answers with examples'}
- ${includeIndianContext ? 'Consider Indian regional context, local patterns, and cultural nuances' : ''}
- ${language !== 'english' ? `Respond in ${language}` : 'Respond in English'}
- ${webContext && webContext.length > 0 ? 'Use the web search results to provide accurate, up-to-date information from across the internet' : 'Use your knowledge to provide the best answer'}
- If web results are available, synthesize them into a coherent answer
- Format code in markdown code blocks when relevant
- Be concise but thorough
- If uncertain, acknowledge limitations

Respond now:`;

  return prompt;
}

/**
 * Get response from Claude (Pro/Team tiers)
 */
async function getClaudeResponse(prompt, config) {
  try {
    const message = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return message.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}

/**
 * Get response from Gemini (Free tier)
 */
async function getGeminiResponse(prompt, config) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Fallback response when AI is unavailable
 */
function getFallbackResponse(message, tier) {
  return `I'm currently experiencing technical difficulties with the AI service. 

Your question: "${message}"

Please try again in a moment. If the issue persists, contact support.

Your current tier: ${tier}`;
}

/**
 * Get conversation history for a user
 */
function getConversationHistory(conversationId) {
  return conversationContexts.get(conversationId) || null;
}

/**
 * Clear conversation context
 */
function clearConversation(conversationId) {
  conversationContexts.delete(conversationId);
}

module.exports = {
  getConversationalResponse,
  scrapeWebForSolutions,
  getConversationHistory,
  clearConversation,
  extractContext,
  AI_CONFIG
};
