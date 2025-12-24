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

    const TYPE_LABELS = { 1: 'Container', 2: 'Stack', 3: 'Compose' };
    const VIEW_MODES = ['grid', 'list', 'compact'];

    // State
    let state = {
        templates: [],
        filteredTemplates: [],
        categories: new Set(),
        isLoading: true,
        error: null,
        validationWarnings: [],
        viewMode: 'grid'
    };

    // DOM Elements
    const elements = {};

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        setupEventListeners();
        setupScrollObserver();
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
        elements.viewButtons = Array.from(document.querySelectorAll('.view-btn'));
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

        // View toggle buttons
        elements.viewButtons?.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.view || 'grid';
                setViewMode(mode);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', restoreStateFromURL);
    }

    function setupScrollObserver() {
        const header = document.querySelector('.header');
        if (!header) return;

        let lastScroll = 0;
        const scrollThreshold = 10;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

            if (currentScroll > scrollThreshold) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }

            lastScroll = currentScroll;
        }, { passive: true });
    }

    function setViewMode(mode, options = {}) {
        const normalized = VIEW_MODES.includes(mode) ? mode : 'grid';
        const force = options.force || false;

        if (!force && state.viewMode === normalized) {
            return;
        }

        state.viewMode = normalized;

        if (elements.templateGrid) {
            elements.templateGrid.dataset.view = normalized;
        }

        elements.viewButtons?.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === normalized);
        });

        if (!options.skipURL) {
            updateURLState();
        }
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

        // Extract categories, prepare metadata, and validate
        state.templates.forEach((template, index) => {
            prepareTemplate(template);

            if (template.categories) {
                template.categories.forEach(cat => state.categories.add(cat));
            }
            
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
        const searchFields = template._searchText || '';
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

        // Ensure grid is visible
        elements.templateGrid.style.display = 'grid';

        // Update results count
        if (elements.resultsCount) {
            elements.resultsCount.textContent =
                `${state.filteredTemplates.length} of ${state.templates.length} templates`;
        }

        // Show empty state if no results
        if (state.filteredTemplates.length === 0) {
            elements.templateGrid.innerHTML = '';
            if (elements.emptyState) {
                elements.emptyState.style.display = 'block';
            }
            return;
        }

        if (elements.emptyState) {
            elements.emptyState.style.display = 'none';
        }

        const fragment = document.createDocumentFragment();
        state.filteredTemplates.forEach(template => {
            if (!template._element) {
                prepareTemplate(template);
            }
            // Clone the node to avoid issues with moving elements
            const cardElement = template._element.cloneNode(true);
            fragment.appendChild(cardElement);
        });
        elements.templateGrid.replaceChildren(fragment);
    }

    function prepareTemplate(template = {}) {
        const pieces = [
            template.title,
            template.name,
            template.description,
            template.image,
            template.platform,
            ...(template.categories || []),
            ...(template.env || []).flatMap(env => [env.name, env.label, env.description])
        ];

        template._searchText = pieces
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        template._element = buildTemplateElement(template);
    }

    function buildTemplateElement(template) {
        const article = document.createElement('article');
        article.className = 'template-card';
        article.setAttribute('role', 'listitem');

        const header = document.createElement('div');
        header.className = 'card-header';

        const logoWrapper = document.createElement('div');
        logoWrapper.className = 'card-logo';

        const showPlaceholder = () => {
            logoWrapper.innerHTML = '';
            const placeholder = document.createElement('span');
            placeholder.className = 'card-logo-placeholder';
            placeholder.textContent = '📦';
            logoWrapper.appendChild(placeholder);
        };

        if (template.logo) {
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = template.logo;
            img.alt = '';
            img.addEventListener('error', showPlaceholder, { once: true });
            logoWrapper.appendChild(img);
        } else {
            showPlaceholder();
        }

        const titleSection = document.createElement('div');
        titleSection.className = 'card-title-section';
        const title = document.createElement('h3');
        title.className = 'card-title';
        title.textContent = template.title || 'Untitled';
        titleSection.appendChild(title);

        const badgeRow = document.createElement('div');
        badgeRow.className = 'card-badges';
        if (template.categories?.length) {
            const catBadge = document.createElement('span');
            catBadge.className = 'badge badge-category';
            catBadge.textContent = template.categories[0];
            badgeRow.appendChild(catBadge);
        }
        const typeBadge = document.createElement('span');
        typeBadge.className = 'badge badge-type';
        typeBadge.textContent = TYPE_LABELS[template.type] || 'Container';
        badgeRow.appendChild(typeBadge);
        if (template.platform) {
            const platformBadge = document.createElement('span');
            platformBadge.className = 'badge badge-platform';
            platformBadge.textContent = template.platform;
            badgeRow.appendChild(platformBadge);
        }
        titleSection.appendChild(badgeRow);

        header.appendChild(logoWrapper);
        header.appendChild(titleSection);

        const body = document.createElement('div');
        body.className = 'card-body';
        const desc = document.createElement('p');
        desc.className = 'card-description';
        desc.textContent = template.description || 'No description available yet.';
        body.appendChild(desc);

        const risks = getRiskIndicators(template);
        if (risks.length) {
            const riskWrap = document.createElement('div');
            riskWrap.className = 'risk-indicators';
            risks.forEach(risk => {
                const badge = document.createElement('span');
                badge.className = `risk-badge ${risk.type}`;
                badge.textContent = `${risk.icon} ${risk.label}`;
                badge.title = risk.label;
                riskWrap.appendChild(badge);
            });
            body.appendChild(riskWrap);
        }

        const footer = document.createElement('div');
        footer.className = 'card-footer';

        const meta = document.createElement('div');
        meta.className = 'card-meta';
        if (template.env?.length) {
            const envStat = document.createElement('span');
            envStat.textContent = `📝 ${template.env.length} env vars`;
            meta.appendChild(envStat);
        }
        if (template.volumes?.length) {
            const volStat = document.createElement('span');
            volStat.textContent = `💾 ${template.volumes.length} volumes`;
            meta.appendChild(volStat);
        }
        footer.appendChild(meta);

        const link = document.createElement('a');
        link.className = 'btn btn-primary btn-sm';
        const slug = template.name || template.title || 'untitled';
        link.href = `template.html?name=${encodeURIComponent(slug)}`;
        link.textContent = 'View Details →';
        footer.appendChild(link);

        article.appendChild(header);
        article.appendChild(body);
        article.appendChild(footer);

        return article;
    }

    function getRiskIndicators(template) {
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
        return risks;
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

        if (state.viewMode && state.viewMode !== 'grid') {
            params.set('view', state.viewMode);
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

        if (params.has('view')) {
            setViewMode(params.get('view'), { skipURL: true, force: true });
        } else {
            setViewMode('grid', { skipURL: true, force: true });
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
