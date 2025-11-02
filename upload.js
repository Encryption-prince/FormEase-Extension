// Upload page JavaScript for Browser Auto-Fill Extension

// Browser compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class UploadPageController {
    constructor() {
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileStatus = document.getElementById('fileStatus');
        this.messageElement = document.getElementById('message');
        this.closeBtn = document.getElementById('closeBtn');
        this.uploadAnotherBtn = document.getElementById('uploadAnotherBtn');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Button events
        this.closeBtn.addEventListener('click', this.closeWindow.bind(this));
        this.uploadAnotherBtn.addEventListener('click', this.resetUpload.bind(this));

        // Keyboard events
        document.addEventListener('keydown', this.handleKeydown.bind(this));
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

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    async processFile(file) {
        try {
            this.showMessage('Processing file...', 'info');

            // Validate file before processing
            if (!file) {
                throw new Error('No file selected');
            }

            if (file.size === 0) {
                throw new Error('Selected file is empty');
            }

            if (file.size > 5 * 1024 * 1024) {
                throw new Error('File too large. Maximum size is 5MB.');
            }

            // Check file extension
            const extension = file.name.split('.').pop().toLowerCase();
            if (!['json', 'csv', 'txt'].includes(extension)) {
                throw new Error('Unsupported file format. Please use JSON, CSV, or TXT files.');
            }

            // Check if FileParser is available
            if (typeof FileParser === 'undefined') {
                throw new Error('FileParser not available. Please reload the extension.');
            }

            // Parse the file
            const parsedData = await this.parseFileWithProgress(file);

            // Validate parsed data
            if (!parsedData || typeof parsedData !== 'object') {
                throw new Error('File parsing returned invalid data');
            }

            if (Object.keys(parsedData).length === 0) {
                throw new Error('No valid data found in file');
            }

            // Store the data
            await browserAPI.storage.local.set({ userData: parsedData });

            // Update UI
            this.updateFileStatus(file.name, `${Object.keys(parsedData).length} fields loaded`);
            this.showMessage('File uploaded successfully! You can now close this window and use auto-fill.', 'success');
            
            // Show upload another button
            this.uploadAnotherBtn.style.display = 'inline-flex';
            this.closeBtn.textContent = 'Done';

            // Clear file input
            this.fileInput.value = '';

            // Auto-close after 3 seconds (optional)
            setTimeout(() => {
                this.showMessage('Auto-closing in 3 seconds... Click "Done" to close now.', 'info');
                setTimeout(() => {
                    this.closeWindow();
                }, 3000);
            }, 2000);

        } catch (error) {
            console.error('File processing error:', error);
            this.showMessage(error.message, 'error');
            this.fileInput.value = '';
        }
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
        this.fileStatus.classList.add('show');
        this.uploadArea.style.display = 'none';
    }

    resetUpload() {
        this.fileStatus.classList.remove('show');
        this.uploadArea.style.display = 'block';
        this.uploadAnotherBtn.style.display = 'none';
        this.closeBtn.textContent = 'Close';
        this.hideMessage();
    }

    showMessage(text, type = 'info') {
        const messageText = document.getElementById('messageText');
        const messageIcon = document.getElementById('messageIcon');

        messageText.textContent = text;
        this.messageElement.className = `message ${type} show`;

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

        // Auto-hide error messages after 5 seconds
        if (type === 'error') {
            setTimeout(() => this.hideMessage(), 5000);
        }
    }

    hideMessage() {
        this.messageElement.classList.remove('show');
    }

    closeWindow() {
        // Close the popup window
        window.close();
    }

    handleKeydown(e) {
        // ESC key closes window
        if (e.key === 'Escape') {
            this.closeWindow();
        }

        // Enter key on upload area triggers file selection
        if (e.key === 'Enter' && e.target === this.uploadArea) {
            this.fileInput.click();
        }
    }
}

// Initialize upload page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new UploadPageController();
});