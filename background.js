// Background script for Browser Auto-Fill Extension
console.log('Browser Auto-Fill Extension background script loaded');

// Browser compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Storage management class
class StorageManager {
    // Storage keys
    static KEYS = {
        USER_DATA: 'userData',
        FIELD_MAPPINGS: 'fieldMappings',
        SETTINGS: 'settings'
    };

    // Default field mappings based on design document
    static DEFAULT_FIELD_MAPPINGS = {
        "firstName": ["firstName", "fname", "given_name", "first", "givenName"],
        "lastName": ["lastName", "lname", "surname", "last", "familyName"],
        "email": ["email", "email_address", "e_mail", "emailAddress"],
        "phone": ["phone", "telephone", "tel", "phoneNumber", "mobile", "phone_number"],
        "street": ["street", "address", "address1", "streetAddress", "street_address"],
        "city": ["city", "locality", "town"],
        "state": ["state", "region", "province", "stateProvince"],
        "zipCode": ["zipCode", "zip", "postalCode", "postal_code", "zip_code"],
        "country": ["country", "countryName"],
        "company": ["company", "organization", "employer"],
        "website": ["website", "url", "homepage"],
        "dateOfBirth": ["dateOfBirth", "dob", "birthDate", "date of birth", "birth date"],
        "fullName": ["fullName", "full_name", "full name", "name", "your name", "complete name"],
        "gender": ["gender", "sex"],
        "mobile": ["mobile", "mobile_number", "mobile number", "cell", "cellular"],
        "linkedIn": ["linkedIn", "linkedin", "linkedin_profile", "linkedin profile"],
        "jobTitle": ["jobTitle", "job_title", "position"],
        "department": ["department", "dept"],
        "workPhone": ["workPhone", "work_phone", "businessPhone"],
        "comments": ["comments", "notes", "remarks"],
        "bio": ["bio", "biography", "about"]
    };

    // Default settings
    static DEFAULT_SETTINGS = {
        autoHighlight: true,
        animationSpeed: 300
    };

    // Store user data from uploaded file
    static async storeUserData(userData) {
        try {
            await browserAPI.storage.local.set({
                [this.KEYS.USER_DATA]: userData
            });
            console.log('User data stored successfully');
            return { success: true };
        } catch (error) {
            console.error('Error storing user data:', error);
            return { success: false, error: error.message };
        }
    }

    // Retrieve user data
    static async getUserData() {
        try {
            const result = await browserAPI.storage.local.get([this.KEYS.USER_DATA]);
            return { success: true, data: result[this.KEYS.USER_DATA] || {} };
        } catch (error) {
            console.error('Error retrieving user data:', error);
            return { success: false, error: error.message };
        }
    }

    // Store custom field mappings
    static async storeFieldMappings(mappings) {
        try {
            await browserAPI.storage.local.set({
                [this.KEYS.FIELD_MAPPINGS]: mappings
            });
            console.log('Field mappings stored successfully');
            return { success: true };
        } catch (error) {
            console.error('Error storing field mappings:', error);
            return { success: false, error: error.message };
        }
    }

    // Retrieve field mappings (returns defaults if none stored)
    static async getFieldMappings() {
        try {
            const result = await browserAPI.storage.local.get([this.KEYS.FIELD_MAPPINGS]);
            const mappings = result[this.KEYS.FIELD_MAPPINGS] || this.DEFAULT_FIELD_MAPPINGS;
            return { success: true, data: mappings };
        } catch (error) {
            console.error('Error retrieving field mappings:', error);
            return { success: false, error: error.message };
        }
    }

    // Store settings
    static async storeSettings(settings) {
        try {
            await browserAPI.storage.local.set({
                [this.KEYS.SETTINGS]: settings
            });
            console.log('Settings stored successfully');
            return { success: true };
        } catch (error) {
            console.error('Error storing settings:', error);
            return { success: false, error: error.message };
        }
    }

