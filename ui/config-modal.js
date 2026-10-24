/**
 * config-modal.js - API 配置弹窗（增强版）
 * 支持连接测试、模型列表、测试消息
 * 使用 CSS class 驱动样式，适配暗色/亮色主题
 * 依赖：api-service.js
 */

// Shared presentation layer for configuration and nested prompt editors (also on the start screen).
(function () {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('settings-dialogs.css', document.currentScript.src).href;
    document.head.appendChild(link);
})();

function showConfigModal(gotRole) {
    var existing = document.getElementById('api-config-modal');
    if (existing) closeConfigModal();

    var got = window.gotGeneration;
    var role = got && (gotRole === 'middleware' ? 'middleware' : 'prose');
    var config = got ? got.configForUI(role) : apiService.getConfig();
    // 内容区 HTML（与外层结构无关）
    var _emb = !got && (typeof embeddingService !== 'undefined') ? embeddingService : null;
    var innerHtml =
        '<h3 class="cfg-title" id="api-config-title">API 配置</h3>' +
        '<div class="cfg-scroll-body">' +
        '<p class="cfg-hint">请输入您的 API 信息。支持 OpenAI 兼容格式与 Gemini API。密钥仅保存在浏览器本地。</p>' +

        // API 类型
        '<div class="cfg-field"><label class="cfg-label">API 类型</label>' +
        '<select id="api-type-select" class="cfg-input">' +
        '<option value="openai"' + (config.type === 'openai' ? ' selected' : '') + '>OpenAI 兼容</option>' +
        '<option value="gemini"' + (config.type === 'gemini' ? ' selected' : '') + '>Gemini</option></select></div>' +

        // API 地址
        '<div class="cfg-field"><label class="cfg-label">API 地址（Endpoint）</label>' +
        '<input id="api-endpoint-input" type="text" placeholder="如 https://api.openai.com/v1" value="' + _escapeHtml(config.endpoint) + '" class="cfg-input"></div>' +

        // API Key
        '<div class="cfg-field"><label class="cfg-label">API Key</label>' +
        '<input id="api-key-input" type="password" placeholder="sk-..." value="' + _escapeHtml(config.apiKey) + '" class="cfg-input"></div>' +

        // 连接测试按钮 + 切换设置按钮
        '<div class="cfg-field cfg-row">' +
        '<button id="api-connect-btn" onclick="_doConnectTest()" class="cfg-btn cfg-btn-blue">🔗 连接测试</button>' +
        '<button onclick="_togglePresetDropdown()" class="cfg-btn cfg-btn-subtle">⚙ 切换设置</button>' +
        '</div>' +
        '<div id="api-preset-container" style="display:none;margin-top:-4px;margin-bottom:4px"></div>' +
        // 连接状态 + 分隔线
        '<div class="cfg-field" style="padding-top:0;margin-top:-4px">' +
        '<span id="api-connect-status" class="cfg-status">未连接</span></div>' +
        '<hr style="margin:6px 0 10px;border:none;border-top:1px solid rgba(128,128,128,0.2)">' +

        // 模型选择区域
        '<div class="cfg-field">' +
        '<label class="cfg-label">模型选择</label>' +
        '<div class="cfg-row" style="margin-bottom:6px">' +
        '<select id="api-model-select" class="cfg-input" style="flex:1" onchange="_onModelSelected()" disabled>' +
        '<option value="">-- 请先连接测试 --</option></select>' +
        '<button onclick="_toggleManualModel()" class="cfg-btn cfg-btn-subtle">✎ 手动输入</button></div>' +
        '<input id="api-model-input" type="text" placeholder="如 gpt-4o-mini" value="' + _escapeHtml(config.model) + '" class="cfg-input"></div>' +

        // Temperature + 最大输出 Token
        '<div class="cfg-field cfg-row">' +
        '<div style="flex:1"><label class="cfg-label">Temperature</label>' +
        '<input id="api-temp-input" type="number" min="0" max="2" step="0.05" value="' + config.temperature + '" class="cfg-input"></div>' +
        '<div style="flex:1"><label class="cfg-label">最大输出 Token</label>' +
        '<input id="api-max-tokens-input" type="number" min="100" max="128000" step="100" value="' + config.maxOutputTokens + '" class="cfg-input"></div></div>' +

        // Top P + Top K（默认不勾选=不发送该参数，勾上才带进请求体）
        '<div class="cfg-field cfg-row">' +
        '<div style="flex:1"><label class="cfg-label">Top P</label>' +
        '<div class="cfg-row" style="align-items:center;gap:6px">' +
        '<input id="api-top-p-input" type="number" min="0" max="1" step="0.01" value="' + config.topP + '" class="cfg-input" style="flex:1">' +
        '<label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;font-size:12px">' +
        '<input type="checkbox" id="api-top-p-enabled"' + (config.topPEnabled ? ' checked' : '') + '>启用</label></div></div>' +
        '<div style="flex:1"><label class="cfg-label">Top K</label>' +
        '<div class="cfg-row" style="align-items:center;gap:6px">' +
        '<input id="api-top-k-input" type="number" min="0" max="500" step="1" value="' + config.topK + '" class="cfg-input" style="flex:1">' +
        '<label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;font-size:12px">' +
        '<input type="checkbox" id="api-top-k-enabled"' + (config.topKEnabled ? ' checked' : '') + '>启用</label></div></div></div>' +

        // Frequency Penalty + Presence Penalty（同样默认不勾选）
        '<div class="cfg-field cfg-row">' +
        '<div style="flex:1"><label class="cfg-label">Frequency Penalty</label>' +
        '<div class="cfg-row" style="align-items:center;gap:6px">' +
        '<input id="api-freq-penalty-input" type="number" min="-2" max="2" step="0.05" value="' + config.frequencyPenalty + '" class="cfg-input" style="flex:1">' +
        '<label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;font-size:12px">' +
        '<input type="checkbox" id="api-freq-penalty-enabled"' + (config.frequencyPenaltyEnabled ? ' checked' : '') + '>启用</label></div></div>' +
        '<div style="flex:1"><label class="cfg-label">Presence Penalty</label>' +
        '<div class="cfg-row" style="align-items:center;gap:6px">' +
        '<input id="api-pres-penalty-input" type="number" min="-2" max="2" step="0.05" value="' + config.presencePenalty + '" class="cfg-input" style="flex:1">' +
        '<label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;font-size:12px">' +
        '<input type="checkbox" id="api-pres-penalty-enabled"' + (config.presencePenaltyEnabled ? ' checked' : '') + '>启用</label></div></div></div>' +

        // 上下文窗口 + 请求方式（流式/非流式）
        '<div class="cfg-field cfg-row">' +
        '<div style="flex:1"><label class="cfg-label">上下文窗口（Token）</label>' +
        '<input id="api-ctx-tokens-input" type="number" min="1000" max="2000000" step="1000" value="' + config.maxContextTokens + '" class="cfg-input"></div>' +
        '<div style="flex:1"><label class="cfg-label">请求方式</label>' +
        '<select id="api-stream-mode-select" class="cfg-input">' +
        '<option value="stream"' + (config.streamMode !== 'non-stream' ? ' selected' : '') + '>流式</option>' +
        '<option value="non-stream"' + (config.streamMode === 'non-stream' ? ' selected' : '') + '>非流式</option>' +
        '</select></div></div>' +

        // CORS 代理地址（网页与 APK 均显示；勾选启用后才生效，默认 web 勾 / APK 不勾）
        '<div class="cfg-field" id="cors-proxy-field"><label class="cfg-label">CORS 代理</label>' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px">' +
        '<input type="checkbox" id="api-cors-proxy-enabled"' + (config.corsProxyEnabled ? ' checked' : '') + '>' +
        '<span style="font-size:12px;color:rgba(55,55,55,0.7)">启用 CORS 代理（勾选后通过代理中转 API 请求）</span></label>' +
        '<input id="api-cors-proxy-input" type="text" placeholder="https://your-worker.your-name.workers.dev" value="' + _escapeHtml(config.corsProxyUrl || '') + '" class="cfg-input">' +
        '<div class="cfg-notice" style="margin-top:4px">勾选后通过代理中转。线上部署且 API 不支持 CORS（如 OpenAI 官方）时需启用；本地 file:// 与 APK 通常直连即可（APK 默认不勾）。</div>' +
        '</div>' +

        // 测试消息
        '<div class="cfg-field">' +
        '<button id="api-test-btn" onclick="_doSendTest()" class="cfg-btn cfg-btn-green">📨 发送测试消息</button>' +
        '<div id="api-test-result" class="cfg-test-result"></div></div>' +

        // ===== Embedding 配置（Phase 3）=====
        '<hr style="margin:12px 0;border-color:rgba(255,255,255,0.15)">' +
        '<div class="cfg-section-title" style="font-size:13px;font-weight:600;margin-bottom:8px">🔍 向量化记忆（可选）</div>' +
        '<div class="cfg-field"><label class="cfg-label">启用向量召回</label>' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">' +
        '<input type="checkbox" id="emb-enabled-input"' + (_emb && _emb.isEnabled() ? ' checked' : '') + '>' +
        '<span style="font-size:12px;color:rgba(55,55,55,0.6)">启用后可召回语义相关的历史摘要</span></label></div>' +
        '<div class="cfg-field"><label class="cfg-label">Embedding 地址</label>' +
        '<input id="emb-endpoint-input" type="text" class="cfg-input" placeholder="https://api.siliconflow.cn/v1/embeddings" value="' +
        _escapeHtml((_emb && _emb.getConfig().endpoint) || '') + '"></div>' +
        '<div class="cfg-field"><label class="cfg-label">Embedding Key</label>' +
        '<input id="emb-key-input" type="password" class="cfg-input" placeholder="独立 Key，不复用主 API Key" value="' +
        _escapeHtml((_emb && _emb.getConfig().apiKey) || '') + '"></div>' +
        '<div class="cfg-field"><label class="cfg-label">模型名称</label>' +
        '<input id="emb-model-input" type="text" class="cfg-input" placeholder="BAAI/bge-m3" value="' +
        _escapeHtml((_emb && _emb.getConfig().model) || 'BAAI/bge-m3') + '"></div>' +
        '<div class="cfg-field"><label class="cfg-label">重排模型（Rerank）</label>' +
        '<input id="emb-rerank-model-input" type="text" class="cfg-input" placeholder="BAAI/bge-reranker-v2-m3" value="' +
        _escapeHtml((_emb && _emb.getConfig().rerankModel) || 'BAAI/bge-reranker-v2-m3') + '"></div>' +
        '<div class="cfg-field">' +
        '<button class="cfg-btn" onclick="_doEmbeddingTest()">🔌 测试连接</button>&nbsp;' +
        '<button class="cfg-btn" onclick="_doRebuildEmbeddingIndex()">🔄 重建索引</button>' +
        '<div id="emb-status" style="font-size:12px;margin-top:6px;color:rgba(255,255,255,0.6)"></div>' +
        '<div id="emb-progress" style="font-size:12px;margin-top:4px;color:rgba(255,255,255,0.5)"></div>' +
        '</div>' +

        // 安全提示
        '<div class="cfg-notice">⚠️ API Key 仅保存在浏览器本地，不会上传到任何服务器。请使用支持 CORS 的中转站或部署代理服务。</div>' +

        // 底部按钮
        '</div><div class="cfg-footer">' +
        '<button class="cfg-btn cfg-btn-subtle" onclick="closeConfigModal()">取消</button>' +
        '<button class="cfg-btn cfg-btn-green" onclick="saveConfigAndClose()">保存</button></div>';

    if (got) {
        innerHtml = innerHtml.replace('API 配置</h3>', (role === 'prose' ? '正文 API' : '中间层 API') + '</h3>');
        innerHtml = innerHtml.replace('支持 OpenAI 兼容格式与 Gemini API。','支持 OpenAI兼容、原生Gemini和Vertex服务账号。真实服务表现待测试。');
        innerHtml = innerHtml.replace('密钥仅保存在浏览器本地。', '密钥保存在本机服务，页面不回显。空栏保留本地址已有密钥。');
        var cut = innerHtml.indexOf('<hr style="margin:12px');
        var notice = innerHtml.indexOf('<div class="cfg-notice">');
        if(role!=='middleware'||!window.gotMemory)innerHtml = innerHtml.slice(0,cut) + innerHtml.slice(notice);
        innerHtml = innerHtml.replace(/<div class="cfg-notice">[\s\S]*?<\/div>/, '<div class="cfg-notice">保存与查看不产生服务请求。密钥由本机服务保存，不进入游戏存档。测试、总结与索引会请求所配置服务；自动处理默认关闭。</div>');
        innerHtml = innerHtml.replace('</div><div class="cfg-footer">', '<div class="cfg-field"><label>超时（毫秒）<input id="got-timeout" class="cfg-input" type="number" value="'+config.timeoutMs+'"></label><label>本路请求次数上限<input id="got-max-calls" class="cfg-input" type="number" value="'+config.maxCalls+'"></label></div><p id="got-config-status" role="status">'+(config.saved ? '已有本机密钥；不回显。' : '尚未保存此连接。')+'</p></div><div class="cfg-footer">');
    }
    var html;
    if (typeof fitModalToViewport === 'function') {
        // index.html 环境：用 modal viewport-overlay 结构，交给 fitModalToViewport 定位
        // cfg-panel 在 modal-content 内居中，上下留 3% 边距
        html = '<div id="api-config-modal" class="modal viewport-overlay">' +
            '<div class="modal-content" style="display:flex;align-items:center;justify-content:center;background:transparent;border:none;box-shadow:none;padding:3% 16px">' +
            '<div class="cfg-panel">' + innerHtml + '</div>' +
            '</div></div>';
    } else {
        // start-screen 等独立环境：用 cfg-overlay 自己的定位
        html = '<div id="api-config-modal" class="cfg-overlay">' +
            '<div class="cfg-panel">' + innerHtml + '</div>' +
            '</div>';
    }

    document.body.insertAdjacentHTML('beforeend', html);

    var modal = document.getElementById('api-config-modal');
    if (got) {
        modal.dataset.gotRole = role;
        modal.dataset.credentialId=config.id||'';
        if(window.gotMemory)window.gotMemory.mountConfig(modal,role);
        document.getElementById('cors-proxy-field').hidden = true;
        document.getElementById('api-cors-proxy-enabled').checked = false;
        var typeSelect=document.getElementById('api-type-select');
        var vertex=document.createElement('option');vertex.value='vertex';vertex.textContent='Google Vertex AI · 服务账号JSON';typeSelect.append(vertex);
        typeSelect.value=config.type||'openai';
        var credentials=document.createElement('div');credentials.id='got-vertex-fields';credentials.className='cfg-field';
        credentials.innerHTML='<label class="cfg-label" for="got-service-account">服务账号 JSON 内容（只保存在本机服务）</label><textarea id="got-service-account" class="cfg-input" rows="5" spellcheck="false" autocomplete="off" placeholder="粘贴完整 Service Account JSON；留空保留已保存内容"></textarea><label class="cfg-label" for="got-region">地区</label><input id="got-region" class="cfg-input" placeholder="us-central1 或 global"><button id="got-validate-json" class="cfg-btn">验证 JSON（不联网）</button><p id="got-json-status" role="status"></p>';
        document.getElementById('api-key-input').closest('.cfg-field').after(credentials);
        document.getElementById('got-region').value=config.region||'us-central1';
        document.getElementById('got-json-status').textContent=config.type==='vertex'&&config.saved?'服务账号已保存；项目：'+config.projectId+'。私钥不回显。':'';
        typeSelect.onchange=_syncGotGoogleFields;_syncGotGoogleFields();
        document.getElementById('got-validate-json').onclick=async function(){
            this.disabled=true;var status=document.getElementById('got-json-status');
            try{var result=await got.validateServiceAccount(document.getElementById('got-service-account').value);status.textContent=result.message+' 项目：'+result.projectId;}
            catch(e){status.textContent=e.message;}finally{this.disabled=false;}
        };
        document.getElementById('api-key-input').placeholder = '填写新密钥；留空保留已保存密钥';
    }
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'api-config-title');
    if (typeof fitModalToViewport === 'function') {
        modal.style.display = 'block';
        requestAnimationFrame(function() {
            if (!modal.isConnected) return;
            fitModalToViewport(modal);
            if (typeof bindModalAutoFit === 'function') bindModalAutoFit(modal);
        });
    } else {
        modal.style.display = 'flex';
    }
}

