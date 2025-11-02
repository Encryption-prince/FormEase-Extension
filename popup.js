// Browser Extension Auto-Fill Popup JavaScript

// Browser compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class PopupController {
    constructor() {
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileStatus = document.getElementById('fileStatus');
        this.autofillBtn = document.getElementById('autofillBtn');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.messageContainer = document.getElementById('messageContainer');

        this.currentFile = null;
        this.userData = null;
        this.currentMappings = {};

        this.initializeEventListeners();
        this.loadStoredData();
    }

    initializeEventListeners() {
        // File upload events - browser-specific handling
        this.uploadArea.addEventListener('click', () => this.handleUploadClick());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // File removal
        document.getElementById('removeFile').addEventListener('click', this.removeFile.bind(this));

        // Auto-fill button
        this.autofillBtn.addEventListener('click', this.triggerAutoFill.bind(this));

        // Settings toggle
        this.settingsToggle.addEventListener('click', this.toggleSettings.bind(this));

        // Settings actions
        document.getElementById('saveMappings').addEventListener('click', this.saveMappings.bind(this));
        document.getElementById('resetMappings').addEventListener('click', this.resetMappings.bind(this));
        document.getElementById('addMappingBtn').addEventListener('click', this.addCustomMapping.bind(this));

        // Message close
        document.getElementById('messageClose').addEventListener('click', this.hideMessage.bind(this));

        // Keyboard navigation
        document.addEventListener('keydown', this.handleKeydown.bind(this));

        // Listen for storage changes to detect file uploads from background
        browserAPI.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.userData) {
                this.handleStorageDataChange(changes.userData);
            }
        });
    }

    async loadStoredData() {
        try {
            // Load stored data with timeout
            const result = await Promise.race([
                browserAPI.storage.local.get(['userData', 'fieldMappings']),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Storage access timeout')), 5000)
                )
            ]);

            if (result.userData && typeof result.userData === 'object') {
                const dataKeys = Object.keys(result.userData);
                if (dataKeys.length > 0) {
                    this.userData = result.userData;
                    this.updateFileStatus('Stored data', `${dataKeys.length} fields ready`);
                    this.autofillBtn.disabled = false;
                } else {
                    console.warn('Stored user data is empty');
                }
            }
        } catch (error) {
            console.error('Error loading stored data:', error);

            let userMessage = 'Error loading stored data';
            if (error.message.includes('timeout')) {
                userMessage = 'Storage access timed out. Please try again.';
            } else if (error.message.includes('QUOTA_EXCEEDED')) {
                userMessage = 'Storage quota exceeded. Please clear some data.';
            }

            this.showMessage(userMessage, 'error');

            // Reset UI state on error
            this.userData = null;
            this.autofillBtn.disabled = true;
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleUploadClick() {
        // Browser solution: Open dedicated upload window
        this.openUploadWindow();
    }

    async openUploadWindow() {
        try {
            // Send message to background script to open upload window
            await browserAPI.runtime.sendMessage({ action: 'openUploadWindow' });

            // Show feedback to user
            this.showMessage('Opening file upload window...', 'info');

            // Close popup after a short delay to avoid confusion
            setTimeout(() => {
                window.close();
            }, 1000);
        } catch (error) {
            console.error('Error opening upload window:', error);
            this.showMessage('Failed to open upload window. Please try again.', 'error');
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFileBrowser(file);
        }
    }

    handleStorageDataChange(change) {
        if (change.newValue && typeof change.newValue === 'object') {
            const dataKeys = Object.keys(change.newValue);
            if (dataKeys.length > 0) {
                this.userData = change.newValue;
                this.updateFileStatus('Uploaded file', `${dataKeys.length} fields loaded`);
                this.autofillBtn.disabled = false;
                this.showMessage('File uploaded successfully!', 'success');
            }
        }
    }

    async processFileBrowser(file) {
        try {
            // Convert file to base64 for sending to background script
            const fileData = await this.fileToBase64(file);

            // Send file data to background script for processing
            const response = await browserAPI.runtime.sendMessage({
                action: 'processFile',
                fileData: fileData,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });

            if (response.success) {
                // File processed successfully in background
                // UI will be updated via storage change listener
                console.log('File processed successfully');
            } else {
                throw new Error(response.error || 'File processing failed');
            }

            // Clear file input
            this.fileInput.value = '';

        } catch (error) {
            console.error('File processing error:', error);

            // Provide user-friendly error messages
            let userMessage = error.message;

            if (error.message.includes('File too large')) {
                userMessage = 'File is too large. Maximum size is 5MB.';
            } else if (error.message.includes('Unsupported file format')) {
                userMessage = 'Unsupported file format. Please use JSON, CSV, or TXT files.';
            } else if (error.message.includes('parsing failed')) {
                userMessage = 'File format is invalid or corrupted. Please check your file.';
            } else if (error.message.includes('storage')) {
                userMessage = 'Failed to save file data. Please try again or use a smaller file.';
            } else if (error.message.includes('timeout') || error.message.includes('Failed to load')) {
                userMessage = 'File processing timed out. Please try again.';
            }

            this.showMessage(userMessage, 'error');
            this.fileInput.value = '';

            // Reset UI state
            this.currentFile = null;
            this.userData = null;
            this.autofillBtn.disabled = true;
        }
    }

    async processFile(file) {
        // Fallback method for drag and drop
        return this.processFileBrowser(file);
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async parseFileWithProgress(file) {
        // Show parsing progress for larger files
        if (file.size > 1024 * 1024) { // 1MB
            this.showMessage('Processing large file, please wait...', 'info');
        }

        try {
            const parsedData = await Promise.race([
                FileParser.parse(file),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('File parsing timeout')), 30000)
                )
            ]);

            return parsedData;
        } catch (error) {
            if (error.message === 'File parsing timeout') {
                throw new Error('File is too complex or large to process. Please try a smaller file.');
            }
            throw error;
        }
    }

    updateFileStatus(filename, details) {
        document.getElementById('statusFilename').textContent = filename;
        document.getElementById('statusDetails').textContent = details;
        this.fileStatus.hidden = false;
        this.uploadArea.style.display = 'none';
    }

    removeFile() {
        this.currentFile = null;
        this.userData = null;
        this.autofillBtn.disabled = true;
        this.fileStatus.hidden = true;
        this.uploadArea.style.display = 'block';

        // Clear stored data
        browserAPI.storage.local.remove(['userData']);

        this.showMessage('File removed', 'info');
    }

    async triggerAutoFill() {
        if (!this.userData) {
            this.showMessage('Please upload a file first', 'error');
            return;
        }

        try {
            this.showAutoFillProgress('Triggering auto-fill...');

            // Disable button to prevent multiple clicks
            this.autofillBtn.disabled = true;

            // Send message to background script with timeout
            const response = await Promise.race([
                browserAPI.runtime.sendMessage({ action: 'triggerAutoFill' }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Auto-fill request timeout')), 10000)
                )
            ]);

            if (response && response.success) {
                const fieldsCount = response.results?.fieldsFilled || 0;
                this.showAutoFillProgress(`Filled ${fieldsCount} fields`, true);
                this.showMessage(`Successfully filled ${fieldsCount} form fields!`, 'success');
            } else {
                this.handleAutoFillError(response);
            }

        } catch (error) {
            console.error('Auto-fill error:', error);
            this.hideAutoFillProgress();
            this.handleAutoFillError({ error: error.message });
        } finally {
            // Re-enable button after a delay
            setTimeout(() => {
                this.autofillBtn.disabled = false;
            }, 2000);
        }
    }

    handleAutoFillError(response) {
        const error = response?.error || 'Auto-fill failed';
        const errorType = response?.errorType;
        let userMessage = error;
        let suggestion = '';

        switch (errorType) {
            case 'NO_ACTIVE_TAB':
                userMessage = 'No active tab found. Please make sure you have a webpage open.';
                break;
            case 'RESTRICTED_PAGE':
                userMessage = 'Auto-fill is not available on this page due to browser security restrictions.';
                suggestion = 'Try using the extension on a regular website.';
                break;
            case 'CONTENT_SCRIPT_NOT_AVAILABLE':
                userMessage = 'Page not ready for auto-fill. Please refresh the page and try again.';
                suggestion = 'Make sure the extension has permission to access this site.';
                break;
            case 'NO_DATA':
                userMessage = 'No data available for auto-fill. Please upload a file first.';
                break;
            case 'STORAGE_ERROR':
                userMessage = 'Failed to access stored data. Please try uploading your file again.';
                break;
            case 'TIMEOUT_ERROR':
                userMessage = 'Auto-fill timed out. The page may be slow to respond.';
                suggestion = 'Try again or refresh the page.';
                break;
            case 'PERMISSION_DENIED':
                userMessage = 'Permission denied. The extension cannot access this page.';
                suggestion = 'Check extension permissions in browser settings.';
                break;
            default:
                if (error.includes('Could not establish connection') ||
                    error.includes('Receiving end does not exist')) {
                    userMessage = 'Page not ready for auto-fill. Please refresh the page and try again.';
                } else if (error.includes('timeout')) {
                    userMessage = 'Auto-fill timed out. Please try again.';
                } else if (error.includes('permission')) {
                    userMessage = 'Permission denied. Check if the extension can access this page.';
                }
        }

        this.showMessage(userMessage, 'error');

        if (suggestion && response?.suggestion) {
            // Show additional suggestion after a delay
            setTimeout(() => {
                this.showMessage(response.suggestion, 'info');
            }, 3000);
        }
    }

    showAutoFillProgress(message, complete = false) {
        const statusElement = document.getElementById('autofillStatus');
        const messageElement = document.getElementById('statusMessage');
        const progressElement = document.getElementById('statusProgress');
        const progressFill = document.getElementById('progressFill');

        statusElement.hidden = false;
        messageElement.textContent = message;

        if (complete) {
            progressElement.hidden = true;
            setTimeout(() => this.hideAutoFillProgress(), 3000);
        } else {
            progressElement.hidden = false;
            progressFill.style.width = '100%';
        }
    }

    hideAutoFillProgress() {
        document.getElementById('autofillStatus').hidden = true;
        document.getElementById('progressFill').style.width = '0%';
    }

    toggleSettings() {
        const isHidden = this.settingsPanel.hidden;
        this.settingsPanel.hidden = !isHidden;
        this.settingsToggle.classList.toggle('active', !isHidden);

        if (!isHidden) {
            this.loadFieldMappings();
            // Disable save button initially
            document.getElementById('saveMappings').disabled = true;
        }
    }

    async loadFieldMappings() {
        try {
            const result = await browserAPI.storage.local.get(['fieldMappings']);
            this.currentMappings = result.fieldMappings || this.getDefaultMappings();

            this.renderMappings();

        } catch (error) {
            console.error('Error loading field mappings:', error);
            this.showMessage('Error loading field mappings', 'error');
        }
    }

    renderMappings() {
        const mappingsList = document.getElementById('mappingsList');
        mappingsList.innerHTML = '';

        Object.entries(this.currentMappings).forEach(([fieldType, aliases]) => {
            const mappingItem = this.createMappingItem(fieldType, aliases);
            mappingsList.appendChild(mappingItem);
        });
    }

    createMappingItem(fieldType, aliases) {
        const mappingItem = document.createElement('div');
        mappingItem.className = 'mapping-item';
        mappingItem.dataset.fieldType = fieldType;

        mappingItem.innerHTML = `
            <div class="mapping-header">
                <div class="mapping-label">
                    <input type="text" value="${fieldType}" readonly>
                </div>
                <button class="mapping-remove" title="Remove mapping">×</button>
            </div>
            <div class="mapping-aliases">
                <div class="mapping-aliases-display">${aliases.join(', ')}</div>
                <textarea class="mapping-aliases-input" placeholder="Enter aliases separated by commas">${aliases.join(', ')}</textarea>
                <div class="mapping-aliases-help">Enter field names that should map to this data field, separated by commas</div>
            </div>
        `;

        // Add event listeners
        const removeBtn = mappingItem.querySelector('.mapping-remove');
        const aliasesDisplay = mappingItem.querySelector('.mapping-aliases-display');
        const aliasesInput = mappingItem.querySelector('.mapping-aliases-input');
        const labelInput = mappingItem.querySelector('.mapping-label input');

        // Remove mapping
        removeBtn.addEventListener('click', () => {
            this.removeMappingItem(fieldType);
        });

        // Edit aliases on click
        aliasesDisplay.addEventListener('click', () => {
            this.editMappingItem(mappingItem);
        });

        // Save on blur or enter
        aliasesInput.addEventListener('blur', () => {
            this.saveMappingItem(mappingItem);
        });

        aliasesInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                aliasesInput.blur();
            }
            if (e.key === 'Escape') {
                this.cancelMappingEdit(mappingItem);
            }
        });

        // Handle label editing for custom mappings
        if (!this.getDefaultMappings().hasOwnProperty(fieldType)) {
            labelInput.removeAttribute('readonly');
            labelInput.addEventListener('blur', () => {
                this.updateMappingFieldType(mappingItem, labelInput.value);
            });
        }

        return mappingItem;
    }

    editMappingItem(mappingItem) {
        mappingItem.classList.add('editing');
        const aliasesInput = mappingItem.querySelector('.mapping-aliases-input');
        aliasesInput.focus();
        aliasesInput.select();
    }

    saveMappingItem(mappingItem) {
        const fieldType = mappingItem.dataset.fieldType;
        const aliasesInput = mappingItem.querySelector('.mapping-aliases-input');
        const aliasesDisplay = mappingItem.querySelector('.mapping-aliases-display');

        const newAliases = aliasesInput.value
            .split(',')
            .map(alias => alias.trim())
            .filter(alias => alias.length > 0);

        if (newAliases.length === 0) {
            this.showMessage('At least one alias is required', 'error');
            aliasesInput.focus();
            return;
        }

        // Update current mappings
        this.currentMappings[fieldType] = newAliases;

        // Update display
        aliasesDisplay.textContent = newAliases.join(', ');
        mappingItem.classList.remove('editing');

        // Enable save button
        this.enableSaveButton();
    }

    cancelMappingEdit(mappingItem) {
        const fieldType = mappingItem.dataset.fieldType;
        const aliasesInput = mappingItem.querySelector('.mapping-aliases-input');

        // Restore original value
        aliasesInput.value = this.currentMappings[fieldType].join(', ');
        mappingItem.classList.remove('editing');
    }

    updateMappingFieldType(mappingItem, newFieldType) {
        const oldFieldType = mappingItem.dataset.fieldType;

        if (newFieldType === oldFieldType || !newFieldType.trim()) {
            return;
        }

        // Check if new field type already exists
        if (this.currentMappings.hasOwnProperty(newFieldType)) {
            this.showMessage('Field type already exists', 'error');
            mappingItem.querySelector('.mapping-label input').value = oldFieldType;
            return;
        }

        // Update mappings
        this.currentMappings[newFieldType] = this.currentMappings[oldFieldType];
        delete this.currentMappings[oldFieldType];

        // Update dataset
        mappingItem.dataset.fieldType = newFieldType;

        this.enableSaveButton();
    }

    removeMappingItem(fieldType) {
        if (this.getDefaultMappings().hasOwnProperty(fieldType)) {
            this.showMessage('Cannot remove default field mappings', 'error');
            return;
        }

        delete this.currentMappings[fieldType];
        this.renderMappings();
        this.enableSaveButton();
    }

    addCustomMapping() {
        const newFieldType = prompt('Enter the name for the new data field:');

        if (!newFieldType || !newFieldType.trim()) {
            return;
        }

        const fieldType = newFieldType.trim();

        if (this.currentMappings.hasOwnProperty(fieldType)) {
            this.showMessage('Field type already exists', 'error');
            return;
        }

        // Add new mapping with empty aliases
        this.currentMappings[fieldType] = [];

        // Re-render and edit the new item
        this.renderMappings();

        // Find and edit the new item
        const newItem = document.querySelector(`[data-field-type="${fieldType}"]`);
        if (newItem) {
            this.editMappingItem(newItem);
        }

        this.enableSaveButton();
    }

    enableSaveButton() {
        const saveBtn = document.getElementById('saveMappings');
        saveBtn.disabled = false;
    }

    async saveMappings() {
        try {
            // Validate mappings
            const validationResult = this.validateMappings();
            if (!validationResult.valid) {
                this.showMessage(validationResult.error, 'error');
                return;
            }

            // Save to storage
            await browserAPI.storage.local.set({ fieldMappings: this.currentMappings });

            // Disable save button
            document.getElementById('saveMappings').disabled = true;

            this.showMessage('Field mappings saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving mappings:', error);
            this.showMessage('Error saving field mappings', 'error');
        }
    }

    validateMappings() {
        for (const [fieldType, aliases] of Object.entries(this.currentMappings)) {
            if (!fieldType.trim()) {
                return { valid: false, error: 'Field type cannot be empty' };
            }

            if (!Array.isArray(aliases) || aliases.length === 0) {
                return { valid: false, error: `Field type "${fieldType}" must have at least one alias` };
            }

            // Check for empty aliases
            if (aliases.some(alias => !alias.trim())) {
                return { valid: false, error: `Field type "${fieldType}" contains empty aliases` };
            }
        }

        return { valid: true };
    }

    getDefaultMappings() {
        return {
            firstName: ['firstName', 'fname', 'given_name', 'first_name', 'firstname', 'first-name'],
            lastName: ['lastName', 'lname', 'surname', 'last_name', 'lastname', 'last-name'],
            email: ['email', 'email_address', 'e_mail', 'e-mail', 'mail'],
            phone: ['phone', 'telephone', 'tel', 'phone_number', 'mobile', 'cell'],
            street: ['street', 'address', 'address1', 'street_address', 'addr1'],
            city: ['city', 'town', 'locality'],
            state: ['state', 'province', 'region'],
            zipCode: ['zipCode', 'zip', 'postal_code', 'postcode', 'zip_code', 'postal'],
            country: ['country', 'nation', 'country_name'],
            company: ['company', 'organization', 'employer'],
            website: ['website', 'url', 'homepage'],
            dateOfBirth: ['dateOfBirth', 'dob', 'birthDate', 'birth_date']
        };
    }

    async resetMappings() {
        if (!confirm('Are you sure you want to reset all field mappings to defaults? This will remove any custom mappings you have created.')) {
            return;
        }

        try {
            const defaultMappings = this.getDefaultMappings();
            await browserAPI.storage.local.set({ fieldMappings: defaultMappings });

            // Update current mappings and re-render
            this.currentMappings = { ...defaultMappings };
            this.renderMappings();

            // Disable save button since we're now in sync
            document.getElementById('saveMappings').disabled = true;

            this.showMessage('Field mappings reset to defaults', 'success');
        } catch (error) {
            console.error('Error resetting mappings:', error);
            this.showMessage('Error resetting mappings', 'error');
        }
    }

    showMessage(text, type = 'info') {
        const messageElement = document.getElementById('message');
        const messageText = document.getElementById('messageText');
        const messageIcon = document.getElementById('messageIcon');

        messageText.textContent = text;
        messageElement.className = `message ${type}`;

        // Set appropriate icon
        switch (type) {
            case 'success':
                messageIcon.textContent = '✓';
                break;
            case 'error':
                messageIcon.textContent = '⚠';
                break;
            case 'info':
            default:
                messageIcon.textContent = 'ℹ';
                break;
        }

        this.messageContainer.hidden = false;

        // Auto-hide after 5 seconds
        setTimeout(() => this.hideMessage(), 5000);
    }

    hideMessage() {
        this.messageContainer.hidden = true;
    }

    handleKeydown(e) {
        // ESC key closes message or settings
        if (e.key === 'Escape') {
            if (!this.messageContainer.hidden) {
                this.hideMessage();
            } else if (!this.settingsPanel.hidden) {
                this.toggleSettings();
            }
        }

        // Enter key on upload area triggers file selection
        if (e.key === 'Enter' && e.target === this.uploadArea) {
            this.fileInput.click();
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});