    // Retrieve settings (returns defaults if none stored)
    static async getSettings() {
        try {
            const result = await browserAPI.storage.local.get([this.KEYS.SETTINGS]);
            const settings = result[this.KEYS.SETTINGS] || this.DEFAULT_SETTINGS;
            return { success: true, data: settings };
        } catch (error) {
            console.error('Error retrieving settings:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear all stored data (for cleanup)
    static async clearAllData() {
        try {
            await browserAPI.storage.local.clear();
            console.log('All data cleared successfully');
            return { success: true };
        } catch (error) {
            console.error('Error clearing data:', error);
            return { success: false, error: error.message };
        }
    }

    // Get storage usage information
    static async getStorageInfo() {
        try {
            const usage = await browserAPI.storage.local.getBytesInUse();
            const quota = browserAPI.storage.local.QUOTA_BYTES || 5242880; // 5MB default
            return {
                success: true,
                data: {
                    used: usage,
                    quota: quota,
                    available: quota - usage,
                    percentUsed: (usage / quota) * 100
                }
            };
        } catch (error) {
            console.error('Error getting storage info:', error);
            return { success: false, error: error.message };
        }
    }

    // Handle storage quota exceeded
    static async handleQuotaExceeded() {
        try {
            console.warn('Storage quota exceeded, attempting cleanup');
            // Clear old user data but keep settings and mappings
            await browserAPI.storage.local.remove([this.KEYS.USER_DATA]);
            return { success: true, message: 'Storage cleaned up successfully' };
        } catch (error) {
            console.error('Error during storage cleanup:', error);
            return { success: false, error: error.message };
        }
    }
}

// Message handling system
class MessageHandler {
    // Handle messages from popup and content scripts
    static async handleMessage(message, sender, sendResponse) {
        try {
            console.log('Received message:', message.action, 'from:', sender.tab ? 'content script' : 'popup');

            // Validate message structure
            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message format');
            }

            if (!message.action || typeof message.action !== 'string') {
                throw new Error('Message action is required and must be a string');
            }

            switch (message.action) {
                case 'uploadFile':
                    return await this.handleFileUpload(message);

                case 'processFile':
                    return await this.handleFileProcessing(message);

                case 'openUploadWindow':
                    return await this.handleOpenUploadWindow();

                case 'getUserData':
                    return await StorageManager.getUserData();

                case 'getFieldMappings':
                    return await StorageManager.getFieldMappings();

                case 'updateFieldMappings':
                    if (!message.mappings || typeof message.mappings !== 'object') {
                        throw new Error('Field mappings data is required');
                    }
                    return await StorageManager.storeFieldMappings(message.mappings);

                case 'getSettings':
                    return await StorageManager.getSettings();

                case 'updateSettings':
                    if (!message.settings || typeof message.settings !== 'object') {
                        throw new Error('Settings data is required');
                    }
                    return await StorageManager.storeSettings(message.settings);

                case 'triggerAutoFill':
                    return await this.handleAutoFillTrigger(sender);

                case 'getStorageInfo':
                    return await StorageManager.getStorageInfo();

                case 'clearData':
                    return await StorageManager.clearAllData();

                default:
                    console.warn('Unknown message action:', message.action);
                    return {
                        success: false,
                        error: `Unknown action: ${message.action}`,
                        errorType: 'UNKNOWN_ACTION'
                    };
            }
        } catch (error) {
            console.error('Error handling message:', error);

            // Categorize error types for better user feedback
            let errorType = 'GENERAL_ERROR';
            let userMessage = error.message;

            if (error.message.includes('storage')) {
                errorType = 'STORAGE_ERROR';
                userMessage = 'Storage operation failed. Please try again.';
            } else if (error.message.includes('permission')) {
                errorType = 'PERMISSION_ERROR';
                userMessage = 'Permission denied. Please check extension permissions.';
            } else if (error.message.includes('connection')) {
                errorType = 'CONNECTION_ERROR';
                userMessage = 'Connection failed. Please refresh the page and try again.';
            }

            return {
                success: false,
                error: userMessage,
                errorType: errorType,
                originalError: error.message
            };
        }
    }

    // Handle file upload from popup
    static async handleFileUpload(message) {
        try {
            const { fileData, fileType } = message;

            if (!fileData) {
                return { success: false, error: 'No file data provided' };
            }

            // Store the parsed file data
            const result = await StorageManager.storeUserData(fileData);

            if (result.success) {
                console.log(`${fileType.toUpperCase()} file uploaded and stored successfully`);
                return {
                    success: true,
                    message: `${fileType.toUpperCase()} file uploaded successfully`,
                    dataKeys: Object.keys(fileData)
                };
            } else {
                return result;
            }
        } catch (error) {
            console.error('Error handling file upload:', error);
            return { success: false, error: error.message };
        }
    }

    // Handle file processing from popup (browser-specific)
    static async handleFileProcessing(message) {
        try {
            const { fileData, fileName, fileSize, fileType } = message;

            if (!fileData) {
                return { success: false, error: 'No file data provided' };
            }

            // Validate file size (5MB limit)
            if (fileSize > 5 * 1024 * 1024) {
                return { success: false, error: 'File too large. Maximum size is 5MB.' };
            }

            // Convert base64 back to file content
            const base64Data = fileData.split(',')[1];
            const fileContent = atob(base64Data);

            // Determine file extension
            const extension = this.getFileExtension(fileName);
            if (!['json', 'csv', 'txt'].includes(extension)) {
                return { success: false, error: 'Unsupported file format. Use JSON, CSV, or TXT files.' };
            }

            // Parse the file content
            const parsedData = await this.parseFileContent(fileContent, extension);

            if (!parsedData || typeof parsedData !== 'object' || Object.keys(parsedData).length === 0) {
                return { success: false, error: 'No valid data found in file' };
            }

            // Store the parsed data
            const result = await StorageManager.storeUserData(parsedData);

            if (result.success) {
                console.log(`${extension.toUpperCase()} file processed and stored successfully`);
                return {
                    success: true,
                    message: `File processed successfully`,
                    dataKeys: Object.keys(parsedData)
                };
            } else {
                return result;
            }
        } catch (error) {
            console.error('Error processing file:', error);
            return { success: false, error: error.message };
        }
    }

    // Get file extension
    static getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // Parse file content based on extension
    static async parseFileContent(content, extension) {
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
    }

    // Simple JSON parser
    static parseJSON(content) {
        try {
            const data = JSON.parse(content);
            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                throw new Error('JSON must contain an object with key-value pairs');
            }
            return this.sanitizeData(data);
        } catch (error) {
            throw new Error(`Invalid JSON format: ${error.message}`);
        }
    }

    // Simple CSV parser
    static parseCSV(content) {
        try {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                throw new Error('CSV must have header and data rows');
            }

            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const values = lines[1].split(',').map(v => v.trim().replace(/"/g, ''));

            const data = {};
            headers.forEach((header, index) => {
                if (header && values[index]) {
                    data[header] = values[index];
                }
            });

            return this.sanitizeData(data);
        } catch (error) {
            throw new Error(`CSV parsing failed: ${error.message}`);
        }
    }

    // Simple TXT parser
    static parseTXT(content) {
        try {
            const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
            const data = {};

            lines.forEach(line => {
                const colonIndex = line.indexOf(':');
                const equalIndex = line.indexOf('=');
                const separatorIndex = colonIndex !== -1 ? colonIndex : equalIndex;

                if (separatorIndex !== -1) {
                    const key = line.substring(0, separatorIndex).trim();
                    const value = line.substring(separatorIndex + 1).trim();
                    if (key && value) {
                        data[key] = value;
                    }
                }
            });

            return this.sanitizeData(data);
        } catch (error) {
            throw new Error(`TXT parsing failed: ${error.message}`);
        }
    }

    // Sanitize parsed data
    static sanitizeData(data) {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            const cleanKey = key.replace(/[<>'"&]/g, '').trim();
            const cleanValue = String(value).replace(/[<>'"&]/g, '').trim().substring(0, 1000);
            if (cleanKey && cleanValue) {
                sanitized[cleanKey] = cleanValue;
            }
        }
        return sanitized;
    }

    // Handle opening upload window (browser solution)
    static async handleOpenUploadWindow() {
        try {
            // Create a new popup window for file upload
            const window = await browserAPI.windows.create({
                url: browserAPI.runtime.getURL('upload.html'),
                type: 'popup',
                width: 600,
                height: 700,
                focused: true
            });

            console.log('Upload window opened:', window.id);

            return {
                success: true,
                message: 'Upload window opened successfully',
                windowId: window.id
            };
        } catch (error) {
            console.error('Error opening upload window:', error);
            return {
                success: false,
                error: `Failed to open upload window: ${error.message}`
            };
        }
    }

    // Handle auto-fill trigger from popup
    static async handleAutoFillTrigger(sender) {
        try {
            // Get current active tab with timeout
            const tabs = await Promise.race([
                browserAPI.tabs.query({ active: true, currentWindow: true }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Tab query timeout')), 5000)
                )
            ]);

            if (!tabs || tabs.length === 0) {
                return {
                    success: false,
                    error: 'No active tab found',
                    errorType: 'NO_ACTIVE_TAB'
                };
            }

            const activeTab = tabs[0];

            // Check if tab URL is restricted
            if (this.isRestrictedPage(activeTab.url)) {
                return {
                    success: false,
                    error: 'Auto-fill is not available on this page due to browser security restrictions',
                    errorType: 'RESTRICTED_PAGE'
                };
            }

            // Get user data and field mappings with error handling
            const [userDataResult, mappingsResult, settingsResult] = await Promise.allSettled([
                StorageManager.getUserData(),
                StorageManager.getFieldMappings(),
                StorageManager.getSettings()
            ]);

            // Check for storage errors
            if (userDataResult.status === 'rejected') {
                throw new Error(`Failed to retrieve user data: ${userDataResult.reason.message}`);
            }
            if (mappingsResult.status === 'rejected') {
                throw new Error(`Failed to retrieve field mappings: ${mappingsResult.reason.message}`);
            }
            if (settingsResult.status === 'rejected') {
                throw new Error(`Failed to retrieve settings: ${settingsResult.reason.message}`);
            }

            const userData = userDataResult.value;
            const mappings = mappingsResult.value;
            const settings = settingsResult.value;

            if (!userData.success || !mappings.success || !settings.success) {
                const errors = [
                    !userData.success && userData.error,
                    !mappings.success && mappings.error,
                    !settings.success && settings.error
                ].filter(Boolean);

                return {
                    success: false,
                    error: `Storage errors: ${errors.join(', ')}`,
                    errorType: 'STORAGE_ERROR'
                };
            }

            if (!userData.data || Object.keys(userData.data).length === 0) {
                return {
                    success: false,
                    error: 'No user data available. Please upload a file first.',
                    errorType: 'NO_DATA'
                };
            }

            // Send message to content script with timeout and retry logic
            try {
                const response = await this.sendMessageWithRetry(activeTab.id, {
                    action: 'performAutoFill',
                    userData: userData.data,
                    fieldMappings: mappings.data,
                    settings: settings.data
                }, 3, 2000);

                return response || { success: true, message: 'Auto-fill triggered successfully' };
            } catch (error) {
                return this.handleContentScriptError(error, activeTab);
            }
        } catch (error) {
            console.error('Error handling auto-fill trigger:', error);

            let errorType = 'GENERAL_ERROR';
            let userMessage = error.message;

            if (error.message.includes('timeout')) {
                errorType = 'TIMEOUT_ERROR';
                userMessage = 'Operation timed out. Please try again.';
            } else if (error.message.includes('storage')) {
                errorType = 'STORAGE_ERROR';
                userMessage = 'Failed to access stored data. Please try again.';
            }

            return {
                success: false,
                error: userMessage,
                errorType: errorType
            };
        }
    }

    // Check if page URL is restricted
    static isRestrictedPage(url) {
        if (!url) return true;

        const restrictedPatterns = [
            /^chrome:\/\//,
            /^chrome-extension:\/\//,
            /^moz-extension:\/\//,
            /^edge:\/\//,
            /^about:/,
            /^data:/,
            /^javascript:/
        ];

        return restrictedPatterns.some(pattern => pattern.test(url));
    }

    // Send message with retry logic
    static async sendMessageWithRetry(tabId, message, maxRetries = 3, timeout = 2000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await Promise.race([
                    browserAPI.tabs.sendMessage(tabId, message),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Message timeout')), timeout)
                    )
                ]);

                return response;
            } catch (error) {
                lastError = error;
                console.warn(`Message attempt ${attempt} failed:`, error.message);

                if (attempt < maxRetries) {
                    // Wait before retry with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, attempt * 500));
                }
            }
        }

        throw lastError;
    }

    // Handle content script specific errors
    static handleContentScriptError(error, activeTab) {
        console.error('Content script error:', error);

        if (error.message.includes('Could not establish connection') ||
            error.message.includes('Receiving end does not exist')) {
            return {
                success: false,
                error: 'Content script not available. Please refresh the page and try again.',
                errorType: 'CONTENT_SCRIPT_NOT_AVAILABLE',
                suggestion: 'Try refreshing the page or check if the extension has permission to access this site.'
            };
        }

        if (error.message.includes('timeout') || error.message.includes('Message timeout')) {
            return {
                success: false,
                error: 'Page is not responding. Please try again or refresh the page.',
                errorType: 'PAGE_TIMEOUT'
            };
        }

        if (error.message.includes('permission')) {
            return {
                success: false,
                error: 'Permission denied. The extension may not have access to this page.',
                errorType: 'PERMISSION_DENIED',
                suggestion: 'Check extension permissions in browser settings.'
            };
        }

        return {
            success: false,
            error: 'Failed to communicate with page. Please refresh and try again.',
            errorType: 'COMMUNICATION_ERROR'
        };
    }
}

// Set up message listener
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle async responses properly
    MessageHandler.handleMessage(message, sender, sendResponse)
        .then(response => {
            sendResponse(response);
        })
        .catch(error => {
            console.error('Message handler error:', error);
            sendResponse({ success: false, error: error.message });
        });

    // Return true to indicate we will send a response asynchronously
    return true;
});