function closeConfigModal() {
    var modal = document.getElementById('api-config-modal');
    if (modal) {
        if (modal._unbindFit) modal._unbindFit();
        modal.remove();
    }
}

async function saveConfigAndClose() {
    var newConfig = {
        type: document.getElementById('api-type-select').value,
        endpoint: document.getElementById('api-endpoint-input').value.trim(),
        apiKey: document.getElementById('api-key-input').value.trim(),
        model: document.getElementById('api-model-input').value.trim(),
        temperature: parseFloat(document.getElementById('api-temp-input').value) || 0.85,
        maxOutputTokens: parseInt(document.getElementById('api-max-tokens-input').value) || 8192,
        maxContextTokens: parseInt(document.getElementById('api-ctx-tokens-input').value) || 128000,
        streamMode: (document.getElementById('api-stream-mode-select') && document.getElementById('api-stream-mode-select').value) || 'stream',
        topP: parseFloat(document.getElementById('api-top-p-input').value),
        topPEnabled: !!(document.getElementById('api-top-p-enabled') && document.getElementById('api-top-p-enabled').checked),
        topK: parseInt(document.getElementById('api-top-k-input').value, 10),
        topKEnabled: !!(document.getElementById('api-top-k-enabled') && document.getElementById('api-top-k-enabled').checked),
        frequencyPenalty: parseFloat(document.getElementById('api-freq-penalty-input').value),
        frequencyPenaltyEnabled: !!(document.getElementById('api-freq-penalty-enabled') && document.getElementById('api-freq-penalty-enabled').checked),
        presencePenalty: parseFloat(document.getElementById('api-pres-penalty-input').value),
        presencePenaltyEnabled: !!(document.getElementById('api-pres-penalty-enabled') && document.getElementById('api-pres-penalty-enabled').checked)
    };
    // CORS 代理（网页与 APK 均有此输入框与勾选框）
    var corsInput = document.getElementById('api-cors-proxy-input');
    if (corsInput) {
        newConfig.corsProxyUrl = corsInput.value.trim();
    }
    var corsEnabledInput = document.getElementById('api-cors-proxy-enabled');
    if (corsEnabledInput) {
        newConfig.corsProxyEnabled = !!corsEnabledInput.checked;
    }
    if (window.gotGeneration) {
        var modal = document.getElementById('api-config-modal');
        if (modal.dataset.gotSaving === 'true') return;
        modal.dataset.gotSaving = 'true';
        try {
            newConfig.temperature = Number(document.getElementById('api-temp-input').value);
            newConfig.maxOutputTokens = Number(document.getElementById('api-max-tokens-input').value);
            newConfig.maxContextTokens = Number(document.getElementById('api-ctx-tokens-input').value);
            newConfig.timeoutMs = Number(document.getElementById('got-timeout').value);
            newConfig.maxCalls = Number(document.getElementById('got-max-calls').value);
            Object.assign(newConfig,_gotGoogleFields());
            await window.gotGeneration.saveConnection(modal.dataset.gotRole, newConfig);
            closeConfigModal();
        } catch(e) { var status = document.getElementById('got-config-status'); if(status)status.textContent = e.message; }
        finally { modal.dataset.gotSaving = 'false'; }
        return;
    }
    if (!newConfig.endpoint || !newConfig.apiKey || !newConfig.model) {
        alert('请填写完整的 API 信息（地址、Key、模型名）');
        return;
    }
    apiService.updateConfig(newConfig);
    _saveConfigHistory(newConfig);
    // Phase 3：保存 embedding 配置
    if (typeof embeddingService !== 'undefined') {
        var embEnabled = !!(document.getElementById('emb-enabled-input') && document.getElementById('emb-enabled-input').checked);
        var embEndpoint = (document.getElementById('emb-endpoint-input') || {}).value || '';
        var embKey = (document.getElementById('emb-key-input') || {}).value || '';
        var embModel = (document.getElementById('emb-model-input') || {}).value || '';
        var embRerankModel = (document.getElementById('emb-rerank-model-input') || {}).value || '';
        var _wasEnabled = embeddingService.isEnabled();
        embeddingService.updateConfig({
            enabled: embEnabled,
            endpoint: embEndpoint.trim(),
            apiKey: embKey.trim(),
            model: embModel.trim(),
            rerankModel: embRerankModel.trim() || 'BAAI/bge-reranker-v2-m3'
        });
        // Phase L2：embedding 从关切换到开 → 触发事件层从 watermark=0 起补建
        if (!_wasEnabled && embEnabled && typeof eventRunner !== 'undefined') {
            eventRunner.resumeOnLoad();
        }
    }
    closeConfigModal();
    if (typeof showModal === 'function') showModal('API 配置已保存！');
}

