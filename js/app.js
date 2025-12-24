/**
 * Portainer Templates - Main Application
 * Modern vanilla JS with caching and URL state
 */

(function() {
    'use strict';

    const CONFIG = {
        TEMPLATES_URL: 'templates.json',
        CACHE_KEY: 'portainer_templates_cache',
        CACHE_TTL: 3600000,
        DEBOUNCE_DELAY: 150
    };

    const TYPE_LABELS = { 1: 'Container', 2: 'Stack', 3: 'Compose' };
    const VIEW_MODES = ['grid', 'list', 'compact'];

    let state = {
        templates: [],
        filteredTemplates: [],
        categories: new Set(),
        isLoading: true,
        error: null,
        validationWarnings: [],
        viewMode: 'grid'
    };

    const elements = {};

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
        elements.viewButtons = Array.from(document.querySelectorAll('.view-btn'));
    }

    function setupEventListeners() {
        elements.searchInput?.addEventListener('input', debounce(handleFilterChange, CONFIG.DEBOUNCE_DELAY));
        elements.categoryFilter?.addEventListener('change', handleFilterChange);
        elements.typeFilter?.addEventListener('change', handleFilterChange);
        elements.sortFilter?.addEventListener('change', handleFilterChange);

        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== elements.searchInput) {
                e.preventDefault();
                elements.searchInput?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === elements.searchInput) {
                elements.searchInput.blur();
            }
        });

        elements.viewButtons?.forEach(btn => {
            btn.addEventListener('click', () => setViewMode(btn.dataset.view || 'grid'));
        });

        window.addEventListener('popstate', restoreStateFromURL);
    }

    function setViewMode(mode, options = {}) {
        const normalized = VIEW_MODES.includes(mode) ? mode : 'grid';
        if (!options.force && state.viewMode === normalized) return;

        state.viewMode = normalized;
        if (elements.templateGrid) elements.templateGrid.dataset.view = normalized;
        elements.viewButtons?.forEach(btn => btn.classList.toggle('active', btn.dataset.view === normalized));
        if (!options.skipURL) updateURLState();
    }

    async function loadTemplates() {
        showLoading(true);
        
        try {
            const cached = getFromCache();
            if (cached) {
                processTemplates(cached);
                showLoading(false);
                fetchTemplates().then(data => {
                    if (data) {
                        saveToCache(data);
                        processTemplates(data);
                        renderTemplates();
                    }
                }).catch(() => {});
                return;
            }

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
        if (!response.ok) throw new Error(`Failed to load templates (HTTP ${response.status})`);
        return await response.json();
    }

    function processTemplates(data) {
        if (!data?.templates || !Array.isArray(data.templates)) {
            throw new Error('Invalid template data format');
        }

        state.templates = data.templates;
        state.categories = new Set();
        state.validationWarnings = [];

        state.templates.forEach((template, index) => {
            prepareTemplate(template);
            if (template.categories) {
                template.categories.forEach(cat => state.categories.add(cat));
            }
            const warnings = validateTemplate(template, index);
            if (warnings.length > 0) state.validationWarnings.push(...warnings);
        });

        if (elements.templateCount) elements.templateCount.textContent = state.templates.length;
        if (elements.categoryCount) elements.categoryCount.textContent = state.categories.size;

        populateCategoryFilter();
        if (state.validationWarnings.length > 0) showValidationWarnings();
        handleFilterChange();
    }

    function validateTemplate(template, index) {
        const warnings = [];
        const id = template.title || `Template #${index}`;
        if (!template.title) warnings.push(`${id}: Missing title`);
        if (!template.image && template.type === 1) warnings.push(`${id}: Missing image`);
        if (template.privileged) warnings.push(`${id}: Uses privileged mode`);
        return warnings;
    }

    function showValidationWarnings() {
        if (elements.validationBanner && elements.validationMessage) {
            elements.validationBanner.classList.remove('hidden');
            elements.validationMessage.textContent = `${state.validationWarnings.length} template(s) have validation warnings`;
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

        state.filteredTemplates = state.templates.filter(template => {
            if (category && (!template.categories || !template.categories.includes(category))) return false;
            if (type && template.type !== parseInt(type)) return false;
            if (searchTerm) return fuzzyMatch(template, searchTerm);
            return true;
        });

        sortTemplates(sort);
        updateURLState();
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
                state.filteredTemplates.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                break;
            case 'name-desc':
                state.filteredTemplates.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
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
        elements.templateGrid.style.display = 'grid';

        if (elements.resultsCount) {
            elements.resultsCount.textContent = `${state.filteredTemplates.length} of ${state.templates.length} templates`;
        }

        if (state.filteredTemplates.length === 0) {
            elements.templateGrid.innerHTML = '';
            if (elements.emptyState) elements.emptyState.style.display = 'block';
            return;
        }

        if (elements.emptyState) elements.emptyState.style.display = 'none';

        const fragment = document.createDocumentFragment();
        state.filteredTemplates.forEach(template => {
            if (!template._element) prepareTemplate(template);
            fragment.appendChild(template._element.cloneNode(true));
        });
        elements.templateGrid.replaceChildren(fragment);
    }

    function prepareTemplate(template = {}) {
        const pieces = [
            template.title, template.name, template.description, template.image, template.platform,
            ...(template.categories || []),
            ...(template.env || []).flatMap(env => [env.name, env.label, env.description])
        ];
        template._searchText = pieces.filter(Boolean).join(' ').toLowerCase();
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
            logoWrapper.innerHTML = '<span class="card-logo-placeholder">📦</span>';
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
        desc.textContent = template.description || 'No description available.';
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
            envStat.textContent = `📝 ${template.env.length} vars`;
            meta.appendChild(envStat);
        }
        if (template.volumes?.length) {
            const volStat = document.createElement('span');
            volStat.textContent = `💾 ${template.volumes.length} vols`;
            meta.appendChild(volStat);
        }
        footer.appendChild(meta);

        const link = document.createElement('a');
        link.className = 'btn btn-primary btn-sm';
        const slug = template.name || template.title || 'untitled';
        link.href = `template.html?name=${encodeURIComponent(slug)}`;
        link.textContent = 'Details →';
        footer.appendChild(link);

        article.appendChild(header);
        article.appendChild(body);
        article.appendChild(footer);

        return article;
    }

    function getRiskIndicators(template) {
        const risks = [];
        if (template.privileged) risks.push({ type: 'danger', label: 'Privileged', icon: '⚠️' });
        if (template.network === 'host') risks.push({ type: 'warning', label: 'Host Net', icon: '🌐' });
        if (template.ports?.length > 3) risks.push({ type: 'warning', label: `${template.ports.length} Ports`, icon: '🔌' });
        return risks;
    }

    function updateURLState() {
        const params = new URLSearchParams();
        if (elements.searchInput?.value) params.set('q', elements.searchInput.value);
        if (elements.categoryFilter?.value) params.set('category', elements.categoryFilter.value);
        if (elements.typeFilter?.value) params.set('type', elements.typeFilter.value);
        if (elements.sortFilter?.value && elements.sortFilter.value !== 'name-asc') {
            params.set('sort', elements.sortFilter.value);
        }
        if (state.viewMode && state.viewMode !== 'grid') params.set('view', state.viewMode);

        const newURL = params.toString() 
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
        window.history.replaceState({}, '', newURL);
    }

    function restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (elements.searchInput && params.has('q')) elements.searchInput.value = params.get('q');
        if (elements.categoryFilter && params.has('category')) elements.categoryFilter.value = params.get('category');
        if (elements.typeFilter && params.has('type')) elements.typeFilter.value = params.get('type');
        if (elements.sortFilter && params.has('sort')) elements.sortFilter.value = params.get('sort');
        
        if (params.has('view')) {
            setViewMode(params.get('view'), { skipURL: true, force: true });
        } else {
            setViewMode('grid', { skipURL: true, force: true });
        }

        if (state.templates.length > 0) handleFilterChange();
    }

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
        } catch { return null; }
    }

    function saveToCache(data) {
        try {
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        } catch {}
    }

    function showLoading(show) {
        state.isLoading = show;
        if (elements.loadingState) elements.loadingState.style.display = show ? 'block' : 'none';
        if (elements.templateGrid) elements.templateGrid.style.display = show ? 'none' : 'grid';
    }

    function showError(message) {
        state.error = message;
        if (elements.errorState) elements.errorState.style.display = 'block';
        if (elements.errorMessage) elements.errorMessage.textContent = message;
        if (elements.loadingState) elements.loadingState.style.display = 'none';
    }

    function debounce(fn, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Global functions
    window.clearFilters = function() {
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.categoryFilter) elements.categoryFilter.value = '';
        if (elements.typeFilter) elements.typeFilter.value = '';
        if (elements.sortFilter) elements.sortFilter.value = 'name-asc';
        handleFilterChange();
    };

    window.copyTemplateUrl = function() {
        const urlElement = document.getElementById('homepage-template-url');
        const btnElement = document.getElementById('copy-url-btn');
        if (!urlElement || !btnElement) return;

        navigator.clipboard.writeText(urlElement.textContent).then(() => {
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '✅ Copied!';
            setTimeout(() => { btnElement.innerHTML = originalText; }, 2000);
        }).catch(() => alert('Failed to copy URL'));
    };

    window.loadTemplates = loadTemplates;
})();
