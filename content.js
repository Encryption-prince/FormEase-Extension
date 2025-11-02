// Content script for form detection and filling
console.log('Browser Auto-Fill Extension content script loaded');

// Browser compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Form Field Detector
class FormFieldDetector {
  constructor() {
    this.fieldCache = new Map();
    this.lastScanTime = 0;
    this.scanCooldown = 1000;
  }

  detectFields(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && this.fieldCache.size > 0 && (now - this.lastScanTime) < this.scanCooldown) {
      return Array.from(this.fieldCache.values());
    }

    this.fieldCache.clear();
    this.lastScanTime = now;

    const fieldSelectors = [
      'input[type="text"]', 'input[type="email"]', 'input[type="tel"]',
      'input[type="url"]', 'input[type="number"]', 'input[type="password"]',
      'input[type="date"]', 'input[type="datetime-local"]', 'input[type="search"]',
      'input:not([type])', 'select', 'textarea',
      // Google Forms specific selectors
      'input[jsname]', 'input[data-initial-value]', 'input[aria-label]',
      'div[role="listbox"]', 'div[role="combobox"]', 'div[role="textbox"]',
      'div[role="radiogroup"]', 'input[type="radio"]'
    ];

    const elements = document.querySelectorAll(fieldSelectors.join(', '));
    const detectedFields = [];

    elements.forEach((element, index) => {
      if (this.isFieldVisible(element) && !element.disabled && !element.readOnly) {
        const fieldData = this.extractFieldMetadata(element, index);
        if (fieldData) {
          this.fieldCache.set(fieldData.id, fieldData);
          detectedFields.push(fieldData);
        }
      }
    });

    console.log(`Detected ${detectedFields.length} fillable fields`);
    console.log('Field details:', detectedFields.map(f => ({
      name: f.name,
      id: f.htmlId,
      label: f.label,
      identifier: f.identifier,
      type: f.type
    })));

    return detectedFields;
  }

  extractFieldMetadata(element, index) {
    try {
      const fieldData = {
        id: element.id || element.name || `field_${index}_${Date.now()}`,
        element: element,
        type: this.getFieldType(element),
        name: element.name || '',
        htmlId: element.id || '',
        placeholder: element.placeholder || '',
        label: this.findAssociatedLabel(element),
        value: element.value || '',
        required: element.required || false,
        maxLength: element.maxLength || null,
        ariaLabel: element.getAttribute('aria-label') || '',
        title: element.title || '',
        dataName: element.getAttribute('data-name') || ''
      };

      fieldData.identifier = this.createFieldIdentifier(fieldData);
      return fieldData;
    } catch (error) {
      console.warn('Error extracting field metadata:', error);
      return null;
    }
  }

  getFieldType(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'select') {
      return 'select';
    } else if (tagName === 'textarea') {
      return 'textarea';
    } else if (tagName === 'input') {
      return element.type || 'text';
    } else if (tagName === 'div') {
      const role = element.getAttribute('role');
      if (role === 'textbox') return 'textbox';
      if (role === 'combobox') return 'combobox';
      if (role === 'listbox') return 'listbox';
      if (role === 'radiogroup') return 'radiogroup';
    }

    return 'unknown';
  }

  findAssociatedLabel(element) {
    // Try standard label association
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }

    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.trim();
    }

    // Try aria-label
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim();
    }

    // Try aria-labelledby
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement) {
        return labelElement.textContent.trim();
      }
    }

    // For Google Forms and complex forms - look for nearby text
    const nearbyLabel = this.findNearbyLabel(element);
    if (nearbyLabel) {
      return nearbyLabel;
    }

    return '';
  }

  findNearbyLabel(element) {
    // For Google Forms, we need to find the actual question text
    // Look for the question container that holds this field

    // Method 1: Look for Google Forms specific question containers
    let questionContainer = element.closest('[role="listitem"], .freebirdFormviewerViewItemsItemItem, .Qr7Oae');

    if (questionContainer) {
      // Look for the question title within this container
      const questionTitle = questionContainer.querySelector('[role="heading"], .freebirdFormviewerViewItemsItemItemTitle, .M7eMe, .Xb9hP');
      if (questionTitle && questionTitle.textContent.trim()) {
        return questionTitle.textContent.trim();
      }

      // Fallback: look for any text that looks like a question
      const allText = questionContainer.textContent;
      if (allText) {
        // Split by common separators and find the question part
        const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        for (const line of lines) {
          // Skip common form text
          if (line.includes('Required') ||
            line.includes('Optional') ||
            line.includes('Your answer') ||
            line.includes('Choose') ||
            line === element.value) {
            continue;
          }

          // If it looks like a question (reasonable length, ends with question mark or colon, or contains common question words)
          if (line.length > 3 && line.length < 100 &&
            (line.includes('Name') || line.includes('Email') || line.includes('Phone') ||
              line.includes('Birth') || line.includes('Gender') || line.includes('Address') ||
              line.endsWith('?') || line.endsWith(':'))) {
            return line.replace(/[*:?]+$/, '').trim(); // Remove trailing punctuation
          }
        }
      }
    }

    // Method 2: Look in parent containers (original method as fallback)
    let parent = element.parentElement;
    let attempts = 0;

    while (parent && attempts < 8) { // Increased attempts for Google Forms
      const textContent = parent.textContent;
      if (textContent && textContent.trim().length > 0) {
        // Look for text that contains question-like words
        const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        for (const line of lines) {
          if (line.includes('Required') ||
            line.includes('Optional') ||
            line.includes('Your answer') ||
            line === element.value) {
            continue;
          }

          // Check if this line contains question keywords
          if ((line.includes('Name') || line.includes('Email') || line.includes('Phone') ||
            line.includes('Birth') || line.includes('Gender') || line.includes('Mobile')) &&
            line.length > 3 && line.length < 100) {
            return line.replace(/[*:?]+$/, '').trim();
          }
        }
      }

      parent = parent.parentElement;
      attempts++;
    }

    return '';
  }

  createFieldIdentifier(fieldData) {
    const identifiers = [
      fieldData.name,
      fieldData.htmlId,
      fieldData.placeholder,
      fieldData.label,
      fieldData.ariaLabel,
      fieldData.title,
      fieldData.dataName
    ].filter(id => id && id.trim().length > 0);

    return identifiers.join(' ').toLowerCase();
  }

  isFieldVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.offsetParent !== null
    );
  }
}

