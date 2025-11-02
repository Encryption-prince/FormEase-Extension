/**
 * FileParser class for handling file upload, validation, and parsing
 * Supports JSON, CSV, and TXT file formats with security validation
 */
class FileParser {
  // File size limit: 5MB
  static MAX_FILE_SIZE = 5 * 1024 * 1024;
  
  // Allowed MIME types
  static ALLOWED_MIME_TYPES = [
    'application/json',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel', // Some CSV files
    '' // Empty MIME type for files without proper detection
  ];
  
  // Allowed file extensions
  static ALLOWED_EXTENSIONS = ['json', 'csv', 'txt'];
  
  /**
   * Main parsing method that validates and processes uploaded files
   * @param {File} file - The uploaded file object
   * @returns {Promise<Object>} Parsed data object
   * @throws {Error} Validation or parsing errors
   */
  static async parse(file) {
    try {
      // Validate file before processing
      this.validateFile(file);
      
      // Read file content asynchronously
      const content = await this.readFileAsync(file);
      
      // Determine file type and parse accordingly
      const extension = this.getFileExtension(file.name);
      
      switch (extension) {
        case 'json':
          return this.parseJSON(content);
        case 'csv':
          return this.parseCSV(content);
        case 'txt':
          return this.parseTXT(content);
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }
    } catch (error) {
      // Re-throw with context for better error handling
      throw new Error(`File parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Validates file type, size, and security constraints
   * @param {File} file - The file to validate
   * @throws {Error} Validation errors
   */
  static validateFile(file) {
    if (!file) {
      throw new Error('No file provided');
    }
    
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(`File too large (${sizeMB}MB). Maximum size is 5MB`);
    }
    
    // Check file extension
    const extension = this.getFileExtension(file.name);
    if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
      throw new Error(`Unsupported file format. Allowed formats: ${this.ALLOWED_EXTENSIONS.join(', ')}`);
    }
    
    // Check MIME type (if available)
    if (file.type && !this.ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.type}`);
    }
    
    // Additional security check for filename
    if (this.containsSuspiciousCharacters(file.name)) {
      throw new Error('Invalid filename contains suspicious characters');
    }
  }
  