// ========== 连接测试 ==========

async function _doConnectTest() {
    var btn = document.getElementById('api-connect-btn');
    var status = document.getElementById('api-connect-status');
    var select = document.getElementById('api-model-select');

    btn.disabled = true;
    btn.textContent = '⏳ 连接中...';
    status.textContent = '连接中...';
    status.style.color = '#888';

    var endpoint = document.getElementById('api-endpoint-input').value.trim();
    var apiKey = document.getElementById('api-key-input').value.trim();
    var type = document.getElementById('api-type-select').value;

    try {
        var models = window.gotGeneration ? await window.gotGeneration.models(document.getElementById('api-config-modal').dataset.gotRole, endpoint, apiKey, type) : await apiService.fetchModels(endpoint, apiKey, type);
        status.textContent = '🟢 已连接（' + models.length + ' 个模型）';
        status.style.color = '#4CAF50';

        // 填充模型下拉框
        select.innerHTML = '<option value="">-- 请选择模型 --</option>';
        for (var i = 0; i < models.length; i++) {
            var opt = document.createElement('option');
            opt.value = models[i].id;
            opt.textContent = models[i].name || models[i].id;
            select.appendChild(opt);
        }
        select.disabled = false;

        // 如果当前已有模型名，尝试自动选中
        var currentModel = document.getElementById('api-model-input').value.trim();
        if (currentModel) {
            for (var j = 0; j < select.options.length; j++) {
                if (select.options[j].value === currentModel) {
                    select.selectedIndex = j;
                    break;
                }
            }
        }
    } catch (e) {
        status.textContent = '🔴 连接失败: ' + e.message + '（若使用本地代理工具，可点击"✎ 手动输入"直接填写模型名）';
        status.style.color = '#f44336';
        select.innerHTML = '<option value="">-- 连接失败 --</option>';
        select.disabled = true;
    }

    btn.disabled = false;
    btn.textContent = '🔗 连接测试';
}

