require('dotenv').config();
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Enhanced mock responses with categories and tags
const mockResponses = {
  default: {
    explanation: 'This appears to be a software error that needs debugging. Without more specific details, it\'s difficult to provide a precise diagnosis.',
    solution: 'Please verify your code logic, check variable declarations, and ensure all dependencies are properly imported.',
    category: 'general',
    tags: ['debugging', 'general'],
    confidence: 0.3
  },
  typeerror: {
    explanation: 'TypeError occurs when an operation is performed on a value of the wrong type, commonly when accessing properties on undefined or null values.',
    solution: 'Check if your variables are defined and have the expected type before accessing their properties or methods.',
    category: 'runtime',
    tags: ['javascript', 'runtime', 'type-checking'],
    confidence: 0.8
  },
  referenceerror: {
    explanation: 'ReferenceError occurs when trying to use a variable that has not been declared or is not in the current scope.',
    solution: 'Declare your variable using const, let, or var, or check if the variable name is spelled correctly.',
    category: 'scope',
    tags: ['javascript', 'scope', 'variables'],
    confidence: 0.8
  },
  syntaxerror: {
    explanation: 'SyntaxError indicates that the code violates JavaScript syntax rules, such as missing brackets, semicolons, or invalid operators.',
    solution: 'Review your code for missing brackets, parentheses, quotes, or semicolons. Use a code editor with syntax highlighting.',
    category: 'syntax',
    tags: ['javascript', 'syntax', 'parsing'],
    confidence: 0.9
  },
  indentationerror: {
    explanation: 'IndentationError occurs in Python when the indentation is not consistent or incorrect for the code structure.',
    solution: 'Use consistent indentation (4 spaces or tabs) and ensure all code blocks are properly indented.',
    category: 'syntax',
    tags: ['python', 'indentation', 'syntax'],
    confidence: 0.9
  },
  nameerror: {
    explanation: 'NameError in Python occurs when trying to use a variable or function that hasn\'t been defined in the current scope.',
    solution: 'Define the variable or function before using it, or check for typos in the name.',
    category: 'scope',
    tags: ['python', 'scope', 'variables'],
    confidence: 0.8
  }
};

function createPrompt(errorMessage, language, errorType, subscriptionTier, codeContext = {}) {
  let prompt = `You are an expert software debugging assistant specializing in ${language} errors.\n\n`;
  prompt += `Error message: """${errorMessage}"""\n`;
  prompt += `Language: ${language}\n`;
  prompt += `Error type: ${errorType}\n`;
  
  // Add code context if provided
  if (codeContext.codeSnippet) {
    prompt += `\nCode context:\n`;
    if (codeContext.fileName) {
      prompt += `File: ${codeContext.fileName}\n`;
    }
    if (codeContext.lineNumber) {
      prompt += `Line number: ${codeContext.lineNumber}\n`;
    }
    prompt += `Code snippet:\n\`\`\`${language}\n${codeContext.codeSnippet}\n\`\`\`\n`;
  }
  
  prompt += `\n`;

  switch (subscriptionTier) {
    case 'free':
      prompt += 'Provide a JSON response with the following structure:\n';
      prompt += '{\n';
      prompt += '  "explanation": "Brief 2-3 line explanation of what caused this error",\n';
      prompt += '  "solution": "Simple 1-2 line solution to fix this error",\n';
      prompt += '  "category": "error category (e.g., syntax, runtime, logic, network)",\n';
      prompt += '  "tags": ["relevant", "tags", "for", "this", "error"],\n';
      prompt += '  "confidence": 0.8\n';
      prompt += '}\n';
      prompt += 'Keep explanations concise and solutions actionable.';
      break;
    case 'pro':
      prompt += 'Provide a JSON response with detailed analysis:\n';
      prompt += '{\n';
      prompt += '  "explanation": "Detailed 4-5 line explanation with technical context",\n';
      prompt += '  "solution": "Step-by-step solution with 2-3 specific actions to take",\n';
      prompt += '  "category": "specific error category",\n';
      prompt += '  "tags": ["comprehensive", "tags", "including", "frameworks", "concepts"],\n';
      prompt += '  "confidence": 0.9,\n';
      prompt += '  "preventionTips": ["tip1", "tip2"]\n';
      prompt += '}\n';
      prompt += 'Include prevention strategies and best practices.';
      break;
    case 'team':
      prompt += 'Provide a comprehensive JSON response:\n';
      prompt += '{\n';
      prompt += '  "explanation": "In-depth 6+ line explanation with full technical context",\n';
      prompt += '  "solution": "Comprehensive solution with multiple approaches and code examples",\n';
      prompt += '  "category": "detailed error classification",\n';
      prompt += '  "tags": ["extensive", "tags", "including", "all", "relevant", "concepts"],\n';
      prompt += '  "confidence": 0.95,\n';
      prompt += '  "preventionTips": ["prevention tip 1", "prevention tip 2", "prevention tip 3"],\n';
      prompt += '  "relatedErrors": ["similar error 1", "similar error 2"],\n';
      prompt += '  "debugging": ["debugging step 1", "debugging step 2", "debugging step 3"]\n';
      prompt += '}\n';
      prompt += 'Include comprehensive analysis, multiple solutions, and debugging strategies.';
      break;
    default:
      prompt += 'Provide a JSON response explaining the error and how to fix it.';
  }

  return prompt;
}