// Field Mapper
class FieldMapper {
  constructor() {
    this.defaultMappings = this.initializeDefaultMappings();
    this.currentMappings = {};
  }

  initializeDefaultMappings() {
    return {
      firstName: {
        aliases: ['firstname', 'first_name', 'fname', 'given_name', 'first-name', 'first name', 'name first'],
        priority: 10
      },
      lastName: {
        aliases: ['lastname', 'last_name', 'lname', 'surname', 'last-name', 'last name', 'family name'],
        priority: 10
      },
      email: {
        aliases: ['email', 'email_address', 'e_mail', 'e-mail', 'mail', 'email address'],
        priority: 10
      },
      phone: {
        aliases: ['phone', 'telephone', 'tel', 'phone_number', 'mobile', 'cell', 'phone number'],
        priority: 9
      },
      street: {
        aliases: ['street', 'address', 'address1', 'street_address', 'addr1', 'street address'],
        priority: 9
      },
      city: {
        aliases: ['city', 'town', 'locality'],
        priority: 9
      },
      state: {
        aliases: ['state', 'province', 'region'],
        priority: 9
      },
      zipCode: {
        aliases: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode', 'zip code'],
        priority: 9
      },
      country: {
        aliases: ['country', 'nation'],
        priority: 8
      },
      // Enhanced mappings for Google Forms
      fullName: {
        aliases: ['full name', 'fullname', 'full_name', 'name', 'your name', 'complete name'],
        priority: 10
      },
      dateOfBirth: {
        aliases: ['date of birth', 'birth date', 'birthday', 'dob', 'birthdate', 'date birth'],
        priority: 9
      },
      gender: {
        aliases: ['gender', 'sex'],
        priority: 8
      },
      mobile: {
        aliases: ['mobile', 'mobile_number', 'mobile number', 'cell', 'cellular'],
        priority: 9
      },
      linkedIn: {
        aliases: ['linkedin', 'linkedin_profile', 'linkedin profile'],
        priority: 7
      }
    };
  }

  // Update mappings from storage
  updateMappings(fieldMappings) {
    this.currentMappings = {};

    // Convert storage format to internal format with priorities
    Object.entries(fieldMappings).forEach(([fieldType, aliases]) => {
      // Use default priority if it exists, otherwise use medium priority
      const defaultMapping = this.defaultMappings[fieldType];
      const priority = defaultMapping ? defaultMapping.priority : 8;

      this.currentMappings[fieldType] = {
        aliases: aliases.map(alias => alias.toLowerCase()),
        priority: priority
      };
    });
  }

  // Get active mappings (custom if available, otherwise default)
  getActiveMappings() {
    return Object.keys(this.currentMappings).length > 0 ? this.currentMappings : this.defaultMappings;
  }

