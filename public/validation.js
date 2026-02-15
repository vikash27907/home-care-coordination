/**
 * Production-Grade Client-Side Validation for Healthcare Platform
 * Implements India-standard phone validation, email validation, and form enhancements
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    indiaPhoneRegex: /^[6-9]\d{9}$/,
    emailRegex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    budgetMin: 5000,
    budgetMax: 200000,
    errorClass: 'field-error',
    successClass: 'field-success'
  };

  // Error messages
  const MESSAGES = {
    phone: 'Please enter a valid 10-digit Indian mobile number.',
    email: 'Please enter a valid email address.',
    required: 'This field is required.',
    budgetMin: `Budget must be at least ₹${CONFIG.budgetMin.toLocaleString('en-IN')}.`,
    budgetMax: `Budget cannot exceed ₹${CONFIG.budgetMax.toLocaleString('en-IN')}.`,
    budgetRange: `Budget must be between ₹${CONFIG.budgetMin.toLocaleString('en-IN')} and ₹${CONFIG.budgetMax.toLocaleString('en-IN')}.`,
    budgetInvalid: 'Please enter a valid budget amount.',
    maxLessThanMin: 'Maximum budget cannot be less than minimum budget.',
    duration: 'Please select a care duration.',
    careRequirement: 'Please select a care requirement.'
  };

  /**
   * Validate Indian phone number (10 digits, starts with 6-9)
   */
  function validateIndiaPhone(phone) {
    if (!phone) return { valid: false, message: MESSAGES.phone };
    const cleaned = phone.replace(/\D/g, '');
    if (!CONFIG.indiaPhoneRegex.test(cleaned)) {
      return { valid: false, message: MESSAGES.phone };
    }
    return { valid: true };
  }

  /**
   * Validate email format
   */
  function validateEmail(email) {
    if (!email) return { valid: false, message: MESSAGES.email };
    if (!CONFIG.emailRegex.test(email.trim().toLowerCase())) {
      return { valid: false, message: MESSAGES.email };
    }
    return { valid: true };
  }

  /**
   * Validate budget field
   */
  function validateBudget(input, isMin = true) {
    const value = parseFloat(input.value);
    
    if (isNaN(value) || input.value === '') {
      return { valid: true }; // Optional field
    }
    
    if (isMin) {
      if (value < CONFIG.budgetMin) {
        return { valid: false, message: MESSAGES.budgetMin };
      }
    } else {
      if (value > CONFIG.budgetMax) {
        return { valid: false, message: MESSAGES.budgetMax };
      }
    }
    
    return { valid: true };
  }

  /**
   * Validate budget range (min < max)
   */
  function validateBudgetRange(minInput, maxInput) {
    const minVal = parseFloat(minInput.value);
    const maxVal = parseFloat(maxInput.value);
    
    if (!isNaN(minVal) && !isNaN(maxVal) && maxVal < minVal) {
      return { valid: false, message: MESSAGES.maxLessThanMin };
    }
    
    return { valid: true };
  }

  /**
   * Show error message below field
   */
  function showError(input, message) {
    // Remove existing error
    removeError(input);
    
    // Add error class
    input.classList.add(CONFIG.errorClass);
    
    // Create error element
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.color = 'var(--danger, #b91c1c)';
    errorEl.style.fontSize = '0.85rem';
    errorEl.style.marginTop = '0.25rem';
    
    // Insert after input
    input.parentNode.insertBefore(errorEl, input.nextSibling);
  }

  /**
   * Remove error message
   */
  function removeError(input) {
    input.classList.remove(CONFIG.errorClass);
    const nextEl = input.nextSibling;
    if (nextEl && nextEl.classList && nextEl.classList.contains('field-error-message')) {
      nextEl.remove();
    }
  }

  /**
   * Show success indicator
   */
  function showSuccess(input) {
    removeError(input);
    input.classList.add(CONFIG.successClass);
  }

  /**
   * Validate single field
   */
  function validateField(input) {
    const name = input.name;
    let result = { valid: true };

    // Phone number validation
    if (name === 'phoneNumber' || name === 'phone') {
      result = validateIndiaPhone(input.value);
    }
    // Email validation
    else if (name === 'email') {
      result = validateEmail(input.value);
    }
    // Budget validation
    else if (name === 'budgetMin') {
      result = validateBudget(input, true);
    }
    else if (name === 'budgetMax') {
      result = validateBudget(input, false);
    }
    // Required validation
    else if (input.hasAttribute('required') && !input.value.trim()) {
      result = { valid: false, message: MESSAGES.required };
    }

    if (!result.valid) {
      showError(input, result.message);
      return false;
    } else if (input.value.trim()) {
      showSuccess(input);
      return true;
    }
    
    return true;
  }

  /**
   * Initialize form validation
   */
  function initForm(form) {
    if (!form || form.dataset.validated === 'true') return;
    form.dataset.validated = 'true';

    // Find all inputs to validate
    const inputs = form.querySelectorAll('input[name="phoneNumber"], input[name="phone"], input[name="email"], input[name="budgetMin"], input[name="budgetMax"], select[name="duration"], select[name="careRequirement"]');

    inputs.forEach(input => {
      // Real-time validation on blur
      input.addEventListener('blur', () => validateField(input));
      
      // Remove error on input
      input.addEventListener('input', () => {
        if (input.classList.contains(CONFIG.errorClass)) {
          removeError(input);
        }
      });
    });

    // Special handling for duration and care requirement selects
    const durationSelect = form.querySelector('select[name="duration"]');
    if (durationSelect) {
      durationSelect.addEventListener('change', () => {
        if (!durationSelect.value) {
          showError(durationSelect, MESSAGES.duration);
        } else {
          removeError(durationSelect);
        }
      });
    }

    const careReqSelect = form.querySelector('select[name="careRequirement"]');
    if (careReqSelect) {
      careReqSelect.addEventListener('change', () => {
        if (!careReqSelect.value) {
          showError(careReqSelect, MESSAGES.careRequirement);
        } else {
          removeError(careReqSelect);
        }
      });
    }

    // Form submission validation
    form.addEventListener('submit', function(e) {
      let isValid = true;
      
      // Validate all relevant fields
      inputs.forEach(input => {
        if (!validateField(input)) {
          isValid = false;
        }
      });

      // Additional check for duration and care requirement
      if (durationSelect && !durationSelect.value) {
        showError(durationSelect, MESSAGES.duration);
        isValid = false;
      }
      
      if (careReqSelect && !careReqSelect.value) {
        showError(careReqSelect, MESSAGES.careRequirement);
        isValid = false;
      }

      // Budget range validation
      const budgetMin = form.querySelector('input[name="budgetMin"]');
      const budgetMax = form.querySelector('input[name="budgetMax"]');
      if (budgetMin && budgetMax) {
        const rangeResult = validateBudgetRange(budgetMin, budgetMax);
        if (!rangeResult.valid) {
          showError(budgetMax, rangeResult.message);
          isValid = false;
        }
      }

      if (!isValid) {
        e.preventDefault();
        // Scroll to first error
        const firstError = form.querySelector('.' + CONFIG.errorClass);
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstError.focus();
        }
        return false;
      }

      // Show loading state
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';
      }
    });
  }

  /**
   * Initialize all forms on page
   */
  function init() {
    document.querySelectorAll('form').forEach(form => initForm(form));
    
    // Also handle dynamically added forms (if using SPA patterns)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === 'FORM') {
              initForm(node);
            }
            node.querySelectorAll && node.querySelectorAll('form').forEach(initForm);
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for manual use
  window.FormValidation = {
    validateIndiaPhone,
    validateEmail,
    validateBudget,
    validateBudgetRange,
    validateField,
    showError,
    removeError,
    CONFIG,
    MESSAGES
  };

})();
