/**
 * Portainer Templates - Main Application
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

    let state = {
        templates: [],
        filteredTemplates: [],
        categories: new Set(),
        viewMode: 'grid'
    };

    const el = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        setupEventListeners();
        await loadTemplates();
        restoreStateFromURL();
    }

    function cacheElements() {
        el.searchInput = document.getElementById('search-input');
        el.categoryFilter = document.getElementById('category-filter');
        el.typeFilter = document.getElementById('type-filter');
        el.sortFilter = document.getElementById('sort-filter');
        el.templateGrid = document.getElementById('template-grid');
        el.loadingState = document.getElementById('loading-state');
        el.errorState = document.getElementById('error-state');
        el.emptyState = document.getElementById('empty-state');
        el.errorMessage = document.getElementById('error-message');
        el.resultsCount = document.getElementById('results-count');
        el.templateCount = document.getElementById('template-count');
        el.categoryCount = document.getElementById('category-count');
        el.validationBanner = document.getElementById('validation-banner');
        el.validationMessage = document.getElementById('validation-message');
    }

    function setupEventListeners() {
        el.searchInput?.addEventListener('input', debounce(handleFilterChange, CONFIG.DEBOUNCE_DELAY));
        el.categoryFilter?.addEventListener('change', handleFilterChange);
        el.typeFilter?.addEventListener('change', handleFilterChange);
        el.sortFilter?.addEventListener('change', handleFilterChange);

        // View toggle buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.viewMode = btn.dataset.view || 'grid';
                if (el.templateGrid) el.templateGrid.dataset.view = state.viewMode;
                updateURLState();
            });
        });

        // Event delegation for card clicks
        el.templateGrid?.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            if (card) {
                const idx = parseInt(card.dataset.index);
                if (!isNaN(idx) && state.filteredTemplates[idx]) {
                    openModal(state.filteredTemplates[idx]);
                }
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== el.searchInput) {
                e.preventDefault();
                el.searchInput?.focus();
            }
            if (e.key === 'Escape') {
                el.searchInput?.blur();
                closeModal();
            }
        });

        window.addEventListener('popstate', restoreStateFromURL);
    }

    async function loadTemplates() {
        showLoading(true);
        try {
            const cached = getFromCache();
            if (cached) {
                processTemplates(cached);
                showLoading(false);
                fetchTemplates().then(data => {
                    if (data) { saveToCache(data); processTemplates(data); renderTemplates(); }
                }).catch(() => {});
                return;
            }
            const data = await fetchTemplates();
            if (data) { saveToCache(data); processTemplates(data); }
        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    async function fetchTemplates() {
        const res = await fetch(CONFIG.TEMPLATES_URL);
        if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
        return res.json();
    }

    function processTemplates(data) {
        if (!data?.templates?.length) throw new Error('Invalid data');
        state.templates = data.templates;
        state.categories = new Set();

        state.templates.forEach(t => {
            // Build search text
            const parts = [t.title, t.name, t.description, t.image, t.platform, ...(t.categories || [])];
            if (t.env) t.env.forEach(e => parts.push(e.name, e.label, e.description));
            t._searchText = parts.filter(Boolean).join(' ').toLowerCase();
            t.categories?.forEach(c => state.categories.add(c));
        });

        if (el.templateCount) el.templateCount.textContent = state.templates.length;
        if (el.categoryCount) el.categoryCount.textContent = state.categories.size;

        populateCategoryFilter();
        
        // Show validation warnings
        const warnings = state.templates.filter(t => t.privileged).length;
        if (warnings && el.validationBanner && el.validationMessage) {
            el.validationBanner.classList.remove('hidden');
            el.validationMessage.textContent = `${warnings} template(s) have validation warnings`;
        }
        
        handleFilterChange();
    }

    function populateCategoryFilter() {
        if (!el.categoryFilter) return;
        const sorted = Array.from(state.categories).sort();
        el.categoryFilter.innerHTML = '<option value="">All Categories</option>';
        sorted.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            el.categoryFilter.appendChild(opt);
        });
    }

    function handleFilterChange() {
        const search = el.searchInput?.value?.toLowerCase() || '';
        const category = el.categoryFilter?.value || '';
        const type = el.typeFilter?.value || '';
        const sort = el.sortFilter?.value || 'name-asc';

        state.filteredTemplates = state.templates.filter(t => {
            if (category && !t.categories?.includes(category)) return false;
            if (type && t.type !== parseInt(type)) return false;
            if (search && !t._searchText.includes(search)) return false;
            return true;
        });

        // Sort
        state.filteredTemplates.sort((a, b) => {
            if (sort === 'name-desc') return (b.title || '').localeCompare(a.title || '');
            if (sort === 'category') return (a.categories?.[0] || 'zzz').localeCompare(b.categories?.[0] || 'zzz');
            return (a.title || '').localeCompare(b.title || '');
        });

        updateURLState();
        renderTemplates();
    }

    function renderTemplates() {
        if (!el.templateGrid) return;

        if (el.resultsCount) {
            el.resultsCount.textContent = `${state.filteredTemplates.length} of ${state.templates.length} templates`;
        }

        if (!state.filteredTemplates.length) {
            el.templateGrid.innerHTML = '';
            el.templateGrid.style.display = 'none';
            if (el.emptyState) el.emptyState.style.display = 'block';
            return;
        }

        if (el.emptyState) el.emptyState.style.display = 'none';
        el.templateGrid.style.display = 'grid';

        // Build all cards HTML
        const html = state.filteredTemplates.map((t, idx) => buildCardHTML(t, idx)).join('');
        el.templateGrid.innerHTML = html;
    }

    function buildCardHTML(t, idx) {
        const logoHtml = t.logo 
            ? `<img src="${esc(t.logo)}" alt="" onerror="this.outerHTML='<span class=card-logo-placeholder>📦</span>'">`
            : '<span class="card-logo-placeholder">📦</span>';

        const badges = [];
        if (t.categories?.[0]) badges.push(`<span class="badge badge-category">${esc(t.categories[0])}</span>`);
        badges.push(`<span class="badge badge-type">${TYPE_LABELS[t.type] || 'Container'}</span>`);
        if (t.platform) badges.push(`<span class="badge badge-platform">${esc(t.platform)}</span>`);

        const risks = [];
        if (t.privileged) risks.push('<span class="risk-badge danger">⚠️ Privileged</span>');
        if (t.network === 'host') risks.push('<span class="risk-badge warning">🌐 Host Net</span>');
        if (t.ports?.length > 3) risks.push(`<span class="risk-badge warning">🔌 ${t.ports.length} Ports</span>`);

        const meta = [];
        if (t.env?.length) meta.push(`<span>📝 ${t.env.length} vars</span>`);
        if (t.volumes?.length) meta.push(`<span>💾 ${t.volumes.length} vols</span>`);

        return `
            <article class="template-card" data-index="${idx}">
                <div class="card-top">
                    <div class="card-logo">${logoHtml}</div>
                    <div class="card-header">
                        <div class="card-title">${esc(t.title || 'Untitled')}</div>
                        <div class="card-badges">${badges.join('')}</div>
                    </div>
                </div>
                <div class="card-body">
                    <p class="card-desc">${esc(t.description || 'No description available.')}</p>
                    ${risks.length ? `<div class="risk-badges">${risks.join('')}</div>` : ''}
                </div>
                <div class="card-footer">
                    <div class="card-meta">${meta.join('')}</div>
                    <span class="card-action">View Details →</span>
                </div>
            </article>
        `;
    }

    function esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // Modal
    function openModal(t) {
        // Remove existing modal
        document.getElementById('modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const types = { 1: 'Container', 2: 'Stack', 3: 'Compose' };
        const risks = [];
        if (t.privileged) risks.push('<span class="risk-badge danger">⚠️ Privileged</span>');
        if (t.network === 'host') risks.push('<span class="risk-badge warning">🌐 Host Network</span>');
        if (t.ports?.length > 3) risks.push(`<span class="risk-badge warning">🔌 ${t.ports.length} Ports</span>`);

        const dockerRun = genDockerRun(t);
        const dockerCompose = genDockerCompose(t);

        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <div class="modal-logo">
                        ${t.logo ? `<img src="${esc(t.logo)}" alt="" onerror="this.outerHTML='📦'">` : '📦'}
                    </div>
                    <div class="modal-title-section">
                        <h2 class="modal-title">${esc(t.title || 'Untitled')}</h2>
                        <span class="modal-category">#${esc(t.categories?.[0] || 'Uncategorized')}</span>
                    </div>
                    <button class="modal-close" id="modal-close-btn">✕</button>
                </div>
                <div class="modal-body">
                    <div class="modal-section">
                        <div class="modal-section-title">Description</div>
                        <p class="modal-desc">${esc(t.description || 'No description available.')}</p>
                        ${risks.length ? `<div class="modal-badges">${risks.join('')}</div>` : ''}
                    </div>

                    <div class="modal-section">
                        <div class="modal-section-title">Details</div>
                        <div class="modal-info-grid">
                            <div class="modal-info-item">
                                <div class="modal-info-label">Type</div>
                                <div class="modal-info-value">${types[t.type] || 'Container'}</div>
                            </div>
                            <div class="modal-info-item">
                                <div class="modal-info-label">Platform</div>
                                <div class="modal-info-value">${esc(t.platform || 'linux')}</div>
                            </div>
                            <div class="modal-info-item">
                                <div class="modal-info-label">Image</div>
                                <div class="modal-info-value">${esc(t.image || '-')}</div>
                            </div>
                            ${t.ports?.length ? `<div class="modal-info-item"><div class="modal-info-label">Ports</div><div class="modal-info-value">${t.ports.join(', ')}</div></div>` : ''}
                            ${t.command ? `<div class="modal-info-item"><div class="modal-info-label">Command</div><div class="modal-info-value">${esc(t.command)}</div></div>` : ''}
                        </div>
                    </div>

                    ${t.env?.length ? `
                    <div class="modal-section">
                        <div class="modal-section-title">Environment Variables</div>
                        <div class="env-list">
                            ${t.env.map(e => `
                                <div class="env-item">
                                    <code class="env-name">${esc(e.name)}</code>
                                    <span class="env-default">${e.default || e.preset || e.label || '-'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${t.volumes?.length ? `
                    <div class="modal-section">
                        <div class="modal-section-title">Volumes</div>
                        <div class="env-list">
                            ${t.volumes.map(v => `
                                <div class="env-item">
                                    <code class="env-name">${esc(v.container)}</code>
                                    <span class="env-default">${v.bind || 'auto'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <div class="modal-section">
                        <div class="modal-section-title">Docker Run</div>
                        <div class="code-block">
                            <div class="code-header">
                                <span class="code-title">Terminal</span>
                                <button class="copy-btn" data-copy="${encodeURIComponent(dockerRun)}">Copy</button>
                            </div>
                            <pre class="code-content">${esc(dockerRun)}</pre>
                        </div>
                    </div>

                    <div class="modal-section">
                        <div class="modal-section-title">Docker Compose</div>
                        <div class="code-block">
                            <div class="code-header">
                                <span class="code-title">docker-compose.yml</span>
                                <button class="copy-btn" data-copy="${encodeURIComponent(dockerCompose)}">Copy</button>
                            </div>
                            <pre class="code-content">${esc(dockerCompose)}</pre>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        
        // Add event listeners
        document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
        overlay.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = decodeURIComponent(btn.dataset.copy);
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => btn.textContent = 'Copy', 2000);
                });
            });
        });

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
        
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
        }
        document.body.style.overflow = '';
    }

    // Generate Docker Run command
    function genDockerRun(t) {
        const parts = ['docker run -d'];
        if (t.name) parts.push(`--name ${t.name}`);
        if (t.restart_policy) parts.push(`--restart ${t.restart_policy}`);
        if (t.network) parts.push(`--network ${t.network}`);
        if (t.privileged) parts.push('--privileged');
        if (t.hostname) parts.push(`--hostname ${t.hostname}`);
        
        t.ports?.forEach(p => parts.push(`-p ${p}`));
        t.volumes?.forEach(v => parts.push(`-v ${v.bind || '/host/path'}:${v.container}`));
        t.env?.forEach(e => {
            const val = e.default || e.preset || 'value';
            parts.push(`-e ${e.name}="${val}"`);
        });
        
        parts.push(t.image || 'image:latest');
        if (t.command) parts.push(t.command);
        
        return parts.join(' \\\n  ');
    }

    // Generate Docker Compose YAML
    function genDockerCompose(t) {
        const name = (t.name || t.title || 'app').toLowerCase().replace(/[^a-z0-9]/g, '-');
        let yaml = `version: "3"\nservices:\n  ${name}:\n    image: ${t.image || 'image:latest'}\n    container_name: ${name}`;
        
        if (t.restart_policy) yaml += `\n    restart: ${t.restart_policy}`;
        if (t.network) yaml += `\n    network_mode: ${t.network}`;
        if (t.privileged) yaml += `\n    privileged: true`;
        if (t.hostname) yaml += `\n    hostname: ${t.hostname}`;
        
        if (t.ports?.length) {
            yaml += '\n    ports:';
            t.ports.forEach(p => yaml += `\n      - "${p}"`);
        }
        
        if (t.volumes?.length) {
            yaml += '\n    volumes:';
            t.volumes.forEach(v => yaml += `\n      - ${v.bind || './data'}:${v.container}`);
        }
        
        if (t.env?.length) {
            yaml += '\n    environment:';
            t.env.forEach(e => {
                const val = e.default || e.preset || '';
                yaml += `\n      - ${e.name}=${val}`;
            });
        }
        
        if (t.command) yaml += `\n    command: ${t.command}`;
        
        return yaml;
    }

    // URL State Management
    function updateURLState() {
        const params = new URLSearchParams();
        const search = el.searchInput?.value || '';
        const category = el.categoryFilter?.value || '';
        const type = el.typeFilter?.value || '';
        const sort = el.sortFilter?.value || '';
        
        if (search) params.set('q', search);
        if (category) params.set('cat', category);
        if (type) params.set('type', type);
        if (sort && sort !== 'name-asc') params.set('sort', sort);
        if (state.viewMode !== 'grid') params.set('view', state.viewMode);
        
        const url = params.toString() ? `?${params}` : window.location.pathname;
        history.replaceState(null, '', url);
    }

    function restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        
        if (el.searchInput && params.has('q')) el.searchInput.value = params.get('q');
        if (el.categoryFilter && params.has('cat')) el.categoryFilter.value = params.get('cat');
        if (el.typeFilter && params.has('type')) el.typeFilter.value = params.get('type');
        if (el.sortFilter && params.has('sort')) el.sortFilter.value = params.get('sort');
        
        if (params.has('view')) {
            state.viewMode = params.get('view');
            if (el.templateGrid) el.templateGrid.dataset.view = state.viewMode;
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === state.viewMode);
            });
        }
        
        if (state.templates.length) handleFilterChange();
    }

    // Cache functions
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
            // Storage full or unavailable
        }
    }

    // UI helpers
    function showLoading(show) {
        if (el.loadingState) el.loadingState.style.display = show ? 'block' : 'none';
        if (el.templateGrid) el.templateGrid.style.display = show ? 'none' : 'grid';
    }

    function showError(msg) {
        if (el.loadingState) el.loadingState.style.display = 'none';
        if (el.errorState) {
            el.errorState.style.display = 'block';
            if (el.errorMessage) el.errorMessage.textContent = msg;
        }
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Global functions for HTML onclick handlers
    window.clearFilters = function() {
        if (el.searchInput) el.searchInput.value = '';
        if (el.categoryFilter) el.categoryFilter.value = '';
        if (el.typeFilter) el.typeFilter.value = '';
        if (el.sortFilter) el.sortFilter.value = 'name-asc';
        handleFilterChange();
    };

    window.copyTemplateUrl = function() {
        const url = document.getElementById('template-url')?.textContent;
        if (url) {
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('copy-btn');
                if (btn) {
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => btn.textContent = 'Copy URL', 2000);
                }
            });
        }
    };

    window.loadTemplates = loadTemplates;

})();