  mapFieldsToData(detectedFields, userData) {
    const mappedFields = [];
    const activeMappings = this.getActiveMappings();

    detectedFields.forEach(field => {
      const dataField = this.findBestMatch(field, userData, activeMappings);
      if (dataField) {
        mappedFields.push({
          field: field,
          dataField: dataField.key,
          value: dataField.value,
          confidence: dataField.confidence
        });
      }
    });

    return mappedFields.sort((a, b) => b.confidence - a.confidence);
  }

  findBestMatch(field, userData, mappings = null) {
    const activeMappings = mappings || this.getActiveMappings();
    let bestMatch = null;
    let highestScore = 0;

    Object.keys(activeMappings).forEach(dataKey => {
      if (userData[dataKey]) {
        const score = this.calculateMatchScore(field, dataKey, activeMappings);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = {
            key: dataKey,
            value: userData[dataKey],
            confidence: score
          };
        }
      }
    });

    return bestMatch;
  }

  calculateMatchScore(field, dataKey, mappings = null) {
    const activeMappings = mappings || this.getActiveMappings();
    const mapping = activeMappings[dataKey];
    if (!mapping) return 0;

    let score = 0;
    const identifier = field.identifier.toLowerCase();
    const fieldName = field.name.toLowerCase();
    const fieldId = field.htmlId.toLowerCase();
    const label = field.label.toLowerCase();
    const ariaLabel = (field.ariaLabel || '').toLowerCase();

    // Smart matching for Google Forms - use question content
    const smartScore = this.calculateSmartMatchScore(field, dataKey, mapping);
    if (smartScore > 0) {
      score = Math.max(score, smartScore);
    }

    mapping.aliases.forEach(alias => {
      const aliasLower = alias.toLowerCase();

      // Exact matches get highest score
      if (fieldName === aliasLower || fieldId === aliasLower || label === aliasLower || ariaLabel === aliasLower) {
        score = Math.max(score, mapping.priority * 10);
      }
      // Partial matches in identifier get good score
      else if (identifier.includes(aliasLower)) {
        score = Math.max(score, mapping.priority * 8);
      }
      // Partial matches in label get medium score
      else if (label.includes(aliasLower) || ariaLabel.includes(aliasLower)) {
        score = Math.max(score, mapping.priority * 6);
      }
      // Word boundary matches (for multi-word labels)
      else if (this.hasWordMatch(label, aliasLower) || this.hasWordMatch(ariaLabel, aliasLower)) {
        score = Math.max(score, mapping.priority * 7);
      }
    });

    return score;
  }

  calculateSmartMatchScore(field, dataKey, mapping) {
    const label = field.label.toLowerCase();
    const identifier = field.identifier.toLowerCase();

    // Smart matching based on question content (for Google Forms)
    switch (dataKey) {
      case 'fullName':
        if (label.includes('full name') || label.includes('name') ||
          identifier.includes('full name') || identifier.includes('name')) {
          return mapping.priority * 9;
        }
        break;

      case 'firstName':
        if (label.includes('first name') || label.includes('first') ||
          identifier.includes('first name') || identifier.includes('first')) {
          return mapping.priority * 9;
        }
        break;

      case 'lastName':
        if (label.includes('last name') || label.includes('last') ||
          identifier.includes('last name') || identifier.includes('last')) {
          return mapping.priority * 9;
        }
        break;

      case 'email':
        if (label.includes('email') || identifier.includes('email')) {
          return mapping.priority * 9;
        }
        break;

      case 'phone':
        if (label.includes('phone') || label.includes('mobile') || label.includes('number') ||
          identifier.includes('phone') || identifier.includes('mobile')) {
          return mapping.priority * 9;
        }
        break;

      case 'dateOfBirth':
        if (label.includes('birth') || label.includes('date') ||
          identifier.includes('birth') || identifier.includes('date')) {
          return mapping.priority * 9;
        }
        break;

      case 'gender':
        if (label.includes('gender') || label.includes('male') || label.includes('female') ||
          identifier.includes('gender') || identifier.includes('choose')) {
          return mapping.priority * 9;
        }
        break;

      case 'mobile':
        if (label.includes('mobile') || label.includes('cell') ||
          identifier.includes('mobile') || identifier.includes('cell')) {
          return mapping.priority * 9;
        }
        break;

      case 'linkedIn':
        if (label.includes('linkedin') || label.includes('profile') ||
          identifier.includes('linkedin') || identifier.includes('profile')) {
          return mapping.priority * 9;
        }
        break;
    }

    return 0;
  }

  hasWordMatch(text, searchTerm) {
    if (!text || !searchTerm) return false;

    // Split both text and search term into words
    const textWords = text.toLowerCase().split(/\s+/);
    const searchWords = searchTerm.toLowerCase().split(/\s+/);

    // Check if all search words are found in text words
    return searchWords.every(searchWord =>
      textWords.some(textWord =>
        textWord.includes(searchWord) || searchWord.includes(textWord)
      )
    );
  }
}

