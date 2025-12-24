/**
 * Portainer Templates - Template Detail Page
 */

(function() {
    'use strict';

    const CONFIG = {
        TEMPLATES_URL: 'templates.json',
        TEMPLATE_JSON_URL: 'https://raw.githubusercontent.com/rexdivakar/portainer_templates/main/templates.json'
    };

    let template = null;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        const templateName = getTemplateNameFromURL();
        if (!templateName) {
            showError('No template specified');
            return;
        }

        try {
            await loadTemplate(templateName);
            if (template) {
                renderTemplate();
                setupTabs();
            }
        } catch (error) {
            showError(error.message);
        }
    }

    function getTemplateNameFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('name');
    }

    async function loadTemplate(name) {
        const response = await fetch(CONFIG.TEMPLATES_URL);
        if (!response.ok) throw new Error('Failed to load templates');
        
        const data = await response.json();
        template = data.templates.find(t => 
            (t.name || t.title || '').toLowerCase() === name.toLowerCase()
        );

        if (!template) {
            throw new Error(`Template "${name}" not found`);
        }
    }

    function renderTemplate() {
        const container = document.getElementById('template-content');
        if (!container) return;

        const typeLabels = { 1: 'Container', 2: 'Stack', 3: 'Compose' };
        const risks = getRisks();

        container.innerHTML = `
            <a href="index.html" class="back-link">← Back to Templates</a>

            <header class="detail-header">
                <div class="detail-logo">
                    ${template.logo 
                        ? `<img src="${escapeHtml(template.logo)}" alt="" onerror="this.parentElement.innerHTML='📦'">`
                        : '📦'
                    }
                </div>
                <div class="detail-info">
                    <h1 class="detail-title">${escapeHtml(template.title || 'Untitled')}</h1>
                    <div class="detail-badges">
                        ${template.categories?.map(c => 
                            `<span class="badge badge-category">${escapeHtml(c)}</span>`
                        ).join('') || ''}
                        <span class="badge badge-type">${typeLabels[template.type] || 'Container'}</span>
                        ${template.platform ? `<span class="badge badge-platform">${escapeHtml(template.platform)}</span>` : ''}
                    </div>
                    <p class="detail-description">${escapeHtml(template.description || '')}</p>
                    ${risks.length > 0 ? `
                        <div class="risk-indicators" style="margin-top: 1rem;">
                            ${risks.map(r => `
                                <span class="risk-badge ${r.type}">${r.icon} ${r.label}</span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </header>

            <nav class="tabs" role="tablist">
                <button class="tab-btn active" data-tab="overview" role="tab" aria-selected="true">Overview</button>
                <button class="tab-btn" data-tab="env" role="tab">Environment Variables</button>
                <button class="tab-btn" data-tab="docker" role="tab">Docker Commands</button>
                <button class="tab-btn" data-tab="install" role="tab">Install on Portainer</button>
            </nav>

            <div id="tab-overview" class="tab-content active" role="tabpanel">
                ${renderOverviewTab()}
            </div>

            <div id="tab-env" class="tab-content" role="tabpanel">
                ${renderEnvTab()}
            </div>

            <div id="tab-docker" class="tab-content" role="tabpanel">
                ${renderDockerTab()}
            </div>

            <div id="tab-install" class="tab-content" role="tabpanel">
                ${renderInstallTab()}
            </div>
        `;
    }

    function getRisks() {
        const risks = [];
        if (template.privileged) {
            risks.push({ type: 'danger', label: 'Privileged Mode', icon: '⚠️' });
        }
        if (template.network === 'host') {
            risks.push({ type: 'warning', label: 'Host Network', icon: '🌐' });
        }
        if (template.ports?.length > 3) {
            risks.push({ type: 'warning', label: `${template.ports.length} Exposed Ports`, icon: '🔌' });
        }
        return risks;
    }

    function renderOverviewTab() {
        return `
            ${template.note ? `
                <div class="note-box info">
                    <span class="note-icon">ℹ️</span>
                    <div class="note-content">${template.note}</div>
                </div>
            ` : ''}

            <div class="info-card">
                <h3>📦 Container Information</h3>
                <div class="info-grid">
                    ${template.image ? `
                        <div class="info-item">
                            <label>Image</label>
                            <span>${escapeHtml(template.image)}</span>
                        </div>
                    ` : ''}
                    ${template.restart_policy ? `
                        <div class="info-item">
                            <label>Restart Policy</label>
                            <span>${escapeHtml(template.restart_policy)}</span>
                        </div>
                    ` : ''}
                    ${template.platform ? `
                        <div class="info-item">
                            <label>Platform</label>
                            <span>${escapeHtml(template.platform)}</span>
                        </div>
                    ` : ''}
                    ${template.maintainer ? `
                        <div class="info-item">
                            <label>Maintainer</label>
                            <span><a href="${escapeHtml(template.maintainer)}" target="_blank" rel="noopener">${escapeHtml(template.maintainer)}</a></span>
                        </div>
                    ` : ''}
                </div>
            </div>

            ${template.ports?.length ? `
                <div class="info-card">
                    <h3>🔌 Ports</h3>
                    <div class="info-grid">
                        ${template.ports.map(port => `
                            <div class="info-item">
                                <label>Port</label>
                                <span>${escapeHtml(String(port))}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${template.volumes?.length ? `
                <div class="info-card">
                    <h3>💾 Volumes</h3>
                    <div class="info-grid">
                        ${template.volumes.map(vol => `
                            <div class="info-item">
                                <label>${vol.bind ? 'Bind Mount' : 'Volume'}</label>
                                <span>${escapeHtml(vol.container)}${vol.bind ? ` → ${escapeHtml(vol.bind)}` : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${template.repository ? `
                <div class="info-card">
                    <h3>📁 Repository</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>URL</label>
                            <span><a href="${escapeHtml(template.repository.url)}" target="_blank" rel="noopener">${escapeHtml(template.repository.url)}</a></span>
                        </div>
                        ${template.repository.stackfile ? `
                            <div class="info-item">
                                <label>Stack File</label>
                                <span>${escapeHtml(template.repository.stackfile)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        `;
    }

    function renderEnvTab() {
        if (!template.env?.length) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <h3>No Environment Variables</h3>
                    <p>This template doesn't require any environment variables.</p>
                </div>
            `;
        }

        const required = template.env.filter(e => !e.default && !e.preset);
        const optional = template.env.filter(e => e.default || e.preset);

        return `
            ${required.length ? `
                <div class="info-card">
                    <h3>🔴 Required Variables</h3>
                    <table class="env-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Label</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${required.map(env => `
                                <tr>
                                    <td><code class="env-name">${escapeHtml(env.name)}</code></td>
                                    <td>${escapeHtml(env.label || '-')}</td>
                                    <td>${escapeHtml(env.description || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            ${optional.length ? `
                <div class="info-card">
                    <h3>🟢 Optional Variables</h3>
                    <table class="env-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Default</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${optional.map(env => `
                                <tr>
                                    <td><code class="env-name">${escapeHtml(env.name)}</code></td>
                                    <td><code>${escapeHtml(env.default || env.preset || '-')}</code></td>
                                    <td>${escapeHtml(env.description || env.label || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}
        `;
    }

    function renderDockerTab() {
        const dockerRun = generateDockerRun();
        const dockerCompose = generateDockerCompose();

        return `
            <div class="code-block">
                <div class="code-header">
                    <span class="code-title">Docker Run</span>
                    <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeForJS(dockerRun)}\`)">
                        📋 Copy
                    </button>
                </div>
                <pre class="code-content">${escapeHtml(dockerRun)}</pre>
            </div>

            <div class="code-block">
                <div class="code-header">
                    <span class="code-title">Docker Compose</span>
                    <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeForJS(dockerCompose)}\`)">
                        📋 Copy
                    </button>
                </div>
                <pre class="code-content">${escapeHtml(dockerCompose)}</pre>
            </div>
        `;
    }

    function generateDockerRun() {
        const parts = ['docker run -d'];
        
        if (template.name) {
            parts.push(`  --name ${template.name}`);
        }

        if (template.ports) {
            template.ports.forEach(port => {
                parts.push(`  -p ${port}`);
            });
        }

        if (template.env) {
            template.env.forEach(env => {
                const value = env.default || env.preset || `<${env.name}>`;
                parts.push(`  -e ${env.name}="${value}"`);
            });
        }

        if (template.volumes) {
            template.volumes.forEach(vol => {
                if (vol.bind) {
                    parts.push(`  -v ${vol.bind}:${vol.container}`);
                } else {
                    parts.push(`  -v ${vol.container}`);
                }
            });
        }

        if (template.restart_policy) {
            parts.push(`  --restart ${template.restart_policy}`);
        }

        if (template.privileged) {
            parts.push('  --privileged');
        }

        if (template.network) {
            parts.push(`  --network ${template.network}`);
        }

        parts.push(`  ${template.image || 'image:latest'}`);

        if (template.command) {
            parts.push(`  ${template.command}`);
        }

        return parts.join(' \\\n');
    }

    function generateDockerCompose() {
        const name = template.name || template.title?.toLowerCase().replace(/\s+/g, '-') || 'app';
        
        let compose = `version: '3.8'
services:
  ${name}:
    image: ${template.image || 'image:latest'}`;

        if (template.ports?.length) {
            compose += `\n    ports:`;
            template.ports.forEach(port => {
                compose += `\n      - "${port}"`;
            });
        }

        if (template.env?.length) {
            compose += `\n    environment:`;
            template.env.forEach(env => {
                const value = env.default || env.preset || '';
                compose += `\n      - ${env.name}=${value}`;
            });
        }

        if (template.volumes?.length) {
            compose += `\n    volumes:`;
            template.volumes.forEach(vol => {
                if (vol.bind) {
                    compose += `\n      - ${vol.bind}:${vol.container}`;
                } else {
                    compose += `\n      - ${vol.container}`;
                }
            });
        }

        if (template.restart_policy) {
            compose += `\n    restart: ${template.restart_policy}`;
        }

        if (template.privileged) {
            compose += `\n    privileged: true`;
        }

        if (template.network) {
            compose += `\n    network_mode: ${template.network}`;
        }

        return compose;
    }

    function renderInstallTab() {
        const templateUrl = CONFIG.TEMPLATE_JSON_URL;

        return `
            <div class="install-url-box">
                <h3>🚀 Install on Portainer</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                    Add this URL to your Portainer instance to access all templates
                </p>
                <div class="url-display" id="template-url">${escapeHtml(templateUrl)}</div>
                <button class="btn btn-primary" onclick="copyToClipboard(this, '${escapeForJS(templateUrl)}')">
                    📋 Copy Template URL
                </button>
            </div>

            <div class="info-card" style="margin-top: 2rem;">
                <h3>📖 Installation Steps</h3>
                <ol style="color: var(--text-secondary); padding-left: 1.5rem; line-height: 2;">
                    <li>Log into your Portainer web interface</li>
                    <li>Navigate to <strong>Settings → App Templates</strong></li>
                    <li>Paste the URL above into the <strong>URL</strong> field</li>
                    <li>Click <strong>Save settings</strong></li>
                    <li>Go to <strong>App Templates</strong> in the sidebar</li>
                    <li>Find <strong>${escapeHtml(template.title)}</strong> and click <strong>Deploy</strong></li>
                </ol>
            </div>
        `;
    }

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update buttons
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                // Update content
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
            });
        });
    }

    function showError(message) {
        const container = document.getElementById('template-content');
        if (container) {
            container.innerHTML = `
                <a href="index.html" class="back-link">← Back to Templates</a>
                <div class="error-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Error Loading Template</h3>
                    <p>${escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeForJS(str) {
        return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    }

    // Global copy function
    window.copyToClipboard = function(btn, text) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('copied');
            }, 2000);
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            btn.innerHTML = '✅ Copied!';
            setTimeout(() => {
                btn.innerHTML = '📋 Copy';
            }, 2000);
        });
    };

})();
