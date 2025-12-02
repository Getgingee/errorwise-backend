/**
 * Conversational AI Service
 * Google Assistant-like conversational experience with context awareness,
 * follow-up questions, web scraping, and tier-based features
 * 
 * UNIFIED: Uses central modelConfig.js for all AI model configuration
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// UNIFIED: Import central model configuration
const modelConfig = require('../config/modelConfig');

// Initialize AI clients
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Conversation context store (use Redis in production)
const conversationContexts = new Map();

/**
 * UNIFIED: Get AI config from central modelConfig
 * No more hardcoded models - everything flows from modelConfig.js
 */
function getAIConfig(tier = 'free') {
  const defaultModel = modelConfig.getDefaultModelForTier(tier);
  const maxTokens = modelConfig.getMaxTokensForTier(tier);
  
  // Feature configuration based on tier
  const featuresByTier = {
    free: {
      basicExplanations: true,
      followUpQuestions: false,
      webScraping: false,
      codeExamples: false,
      multiLanguage: false
    },
    pro: {
      basicExplanations: true,
      fullExplanations: true,
      followUpQuestions: true,
      webScraping: true,
      codeExamples: true,
      fixSuggestions: true,
      multiLanguage: true,
      contextAwareness: true
    },
    team: {
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
  };
  
  return {
    model: defaultModel.apiId,
    modelName: defaultModel.name,
    provider: 'anthropic', // All tiers use Anthropic Claude
    maxTokens: maxTokens,
    features: featuresByTier[tier] || featuresByTier.free
  };
}

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
 * Detect programming language from message content
 */
function detectProgrammingLanguage(text) {
  const lowerText = text.toLowerCase();
  
  const languagePatterns = {
    'javascript': /javascript|js|node|react|vue|angular|express|npm|yarn|const |let |var |=>|\.then\(|async |await /i,
    'typescript': /typescript|ts|\.tsx|\.ts|interface |type |: string|: number|: boolean/i,
    'python': /python|pip|django|flask|pandas|numpy|def |import |from .* import|print\(|__init__|\.py/i,
    'java': /\bjava\b|spring|maven|gradle|public class|private |void |System\.out/i,
    'csharp': /c#|csharp|\.net|asp\.net|using |namespace |public class|Console\.Write/i,
    'cpp': /c\+\+|cpp|#include|iostream|std::|cout|cin|nullptr/i,
    'go': /golang|\bgo\b|func |package main|fmt\.|goroutine/i,
    'rust': /\brust\b|cargo|fn |let mut|impl |pub fn|println!/i,
    'php': /\bphp\b|\$_GET|\$_POST|<?php|echo |->|::/i,
    'ruby': /\bruby\b|rails|gem|def |end$|puts |attr_/i,
    'swift': /\bswift\b|ios|xcode|var |let |func |guard |optional/i,
    'kotlin': /kotlin|android|fun |val |var |data class/i,
    'sql': /\bsql\b|mysql|postgres|select |insert |update |delete |from |where |join /i,
    'html': /html|<div|<span|<p>|<body|<head|<!DOCTYPE/i,
    'css': /\bcss\b|scss|sass|@media|margin:|padding:|display:|flex|grid/i,
    'bash': /bash|shell|sh|terminal|chmod|grep|sed|awk|\$\(|#!/i
  };
  
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    if (pattern.test(lowerText)) {
      return lang;
    }
  }
  
  return null;
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
    includeIndianContext: false,
    programmingLanguage: detectProgrammingLanguage(message),
    framework: null
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
  
  // Detect frameworks
  const frameworks = ['react', 'angular', 'vue', 'express', 'django', 'flask', 'spring', 'rails', 'laravel', 'next.js', 'nuxt', 'svelte'];
  frameworks.forEach(fw => {
    if (messageLower.includes(fw)) {
      context.framework = fw;
    }
  });
  
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
 * Generate intelligent follow-up questions based on context
 * Enhanced with smarter, error-specific suggestions
 */
function generateFollowUpQuestions(message, context) {
  const questions = [];
  const lowerMessage = message.toLowerCase();
  
  // Programming/Error specific follow-ups
  if (lowerMessage.includes('error') || lowerMessage.includes('exception') || lowerMessage.includes('fail')) {
    if (!context.errorMessage) {
      questions.push("Could you share the complete error message or stack trace?");
    }
    if (!context.language) {
      questions.push("What programming language or framework are you using?");
    }
    if (!context.codeSnippet) {
      questions.push("Can you share the relevant code snippet where the error occurs?");
    }
    if (!context.triedSolutions) {
      questions.push("What solutions have you already tried?");
    }
  }
  
  // Device/Hardware specific
  if (!context.manufacturer && (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('device'))) {
    questions.push("What brand/manufacturer is your device? (e.g., Dell, HP, Lenovo)");
  }
  
  if (!context.model && context.manufacturer) {
    questions.push(`What's your ${context.manufacturer} model number?`);
  }
  
  // Software/Environment specific
  if (!context.os && (lowerMessage.includes('install') || lowerMessage.includes('setup') || lowerMessage.includes('config'))) {
    questions.push("What operating system are you using? (Windows, macOS, Linux)");
  }
  
  if (!context.version && (lowerMessage.includes('update') || lowerMessage.includes('version') || lowerMessage.includes('upgrade'))) {
    questions.push("What version are you currently using?");
  }
  
  // Limit to 3 most relevant questions
  return questions.slice(0, 3);
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
    console.log(`[ConversationalAI] Starting response for user ${userId}, tier: ${tier}`);
    
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
    
    // UNIFIED: Get tier configuration from central modelConfig
    const config = getAIConfig(tier);
    console.log(`[ConversationalAI] Using config: provider=${config.provider}, model=${config.model}, modelName=${config.modelName}`);
    
    // Check if Anthropic is available
    if (config.provider === 'anthropic' && !anthropic) {
      console.error('[ConversationalAI] ERROR: Anthropic client not initialized! ANTHROPIC_API_KEY may be missing.');
      throw new Error('AI service not configured. Please check ANTHROPIC_API_KEY.');
    }
    
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
      try {
        console.log('[ConversationalAI] Web scraping enabled, fetching...');
        webContext = await scrapeWebForSolutions(message, conversation.context);
      } catch (webError) {
        console.warn('[ConversationalAI] Web scraping failed:', webError.message);
      }
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
    
    console.log(`[ConversationalAI] Calling ${config.provider} API...`);
    
    // Get AI response based on tier - ALL tiers use Claude now
    let aiResponse;
    if (config.provider === 'anthropic' && anthropic) {
      aiResponse = await getClaudeResponse(aiPrompt, config);
      console.log('[ConversationalAI] Claude response received');
    } else if (config.provider === 'gemini' && genAI) {
      // Fallback to Gemini only if explicitly configured
      aiResponse = await getGeminiResponse(aiPrompt, config);
      console.log('[ConversationalAI] Gemini response received');
    } else {
      console.error('[ConversationalAI] No AI provider available!');
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
    
    console.log('[ConversationalAI] Response complete');
    
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
    console.error('[ConversationalAI] Error:', error.message);
    console.error('[ConversationalAI] Stack:', error.stack);
    return {
      type: 'error',
      message: 'Sorry, I encountered an error processing your request. Please try again.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

/**
 * Build comprehensive prompt for AI with context
 * Enhanced for highly intelligent, context-aware conversations
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
  // Detect query type with enhanced patterns
  const isErrorQuery = /error|exception|bug|issue|failed|crash|not working|broken|undefined|null|cannot|unable/i.test(currentMessage);
  const isHowTo = /how to|how do|tutorial|guide|steps|learn|teach|show me|explain how/i.test(currentMessage);
  const isFactual = /what is|who is|when|where|why|define|explain|meaning|difference between/i.test(currentMessage);
  const isNews = /latest|news|current|today|recent|trending/i.test(currentMessage);
  const isCodeRequest = /code|example|snippet|implement|write|create|build|make/i.test(currentMessage);
  const isDebugRequest = /debug|fix|solve|troubleshoot|diagnose|investigate/i.test(currentMessage);
  
  // Detect programming language from context
  const detectedLanguage = detectProgrammingLanguage(currentMessage + ' ' + (context.codeSnippet || ''));
  
  let prompt = `You are ErrorWise AI, a highly intelligent and versatile AI assistant - think of yourself as a brilliant senior developer combined with a helpful Google Assistant.

🧠 INTELLIGENCE PROFILE:
- Expert-level programming knowledge across ALL languages and frameworks
- Deep understanding of debugging, optimization, and best practices
- Ability to explain complex concepts simply
- Proactive problem-solving mindset

💬 CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n') : 'This is the start of the conversation.'}

📋 EXTRACTED CONTEXT:
${context.manufacturer ? `• Device: ${context.manufacturer}` : ''}
${context.model ? `• Model: ${context.model}` : ''}
${context.errorType ? `• Issue type: ${context.errorType}` : ''}
${context.language || detectedLanguage ? `• Programming Language: ${context.language || detectedLanguage}` : ''}
${context.framework ? `• Framework: ${context.framework}` : ''}
${context.os ? `• Operating System: ${context.os}` : ''}
${includeIndianContext ? '• Regional context: India (consider local patterns, Indian tech ecosystem)' : ''}

${webContext && webContext.length > 0 ? `
🌐 LIVE WEB SEARCH RESULTS:
${webContext.map((result, i) => `
📄 Source ${i + 1}: ${result.title}
🔗 ${result.url}
${result.content.substring(0, 500)}...
`).join('\n')}
` : ''}

❓ CURRENT QUESTION: ${currentMessage}

🏷️ QUERY CLASSIFICATION: ${isErrorQuery ? '🐛 Technical Problem/Error' : isDebugRequest ? '🔍 Debug Request' : isCodeRequest ? '💻 Code Request' : isHowTo ? '📚 Tutorial/How-To' : isFactual ? 'ℹ️ Factual Information' : isNews ? '📰 News/Current Events' : '💬 General Query'}

📜 RESPONSE GUIDELINES:

${isErrorQuery || isDebugRequest ? `
🐛 ERROR/DEBUG MODE:
1. Identify the root cause clearly
2. Explain WHY this error happens (not just how to fix)
3. Provide step-by-step solution
4. Include working code example with syntax highlighting
5. Suggest preventive measures
6. If multiple solutions exist, rank by effectiveness
` : ''}

${isCodeRequest ? `
💻 CODE MODE:
1. Provide complete, production-ready code
2. Include all necessary imports/setup
3. Add clear comments explaining logic
4. Show usage examples
5. Mention any dependencies
6. Consider edge cases
` : ''}

${isHowTo ? `
📚 TUTORIAL MODE:
1. Break into numbered steps
2. Start with prerequisites
3. Explain each step clearly
4. Include code examples where relevant
5. Add tips and best practices
6. Mention common pitfalls to avoid
` : ''}

${isFactual ? `
ℹ️ KNOWLEDGE MODE:
1. Provide accurate, comprehensive information
2. Use analogies for complex concepts
3. Include relevant examples
4. Cite sources when available
5. Connect to related concepts
` : ''}

📊 QUALITY STANDARDS:
- ${tier === 'free' ? 'Be helpful and clear within concise responses' : tier === 'pro' ? 'Provide detailed, expert-level explanations with multiple examples' : 'Give the most comprehensive, senior-developer-level analysis possible'}
- Use proper markdown formatting
- Code blocks with language syntax: \`\`\`${detectedLanguage || 'javascript'}
- Be conversational and friendly
- If uncertain, acknowledge and provide best guidance
${webContext && webContext.length > 0 ? '- Synthesize web results into a coherent, helpful answer' : '- Use your comprehensive knowledge base'}
${language !== 'english' ? `- Respond in ${language}` : ''}

🎯 Now provide your intelligent, helpful response:`;

  return prompt;
}

/**
 * Get response from Claude (ALL tiers now use Claude)
 */
async function getClaudeResponse(prompt, config) {
  try {
    if (!anthropic) {
      console.error('[Claude] Anthropic client not initialized!');
      throw new Error('Anthropic API client not available. Check ANTHROPIC_API_KEY environment variable.');
    }
    
    console.log(`[Claude] Calling model: ${config.model}, maxTokens: ${config.maxTokens}`);
    
    const message = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    if (!message || !message.content || !message.content[0]) {
      console.error('[Claude] Empty response received');
      throw new Error('Empty response from Claude API');
    }
    
    const responseText = message.content[0].text;
    console.log(`[Claude] Response received: ${responseText.length} chars`);
    
    return responseText;
  } catch (error) {
    console.error('[Claude] API error:', error.message);
    console.error('[Claude] Error details:', {
      status: error.status,
      code: error.code,
      type: error.type
    });
    
    // Provide more specific error messages
    if (error.status === 401) {
      throw new Error('Invalid Anthropic API key. Please check configuration.');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    } else if (error.status >= 500) {
      throw new Error('Anthropic service temporarily unavailable. Please try again.');
    }
    
    throw error;
  }
}

/**
 * Get response from Gemini (LEGACY FALLBACK - Not used since all tiers use Claude)
 * Kept for emergency fallback only
 */
async function getGeminiResponse(prompt, config) {
  try {
    if (!genAI) {
      throw new Error('Gemini client not initialized');
    }
    // Use a stable Gemini model as emergency fallback
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('[Gemini] API error (fallback):', error.message);
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
  getAIConfig  // UNIFIED: Export the function that uses central modelConfig
};