// Auto Filler
class AutoFiller {
  constructor(fieldDetector, fieldMapper) {
    this.fieldDetector = fieldDetector;
    this.fieldMapper = fieldMapper;
    this.animationDuration = 300;
  }

  async fillSingleField(mappedField) {
    const { field, value } = mappedField;
    const element = field.element;

    // Comprehensive field validation
    if (!element) {
      throw new Error('Field element is null or undefined');
    }

    if (!document.contains(element)) {
      throw new Error('Field element no longer exists in the page');
    }

    if (element.disabled) {
      console.warn(`Field ${field.identifier} is disabled, skipping`);
      return false;
    }

    if (element.readOnly) {
      console.warn(`Field ${field.identifier} is read-only, skipping`);
      return false;
    }

    // Check if element is visible and interactable
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn(`Field ${field.identifier} is not visible, skipping`);
      return false;
    }

    try {
      this.addFillAnimation(element);

      // Validate value before setting
      if (value === null || value === undefined) {
        console.warn(`No value provided for field ${field.identifier}`);
        return false;
      }

      const success = await this.setFieldValueSafely(element, value, field.type);

      if (success) {
        try {
          this.triggerChangeEvents(element);
        } catch (eventError) {
          console.warn('Failed to trigger change events:', eventError);
          // Still consider the fill successful if the value was set
        }

        setTimeout(() => {
          try {
            this.removeFillAnimation(element);
          } catch (animationError) {
            console.warn('Failed to remove animation:', animationError);
          }
        }, this.animationDuration);

        return true;
      }

      return false;
    } catch (error) {
      console.warn(`Error filling field ${field.identifier}:`, error);

      try {
        this.removeFillAnimation(element);
      } catch (animationError) {
        console.warn('Failed to remove animation after error:', animationError);
      }

      // Re-throw for higher-level error handling
      throw new Error(`Failed to fill field ${field.identifier}: ${error.message}`);
    }
  }

  async setFieldValueSafely(element, value, fieldType) {
    try {
      // Add timeout protection for field operations
      return await Promise.race([
        this.setFieldValue(element, value, fieldType),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Field operation timeout')), 3000)
        )
      ]);
    } catch (error) {
      if (error.message === 'Field operation timeout') {
        throw new Error('Field took too long to respond');
      }
      throw error;
    }
  }

  setFieldValue(element, value, fieldType) {
    try {
      switch (fieldType) {
        case 'select':
          return this.fillSelectField(element, value);
        case 'textarea':
          return this.fillTextareaField(element, value);
        case 'email':
          return this.fillEmailField(element, value);
        case 'tel':
        case 'phone':
          return this.fillPhoneField(element, value);
        case 'number':
          return this.fillNumberField(element, value);
        case 'url':
          return this.fillUrlField(element, value);
        case 'textbox':
          return this.fillDivTextbox(element, value);
        case 'combobox':
          return this.fillCombobox(element, value);
        case 'listbox':
          return this.fillListbox(element, value);
        case 'radiogroup':
          return this.fillRadioGroup(element, value);
        default:
          return this.fillTextField(element, value);
      }
    } catch (error) {
      throw new Error(`Failed to set ${fieldType} field value: ${error.message}`);
    }
  }

  fillTextField(element, value) {
    try {
      if (!this.focusElement(element)) {
        throw new Error('Could not focus on text field');
      }

      const stringValue = String(value).trim();

      // Check max length constraint
      if (element.maxLength > 0 && stringValue.length > element.maxLength) {
        console.warn(`Value truncated to fit maxLength constraint: ${element.maxLength}`);
        element.value = stringValue.substring(0, element.maxLength);
      } else {
        element.value = stringValue;
      }

      return true;
    } catch (error) {
      throw new Error(`Text field fill failed: ${error.message}`);
    }
  }

  fillSelectField(element, value) {
    try {
      if (!this.focusElement(element)) {
        throw new Error('Could not focus on select field');
      }

      const options = Array.from(element.options);
      if (options.length === 0) {
        throw new Error('Select field has no options');
      }

      const stringValue = String(value).trim();

      // Try exact value match first
      let option = options.find(opt => opt.value === stringValue);

      // Try case-insensitive text match
      if (!option) {
        option = options.find(opt =>
          opt.textContent.trim().toLowerCase() === stringValue.toLowerCase()
        );
      }

      // Try partial text match
      if (!option) {
        option = options.find(opt =>
          opt.textContent.trim().toLowerCase().includes(stringValue.toLowerCase())
        );
      }

      if (option) {
        element.value = option.value;
        return true;
      }

      console.warn(`No matching option found for value: ${stringValue}`);
      return false;
    } catch (error) {
      throw new Error(`Select field fill failed: ${error.message}`);
    }
  }

  fillTextareaField(element, value) {
    try {
      if (!this.focusElement(element)) {
        throw new Error('Could not focus on textarea field');
      }

      const stringValue = String(value).trim();

      // Check max length constraint
      if (element.maxLength > 0 && stringValue.length > element.maxLength) {
        console.warn(`Textarea value truncated to fit maxLength constraint: ${element.maxLength}`);
        element.value = stringValue.substring(0, element.maxLength);
      } else {
        element.value = stringValue;
      }

      return true;
    } catch (error) {
      throw new Error(`Textarea field fill failed: ${error.message}`);
    }
  }

  fillEmailField(element, value) {
    try {
      const stringValue = String(value).trim();

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(stringValue)) {
        console.warn(`Invalid email format: ${stringValue}`);
        // Still try to fill it, let the browser handle validation
      }

      return this.fillTextField(element, stringValue);
    } catch (error) {
      throw new Error(`Email field fill failed: ${error.message}`);
    }
  }

  fillPhoneField(element, value) {
    try {
      let stringValue = String(value).trim();

      // Clean phone number (remove non-digits except + and -)
      stringValue = stringValue.replace(/[^\d+\-\s()]/g, '');

      return this.fillTextField(element, stringValue);
    } catch (error) {
      throw new Error(`Phone field fill failed: ${error.message}`);
    }
  }

  fillNumberField(element, value) {
    try {
      const numericValue = parseFloat(value);

      if (isNaN(numericValue)) {
        console.warn(`Invalid numeric value: ${value}`);
        return false;
      }

      // Check min/max constraints
      if (element.min && numericValue < parseFloat(element.min)) {
        console.warn(`Value ${numericValue} is below minimum ${element.min}`);
        return false;
      }

      if (element.max && numericValue > parseFloat(element.max)) {
        console.warn(`Value ${numericValue} is above maximum ${element.max}`);
        return false;
      }

      return this.fillTextField(element, numericValue.toString());
    } catch (error) {
      throw new Error(`Number field fill failed: ${error.message}`);
    }
  }

  fillUrlField(element, value) {
    try {
      let stringValue = String(value).trim();

      // Add protocol if missing
      if (stringValue && !stringValue.match(/^https?:\/\//)) {
        stringValue = 'https://' + stringValue;
      }

      return this.fillTextField(element, stringValue);
    } catch (error) {
      throw new Error(`URL field fill failed: ${error.message}`);
    }
  }

  fillDivTextbox(element, value) {
    try {
      // For div elements with role="textbox" (Google Forms)
      const stringValue = String(value).trim();

      // Try to click the element first
      element.click();

      // Try setting textContent or innerText
      if (element.isContentEditable) {
        element.textContent = stringValue;
        element.innerText = stringValue;
      } else {
        // Look for an actual input inside
        const input = element.querySelector('input, textarea');
        if (input) {
          input.value = stringValue;
          this.triggerChangeEvents(input);
        } else {
          element.textContent = stringValue;
        }
      }

      this.triggerChangeEvents(element);
      return true;
    } catch (error) {
      throw new Error(`Div textbox fill failed: ${error.message}`);
    }
  }

  fillCombobox(element, value) {
    try {
      // For div elements with role="combobox" (Google Forms dropdowns)
      const stringValue = String(value).trim();

      // Click to open the dropdown
      element.click();

      // Wait a bit for dropdown to open
      setTimeout(() => {
        // Look for options
        const options = document.querySelectorAll('[role="option"]');
        for (const option of options) {
          const optionText = option.textContent.trim().toLowerCase();
          if (optionText === stringValue.toLowerCase() ||
            optionText.includes(stringValue.toLowerCase())) {
            option.click();
            return true;
          }
        }
      }, 100);

      return true;
    } catch (error) {
      throw new Error(`Combobox fill failed: ${error.message}`);
    }
  }

  fillListbox(element, value) {
    try {
      // Similar to combobox but for listbox elements
      return this.fillCombobox(element, value);
    } catch (error) {
      throw new Error(`Listbox fill failed: ${error.message}`);
    }
  }

  fillRadioGroup(element, value) {
    try {
      // For radio button groups
      const stringValue = String(value).trim().toLowerCase();

      // Look for radio buttons within the group
      const radios = element.querySelectorAll('input[type="radio"], [role="radio"]');

      for (const radio of radios) {
        const radioLabel = this.getRadioLabel(radio);
        if (radioLabel.toLowerCase().includes(stringValue) ||
          stringValue.includes(radioLabel.toLowerCase())) {
          radio.click();
          return true;
        }
      }

      return false;
    } catch (error) {
      throw new Error(`Radio group fill failed: ${error.message}`);
    }
  }

  getRadioLabel(radioElement) {
    // Try to find the label for a radio button
    const label = radioElement.closest('label');
    if (label) return label.textContent.trim();

    const ariaLabel = radioElement.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Look for nearby text
    const parent = radioElement.parentElement;
    if (parent) return parent.textContent.trim();

    return '';
  }

  focusElement(element) {
    try {
      // Check if element can be focused
      if (typeof element.focus !== 'function') {
        // For div elements, try clicking instead
        if (element.tagName.toLowerCase() === 'div') {
          element.click();
          return true;
        }
        return false;
      }

      element.focus();

      // Verify focus was successful
      return document.activeElement === element;
    } catch (error) {
      console.warn('Focus failed:', error);
      return false;
    }
  }

  triggerChangeEvents(element) {
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);

    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    element.dispatchEvent(changeEvent);
  }

  addFillAnimation(element) {
    element.classList.add('autofill-filling');
  }

  removeFillAnimation(element) {
    element.classList.remove('autofill-filling');
  }
}