function detectErrorType(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  if (msg.includes('syntax')) return 'syntax';
  if (msg.includes('type') && msg.includes('error')) return 'runtime';
  if (msg.includes('reference')) return 'scope';
  if (msg.includes('indentation')) return 'syntax';
  if (msg.includes('name') && msg.includes('error')) return 'scope';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('cors')) return 'network';
  if (msg.includes('permission') || msg.includes('access')) return 'permission';
  if (msg.includes('timeout')) return 'performance';
  
  return 'runtime';
}

function detectLanguage(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('syntaxerror')) return 'javascript';
  if (msg.includes('indentationerror') || msg.includes('nameerror') || msg.includes('attributeerror')) return 'python';
  if (msg.includes('nullpointerexception') || msg.includes('classnotfoundexception')) return 'java';
  if (msg.includes('segmentation fault') || msg.includes('core dumped')) return 'c++';
  if (msg.includes('panic') || msg.includes('goroutine')) return 'go';
  
  return 'javascript'; // default
}

function categorizeError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  for (const [key, response] of Object.entries(mockResponses)) {
    if (key !== 'default' && msg.includes(key.replace('error', ''))) {
      return response;
    }
  }
  
  return mockResponses.default;
}

async function analyzeError({ errorMessage, codeSnippet, fileName, lineNumber, language, errorType, subscriptionTier = 'free' }) {
  // Auto-detect language and error type if not provided
  const detectedLanguage = language || detectLanguage(errorMessage);
  const detectedErrorType = errorType || detectErrorType(errorMessage);
  
  // Prepare code context
  const codeContext = {
    codeSnippet,
    fileName,
    lineNumber
  };
  
  const prompt = createPrompt(errorMessage, detectedLanguage, detectedErrorType, subscriptionTier, codeContext);

  // Try Gemini first
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (text) {
      try {
        // Try to parse JSON response
        const parsed = JSON.parse(text);
        return {
          ...parsed,
          provider: 'gemini',
          language: detectedLanguage,
          errorType: detectedErrorType
        };
      } catch (parseError) {
        // If not JSON, create structured response from text
        return {
          explanation: text,
          solution: 'Please review the explanation above for solutions.',
          category: detectedErrorType,
          tags: [detectedLanguage, detectedErrorType],
          confidence: 0.7,
          provider: 'gemini',
          language: detectedLanguage,
          errorType: detectedErrorType
        };
      }
    }
    throw new Error('Empty Gemini response');
  } catch (geminiErr) {
    console.error('Gemini API error:', geminiErr?.message || geminiErr);

    // If Gemini fails, try OpenAI
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7,
      });
      
      const content = response.choices[0].message.content;
      
      try {
        // Try to parse JSON response
        const parsed = JSON.parse(content);
        return {
          ...parsed,
          provider: 'openai',
          language: detectedLanguage,
          errorType: detectedErrorType
        };
      } catch (parseError) {
        // If not JSON, create structured response from text
        return {
          explanation: content,
          solution: 'Please review the explanation above for solutions.',
          category: detectedErrorType,
          tags: [detectedLanguage, detectedErrorType],
          confidence: 0.7,
          provider: 'openai',
          language: detectedLanguage,
          errorType: detectedErrorType
        };
      }
    } catch (openaiErr) {
      console.error('OpenAI API error:', openaiErr?.message || openaiErr);

      // Fallback to enhanced mock response
      const mockResponse = categorizeError(errorMessage);
      return {
        ...mockResponse,
        provider: 'mock',
        language: detectedLanguage,
        errorType: detectedErrorType
      };
    }
  }
}

// Backward compatibility
async function explainError(errorMessage, subscriptionTier = 'free') {
  const result = await analyzeError({ errorMessage, subscriptionTier });
  return {
    explanation: result.explanation,
    solution: result.solution
  };
}

module.exports = { 
  analyzeError, 
  explainError // Keep for backward compatibility
};