// Handle extension lifecycle events
browserAPI.runtime.onStartup.addListener(() => {
    console.log('Extension startup');
});

if (browserAPI.runtime.onSuspend) {
    browserAPI.runtime.onSuspend.addListener(() => {
        console.log('Extension suspending');
    });
}

// Handle tab updates for content script injection (browser uses different approach)
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only inject when page is completely loaded
    if (changeInfo.status === 'complete' && tab.url && !MessageHandler.isRestrictedPage(tab.url)) {
        try {
            // Check if we have user data before injecting
            const userDataResult = await StorageManager.getUserData();

            if (userDataResult.success && Object.keys(userDataResult.data).length > 0) {
                // Check if content script is already injected
                try {
                    await browserAPI.tabs.sendMessage(tabId, { action: 'ping' });
                    // If we get here, content script is already present
                    return;
                } catch (pingError) {
                    // Content script not present, but it's automatically injected via manifest
                    // So we don't need to manually inject it
                    console.log(`Content script will be automatically available for tab ${tabId}`);
                }
            }
        } catch (error) {
            // Handle storage or other errors
            if (error.message.includes('storage')) {
                console.warn('Storage error during content script check:', error.message);
            } else {
                console.warn(`Unexpected error during content script check for tab ${tabId}:`, error.message);
            }
        }
    }
});

// Initialize extension on install
browserAPI.runtime.onInstalled.addListener(async () => {
    console.log('Browser extension installed');

    // Initialize default settings and mappings if not present
    try {
        const settingsResult = await StorageManager.getSettings();
        const mappingsResult = await StorageManager.getFieldMappings();

        if (settingsResult.success && mappingsResult.success) {
            console.log('Browser extension initialized with default settings');
        }
    } catch (error) {
        console.error('Error initializing browser extension:', error);
    }
});