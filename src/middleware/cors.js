const cors = require('cors');

// CORS configuration for different environments
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'https://errorwise-frontend.vercel.app',
      'https://errorwise.app',
      'https://www.errorwise.app',
      'https://errorwise.tech',
      'https://www.errorwise.tech'
    ];

    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development') {
      const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
      const localhostIPRegex = /^https?:\/\/127\.0\.0\.1(:\d+)?$/;
      
      if (localhostRegex.test(origin) || localhostIPRegex.test(origin)) {
        return callback(null, true);
      }
    }

    // Production: also allow Vercel preview URLs
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // Production origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  
  credentials: true, // Allow cookies to be sent
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key'
  ],
  
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  
  maxAge: 86400 // 24 hours
};

// Strict CORS for sensitive endpoints
const strictCorsOptions = {
  ...corsOptions,
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://errorwise-frontend.vercel.app',
      'https://errorwise.app',
      'https://www.errorwise.app',
      'https://errorwise.tech',
      'https://www.errorwise.tech'
    ];
    
    // In development, only allow specific localhost
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000');
      allowedOrigins.push('http://localhost:5173');
    }

    // Also allow Vercel preview URLs
    if (origin && origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Strict CORS policy violation'));
    }
  }
};

// Development-only permissive CORS
const devCorsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: '*'
};

module.exports = {
  corsMiddleware: cors(corsOptions),
  strictCorsMiddleware: cors(strictCorsOptions),
  devCorsMiddleware: cors(devCorsOptions),
  corsOptions,
  strictCorsOptions,
  devCorsOptions
};