function _onModelSelected() {
    var select = document.getElementById('api-model-select');
    var input = document.getElementById('api-model-input');
    if (select.value) {
        input.value = select.value;
    }
}

function _toggleManualModel() {
    var input = document.getElementById('api-model-input');
    input.focus();
    input.select();
}

// ========== 测试消息 ==========

async function _doSendTest() {
    var btn = document.getElementById('api-test-btn');
    var resultDiv = document.getElementById('api-test-result');

    btn.disabled = true;
    btn.textContent = '⏳ 发送中...';
    resultDiv.style.display = 'block';
    resultDiv.className = 'cfg-test-result cfg-test-loading';
    resultDiv.textContent = '正在发送测试消息...';

    var tempConfig = {
        type: document.getElementById('api-type-select').value,
        endpoint: document.getElementById('api-endpoint-input').value.trim(),
        apiKey: document.getElementById('api-key-input').value.trim(),
        model: document.getElementById('api-model-input').value.trim(),
        temperature: parseFloat(document.getElementById('api-temp-input').value) || 0.85
    };

    if(window.gotGeneration)Object.assign(tempConfig,_gotGoogleFields());
    var result = window.gotGeneration ? await window.gotGeneration.testConnection(document.getElementById('api-config-modal').dataset.gotRole,tempConfig) : await apiService.sendTestMessage(tempConfig);

    if (result.success) {
        var preview = result.content.length > 100 ? result.content.substring(0, 100) + '...' : result.content;
        resultDiv.className = 'cfg-test-result cfg-test-ok';
        resultDiv.textContent = '✅ 测试通过！AI 回复: ' + preview;
    } else {
        resultDiv.className = 'cfg-test-result cfg-test-fail';
        resultDiv.textContent = '❌ 测试失败: ' + result.error;
    }

    btn.disabled = false;
    btn.textContent = '📨 发送测试消息';
}