  /**
   * Extracts file extension from filename
   * @param {string} filename - The filename
   * @returns {string} File extension in lowercase
   */
  static getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename');
    }
    
    const parts = filename.split('.');
    if (parts.length < 2) {
      throw new Error('File must have an extension');
    }
    
    return parts.pop().toLowerCase();
  }
  
  /**
   * Checks for suspicious characters in filename
   * @param {string} filename - The filename to check
   * @returns {boolean} True if suspicious characters found
   */
  static containsSuspiciousCharacters(filename) {
    // Check for path traversal and other suspicious patterns
    const suspiciousPatterns = [
      /\.\./,           // Path traversal
      /[<>:"|?*]/,      // Invalid filename characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
      /^\./,            // Hidden files starting with dot
      /\x00/            // Null bytes
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(filename));
  }
  
  /**
   * Reads file content asynchronously using FileReader API
   * @param {File} file - The file to read
   * @returns {Promise<string>} File content as text
   */
  static readFileAsync(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.onabort = () => {
        reject(new Error('File reading was aborted'));
      };
      
      // Read file as text with UTF-8 encoding
      reader.readAsText(file, 'UTF-8');
    });
  }  /**

   * Parses JSON file content and validates structure
   * @param {string} content - Raw JSON content
   * @returns {Object} Parsed and validated JSON data
   * @throws {Error} JSON parsing or validation errors
   */
  static parseJSON(content) {
    try {
      if (!content || content.trim() === '') {
        throw new Error('JSON file is empty');
      }
      
      // Parse JSON content
      const data = JSON.parse(content);
      
      // Validate that it's an object (not array or primitive)
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('JSON must contain an object with key-value pairs');
      }
      
      // Validate that object has at least one property
      if (Object.keys(data).length === 0) {
        throw new Error('JSON object cannot be empty');
      }
      
      // Validate data types and sanitize
      const sanitizedData = this.sanitizeJSONData(data);
      
      return sanitizedData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON format: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Sanitizes and validates JSON data values
   * @param {Object} data - Raw JSON data
   * @returns {Object} Sanitized data
   */
  static sanitizeJSONData(data) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Validate key
      if (typeof key !== 'string' || key.trim() === '') {
        continue; // Skip invalid keys
      }
      
      // Sanitize key (remove suspicious characters)
      const cleanKey = key.replace(/[<>'"&]/g, '').trim();
      if (cleanKey === '') {
        continue;
      }
      
      // Process value based on type
      if (value === null || value === undefined) {
        sanitized[cleanKey] = '';
      } else if (typeof value === 'string') {
        // Sanitize string values
        sanitized[cleanKey] = this.sanitizeStringValue(value);
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[cleanKey] = value.toString();
      } else if (typeof value === 'boolean') {
        sanitized[cleanKey] = value.toString();
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings
        sanitized[cleanKey] = value
          .filter(item => item !== null && item !== undefined)
          .map(item => this.sanitizeStringValue(String(item)))
          .join(', ');
      } else if (typeof value === 'object') {
        // Flatten nested objects (one level only)
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const combinedKey = `${cleanKey}_${nestedKey}`.replace(/[<>'"&]/g, '');
          if (nestedValue !== null && nestedValue !== undefined) {
            sanitized[combinedKey] = this.sanitizeStringValue(String(nestedValue));
          }
        }
      } else {
        // Convert other types to string
        sanitized[cleanKey] = this.sanitizeStringValue(String(value));
      }
    }
    
    return sanitized;
  }
  
  /**
   * Sanitizes string values to prevent XSS and other issues
   * @param {string} value - String value to sanitize
   * @returns {string} Sanitized string
   */
  static sanitizeStringValue(value) {
    if (typeof value !== 'string') {
      value = String(value);
    }
    
    // Remove or escape potentially dangerous characters
    return value
      .replace(/[<>'"&]/g, '') // Remove HTML/XML characters
      .replace(/\x00/g, '')    // Remove null bytes
      .trim()
      .substring(0, 1000);     // Limit length to prevent memory issues
  }  /**

   * Parses CSV file content with header detection and delimiter identification
   * @param {string} content - Raw CSV content
   * @returns {Object} Parsed CSV data as key-value pairs
   * @throws {Error} CSV parsing errors
   */
  static parseCSV(content) {
    try {
      if (!content || content.trim() === '') {
        throw new Error('CSV file is empty');
      }
      
      // Normalize line endings
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Detect delimiter
      const delimiter = this.detectCSVDelimiter(normalizedContent);
      
      // Split into lines
      const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }
      
      // Parse header row
      const headers = this.parseCSVRow(lines[0], delimiter);
      
      if (headers.length === 0) {
        throw new Error('CSV header row is empty or invalid');
      }
      
      // Validate headers
      const cleanHeaders = headers.map(header => {
        const clean = header.replace(/[<>'"&]/g, '').trim();
        if (clean === '') {
          throw new Error('CSV contains empty or invalid header names');
        }
        return clean;
      });
      
      // Parse data rows and create objects
      const dataObjects = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVRow(lines[i], delimiter);
        
        // Skip empty rows
        if (values.every(val => val.trim() === '')) {
          continue;
        }
        
        const rowData = {};
        for (let j = 0; j < cleanHeaders.length; j++) {
          const value = j < values.length ? values[j] : '';
          rowData[cleanHeaders[j]] = this.sanitizeStringValue(value);
        }
        
        dataObjects.push(rowData);
      }
      
      if (dataObjects.length === 0) {
        throw new Error('CSV contains no valid data rows');
      }
      
      // For form filling, we typically want the first row of data
      // But we'll merge all rows into a single object, with later rows overriding earlier ones
      const mergedData = {};
      dataObjects.forEach(row => {
        Object.assign(mergedData, row);
      });
      
      return mergedData;
    } catch (error) {
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Detects the delimiter used in CSV content
   * @param {string} content - CSV content
   * @returns {string} Detected delimiter
   */
  static detectCSVDelimiter(content) {
    const delimiters = [',', ';', '\t', '|'];
    const sampleLines = content.split('\n').slice(0, 5); // Check first 5 lines
    
    let bestDelimiter = ',';
    let maxCount = 0;
    
    for (const delimiter of delimiters) {
      let totalCount = 0;
      let consistent = true;
      let expectedCount = -1;
      
      for (const line of sampleLines) {
        if (line.trim() === '') continue;
        
        const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
        totalCount += count;
        
        if (expectedCount === -1) {
          expectedCount = count;
        } else if (count !== expectedCount && count > 0) {
          consistent = false;
        }
      }
      
      // Prefer delimiters that appear consistently and frequently
      if (consistent && totalCount > maxCount) {
        maxCount = totalCount;
        bestDelimiter = delimiter;
      }
    }
    
    return bestDelimiter;
  }
  
  /**
   * Parses a single CSV row, handling quoted values
   * @param {string} row - CSV row string
   * @param {string} delimiter - Delimiter character
   * @returns {string[]} Array of field values
   */
  static parseCSVRow(row, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = i < row.length - 1 ? row[i + 1] : '';
      
      if (!inQuotes) {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (char === delimiter) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      } else {
        if (char === quoteChar) {
          if (nextChar === quoteChar) {
            // Escaped quote
            current += char;
            i++; // Skip next character
          } else {
            // End of quoted section
            inQuotes = false;
            quoteChar = '';
          }
        } else {
          current += char;
        }
      }
    }
    
    // Add the last value
    values.push(current.trim());
    
    return values;
  }  /**

   * Parses TXT file content in key-value pair format
   * @param {string} content - Raw TXT content
   * @returns {Object} Parsed key-value pairs
   * @throws {Error} TXT parsing errors
   */
  static parseTXT(content) {
    try {
      if (!content || content.trim() === '') {
        throw new Error('TXT file is empty');
      }
      
      // Normalize line endings
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Split into lines and filter out empty lines
      const lines = normalizedContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#') && !line.startsWith('//'));
      
      if (lines.length === 0) {
        throw new Error('TXT file contains no valid key-value pairs');
      }
      
      const data = {};
      const errors = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        
        try {
          const parsed = this.parseTXTLine(line);
          if (parsed) {
            const { key, value } = parsed;
            data[key] = value;
          }
        } catch (error) {
          errors.push(`Line ${lineNumber}: ${error.message}`);
        }
      }
      
      // If we have some data but also errors, warn but continue
      if (errors.length > 0 && Object.keys(data).length === 0) {
        throw new Error(`No valid key-value pairs found. Errors:\n${errors.join('\n')}`);
      }
      
      if (Object.keys(data).length === 0) {
        throw new Error('No valid key-value pairs found in TXT file');
      }
      
      return data;
    } catch (error) {
      throw new Error(`TXT parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Parses a single line of TXT file for key-value pairs
   * @param {string} line - Single line from TXT file
   * @returns {Object|null} Parsed key-value pair or null if invalid
   */
  static parseTXTLine(line) {
    // Support multiple key-value separators
    const separators = [':', '=', '\t'];
    let separator = null;
    let separatorIndex = -1;
    
    // Find the first separator
    for (const sep of separators) {
      const index = line.indexOf(sep);
      if (index !== -1 && (separatorIndex === -1 || index < separatorIndex)) {
        separator = sep;
        separatorIndex = index;
      }
    }
    
    if (!separator || separatorIndex === -1) {
      throw new Error('No valid separator found (expected :, =, or tab)');
    }
    
    // Split on the first occurrence of the separator
    const key = line.substring(0, separatorIndex).trim();
    const value = line.substring(separatorIndex + 1).trim();
    
    if (key === '') {
      throw new Error('Key cannot be empty');
    }
    
    // Validate and sanitize key
    const cleanKey = key.replace(/[<>'"&]/g, '').trim();
    if (cleanKey === '') {
      throw new Error('Key contains only invalid characters');
    }
    
    // Handle quoted values
    let cleanValue = value;
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      cleanValue = value.slice(1, -1);
    }
    
    // Sanitize value
    cleanValue = this.sanitizeStringValue(cleanValue);
    
    return { key: cleanKey, value: cleanValue };
  }
  
  /**
   * Utility method to get supported file formats for error messages
   * @returns {string[]} Array of supported formats
   */
  static getSupportedFormats() {
    return [...this.ALLOWED_EXTENSIONS];
  }
  
  /**
   * Utility method to get maximum file size in human-readable format
   * @returns {string} Maximum file size
   */
  static getMaxFileSizeString() {
    return `${this.MAX_FILE_SIZE / (1024 * 1024)}MB`;
  }
}

// Export for use in other modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileParser;
}

// Make FileParser available globally for extension context
if (typeof window !== 'undefined') {
  window.FileParser = FileParser;
}