// Visual Feedback
class VisualFeedback {
  constructor() {
    this.highlightedFields = new Set();
    this.progressOverlay = null;
    this.fieldCounter = null;
  }

  highlightFillableFields(fields) {
    this.clearHighlights();

    if (!fields || fields.length === 0) {
      this.showNoFieldsMessage();
      return;
    }

    fields.forEach(field => {
      if (field.element && document.contains(field.element)) {
        field.element.classList.add('autofill-highlight');
        this.highlightedFields.add(field.element);
      }
    });

    this.showFieldCounter(fields.length);
  }

  clearHighlights() {
    this.highlightedFields.forEach(element => {
      if (document.contains(element)) {
        element.classList.remove('autofill-highlight', 'pulse');
      }
    });
    this.highlightedFields.clear();
    this.hideFieldCounter();
  }

  showProgress(current, total) {
    if (!this.progressOverlay) {
      this.createProgressOverlay();
    }

    const percentage = Math.round((current / total) * 100);
    const progressFill = this.progressOverlay.querySelector('.autofill-progress-fill');
    const progressText = this.progressOverlay.querySelector('.progress-text');

    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `Filling fields... ${current}/${total}`;
  }

  hideProgress() {
    if (this.progressOverlay && this.progressOverlay.parentNode) {
      this.progressOverlay.parentNode.removeChild(this.progressOverlay);
      this.progressOverlay = null;
    }
  }

