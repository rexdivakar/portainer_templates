/**
 * Portainer Templates - Template Detail Page
 * Styled like portainer-templates.as93.net
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
                document.title = `${template.title} | Portainer Templates`;
                renderTemplate();
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

        if (!template) throw new Error(`Template "${name}" not found`);
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

    function renderTemplate() {
        const container = document.getElementById('template-content');
        if (!container) return;

        const typeLabels = { 1: 'Container', 2: 'Stack', 3: 'Compose' };
        const dockerRun = generateDockerRun();
        const dockerCompose = generateDockerCompose();

        container.innerHTML = `
            <a href="index.html" class="back-link">← Back to Templates</a>

            <!-- Header Section - Like reference site -->
            <div class="detail-header">
                <div class="detail-top">
                    <div class="detail-logo">
                        ${template.logo 
                            ? `<img src="${escapeHtml(template.logo)}" alt="" onerror="this.parentElement.innerHTML='📦'">`
                            : '📦'
                        }
                    </div>
                    <div class="detail-title-section">
                        <h1 class="detail-title">${escapeHtml(template.title || 'Untitled')}</h1>
                        <span class="detail-category">${escapeHtml(template.categories?.[0] || 'Uncategorized')}</span>
                    </div>
                </div>
                
                <div class="detail-content">
                    <div class="detail-left">
                        <div class="detail-description">
                            ${escapeHtml(template.description || 'No description available.')}
                        </div>
                        ${getRisksHtml()}
                    </div>
                    <div class="info-table">
                        <div class="info-row">
                            <span class="info-label">Type</span>
                            <span class="info-value">${typeLabels[template.type] || 'Container'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Platform</span>
                            <span class="info-value">${escapeHtml(template.platform || 'linux')}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Image</span>
                            <span class="info-value">${escapeHtml(template.image || '-')}</span>
                        </div>
                        ${template.command ? `
                        <div class="info-row">
                            <span class="info-label">Command</span>
                            <span class="info-value">${escapeHtml(template.command)}</span>
                        </div>
                        ` : ''}
                        ${template.interactive ? `
                        <div class="info-row">
                            <span class="info-label">Interactive</span>
                            <span class="info-value">Yes</span>
                        </div>
                        ` : ''}
                        ${template.ports?.length ? `
                        <div class="info-row">
                            <span class="info-label">Ports</span>
                            <span class="info-value">${template.ports.join(', ')}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Installation Section -->
            <div class="section-card">
                <h2 class="section-title">Installation</h2>
                
                <h3 class="subsection-title">Via Portainer</h3>
                <ol class="install-steps">
                    <li>Ensure both <a href="https://docs.docker.com/get-docker/" target="_blank">Docker</a> and <a href="https://docs.portainer.io/start/install" target="_blank">Portainer</a> are installed, and up-to-date</li>
                    <li>Log into your Portainer web UI</li>
                    <li>Under Settings → App Templates, paste the below URL</li>
                    <li>Head to Home → App Templates, and the list of apps will show up</li>
                    <li>Select the app you wish to deploy, fill in any config options, and hit Deploy</li>
                </ol>
                
                <div class="template-url-section">
                    <div class="template-url-label">Template Import URL</div>
                    <div class="template-url-row">
                        <div class="url-display" id="template-url">${escapeHtml(CONFIG.TEMPLATE_JSON_URL)}</div>
                        <button class="btn btn-secondary" onclick="copyToClipboard(this, '${escapeForJS(CONFIG.TEMPLATE_JSON_URL)}')">Copy</button>
                    </div>
                </div>
            </div>

            <!-- Docker Run Section -->
            <div class="section-card">
                <h3 class="subsection-title">Via Docker Run</h3>
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-title">docker run</span>
                        <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeForJS(dockerRun)}\`)">Copy</button>
                    </div>
                    <pre class="code-content">${escapeHtml(dockerRun)}</pre>
                </div>
            </div>

            <!-- Docker Compose Section -->
            <div class="section-card">
                <h3 class="subsection-title">Via Docker Compose</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: var(--space-md);">
                    Save this file as <code>docker-compose.yml</code> and run <code>docker-compose up -d</code>
                </p>
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-title">docker-compose.yml</span>
                        <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeForJS(dockerCompose)}\`)">Copy</button>
                    </div>
                    <pre class="code-content">${escapeHtml(dockerCompose)}</pre>
                </div>
            </div>

            ${renderEnvSection()}
            ${renderVolumesSection()}
        `;
    }

    function getRisksHtml() {
        const risks = [];
        if (template.privileged) risks.push({ type: 'danger', label: 'Privileged Mode', icon: '⚠️' });
        if (template.network === 'host') risks.push({ type: 'warning', label: 'Host Network', icon: '🌐' });
        if (template.ports?.length > 3) risks.push({ type: 'warning', label: `${template.ports.length} Ports`, icon: '🔌' });
        
        if (risks.length === 0) return '';
        
        return `
            <div class="detail-risks">
                ${risks.map(r => `<span class="risk-badge ${r.type}">${r.icon} ${r.label}</span>`).join('')}
            </div>
        `;
    }

    function renderEnvSection() {
        if (!template.env?.length) return '';
        
        return `
            <div class="section-card">
                <h3 class="subsection-title">Environment Variables</h3>
                <table class="env-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Default</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${template.env.map(env => `
                            <tr>
                                <td><code class="env-name">${escapeHtml(env.name)}</code></td>
                                <td><code>${escapeHtml(env.default || env.preset || '-')}</code></td>
                                <td>${escapeHtml(env.description || env.label || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderVolumesSection() {
        if (!template.volumes?.length) return '';
        
        return `
            <div class="section-card">
                <h3 class="subsection-title">Volumes</h3>
                <table class="env-table">
                    <thead>
                        <tr>
                            <th>Container Path</th>
                            <th>Host Path</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${template.volumes.map(vol => `
                            <tr>
                                <td><code class="env-name">${escapeHtml(vol.container)}</code></td>
                                <td>${vol.bind ? `<code>${escapeHtml(vol.bind)}</code>` : '<em style="color: var(--text-muted);">Not specified</em>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function generateDockerRun() {
        const parts = ['docker run -d \\'];
        if (template.name) parts.push(`  --name ${template.name} \\`);
        if (template.ports) template.ports.forEach(port => parts.push(`  -p ${port} \\`));
        if (template.env) template.env.forEach(env => {
            const value = env.default || env.preset || `<${env.name}>`;
            parts.push(`  -e ${env.name}="${value}" \\`);
        });
        if (template.volumes) template.volumes.forEach(vol => {
            parts.push(vol.bind ? `  -v ${vol.bind}:${vol.container} \\` : `  -v ${vol.container} \\`);
        });
        if (template.restart_policy) parts.push(`  --restart ${template.restart_policy} \\`);
        if (template.privileged) parts.push('  --privileged \\');
        if (template.network) parts.push(`  --network ${template.network} \\`);
        
        // Last line without backslash
        let lastLine = `  ${template.image || 'image:latest'}`;
        if (template.command) lastLine += ` ${template.command}`;
        parts.push(lastLine);
        
        return parts.join('\n');
    }

    function generateDockerCompose() {
        const name = template.name || template.title?.toLowerCase().replace(/\s+/g, '-') || 'app';
        let compose = `version: '3.8'\nservices:\n  ${name}:\n    image: ${template.image || 'image:latest'}`;
        
        if (template.ports?.length) {
            compose += `\n    ports:`;
            template.ports.forEach(port => compose += `\n      - "${port}"`);
        }
        if (template.env?.length) {
            compose += `\n    environment:`;
            template.env.forEach(env => compose += `\n      - ${env.name}=${env.default || env.preset || ''}`);
        }
        if (template.volumes?.length) {
            compose += `\n    volumes:`;
            template.volumes.forEach(vol => compose += vol.bind ? `\n      - ${vol.bind}:${vol.container}` : `\n      - ${vol.container}`);
        }
        if (template.restart_policy) compose += `\n    restart: ${template.restart_policy}`;
        if (template.privileged) compose += `\n    privileged: true`;
        if (template.network) compose += `\n    network_mode: ${template.network}`;
        if (template.command) compose += `\n    command: ${template.command}`;
        
        return compose;
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

    window.copyToClipboard = function(btn, text) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✓ Copied!';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            btn.innerHTML = '✓ Copied!';
            setTimeout(() => { btn.innerHTML = 'Copy'; }, 2000);
        });
    };
})();