function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========== 历史配置切换 ==========

function _loadConfigHistory() {
    if (window.gotGeneration) return window.gotGeneration.history(document.getElementById('api-config-modal').dataset.gotRole);
    try {
        var raw = localStorage.getItem('jxz_apiConfigHistory');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function _saveConfigHistory(cfg) {
    var history = _loadConfigHistory();
    // 生成标签：模型名 · 域名（或类型）
    var domain = '';
    try {
        domain = cfg.type === 'gemini' ? 'Gemini' : new URL(cfg.endpoint).hostname.replace(/^www\./, '');
    } catch (e) {
        domain = cfg.type || 'OpenAI';
    }
    // 标签加保存时间：同 endpoint+model 重复保存时只更新不新增条目，
    // 时间戳让「已更新」在下拉框中可见（否则 label 不变，用户会误以为历史没更新）
    var _now = new Date();
    var _pad = function(n) { return (n < 10 ? '0' : '') + n; };
    var timeStr = (_now.getMonth() + 1) + '-' + _pad(_now.getDate()) + ' ' + _pad(_now.getHours()) + ':' + _pad(_now.getMinutes());
    var label = (cfg.model || '未知模型') + ' · ' + domain + ' · ' + timeStr;
    // 移除相同 endpoint+model 的旧记录（去重）
    history = history.filter(function(h) {
        return !(h.endpoint === cfg.endpoint && h.model === cfg.model);
    });
    // 新配置插到最前面
    history.unshift(Object.assign({}, cfg, { _label: label }));
    // 最多保留 3 条（先进先出）
    if (history.length > 3) history = history.slice(0, 3);
    try {
        localStorage.setItem('jxz_apiConfigHistory', JSON.stringify(history));
    } catch (e) {
        // 写入失败（localStorage 已满/不可用）时历史会冻结在旧数据，必须留日志便于排查
        console.warn('[ConfigModal] 历史配置写入失败：', e);
    }
}

function _togglePresetDropdown() {
    var container = document.getElementById('api-preset-container');
    if (!container) return;
    // 切换显隐
    var isVisible = container.style.display !== 'none';
    if (isVisible) {
        container.style.display = 'none';
        return;
    }
    var history = _loadConfigHistory();
    if (history.length === 0) {
        container.innerHTML = '<div style="padding:5px 2px;color:#999;font-size:12px">暂无历史配置，保存后将自动记录</div>';
    } else {
        var html = '<select class="cfg-input" onchange="_applyPreset(this.value);this.value=\'\'"><option value="">-- 选择历史配置回填 --</option>';
        for (var i = 0; i < history.length; i++) {
            html += '<option value="' + i + '">' + _escapeHtml(history[i]._label) + '</option>';
        }
        html += '</select>';
        container.innerHTML = html;
    }
    container.style.display = 'block';
}

function _applyPreset(indexStr) {
    var idx = parseInt(indexStr, 10);
    if (isNaN(idx)) return;
    var history = _loadConfigHistory();
    var preset = history[idx];
    if (!preset) return;
    var el;
    el = document.getElementById('api-type-select');      if (el) el.value = preset.type || 'openai';
    el = document.getElementById('api-endpoint-input');   if (el) el.value = preset.endpoint || '';
    el = document.getElementById('api-key-input');        if (el) el.value = preset.apiKey || '';
    el = document.getElementById('api-model-input');      if (el) el.value = preset.model || '';
    el = document.getElementById('api-temp-input');       if (el) el.value = preset.temperature != null ? preset.temperature : 0.9;
    el = document.getElementById('api-max-tokens-input'); if (el) el.value = preset.maxOutputTokens || 18000;
    el = document.getElementById('api-ctx-tokens-input'); if (el) el.value = preset.maxContextTokens || 500000;
    el = document.getElementById('got-timeout'); if (el) el.value = preset.timeoutMs;
    el = document.getElementById('got-max-calls'); if (el) el.value = preset.maxCalls;
    el = document.getElementById('api-stream-mode-select'); if (el) el.value = preset.streamMode || 'stream';
    el = document.getElementById('api-top-p-input');          if (el) el.value = preset.topP != null ? preset.topP : 1;
    el = document.getElementById('api-top-p-enabled');        if (el) el.checked = !!preset.topPEnabled;
    el = document.getElementById('api-top-k-input');          if (el) el.value = preset.topK != null ? preset.topK : 200;
    el = document.getElementById('api-top-k-enabled');        if (el) el.checked = !!preset.topKEnabled;
    el = document.getElementById('api-freq-penalty-input');   if (el) el.value = preset.frequencyPenalty != null ? preset.frequencyPenalty : 0.3;
    el = document.getElementById('api-freq-penalty-enabled'); if (el) el.checked = !!preset.frequencyPenaltyEnabled;
    el = document.getElementById('api-pres-penalty-input');   if (el) el.value = preset.presencePenalty != null ? preset.presencePenalty : 0.2;
    el = document.getElementById('api-pres-penalty-enabled'); if (el) el.checked = !!preset.presencePenaltyEnabled;
    el = document.getElementById('api-cors-proxy-input'); if (el && preset.corsProxyUrl) el.value = preset.corsProxyUrl;
    // 勾选框：preset 含该字段才回填，否则保留首次渲染按环境给的默认值（web勾/APK不勾）
    el = document.getElementById('api-cors-proxy-enabled'); if (el && typeof preset.corsProxyEnabled === 'boolean') el.checked = preset.corsProxyEnabled;
    if(window.gotGeneration){document.getElementById('api-config-modal').dataset.credentialId=preset.id||'';document.getElementById('got-service-account').value='';document.getElementById('got-region').value=preset.region||'us-central1';document.getElementById('got-json-status').textContent=preset.type==='vertex'?'已保存项目：'+preset.projectId+'。私钥不回显。':'';_syncGotGoogleFields();}
    // 回填完成后收起下拉
    var container = document.getElementById('api-preset-container');
    if (container) container.style.display = 'none';
}

// ========== Phase 3: Embedding 辅助函数 ==========

async function _doEmbeddingTest() {
    if(window.gotMemory)return window.gotMemory.testEmbedding();
    var status = document.getElementById('emb-status');
    if (!status) return;
    status.textContent = '⏳ 测试中...';
    status.style.color = 'rgba(255,255,255,0.6)';
    try {
        if (typeof embeddingService === 'undefined') {
            status.textContent = '🔴 embeddingService 未加载';
            status.style.color = '#f44336';
            return;
        }
        // 临时用表单当前值测试
        var tempCfg = {
            enabled: true,
            endpoint: (document.getElementById('emb-endpoint-input') || {}).value || '',
            apiKey: (document.getElementById('emb-key-input') || {}).value || '',
            model: (document.getElementById('emb-model-input') || {}).value || ''
        };
        var result = await embeddingService.testConnection(tempCfg);
        if (result.ok) {
            status.textContent = '🟢 连接成功！维度：' + (result.dims || '?');
            status.style.color = '#4caf50';
        } else {
            status.textContent = '🔴 连接失败：' + (result.error || '未知错误');
            status.style.color = '#f44336';
        }
    } catch (e) {
        status.textContent = '🔴 测试异常：' + (e.message || e);
        status.style.color = '#f44336';
    }
}

async function _doRebuildEmbeddingIndex() {
    if(window.gotMemory)return window.gotMemory.rebuildSelected();
    var status = document.getElementById('emb-status');
    var progress = document.getElementById('emb-progress');
    if (!status || !progress) return;
    if (typeof embeddingService === 'undefined' || typeof memoryRecall === 'undefined' || typeof summaryHistoryService === 'undefined') {
        status.textContent = '🔴 相关服务未加载，无法重建';
        status.style.color = '#f44336';
        return;
    }
    status.textContent = '⏳ 重建中...';
    status.style.color = 'rgba(255,255,255,0.6)';
    progress.textContent = '';

    var all = summaryHistoryService.getAll();
    if (!all || all.length === 0) {
        status.textContent = '📭 没有摘要记录，无需重建';
        return;
    }

    // 找出还没有向量的条目
    var stats = memoryRecall.getStats();
    var cachedIds = {};
    var cached = stats && stats.entries ? stats.entries : [];
    for (var ci = 0; ci < cached.length; ci++) {
        cachedIds[cached[ci].id] = true;
    }
    var todo = all.filter(function(s) { return !cachedIds[s.id]; });

    if (todo.length === 0) {
        status.textContent = '✅ 所有摘要已有向量，无需重建';
        return;
    }

    var batchSize = 10;
    var done = 0;
    var fp = embeddingService.getFingerprint();

    try {
        for (var i = 0; i < todo.length; i += batchSize) {
            var batch = todo.slice(i, i + batchSize);
            var texts = batch.map(function(s) { return s.summaryText; });
            progress.textContent = '进度：' + done + '/' + todo.length;
            var vectors = await embeddingService.embed(texts);
            for (var vi = 0; vi < batch.length; vi++) {
                if (!vectors[vi]) continue;
                var vec = new Float32Array(vectors[vi]);
                var meta = { text: batch[vi].summaryText, week: batch[vi].week || 0, fingerprint: fp, createdAt: Date.now() };
                storageService.saveEmbedding(batch[vi].id, vec, meta);
                memoryRecall.addToCache({ id: batch[vi].id, vector: vec, text: meta.text, week: meta.week, fingerprint: fp, createdAt: meta.createdAt });
            }
            done += batch.length;
        }
        progress.textContent = '进度：' + done + '/' + todo.length;
        status.textContent = '✅ 重建完成，共处理 ' + done + ' 条';
        status.style.color = '#4caf50';
    } catch (e) {
        status.textContent = '🔴 重建失败：' + (e.message || e);
        status.style.color = '#f44336';
        progress.textContent = '已完成：' + done + '/' + todo.length;
    }
}

// Extension fields within the inherited configuration dialog; no parallel settings store.
function _gotGoogleFields(){return {credentialId:document.getElementById('api-config-modal')?.dataset.credentialId,serviceAccountJson:document.getElementById('got-service-account')?.value||'',region:document.getElementById('got-region')?.value.trim()||'us-central1'};}
function _syncGotGoogleFields(){
 if(!window.gotGeneration)return;
 var type=document.getElementById('api-type-select').value;
 document.getElementById('got-vertex-fields').hidden=type!=='vertex';
 document.getElementById('api-key-input').closest('.cfg-field').hidden=type==='vertex';
 var endpoint=document.getElementById('api-endpoint-input');endpoint.closest('.cfg-field').hidden=type==='vertex';
 if(type==='gemini'&&(!endpoint.value||/\/chat\/completions$/.test(endpoint.value)))endpoint.value='https://generativelanguage.googleapis.com/v1beta';
 document.getElementById('api-connect-btn').hidden=type==='vertex';
 document.getElementById('api-model-input').placeholder=type==='openai'?'填写服务提供的模型ID':'填写Google模型ID（如gemini-2.5-pro）';
 document.getElementById('api-model-select').closest('.cfg-row').hidden=type==='vertex';
 if(type==='vertex')document.getElementById('api-connect-status').textContent='服务账号模式：手填模型ID。验证JSON不代表权限或额度已通过。';
}
