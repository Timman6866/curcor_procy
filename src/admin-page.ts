export const ADMIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cursor OpenAI Proxy</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --panel: #171a22;
      --panel-2: #1f2430;
      --border: #2a3142;
      --text: #e8ecf4;
      --muted: #9aa4b8;
      --accent: #6ea8ff;
      --accent-2: #4f8cff;
      --ok: #3ecf8e;
      --warn: #f5c451;
      --danger: #ff6b6b;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(79, 140, 255, 0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(62, 207, 142, 0.08), transparent 24%),
        var(--bg);
      color: var(--text);
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 48px; }
    .hero {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px;
    }
    h1 { margin: 0 0 6px; font-size: 1.8rem; }
    .sub { color: var(--muted); margin: 0; }
    .badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
      border-radius: 999px; background: var(--panel); border: 1px solid var(--border); font-size: 0.9rem;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 12px rgba(62, 207, 142, 0.8); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent), var(--panel);
      border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow);
    }
    .card h2, .card h3 { margin: 0 0 12px; font-size: 1rem; }
    .metric { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
    .label { color: var(--muted); font-size: 0.85rem; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .tab {
      border: 1px solid var(--border); background: var(--panel); color: var(--text);
      padding: 10px 14px; border-radius: 999px; cursor: pointer;
    }
    .tab.active { background: var(--accent-2); border-color: transparent; color: white; }
    .panel { display: none; }
    .panel.active { display: block; }
    .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; font-size: 0.95rem; }
    .kv div:nth-child(odd) { color: var(--muted); }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px;
    }
    code { padding: 2px 6px; }
    pre { padding: 14px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
    input, textarea, select, button {
      font: inherit; border-radius: 10px; border: 1px solid var(--border);
      background: var(--panel-2); color: var(--text); padding: 10px 12px;
    }
    textarea { width: 100%; min-height: 110px; resize: vertical; }
    button {
      cursor: pointer; background: var(--accent-2); border-color: transparent; color: white; font-weight: 600;
    }
    button.secondary { background: transparent; border-color: var(--border); color: var(--text); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
    .stack { display: grid; gap: 12px; }
    .login {
      max-width: 420px; margin: 12vh auto 0; padding: 28px; background: var(--panel);
      border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow);
    }
    .login h1 { font-size: 1.5rem; }
    .error { color: var(--danger); min-height: 1.2em; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .pill {
      display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 0.78rem;
      background: rgba(110, 168, 255, 0.12); color: var(--accent);
    }
    .pill.ok { background: rgba(62, 207, 142, 0.12); color: var(--ok); }
    .pill.warn { background: rgba(245, 196, 81, 0.12); color: var(--warn); }
    .hidden { display: none !important; }
    .field { display: grid; gap: 6px; }
    .field label { color: var(--muted); font-size: 0.9rem; }
    .hint { color: var(--muted); font-size: 0.82rem; }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .tool-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }
    .tool-grid label { display: flex; gap: 8px; align-items: center; color: var(--text); font-size: 0.9rem; }
    .segmented { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .segmented label {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
      border: 1px solid var(--border); border-radius: 999px; cursor: pointer; color: var(--text);
    }
    .segmented input { accent-color: var(--accent-2); }
    .source-pill { margin-left: 8px; }
    .notice {
      padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border);
      background: rgba(245, 196, 81, 0.08); color: var(--warn); font-size: 0.9rem;
    }
    .success { color: var(--ok); min-height: 1.2em; }
    .models-table-wrap { max-height: 420px; overflow: auto; margin-top: 12px; border: 1px solid var(--border); border-radius: 12px; }
    .models-table-wrap table { width: 100%; border-collapse: collapse; }
    .models-table-wrap th, .models-table-wrap td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
    .models-table-wrap tr.disabled td { opacity: 0.55; }
    .models-table-wrap tr:last-child td { border-bottom: none; }
    @media (max-width: 700px) {
      .hero { flex-direction: column; }
      .kv { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div id="loginView" class="login hidden">
    <h1>Proxy Admin</h1>
    <p class="sub">Sign in to manage the Cursor OpenAI proxy.</p>
    <form id="loginForm" class="stack" style="margin-top:18px">
      <input id="loginUser" name="username" placeholder="Username" autocomplete="username" required />
      <input id="loginPass" name="password" type="password" placeholder="Password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
      <div id="loginError" class="error"></div>
    </form>
  </div>

  <div id="appView" class="wrap hidden">
    <div class="hero">
      <div>
        <h1>Cursor OpenAI Proxy</h1>
        <p class="sub">Health, config, models, and smoke tests for your compatibility endpoint.</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div class="badge" id="loggingPolicyBadge"><span class="dot"></span><span id="loggingPolicyText">standard</span></div>
        <div class="badge"><span class="dot" id="healthDot"></span><span id="healthText">Checking…</span></div>
        <button class="secondary" id="logoutBtn" type="button">Sign out</button>
      </div>
    </div>

    <div class="grid" id="summaryCards"></div>

    <div class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="settings">Settings</button>
      <button class="tab" data-tab="models">Models</button>
      <button class="tab" data-tab="tester">Chat tester</button>
      <button class="tab" data-tab="logs" id="logsTabButton">Request log</button>
    </div>

    <section class="panel active card" data-panel="overview">
      <h2>Configuration</h2>
      <div class="kv" id="configKv"></div>
      <h3 style="margin-top:20px">Client endpoints</h3>
      <pre id="endpointBlock"></pre>
    </section>

    <section class="panel card" data-panel="settings">
      <div class="row" style="justify-content:space-between; margin-top:0">
        <h2 style="margin:0">Runtime settings</h2>
        <div class="row" style="margin-top:0">
          <button class="secondary" id="resetSettings" type="button">Reset to env</button>
          <button id="saveSettings" type="button">Save changes</button>
        </div>
      </div>
      <p class="hint" style="margin-top:8px">Changes apply immediately and persist to <code id="settingsPathLabel">.scratch/proxy-settings.json</code>. Host and port still require a container restart.</p>
      <div id="settingsNotice" class="notice hidden" style="margin-top:12px"></div>
      <div id="settingsSuccess" class="success"></div>

      <div class="settings-grid" style="margin-top:16px">
        <div class="card" style="box-shadow:none">
          <h3>Agent</h3>
          <div class="stack">
            <div class="field">
              <label>Runtime <span id="sourceRuntime" class="pill source-pill"></span></label>
              <div class="segmented" id="runtimeGroup">
                <label><input type="radio" name="runtime" value="local" /> Local</label>
                <label><input type="radio" name="runtime" value="cloud" /> Cloud</label>
              </div>
            </div>
            <div class="field">
              <label>Default model <span id="sourceDefaultModel" class="pill source-pill"></span></label>
              <select id="settingsDefaultModel"></select>
            </div>
            <div class="field">
              <label>Working directory <span id="sourceCwd" class="pill source-pill"></span></label>
              <input id="settingsCwd" type="text" />
            </div>
            <div class="field">
              <label>Tools policy <span id="sourceTools" class="pill source-pill"></span></label>
              <div class="segmented" id="toolsModeGroup">
                <label><input type="radio" name="toolsMode" value="local" /> Local</label>
                <label><input type="radio" name="toolsMode" value="cloud" /> Cloud</label>
                <label><input type="radio" name="toolsMode" value="custom" /> Custom</label>
              </div>
              <div id="toolsCustomPanel" class="tool-grid hidden"></div>
            </div>
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <h3>Authentication</h3>
          <div class="stack">
            <div class="field">
              <label>Cursor API key <span id="sourceCursorKey" class="pill source-pill"></span></label>
              <input id="settingsCursorKey" type="password" placeholder="Leave blank to keep current" autocomplete="new-password" />
            </div>
            <div class="field">
              <label>Proxy API keys <span id="sourceProxyKey" class="pill source-pill"></span></label>
              <p class="hint">Clients send any enabled key as Bearer or <code>x-api-key</code>. Usage is persisted to <code>proxy-usage.json</code> (aggregate counters only).</p>
              <div id="proxyKeysNotice" class="notice hidden" style="margin-top:8px"></div>
              <div class="row" style="margin-top:0; gap:8px; flex-wrap:wrap">
                <input id="newProxyKeyLabel" type="text" placeholder="Label (optional)" style="flex:1; min-width:180px" />
                <button class="secondary" id="createProxyKeyBtn" type="button">Generate key</button>
              </div>
              <div id="proxyKeysTable" class="models-table-wrap" style="margin-top:12px"></div>
              <h3 style="margin-top:18px">Retired keys</h3>
              <p class="hint">Removed keys keep lifetime usage history for reporting.</p>
              <div id="retiredProxyKeysTable" class="models-table-wrap" style="margin-top:8px"></div>
              <div class="row" style="gap:8px; align-items:end; margin-top:12px">
                <label class="stack" style="flex:1; gap:6px">
                  <span class="label">Test a client key</span>
                  <input id="verifyRestKey" type="password" placeholder="Paste key to verify" autocomplete="off" />
                </label>
                <button class="secondary" id="verifyRestKeyBtn" type="button">Verify</button>
              </div>
              <p id="verifyRestKeyResult" class="hint"></p>
            </div>
            <div class="field">
              <label>Connect auth token <span id="sourceConnectToken" class="pill source-pill"></span></label>
              <input id="settingsConnectTokenDisplay" type="text" readonly />
              <input id="settingsConnectToken" type="password" placeholder="Pin a custom token (optional)" autocomplete="new-password" />
              <div class="row" style="margin-top:0">
                <label class="hint"><input id="clearConnectToken" type="checkbox" /> Use auto-generated token</label>
                <button class="secondary" id="regenerateConnectToken" type="button">Regenerate</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <h3>Admin & server</h3>
          <div class="stack">
            <div class="field">
              <label>Admin username <span id="sourceAdminUser" class="pill source-pill"></span></label>
              <input id="settingsAdminUser" type="text" autocomplete="username" />
            </div>
            <div class="field">
              <label>Admin password <span id="sourceAdminPass" class="pill source-pill"></span></label>
              <input id="settingsAdminPass" type="password" placeholder="Leave blank to keep current" autocomplete="new-password" />
            </div>
            <div class="field">
              <label>Listen address</label>
              <input id="settingsHostPort" type="text" readonly />
              <p class="hint">Change HOST/PORT in the environment and restart the container.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel card" data-panel="models">
      <div class="row" style="justify-content:space-between; align-items:flex-start; margin-top:0; gap:12px; flex-wrap:wrap">
        <div>
          <h2 style="margin:0">Available models</h2>
          <p id="modelsSummary" class="hint" style="margin-top:6px">Choose which models appear in /v1/models for OpenCode and Zenflow.</p>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <button class="secondary" id="modelsEnableAll" type="button">Enable all</button>
          <button class="secondary" id="modelsComposerOnly" type="button">Composer only</button>
          <button id="saveModels" type="button">Save visibility</button>
          <button class="secondary" id="refreshModels" type="button">Refresh</button>
        </div>
      </div>
      <div id="modelsNotice" class="success" style="margin-top:8px"></div>
      <div id="modelsTable" class="models-table-wrap"></div>
    </section>

    <section class="panel card" data-panel="tester">
      <h2>Chat smoke test</h2>
      <div class="stack">
        <select id="testModel"></select>
        <div class="row" style="gap:12px; flex-wrap:wrap">
          <label class="stack" style="flex:1; min-width:160px; gap:6px">
            <span class="label">Speed</span>
            <select id="testSpeed">
              <option value="">From model id / default</option>
              <option value="fast">Fast</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <label class="stack" style="flex:1; min-width:160px; gap:6px">
            <span class="label">Reasoning effort</span>
            <select id="testReasoning">
              <option value="">Off / from model id</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="none">Force off</option>
            </select>
          </label>
        </div>
        <textarea id="testPrompt" placeholder="Ask the model something simple…">Say "proxy-ok" and nothing else.</textarea>
        <div class="row">
          <button id="runTest" type="button">Run test</button>
          <button class="secondary" id="runHealth" type="button">Ping health</button>
        </div>
        <pre id="testOutput">Ready.</pre>
      </div>
    </section>

    <section class="panel card" data-panel="logs" id="logsPanel">
      <div class="row" style="justify-content:space-between; margin-top:0">
        <h2 style="margin:0">Recent requests</h2>
        <button class="secondary" id="refreshLogs" type="button">Refresh</button>
      </div>
      <div id="logsTable" style="margin-top:12px"></div>
    </section>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const api = (path, options = {}) => fetch('/admin/api' + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    function show(view) {
      $('loginView').classList.toggle('hidden', view !== 'login');
      $('appView').classList.toggle('hidden', view !== 'app');
    }

    async function requireAuth() {
      const res = await api('/session');
      if (!res.ok) {
        show('login');
        return false;
      }
      const data = await res.json();
      if (data.authenticated) {
        show('app');
        return true;
      }
      show('login');
      return false;
    }

    async function authedApi(path, options = {}) {
      const res = await api(path, options);
      if (res.status === 401) {
        show('login');
        throw new Error('Session expired. Sign in again.');
      }
      return res;
    }

    function pill(text, kind = '') {
      return '<span class="pill ' + kind + '">' + text + '</span>';
    }

    function renderSummary(status) {
      $('summaryCards').innerHTML = [
        ['Logging policy', status.loggingPolicy || 'standard', status.loggingPolicy === 'no-log' ? 'warn' : 'ok'],
        ['Runtime', status.runtime, ''],
        ['Default model', status.defaultModel, ''],
        ['Tools policy', Array.isArray(status.toolsPolicy) ? status.toolsPolicy.join(', ') : status.toolsPolicy, ''],
        ['Proxy API keys', String(status.proxyApiKeyCount ?? 0), status.proxyApiKeyCount ? 'ok' : 'warn'],
        ['REST auth', status.restAuthMode, status.restAuthMode === 'proxy-key' ? 'warn' : 'ok'],
      ].map(([label, value, kind]) =>
        '<div class="card"><div class="label">' + label + '</div><div class="metric">' + value + '</div><div>' + pill(kind ? label : 'live', kind) + '</div></div>'
      ).join('');
    }

    function applyLoggingPolicy(status) {
      const noLog = status.loggingPolicy === 'no-log';
      const policyText = status.loggingPolicy || 'standard';
      $('loggingPolicyText').textContent = 'Logging: ' + policyText;
      $('loggingPolicyBadge').querySelector('.dot').style.background = noLog ? 'var(--warn)' : 'var(--ok)';
      $('logsTabButton').classList.toggle('hidden', noLog);
      $('logsPanel').classList.toggle('hidden', noLog);
      if (noLog) {
        document.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
        const overviewTab = document.querySelector('.tab[data-tab="overview"]');
        overviewTab?.classList.add('active');
        document.querySelector('[data-panel="overview"]')?.classList.add('active');
      }
      const connectField = $('settingsConnectTokenDisplay')?.closest('.field');
      if (connectField) connectField.classList.toggle('hidden', noLog);
    }

    function renderConfig(status) {
      const noLog = status.loggingPolicy === 'no-log';
      const rows = [
        ['Logging policy', status.loggingPolicy || 'standard'],
        ['Host', status.host + ':' + status.port],
        ['Runtime', status.runtime],
        ['Working directory', status.cwd],
        ['Default model', status.defaultModel],
        ['Tools policy', Array.isArray(status.toolsPolicy) ? status.toolsPolicy.join(', ') : status.toolsPolicy],
        ['Cursor API key', status.secrets.cursorApiKey ? 'configured' : 'missing'],
        ['Proxy API key', status.secrets.proxyApiKey ? status.proxyApiKeyCount + ' enabled' : 'not set'],
        ['Connect token', status.secrets.connectAuthToken],
        ['Admin user', status.adminUsername],
      ];
      $('configKv').innerHTML = rows.map(([k, v]) => '<div>' + k + '</div><div>' + v + '</div>').join('');
      const connectAuthHint = noLog
        ? '(set CONNECT_AUTH_TOKEN in environment; not shown in no-log mode)'
        : (status.connectAuthToken || '(see server logs if auto-generated)');
      $('endpointBlock').textContent =
        'OpenAI REST:  ' + status.endpoints.openai + '\\n' +
        'Models:       ' + status.endpoints.models + '\\n' +
        'Health:       ' + status.endpoints.health + '\\n' +
        'Connect Send: ' + status.endpoints.connectSend + '\\n' +
        'Connect auth: ' + connectAuthHint;
    }

    let modelCatalog = [];

    function setModelsMessage(text, isError = false) {
      const el = $('modelsNotice');
      el.textContent = text || '';
      el.style.color = isError ? 'var(--danger)' : 'var(--ok)';
    }

    function updateModelSelects(models) {
      const enabled = models.filter((m) => m.enabled);
      const options = enabled.map((m) => '<option value="' + m.id + '">' + m.id + '</option>').join('');

      const testSelect = $('testModel');
      const currentTest = testSelect.value;
      testSelect.innerHTML = options;
      if (currentTest && enabled.some((m) => m.id === currentTest)) {
        testSelect.value = currentTest;
      } else if (enabled.length > 0) {
        testSelect.selectedIndex = 0;
      }

      const settingsSelect = $('settingsDefaultModel');
      if (!settingsSelect) return;
      const currentSettings = settingsSelect.value;
      const merged = [...enabled];
      if (currentSettings && !merged.some((m) => m.id === currentSettings)) {
        merged.unshift({ id: currentSettings, enabled: false });
      }
      settingsSelect.innerHTML = merged.map((m) => '<option value="' + m.id + '">' + m.id + '</option>').join('');
      if (currentSettings && [...settingsSelect.options].some((opt) => opt.value === currentSettings)) {
        settingsSelect.value = currentSettings;
      }
    }

    function renderModels(payload) {
      const models = payload.data || [];
      modelCatalog = models.map((m) => ({ ...m }));
      const visibleCount = payload.visibleCount ?? models.filter((m) => m.enabled).length;
      const totalCount = payload.totalCount ?? models.length;
      $('modelsSummary').textContent = visibleCount + ' of ' + totalCount + ' visible to clients via /v1/models';

      if (!models.length) {
        $('modelsTable').innerHTML = '<p class="label" style="padding:12px">No models returned.</p>';
        return;
      }

      $('modelsTable').innerHTML =
        '<table><thead><tr><th>Visible</th><th>ID</th><th>Owner</th></tr></thead><tbody>' +
        modelCatalog.map((m, index) =>
          '<tr class="' + (m.enabled ? '' : 'disabled') + '">' +
          '<td><input type="checkbox" data-model-index="' + index + '" ' + (m.enabled ? 'checked' : '') + ' /></td>' +
          '<td><code>' + m.id + '</code></td>' +
          '<td>' + (m.owned_by || 'cursor') + '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table>';

      $('modelsTable').querySelectorAll('input[type=checkbox][data-model-index]').forEach((input) => {
        input.addEventListener('change', (event) => {
          const index = Number(event.target.getAttribute('data-model-index'));
          modelCatalog[index].enabled = event.target.checked;
          event.target.closest('tr')?.classList.toggle('disabled', !event.target.checked);
          $('modelsSummary').textContent =
            modelCatalog.filter((m) => m.enabled).length + ' of ' + modelCatalog.length + ' visible to clients via /v1/models';
          updateModelSelects(modelCatalog);
        });
      });

      updateModelSelects(modelCatalog);
    }

    async function saveModelVisibility() {
      const disabledModels = modelCatalog.filter((m) => !m.enabled).map((m) => m.id);
      const res = await authedApi('/models', {
        method: 'PATCH',
        body: JSON.stringify({ disabledModels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save model visibility');
      renderModels(data);
      setModelsMessage('Model visibility saved.');
    }

    function setProxyKeysNotice(text, isError = false) {
      const el = $('proxyKeysNotice');
      if (!text) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
      }
      el.classList.remove('hidden');
      el.textContent = text;
      el.style.color = isError ? 'var(--danger)' : 'var(--text)';
      el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
      el.style.background = isError ? 'rgba(255, 107, 107, 0.08)' : 'rgba(110, 168, 255, 0.08)';
    }

    function quotaSummary(quota) {
      if (!quota) return '—';
      const parts = [];
      if (quota.maxTotalTokens != null) parts.push('total ' + quota.maxTotalTokens);
      if (quota.maxDailyTokens != null) parts.push('daily ' + quota.maxDailyTokens);
      if (quota.maxMonthlyTokens != null) parts.push('monthly ' + quota.maxMonthlyTokens);
      return parts.join(', ') || '—';
    }

    function renderProxyKeys(payload) {
      const keys = payload.keys || [];
      if (!keys.length) {
        $('proxyKeysTable').innerHTML = '<p class="label" style="padding:12px">No proxy API keys yet. Generate one to require client authentication.</p>';
      } else {
        $('proxyKeysTable').innerHTML =
          '<table><thead><tr><th>Label</th><th>Prefix</th><th>Source</th><th>Today</th><th>Month</th><th>Lifetime</th><th>Quota</th><th></th></tr></thead><tbody>' +
          keys.map((key) => {
            const usage = key.usage || {};
            const today = usage.today || {};
            const month = usage.monthToDate || {};
            return '<tr>' +
              '<td>' + key.label + '</td>' +
              '<td><code>' + key.prefix + '</code></td>' +
              '<td><span class="pill' + (key.source === 'env' ? ' ok' : '') + '">' + key.source + '</span></td>' +
              '<td>' + (today.totalTokens || 0) + ' tok / ' + (today.requestCount || 0) + ' req</td>' +
              '<td>' + (month.totalTokens || 0) + ' tok / ' + (month.requestCount || 0) + ' req</td>' +
              '<td>' + (usage.totalTokens || 0) + ' tok / ' + (usage.requestCount || 0) + ' req</td>' +
              '<td><code>' + quotaSummary(key.quota) + '</code><br><button class="secondary" type="button" data-edit-quota="' + key.id + '">Set quota</button></td>' +
              '<td><button class="secondary" type="button" data-remove-proxy-key="' + key.id + '">Remove</button></td>' +
              '</tr>';
          }).join('') +
          '</tbody></table>';

        $('proxyKeysTable').querySelectorAll('[data-remove-proxy-key]').forEach((button) => {
          button.addEventListener('click', async () => {
            const id = button.getAttribute('data-remove-proxy-key');
            if (!id || !confirm('Remove this API key? Clients using it will be rejected.')) return;
            try {
              const res = await authedApi('/proxy-keys/' + encodeURIComponent(id), { method: 'DELETE' });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to remove API key');
              setProxyKeysNotice('');
              await Promise.all([loadProxyKeys(), loadStatus()]);
            } catch (error) {
              setProxyKeysNotice(String(error), true);
            }
          });
        });

        $('proxyKeysTable').querySelectorAll('[data-edit-quota]').forEach((button) => {
          button.addEventListener('click', async () => {
            const id = button.getAttribute('data-edit-quota');
            const key = keys.find((entry) => entry.id === id);
            if (!id || !key) return;
            const total = prompt('Lifetime token limit (blank = none)', key.quota?.maxTotalTokens ?? '');
            if (total === null) return;
            const daily = prompt('Daily token limit (blank = none)', key.quota?.maxDailyTokens ?? '');
            if (daily === null) return;
            const monthly = prompt('Monthly token limit (blank = none)', key.quota?.maxMonthlyTokens ?? '');
            if (monthly === null) return;
            const quota = {
              maxTotalTokens: total.trim() ? Number(total.trim()) : null,
              maxDailyTokens: daily.trim() ? Number(daily.trim()) : null,
              maxMonthlyTokens: monthly.trim() ? Number(monthly.trim()) : null,
            };
            try {
              const res = await authedApi('/proxy-keys/' + encodeURIComponent(id), {
                method: 'PATCH',
                body: JSON.stringify({ quota }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to save quota');
              setProxyKeysNotice('Quota updated.');
              await loadProxyKeys();
            } catch (error) {
              setProxyKeysNotice(String(error), true);
            }
          });
        });
      }

      const retired = payload.retired || [];
      if (!retired.length) {
        $('retiredProxyKeysTable').innerHTML = '<p class="label" style="padding:12px">No retired keys yet.</p>';
        return;
      }

      $('retiredProxyKeysTable').innerHTML =
        '<table><thead><tr><th>Label</th><th>Prefix</th><th>Removed</th><th>Month</th><th>Lifetime</th></tr></thead><tbody>' +
        retired.map((key) => {
          const month = key.monthToDate || {};
          const removed = key.deletedAt ? key.deletedAt.replace('T', ' ').replace('Z', ' UTC') : '—';
          return '<tr>' +
            '<td>' + key.label + '</td>' +
            '<td><code>' + key.prefix + '</code></td>' +
            '<td>' + removed + '</td>' +
            '<td>' + (month.totalTokens || 0) + ' tok / ' + (month.requestCount || 0) + ' req</td>' +
            '<td>' + (key.totalTokens || 0) + ' tok / ' + (key.requestCount || 0) + ' req</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    async function loadProxyKeys() {
      const res = await authedApi('/proxy-keys');
      if (!res.ok) throw new Error('Failed to load proxy API keys');
      const data = await res.json();
      renderProxyKeys(data);
      return data;
    }

    async function createProxyKey() {
      const label = $('newProxyKeyLabel').value.trim();
      const res = await authedApi('/proxy-keys', {
        method: 'POST',
        body: JSON.stringify({ label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create API key');
      $('newProxyKeyLabel').value = '';
      setProxyKeysNotice('New key created. Copy it now — it will not be shown again: ' + data.key.secret);
      await Promise.all([loadProxyKeys(), loadStatus()]);
    }

    function renderLogs(entries) {
      if (!entries.length) {
        $('logsTable').innerHTML = '<p class="label">No requests recorded yet.</p>';
        return;
      }
      $('logsTable').innerHTML = '<table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>ms</th></tr></thead><tbody>' +
        entries.map((e) => '<tr><td>' + e.at.replace('T', ' ').replace('Z', ' UTC') + '</td><td>' + e.method + '</td><td><code>' + e.url + '</code></td><td>' + e.statusCode + '</td><td>' + Math.round(e.responseTimeMs) + '</td></tr>').join('') +
        '</tbody></table>';
    }

    async function loadStatus() {
      const res = await authedApi('/status');
      if (!res.ok) throw new Error('Failed to load status');
      const status = await res.json();
      $('healthText').textContent = status.healthy ? 'Healthy' : 'Unhealthy';
      $('healthDot').style.background = status.healthy ? 'var(--ok)' : 'var(--danger)';
      applyLoggingPolicy(status);
      renderSummary(status);
      renderConfig(status);
      return status;
    }

    function sourcePill(source) {
      if (source === 'env') return pill('env', 'ok');
      if (source === 'runtime') return pill('saved', '');
      if (source === 'generated') return pill('generated', 'warn');
      if (source === 'unset') return pill('unset', 'warn');
      return pill(source || 'unknown', '');
    }

    function selectedTools() {
      return [...document.querySelectorAll('#toolsCustomPanel input[type=checkbox]:checked')].map((el) => el.value);
    }

    function renderToolGrid(availableTools, selected) {
      const panel = $('toolsCustomPanel');
      panel.innerHTML = availableTools.map((tool) =>
        '<label><input type="checkbox" value="' + tool + '"' + (selected.includes(tool) ? ' checked' : '') + ' /> ' + tool + '</label>'
      ).join('');
    }

    function updateToolsPanelVisibility() {
      const mode = document.querySelector('input[name=toolsMode]:checked')?.value;
      $('toolsCustomPanel').classList.toggle('hidden', mode !== 'custom');
    }

    function setSettingsMessage(text, isError = false) {
      const el = $('settingsSuccess');
      el.textContent = text;
      el.classList.toggle('error', isError);
      el.classList.toggle('success', !isError && Boolean(text));
    }

    function setSourceLabel(id, source) {
      const el = $(id);
      el.textContent = source;
      el.className = 'pill source-pill' + (source === 'env' ? ' ok' : source === 'generated' || source === 'unset' ? ' warn' : '');
    }

    function fillSettingsForm(settings) {
      document.querySelectorAll('input[name=runtime]').forEach((el) => {
        el.checked = el.value === settings.runtime;
      });
      document.querySelectorAll('input[name=toolsMode]').forEach((el) => {
        el.checked = el.value === settings.toolsMode;
      });
      $('settingsDefaultModel').value = settings.defaultModel;
      const modelSelect = $('settingsDefaultModel');
      if (settings.defaultModel && ![...modelSelect.options].some((opt) => opt.value === settings.defaultModel)) {
        const option = document.createElement('option');
        option.value = settings.defaultModel;
        option.textContent = settings.defaultModel;
        modelSelect.appendChild(option);
      }
      modelSelect.value = settings.defaultModel;
      $('settingsCwd').value = settings.cwd;
      $('settingsHostPort').value = settings.host + ':' + settings.port;
      $('settingsAdminUser').value = settings.adminUsername;
      $('settingsConnectTokenDisplay').value = settings.connectAuthToken || '';
      if (settings.settingsPath) $('settingsPathLabel').textContent = settings.settingsPath;
      $('settingsCursorKey').value = '';
      $('settingsConnectToken').value = '';
      $('settingsAdminPass').value = '';
      $('clearConnectToken').checked = settings.secrets.connectAuthTokenAuto;
      renderToolGrid(settings.availableTools || [], settings.tools || []);
      updateToolsPanelVisibility();

      setSourceLabel('sourceRuntime', settings.sources.runtime);
      setSourceLabel('sourceDefaultModel', settings.sources.defaultModel);
      setSourceLabel('sourceCwd', settings.sources.cwd);
      setSourceLabel('sourceTools', settings.sources.toolsPolicy);
      setSourceLabel('sourceCursorKey', settings.sources.cursorApiKey);
      setSourceLabel('sourceProxyKey', settings.sources.proxyApiKey);
      setSourceLabel('sourceConnectToken', settings.sources.connectAuthToken);
      setSourceLabel('sourceAdminUser', settings.sources.adminUsername);
      setSourceLabel('sourceAdminPass', settings.sources.adminPassword);
    }

    async function loadSettings() {
      const res = await authedApi('/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const settings = await res.json();
      fillSettingsForm(settings);
      return settings;
    }

    async function saveSettings(extra = {}) {
      const body = {
        runtime: document.querySelector('input[name=runtime]:checked')?.value,
        toolsMode: document.querySelector('input[name=toolsMode]:checked')?.value,
        tools: selectedTools(),
        defaultModel: $('settingsDefaultModel').value,
        cwd: $('settingsCwd').value,
        adminUsername: $('settingsAdminUser').value,
        ...extra,
      };
      const cursorKey = $('settingsCursorKey').value.trim();
      const connectToken = $('settingsConnectToken').value.trim();
      const adminPass = $('settingsAdminPass').value;
      if (cursorKey) body.cursorApiKey = cursorKey;
      if (connectToken) body.connectAuthToken = connectToken;
      if ($('clearConnectToken').checked) body.connectAuthToken = null;
      if (adminPass) body.adminPassword = adminPass;

      const res = await authedApi('/settings', { method: 'PATCH', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      fillSettingsForm(data.settings);
      setSettingsMessage('Settings saved.');
      await loadStatus();
      await loadModels();
    }

    async function loadModels() {
      const res = await authedApi('/models');
      if (!res.ok) throw new Error('Failed to load models');
      const data = await res.json();
      renderModels(data);
      const settingsModel = $('settingsDefaultModel');
      const current = settingsModel.value;
      const enabledIds = new Set((data.data || []).filter((m) => m.enabled).map((m) => m.id));
      if (current && !enabledIds.has(current) && ![...settingsModel.options].some((opt) => opt.value === current)) {
        const option = document.createElement('option');
        option.value = current;
        option.textContent = current;
        settingsModel.appendChild(option);
      }
    }

    async function loadLogs() {
      const res = await authedApi('/logs');
      if (!res.ok) throw new Error('Failed to load logs');
      const data = await res.json();
      renderLogs(data.entries || []);
    }

    $('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      $('loginError').textContent = '';
      const body = {
        username: $('loginUser').value.trim(),
        password: $('loginPass').value,
      };
      const res = await api('/login', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        $('loginError').textContent = 'Invalid username or password.';
        return;
      }
      show('app');
      await bootstrap();
    });

    $('logoutBtn').addEventListener('click', async () => {
      await api('/logout', { method: 'POST' });
      show('login');
    });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector('[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
      });
    });

    document.querySelectorAll('input[name=toolsMode]').forEach((el) => {
      el.addEventListener('change', updateToolsPanelVisibility);
    });

    $('saveSettings').addEventListener('click', () => {
      setSettingsMessage('');
      saveSettings().catch((error) => { setSettingsMessage(String(error), true); });
    });
    $('resetSettings').addEventListener('click', async () => {
      if (!confirm('Reset all runtime settings to environment defaults?')) return;
      setSettingsMessage('');
      try {
        await saveSettings({ resetToEnv: true });
        setSettingsMessage('Reset to environment defaults.');
      } catch (error) {
        setSettingsMessage(String(error), true);
      }
    });
    $('regenerateConnectToken').addEventListener('click', () => {
      setSettingsMessage('');
      saveSettings({ connectAuthToken: null, regenerateConnectToken: true })
        .then(() => { setSettingsMessage('Connect token regenerated.'); })
        .catch((error) => { setSettingsMessage(String(error), true); });
    });
    $('verifyRestKeyBtn').addEventListener('click', async () => {
      const key = $('verifyRestKey').value.trim();
      const result = $('verifyRestKeyResult');
      if (!key) {
        result.textContent = 'Enter a key to verify.';
        return;
      }
      try {
        const res = await authedApi('/verify-rest-key', {
          method: 'POST',
          body: JSON.stringify({ key }),
        });
        const data = await res.json();
        result.textContent = data.ok
          ? 'Key is accepted (' + (data.method || 'unknown') + (data.proxyKeyId ? ', id ' + data.proxyKeyId : '') + ').'
          : 'Key was rejected.';
      } catch (error) {
        result.textContent = String(error);
      }
    });

    $('createProxyKeyBtn').addEventListener('click', () => {
      setProxyKeysNotice('');
      createProxyKey().catch((error) => setProxyKeysNotice(String(error), true));
    });
    $('refreshModels').addEventListener('click', () => loadModels().catch(showError));
    $('saveModels').addEventListener('click', () => {
      setModelsMessage('');
      saveModelVisibility().catch((error) => setModelsMessage(String(error), true));
    });
    $('modelsEnableAll').addEventListener('click', () => {
      modelCatalog.forEach((m) => { m.enabled = true; });
      renderModels({ data: modelCatalog, totalCount: modelCatalog.length, visibleCount: modelCatalog.length });
    });
    $('modelsComposerOnly').addEventListener('click', () => {
      modelCatalog.forEach((m) => { m.enabled = /^composer/i.test(m.id); });
      renderModels({
        data: modelCatalog,
        totalCount: modelCatalog.length,
        visibleCount: modelCatalog.filter((m) => m.enabled).length,
      });
    });
    $('refreshLogs').addEventListener('click', () => loadLogs().catch(showError));
    $('runHealth').addEventListener('click', async () => {
      const res = await fetch('/health');
      $('testOutput').textContent = JSON.stringify(await res.json(), null, 2);
    });
    $('runTest').addEventListener('click', async () => {
      $('runTest').disabled = true;
      $('testOutput').textContent = 'Running…';
      try {
        const body = {
          model: $('testModel').value,
          message: $('testPrompt').value,
        };
        const speed = $('testSpeed').value;
        if (speed === 'fast') body.fast = true;
        if (speed === 'standard') body.fast = false;
        const reasoning = $('testReasoning').value;
        if (reasoning) body.reasoning_effort = reasoning;
        const res = await authedApi('/chat', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        $('testOutput').textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        $('testOutput').textContent = String(error);
      } finally {
        $('runTest').disabled = false;
      }
    });

    function showError(error) {
      $('testOutput').textContent = String(error);
    }

    async function bootstrap() {
      const status = await loadStatus();
      await loadModels();
      const tasks = [loadSettings(), loadProxyKeys()];
      if (status.loggingPolicy !== 'no-log') {
        tasks.push(loadLogs());
      }
      await Promise.all(tasks);
      const select = $('testModel');
      if (status.defaultModel && [...select.options].some((opt) => opt.value === status.defaultModel)) {
        select.value = status.defaultModel;
      }
    }

    requireAuth().then((authed) => {
      if (authed) bootstrap().catch((error) => setSettingsMessage(String(error), true));
    });
  </script>
</body>
</html>`;