  createProgressOverlay() {
    this.progressOverlay = document.createElement('div');
    this.progressOverlay.className = 'autofill-progress-overlay';
    this.progressOverlay.innerHTML = `
      <div class="progress-text">Preparing to fill fields...</div>
      <div class="autofill-progress-bar">
        <div class="autofill-progress-fill"></div>
      </div>
    `;

    document.body.appendChild(this.progressOverlay);
  }

  showNoFieldsMessage() {
    const message = document.createElement('div');
    message.className = 'autofill-no-fields-message';
    message.innerHTML = `
      <div class="icon">🔍</div>
      <div>No fillable fields detected on this page</div>
    `;

    document.body.appendChild(message);

    setTimeout(() => {
      if (message.parentNode) {
        message.parentNode.removeChild(message);
      }
    }, 3000);
  }

  showFieldCounter(count) {
    if (this.fieldCounter) {
      this.hideFieldCounter();
    }

    this.fieldCounter = document.createElement('div');
    this.fieldCounter.className = 'autofill-field-counter';
    this.fieldCounter.textContent = `${count} fields detected`;

    document.body.appendChild(this.fieldCounter);

    setTimeout(() => {
      if (this.fieldCounter) {
        this.fieldCounter.classList.add('show');
      }
    }, 100);
  }

