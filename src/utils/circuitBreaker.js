/**
 * Circuit Breaker Pattern for High Traffic Protection
 * 
 * Prevents cascade failures by "opening" the circuit when too many failures occur.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: All requests fail immediately (fast-fail)
 * - HALF-OPEN: Allow limited requests to test if service recovered
 */

const logger = require('./logger');

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;      // Open after 5 failures
    this.successThreshold = options.successThreshold || 3;      // Close after 3 successes in half-open
    this.timeout = options.timeout || 30000;                    // Stay open for 30 seconds
    this.monitorWindow = options.monitorWindow || 60000;        // Monitor failures in 1 minute window
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
    this.failureHistory = [];
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      stateChanges: []
    };
  }

  async execute(fn) {
    this.metrics.totalRequests++;
    
    if (this.state === 'OPEN') {
      // Check if timeout has passed
      if (Date.now() - this.openedAt >= this.timeout) {
        this._setState('HALF-OPEN');
      } else {
        this.metrics.rejectedRequests++;
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN`, this.state);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    this.metrics.successfulRequests++;
    
    if (this.state === 'HALF-OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this._setState('CLOSED');
        this.failures = 0;
        this.successes = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failures on success in closed state
      this.failures = 0;
    }
  }

  _onFailure(error) {
    this.metrics.failedRequests++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.failureHistory.push({ time: Date.now(), error: error.message });
    
    // Clean old failures outside monitor window
    this.failureHistory = this.failureHistory.filter(
      f => Date.now() - f.time < this.monitorWindow
    );

    if (this.state === 'HALF-OPEN') {
      this._setState('OPEN');
      this.successes = 0;
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this._setState('OPEN');
    }
  }

  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (newState === 'OPEN') {
      this.openedAt = Date.now();
    }
    
    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      time: new Date().toISOString()
    });
    
    logger.warn(`🔌 Circuit Breaker [${this.name}]: ${oldState} → ${newState}`);
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
      metrics: this.metrics
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
    this.failureHistory = [];
    logger.info(`🔌 Circuit Breaker [${this.name}]: Reset to CLOSED`);
  }
}

class CircuitBreakerError extends Error {
  constructor(message, state) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
  }
}

// Pre-configured circuit breakers for different services
const circuitBreakers = {
  // AI Provider circuit breaker (Anthropic, OpenAI, etc.)
  ai: new CircuitBreaker({
    name: 'AI-Provider',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,        // 1 minute cooldown
    monitorWindow: 120000  // 2 minute failure window
  }),
  
  // Database circuit breaker
  database: new CircuitBreaker({
    name: 'Database',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,        // 30 second cooldown
    monitorWindow: 60000   // 1 minute failure window
  }),
  
  // Redis circuit breaker
  redis: new CircuitBreaker({
    name: 'Redis',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 15000,        // 15 second cooldown
    monitorWindow: 60000
  }),
  
  // External API circuit breaker (DodoPayments, etc.)
  externalApi: new CircuitBreaker({
    name: 'External-API',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 45000,
    monitorWindow: 120000
  }),
  
  // Email service circuit breaker
  email: new CircuitBreaker({
    name: 'Email-Service',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    monitorWindow: 300000  // 5 minute window for email
  })
};

// Middleware for Express routes
const circuitBreakerMiddleware = (breakerName) => {
  return (req, res, next) => {
    const breaker = circuitBreakers[breakerName];
    
    if (!breaker) {
      return next();
    }
    
    if (breaker.state === 'OPEN') {
      const retryAfter = Math.ceil((breaker.timeout - (Date.now() - breaker.openedAt)) / 1000);
      
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable',
        message: 'We are experiencing high load. Please try again shortly.',
        retryAfter,
        circuitBreaker: {
          name: breaker.name,
          state: breaker.state
        }
      });
    }
    
    next();
  };
};

// Get all circuit breaker states (for monitoring)
const getAllCircuitBreakerStates = () => {
  const states = {};
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    states[name] = breaker.getState();
  }
  return states;
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerError,
  circuitBreakers,
  circuitBreakerMiddleware,
  getAllCircuitBreakerStates
};
