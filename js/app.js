/**
 * Portainer Templates - Main Application
 * Vanilla JS implementation with fuzzy search, caching, and URL state
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        TEMPLATES_URL: 'templates.json',
        CACHE_KEY: 'portainer_templates_cache',
        CACHE_TTL: 3600000, // 1 hour in milliseconds
        DEBOUNCE_DELAY: 150,
        FUZZY_THRESHOLD: 0.3
    };

    // State
    let state = {
        templates: [],
        filteredTemplates: [],
        categories: new Set(),
        isLoading: true,
        error: null,
        validationWarnings: []
    };

    // DOM Elements
    const elements = {};

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        setupEventListeners();
        await loadTemplates();
        restoreStateFromURL();
    }

    function cacheElements() {
        elements.searchInput = document.getElementById('search-input');
        elements.categoryFilter = document.getElementById('category-filter');
        elements.typeFilter = document.getElementById('type-filter');
        elements.sortFilter = document.getElementById('sort-filter');
        elements.templateGrid = document.getElementById('template-grid');
        elements.loadingState = document.getElementById('loading-state');
        elements.errorState = document.getElementById('error-state');
        elements.emptyState = document.getElementById('empty-state');
        elements.errorMessage = document.getElementById('error-message');
        elements.resultsCount = document.getElementById('results-count');
        elements.templateCount = document.getElementById('template-count');
        elements.categoryCount = document.getElementById('category-count');
        elements.validationBanner = document.getElementById('validation-banner');
        elements.validationMessage = document.getElementById('validation-message');
    }

    function setupEventListeners() {
        // Search with debounce
        elements.searchInput?.addEventListener('input', debounce(handleFilterChange, CONFIG.DEBOUNCE_DELAY));
        
        // Filters
        elements.categoryFilter?.addEventListener('change', handleFilterChange);
        elements.typeFilter?.addEventListener('change', handleFilterChange);
        elements.sortFilter?.addEventListener('change', handleFilterChange);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== elements.searchInput) {
                e.preventDefault();
                elements.searchInput?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === elements.searchInput) {
                elements.searchInput.blur();
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', restoreStateFromURL);
    }

    async function loadTemplates() {
        showLoading(true);
        
        try {
            // Try cache first
            const cached = getFromCache();
            if (cached) {
                processTemplates(cached);
                showLoading(false);
                // Refresh in background
                fetchTemplates().then(data => {
                    if (data) {
                        saveToCache(data);
                        processTemplates(data);
                        renderTemplates();
                    }
                }).catch(() => {});
                return;
            }

            // Fetch fresh data
            const data = await fetchTemplates();
            if (data) {
                saveToCache(data);
                processTemplates(data);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    async function fetchTemplates() {
        const response = await fetch(CONFIG.TEMPLATES_URL);
        if (!response.ok) {
            throw new Error(`Failed to load templates (HTTP ${response.status})`);
        }
        return await response.json();
    }

    function processTemplates(data) {
        if (!data?.templates || !Array.isArray(data.templates)) {
            throw new Error('Invalid template data format');
        }

        state.templates = data.templates;
        state.categories = new Set();
        state.validationWarnings = [];

        // Extract categories and validate
        state.templates.forEach((template, index) => {
            if (template.categories) {
                template.categories.forEach(cat => state.categories.add(cat));
            }
            
            // Basic validation
            const warnings = validateTemplate(template, index);
            if (warnings.length > 0) {
                state.validationWarnings.push(...warnings);
            }
        });

        // Update stats
        if (elements.templateCount) {
            elements.templateCount.textContent = state.templates.length;
        }
        if (elements.categoryCount) {
            elements.categoryCount.textContent = state.categories.size;
        }

        // Populate category filter
        populateCategoryFilter();

        // Show validation warnings if any
        if (state.validationWarnings.length > 0) {
            showValidationWarnings();
        }

        // Initial render
        handleFilterChange();
    }

    function validateTemplate(template, index) {
        const warnings = [];
        const id = template.title || `Template #${index}`;

        if (!template.title) {
            warnings.push(`${id}: Missing title`);
        }
        if (!template.image && template.type === 1) {
            warnings.push(`${id}: Missing image for container template`);
        }
        if (template.privileged) {
            warnings.push(`${id}: Uses privileged mode (security risk)`);
        }

        return warnings;
    }

    function showValidationWarnings() {
        if (elements.validationBanner && elements.validationMessage) {
            elements.validationBanner.classList.remove('hidden');
            elements.validationMessage.textContent = 
                `${state.validationWarnings.length} template(s) have validation warnings`;
        }
    }

    function populateCategoryFilter() {
        if (!elements.categoryFilter) return;

        const sortedCategories = Array.from(state.categories).sort();
        elements.categoryFilter.innerHTML = '<option value="">All Categories</option>';
        
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            elements.categoryFilter.appendChild(option);
        });
    }

    function handleFilterChange() {
        const searchTerm = elements.searchInput?.value?.toLowerCase() || '';
        const category = elements.categoryFilter?.value || '';
        const type = elements.typeFilter?.value || '';
        const sort = elements.sortFilter?.value || 'name-asc';

        // Filter templates
        state.filteredTemplates = state.templates.filter(template => {
            // Category filter
            if (category && (!template.categories || !template.categories.includes(category))) {
                return false;
            }

            // Type filter
            if (type && template.type !== parseInt(type)) {
                return false;
            }

            // Search filter (fuzzy)
            if (searchTerm) {
                return fuzzyMatch(template, searchTerm);
            }

            return true;
        });

        // Sort templates
        sortTemplates(sort);

        // Update URL state
        updateURLState();

        // Render
        renderTemplates();
    }

    function fuzzyMatch(template, searchTerm) {
        const searchFields = [
            template.title || '',
            template.description || '',
            template.name || '',
            ...(template.categories || []),
            ...(template.env || []).map(e => e.name || e.label || '')
        ].join(' ').toLowerCase();

        // Simple fuzzy: check if all search words are present
        const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
        return searchWords.every(word => searchFields.includes(word));
    }

    function sortTemplates(sortType) {
        switch (sortType) {
            case 'name-asc':
                state.filteredTemplates.sort((a, b) => 
                    (a.title || '').localeCompare(b.title || ''));
                break;
            case 'name-desc':
                state.filteredTemplates.sort((a, b) => 
                    (b.title || '').localeCompare(a.title || ''));
                break;
            case 'category':
                state.filteredTemplates.sort((a, b) => {
                    const catA = (a.categories?.[0] || 'zzz').toLowerCase();
                    const catB = (b.categories?.[0] || 'zzz').toLowerCase();
                    return catA.localeCompare(catB);
                });
                break;
        }
    }

    function renderTemplates() {
        if (!elements.templateGrid) return;

        // Update results count
        if (elements.resultsCount) {
            elements.resultsCount.textContent = 
                `${state.filteredTemplates.length} of ${state.templates.length} templates`;
        }

        // Show empty state if no results
        if (state.filteredTemplates.length === 0) {
            elements.templateGrid.innerHTML = '';
            elements.emptyState.style.display = 'block';
            return;
        }

        elements.emptyState.style.display = 'none';

        // Render template cards
        const html = state.filteredTemplates.map(template => createTemplateCard(template)).join('');
        elements.templateGrid.innerHTML = html;
    }

    function createTemplateCard(template) {
        const name = template.name || template.title || 'untitled';
        const title = escapeHtml(template.title || 'Untitled');
        const description = escapeHtml(template.description || 'No description available');
        const category = template.categories?.[0] || '';
        const type = template.type || 1;
        const platform = template.platform || '';
        const logo = template.logo || '';

        // Risk indicators
        const risks = [];
        if (template.privileged) {
            risks.push({ type: 'danger', label: 'Privileged', icon: '⚠️' });
        }
        if (template.network === 'host') {
            risks.push({ type: 'warning', label: 'Host Network', icon: '🌐' });
        }
        if (template.ports?.length > 3) {
            risks.push({ type: 'warning', label: `${template.ports.length} Ports`, icon: '🔌' });
        }

        const typeLabels = { 1: 'Container', 2: 'Stack', 3: 'Compose' };

        return `
            <article class="template-card fade-in" role="listitem">
                <div class="card-header">
                    <div class="card-logo">
                        ${logo 
                            ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'card-logo-placeholder\\'>📦</span>'">`
                            : '<span class="card-logo-placeholder">📦</span>'
                        }
                    </div>
                    <div class="card-title-section">
                        <h3 class="card-title">${title}</h3>
                        <div class="card-badges">
                            ${category ? `<span class="badge badge-category">${escapeHtml(category)}</span>` : ''}
                            <span class="badge badge-type">${typeLabels[type] || 'Container'}</span>
                            ${platform ? `<span class="badge badge-platform">${escapeHtml(platform)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <p class="card-description">${description}</p>
                    ${risks.length > 0 ? `
                        <div class="risk-indicators">
                            ${risks.map(r => `
                                <span class="risk-badge ${r.type}" title="${r.label}">
                                    ${r.icon} ${r.label}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <div class="card-meta">
                        ${template.env?.length ? `<span>📝 ${template.env.length} env vars</span>` : ''}
                        ${template.volumes?.length ? `<span>💾 ${template.volumes.length} volumes</span>` : ''}
                    </div>
                    <a href="template.html?name=${encodeURIComponent(name)}" class="btn btn-primary btn-sm">
                        View Details →
                    </a>
                </div>
            </article>
        `;
    }

    // URL State Management
    function updateURLState() {
        const params = new URLSearchParams();
        
        if (elements.searchInput?.value) {
            params.set('q', elements.searchInput.value);
        }
        if (elements.categoryFilter?.value) {
            params.set('category', elements.categoryFilter.value);
        }
        if (elements.typeFilter?.value) {
            params.set('type', elements.typeFilter.value);
        }
        if (elements.sortFilter?.value && elements.sortFilter.value !== 'name-asc') {
            params.set('sort', elements.sortFilter.value);
        }

        const newURL = params.toString() 
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;

        window.history.replaceState({}, '', newURL);
    }

    function restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);

        if (elements.searchInput && params.has('q')) {
            elements.searchInput.value = params.get('q');
        }
        if (elements.categoryFilter && params.has('category')) {
            elements.categoryFilter.value = params.get('category');
        }
        if (elements.typeFilter && params.has('type')) {
            elements.typeFilter.value = params.get('type');
        }
        if (elements.sortFilter && params.has('sort')) {
            elements.sortFilter.value = params.get('sort');
        }

        if (state.templates.length > 0) {
            handleFilterChange();
        }
    }

    // Caching
    function getFromCache() {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CONFIG.CACHE_TTL) {
                localStorage.removeItem(CONFIG.CACHE_KEY);
                return null;
            }

            return data;
        } catch {
            return null;
        }
    }

    function saveToCache(data) {
        try {
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch {
            // Storage full or disabled
        }
    }

    // UI Helpers
    function showLoading(show) {
        state.isLoading = show;
        if (elements.loadingState) {
            elements.loadingState.style.display = show ? 'block' : 'none';
        }
        if (elements.templateGrid) {
            elements.templateGrid.style.display = show ? 'none' : 'grid';
        }
    }

    function showError(message) {
        state.error = message;
        if (elements.errorState) {
            elements.errorState.style.display = 'block';
        }
        if (elements.errorMessage) {
            elements.errorMessage.textContent = message;
        }
        if (elements.loadingState) {
            elements.loadingState.style.display = 'none';
        }
    }

    // Utilities
    function debounce(fn, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Global functions for onclick handlers
    window.clearFilters = function() {
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.categoryFilter) elements.categoryFilter.value = '';
        if (elements.typeFilter) elements.typeFilter.value = '';
        if (elements.sortFilter) elements.sortFilter.value = 'name-asc';
        handleFilterChange();
    };

    window.loadTemplates = loadTemplates;

})();