  hideFieldCounter() {
    if (this.fieldCounter && this.fieldCounter.parentNode) {
      this.fieldCounter.parentNode.removeChild(this.fieldCounter);
      this.fieldCounter = null;
    }
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `autofill-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 100);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  showCompletionSummary(results) {
    const { fieldsDetected, fieldsFilled, fieldsSkipped, errors } = results;

    let message = `✅ Filled ${fieldsFilled} of ${fieldsDetected} fields`;
    let type = 'success';

    if (errors && errors.length > 0) {
      message = `⚠️ Filled ${fieldsFilled} fields, ${errors.length} errors`;
      type = 'warning';
    }

    if (fieldsFilled === 0) {
      message = '❌ No fields could be filled';
      type = 'error';
    }

    this.showNotification(message, type);
  }

  clearAll() {
    this.clearHighlights();
    this.hideProgress();
    this.hideFieldCounter();
  }
}

// Content Script Controller
class ContentScriptController {
  constructor() {
    this.isExtensionActive = false;
    this.currentFields = [];
    this.init();
  }

  init() {
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    console.log('Browser Auto-Fill Extension content script initialized');
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
      }

      if (!message.action || typeof message.action !== 'string') {
        throw new Error('Message action is required');
      }

      // Handle ping for connection testing
      if (message.action === 'ping') {
        sendResponse({ success: true, message: 'Content script is active' });
        return;
      }

      switch (message.action) {
        case 'detectFields':
          this.handleDetectFields(sendResponse);
          break;

        case 'highlightFields':
          this.handleHighlightFields(sendResponse);
          break;

        case 'autoFill':
          await this.handleAutoFill(message.userData, sendResponse);
          break;

        case 'performAutoFill':
          await this.handlePerformAutoFill(message, sendResponse);
          break;

        case 'clearHighlights':
          this.handleClearHighlights(sendResponse);
          break;

        default:
          sendResponse({
            success: false,
            error: `Unknown action: ${message.action}`,
            errorType: 'UNKNOWN_ACTION'
          });
      }
    } catch (error) {
      console.error('Error handling message:', error);

      let errorType = 'GENERAL_ERROR';
      let userMessage = error.message;

      if (error.message.includes('DOM')) {
        errorType = 'DOM_ERROR';
        userMessage = 'Page structure error. Please refresh the page.';
      } else if (error.message.includes('permission')) {
        errorType = 'PERMISSION_ERROR';
        userMessage = 'Permission denied accessing page elements.';
      } else if (error.message.includes('timeout')) {
        errorType = 'TIMEOUT_ERROR';
        userMessage = 'Operation timed out. Please try again.';
      }

      sendResponse({
        success: false,
        error: userMessage,
        errorType: errorType,
        originalError: error.message
      });
    }
  }

  handleDetectFields(sendResponse) {
    try {
      const fields = fieldDetector.detectFields(true);
      this.currentFields = fields;

      sendResponse({
        success: true,
        fields: fields.map(field => ({
          id: field.id,
          type: field.type,
          name: field.name,
          identifier: field.identifier,
          label: field.label
        })),
        count: fields.length
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  handleHighlightFields(sendResponse) {
    try {
      if (this.currentFields.length === 0) {
        this.currentFields = fieldDetector.detectFields(true);
      }

      visualFeedback.highlightFillableFields(this.currentFields);
      this.isExtensionActive = true;

      sendResponse({
        success: true,
        fieldsHighlighted: this.currentFields.length
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleAutoFill(userData, sendResponse) {
    try {
      if (!userData) {
        throw new Error('No user data provided');
      }

      visualFeedback.clearHighlights();

      const results = await this.performAutoFill(userData);

      visualFeedback.showCompletionSummary(results);

      setTimeout(() => {
        visualFeedback.clearHighlights();
        this.isExtensionActive = false;
      }, 2000);

      sendResponse({
        success: true,
        fieldsCount: results.fieldsFilled,
        results: results
      });

    } catch (error) {
      visualFeedback.showNotification(error.message, 'error');
      sendResponse({ success: false, error: error.message });
    }
  }

  async handlePerformAutoFill(message, sendResponse) {
    try {
      const { userData, fieldMappings, settings } = message;

      // Validate required data
      if (!userData || typeof userData !== 'object') {
        throw new Error('No valid user data provided');
      }

      if (Object.keys(userData).length === 0) {
        throw new Error('User data is empty');
      }

      // Check if page is in a valid state for auto-fill
      if (document.readyState !== 'complete') {
        throw new Error('Page is still loading. Please wait and try again.');
      }

      // Update field mapper with custom mappings
      if (fieldMappings && typeof fieldMappings === 'object') {
        try {
          fieldMapper.updateMappings(fieldMappings);
        } catch (mappingError) {
          console.warn('Failed to update field mappings:', mappingError);
          // Continue with default mappings
        }
      }

      // Update settings if provided
      if (settings && typeof settings === 'object') {
        if (settings.animationSpeed && typeof settings.animationSpeed === 'number') {
          autoFiller.animationDuration = Math.max(100, Math.min(1000, settings.animationSpeed));
        }
      }

      visualFeedback.clearHighlights();

      const results = await this.performAutoFillWithErrorHandling(userData);

      visualFeedback.showCompletionSummary(results);

      setTimeout(() => {
        visualFeedback.clearHighlights();
        this.isExtensionActive = false;
      }, 2000);

      sendResponse({
        success: true,
        fieldsCount: results.fieldsFilled,
        results: results
      });

    } catch (error) {
      console.error('Auto-fill error:', error);

      let userMessage = error.message;
      let errorType = 'AUTOFILL_ERROR';

      if (error.message.includes('loading')) {
        errorType = 'PAGE_NOT_READY';
        userMessage = 'Page is still loading. Please wait and try again.';
      } else if (error.message.includes('No fillable fields')) {
        errorType = 'NO_FIELDS';
        userMessage = 'No fillable form fields found on this page.';
      } else if (error.message.includes('No matching fields')) {
        errorType = 'NO_MATCHES';
        userMessage = 'No form fields match your data. Try customizing field mappings.';
      }

      visualFeedback.showNotification(userMessage, 'error');
      sendResponse({
        success: false,
        error: userMessage,
        errorType: errorType
      });
    }
  }

  async performAutoFillWithErrorHandling(userData) {
    try {
      return await this.performAutoFill(userData);
    } catch (error) {
      // Enhanced error handling for auto-fill process
      if (error.message.includes('DOM')) {
        throw new Error('Page structure changed during auto-fill. Please refresh and try again.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Auto-fill process timed out. The page may be slow to respond.');
      } else if (error.message.includes('permission')) {
        throw new Error('Cannot access form fields due to page restrictions.');
      }

      throw error;
    }
  }

  async performAutoFill(userData) {
    let fields;

    try {
      fields = fieldDetector.detectFields(true);
    } catch (detectionError) {
      throw new Error(`Field detection failed: ${detectionError.message}`);
    }

    if (!fields || fields.length === 0) {
      throw new Error('No fillable fields detected on this page');
    }

    let mappedFields;
    try {
      mappedFields = fieldMapper.mapFieldsToData(fields, userData);
    } catch (mappingError) {
      throw new Error(`Field mapping failed: ${mappingError.message}`);
    }

    if (!mappedFields || mappedFields.length === 0) {
      throw new Error('No matching fields found for available data. Try customizing field mappings in settings.');
    }

    visualFeedback.showProgress(0, mappedFields.length);

    const results = {
      fieldsDetected: fields.length,
      fieldsFilled: 0,
      fieldsSkipped: 0,
      errors: [],
      warnings: []
    };

    // Process fields with timeout protection
    const fillTimeout = 30000; // 30 seconds total timeout
    const startTime = Date.now();

    for (let i = 0; i < mappedFields.length; i++) {
      // Check for overall timeout
      if (Date.now() - startTime > fillTimeout) {
        results.warnings.push('Auto-fill timed out - some fields may not have been filled');
        break;
      }

      const mappedField = mappedFields[i];

      try {
        visualFeedback.showProgress(i + 1, mappedFields.length);

        // Validate field is still accessible
        if (!document.contains(mappedField.field.element)) {
          results.errors.push({
            field: mappedField.field.identifier,
            error: 'Field no longer exists in page'
          });
          results.fieldsSkipped++;
          continue;
        }

        const success = await Promise.race([
          autoFiller.fillSingleField(mappedField),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Field fill timeout')), 5000)
          )
        ]);

        if (success) {
          results.fieldsFilled++;
        } else {
          results.fieldsSkipped++;
          results.warnings.push(`Could not fill field: ${mappedField.field.identifier}`);
        }

        // Small delay between fields to prevent overwhelming the page
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.warn(`Error filling field ${mappedField.field.identifier}:`, error);

        results.errors.push({
          field: mappedField.field.identifier,
          error: error.message.includes('timeout') ? 'Field fill timeout' : error.message
        });
        results.fieldsSkipped++;
      }
    }

    visualFeedback.hideProgress();

    // Log summary for debugging
    console.log('Auto-fill completed:', {
      detected: results.fieldsDetected,
      filled: results.fieldsFilled,
      skipped: results.fieldsSkipped,
      errors: results.errors.length,
      warnings: results.warnings.length
    });

    return results;
  }

  handleClearHighlights(sendResponse) {
    visualFeedback.clearAll();
    this.isExtensionActive = false;
    sendResponse({ success: true });
  }
}

// Initialize all components
const fieldDetector = new FormFieldDetector();
const fieldMapper = new FieldMapper();
const autoFiller = new AutoFiller(fieldDetector, fieldMapper);
const visualFeedback = new VisualFeedback();
const contentController = new ContentScriptController();