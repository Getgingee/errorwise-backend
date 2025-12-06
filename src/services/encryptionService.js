/**
 * End-to-End Encryption Service for Team Features
 * 
 * Provides encryption/decryption for sensitive team data using AES-256-GCM.
 * Each team gets a unique encryption key derived from a master key + team salt.
 * 
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Per-team key derivation using PBKDF2
 * - Random IV for each encryption operation
 * - Authentication tag prevents tampering
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

// Master encryption key from environment (should be set in Railway secrets)
const getMasterKey = () => {
  const key = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('ENCRYPTION_MASTER_KEY or JWT_SECRET must be set');
  }
  return key;
};

class EncryptionService {
  
  /**
   * Generate a unique salt for a team
   * @returns {string} Base64 encoded salt
   */
  generateTeamSalt() {
    return crypto.randomBytes(SALT_LENGTH).toString('base64');
  }

  /**
   * Derive a team-specific encryption key using PBKDF2
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's unique salt (stored in DB)
   * @returns {Buffer} 256-bit encryption key
   */
  deriveTeamKey(teamId, teamSalt) {
    const masterKey = getMasterKey();
    const salt = Buffer.from(teamSalt, 'base64');
    
    return crypto.pbkdf2Sync(
      `${masterKey}:${teamId}`,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha512'
    );
  }

  /**
   * Encrypt data for a specific team
   * @param {string|object} data - Data to encrypt (objects are JSON stringified)
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {string} Encrypted data in format: iv:authTag:ciphertext (all base64)
   */
  encrypt(data, teamId, teamSalt) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      const key = this.deriveTeamKey(teamId, teamSalt);
      const iv = crypto.randomBytes(IV_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });
      
      let encrypted = cipher.update(dataStr, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const authTag = cipher.getAuthTag();
      
      // Return format: iv:authTag:ciphertext
      return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data for a specific team
   * @param {string} encryptedData - Encrypted data in format: iv:authTag:ciphertext
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @param {boolean} parseJson - Whether to parse result as JSON (default: true)
   * @returns {string|object} Decrypted data
   */
  decrypt(encryptedData, teamId, teamSalt, parseJson = true) {
    try {
      const [ivB64, authTagB64, ciphertext] = encryptedData.split(':');
      
      if (!ivB64 || !authTagB64 || !ciphertext) {
        throw new Error('Invalid encrypted data format');
      }
      
      const key = this.deriveTeamKey(teamId, teamSalt);
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      if (parseJson) {
        try {
          return JSON.parse(decrypted);
        } catch {
          return decrypted;
        }
      }
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - data may be corrupted or tampered');
    }
  }

  /**
   * Encrypt a shared error's sensitive data
   * @param {object} errorData - Error data to encrypt
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {object} Error data with sensitive fields encrypted
   */
  encryptSharedError(errorData, teamId, teamSalt) {
    const sensitiveFields = ['errorMessage', 'stackTrace', 'code', 'solution', 'context'];
    const encryptedData = { ...errorData };
    
    for (const field of sensitiveFields) {
      if (encryptedData[field]) {
        encryptedData[`${field}_encrypted`] = this.encrypt(encryptedData[field], teamId, teamSalt);
        encryptedData[field] = '[ENCRYPTED]';
      }
    }
    
    encryptedData._isEncrypted = true;
    return encryptedData;
  }

  /**
   * Decrypt a shared error's sensitive data
   * @param {object} errorData - Encrypted error data
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {object} Error data with sensitive fields decrypted
   */
  decryptSharedError(errorData, teamId, teamSalt) {
    if (!errorData._isEncrypted) {
      return errorData; // Not encrypted, return as-is
    }
    
    const sensitiveFields = ['errorMessage', 'stackTrace', 'code', 'solution', 'context'];
    const decryptedData = { ...errorData };
    
    for (const field of sensitiveFields) {
      const encryptedField = `${field}_encrypted`;
      if (decryptedData[encryptedField]) {
        decryptedData[field] = this.decrypt(decryptedData[encryptedField], teamId, teamSalt);
        delete decryptedData[encryptedField];
      }
    }
    
    delete decryptedData._isEncrypted;
    return decryptedData;
  }

  /**
   * Encrypt team message/comment content
   * @param {string} message - Message content
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {string} Encrypted message
   */
  encryptTeamMessage(message, teamId, teamSalt) {
    return this.encrypt(message, teamId, teamSalt);
  }

  /**
   * Decrypt team message/comment content
   * @param {string} encryptedMessage - Encrypted message
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {string} Decrypted message
   */
  decryptTeamMessage(encryptedMessage, teamId, teamSalt) {
    return this.decrypt(encryptedMessage, teamId, teamSalt, false);
  }

  /**
   * Hash sensitive data for search/lookup (deterministic)
   * @param {string} data - Data to hash
   * @param {string} teamSalt - Team's salt for consistent hashing
   * @returns {string} HMAC hash for lookup
   */
  hashForSearch(data, teamSalt) {
    const salt = Buffer.from(teamSalt, 'base64');
    return crypto.createHmac('sha256', salt)
      .update(String(data).toLowerCase().trim())
      .digest('hex');
  }

  /**
   * Verify data integrity using authentication tag
   * @param {string} encryptedData - Encrypted data to verify
   * @param {string} teamId - Team identifier
   * @param {string} teamSalt - Team's encryption salt
   * @returns {boolean} True if data is intact and authentic
   */
  verifyIntegrity(encryptedData, teamId, teamSalt) {
    try {
      this.decrypt(encryptedData, teamId, teamSalt);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt data with a new team salt (key rotation)
   * @param {string} encryptedData - Currently encrypted data
   * @param {string} teamId - Team identifier
   * @param {string} oldSalt - Current salt
   * @param {string} newSalt - New salt for rotation
   * @returns {string} Re-encrypted data
   */
  rotateKey(encryptedData, teamId, oldSalt, newSalt) {
    const decrypted = this.decrypt(encryptedData, teamId, oldSalt);
    return this.encrypt(decrypted, teamId, newSalt);
  }
}

// Singleton instance
const encryptionService = new EncryptionService();

module.exports = encryptionService;
