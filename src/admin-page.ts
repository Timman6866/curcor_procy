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
      <button class="tab" data-tab="logs">Request log</button>
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
                <label><input type="radio" name="toolsMode" value="full" /> Full</label>
                <label><input type="radio" name="toolsMode" value="none" /> None</label>
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
              <label>Proxy API key <span id="sourceProxyKey" class="pill source-pill"></span></label>
              <input id="settingsProxyKey" type="password" placeholder="Leave blank to keep current" autocomplete="new-password" />
              <label class="hint"><input id="clearProxyKey" type="checkbox" /> Clear proxy API key (clients can use Cursor key)</label>
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
      <div class="row" style="justify-content:space-between; margin-top:0">
        <h2 style="margin:0">Available models</h2>
        <button class="secondary" id="refreshModels" type="button">Refresh</button>
      </div>
      <div id="modelsTable" style="margin-top:12px"></div>
    </section>

    <section class="panel card" data-panel="tester">
      <h2>Chat smoke test</h2>
      <div class="stack">
        <select id="testModel"></select>
        <textarea id="testPrompt" placeholder="Ask the model something simple…">Say "proxy-ok" and nothing else.</textarea>
        <div class="row">
          <button id="runTest" type="button">Run test</button>
          <button class="secondary" id="runHealth" type="button">Ping health</button>
        </div>
        <pre id="testOutput">Ready.</pre>
      </div>
    </section>

    <section class="panel card" data-panel="logs">
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
        ['Runtime', status.runtime, ''],
        ['Default model', status.defaultModel, ''],
        ['Tools policy', Array.isArray(status.toolsPolicy) ? status.toolsPolicy.join(', ') : status.toolsPolicy, ''],
        ['REST auth', status.restAuthMode, status.restAuthMode === 'proxy-key' ? 'warn' : 'ok'],
      ].map(([label, value, kind]) =>
        '<div class="card"><div class="label">' + label + '</div><div class="metric">' + value + '</div><div>' + pill(kind ? label : 'live', kind) + '</div></div>'
      ).join('');
    }

    function renderConfig(status) {
      const rows = [
        ['Host', status.host + ':' + status.port],
        ['Runtime', status.runtime],
        ['Working directory', status.cwd],
        ['Default model', status.defaultModel],
        ['Tools policy', Array.isArray(status.toolsPolicy) ? status.toolsPolicy.join(', ') : status.toolsPolicy],
        ['Cursor API key', status.secrets.cursorApiKey ? 'configured' : 'missing'],
        ['Proxy API key', status.secrets.proxyApiKey ? 'configured' : 'not set'],
        ['Connect token', status.secrets.connectAuthToken],
        ['Admin user', status.adminUsername],
      ];
      $('configKv').innerHTML = rows.map(([k, v]) => '<div>' + k + '</div><div>' + v + '</div>').join('');
      $('endpointBlock').textContent =
        'OpenAI REST:  ' + status.endpoints.openai + '\\n' +
        'Models:       ' + status.endpoints.models + '\\n' +
        'Health:       ' + status.endpoints.health + '\\n' +
        'Connect Send: ' + status.endpoints.connectSend + '\\n' +
        'Connect auth: ' + (status.connectAuthToken || '(see server logs if auto-generated)');
    }

    function renderModels(models) {
      if (!models.length) {
        $('modelsTable').innerHTML = '<p class="label">No models returned.</p>';
        return;
      }
      $('modelsTable').innerHTML = '<table><thead><tr><th>ID</th><th>Owner</th></tr></thead><tbody>' +
        models.map((m) => '<tr><td><code>' + m.id + '</code></td><td>' + (m.owned_by || 'cursor') + '</td></tr>').join('') +
        '</tbody></table>';
      const select = $('testModel');
      const current = select.value;
      select.innerHTML = models.map((m) => '<option value="' + m.id + '">' + m.id + '</option>').join('');
      if (current && models.some((m) => m.id === current)) {
        select.value = current;
      } else if (models.length > 0) {
        select.selectedIndex = 0;
      }
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
      $('settingsProxyKey').value = '';
      $('settingsConnectToken').value = '';
      $('settingsAdminPass').value = '';
      $('clearProxyKey').checked = false;
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
      const proxyKey = $('settingsProxyKey').value.trim();
      const connectToken = $('settingsConnectToken').value.trim();
      const adminPass = $('settingsAdminPass').value;
      if (cursorKey) body.cursorApiKey = cursorKey;
      if (proxyKey) body.proxyApiKey = proxyKey;
      if ($('clearProxyKey').checked) body.proxyApiKey = null;
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
      renderModels(data.data || []);
      const settingsModel = $('settingsDefaultModel');
      const current = settingsModel.value;
      settingsModel.innerHTML = (data.data || []).map((m) => '<option value="' + m.id + '">' + m.id + '</option>').join('');
      if (current && (data.data || []).some((m) => m.id === current)) settingsModel.value = current;
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

    $('refreshModels').addEventListener('click', () => loadModels().catch(showError));
    $('refreshLogs').addEventListener('click', () => loadLogs().catch(showError));
    $('runHealth').addEventListener('click', async () => {
      const res = await fetch('/health');
      $('testOutput').textContent = JSON.stringify(await res.json(), null, 2);
    });
    $('runTest').addEventListener('click', async () => {
      $('runTest').disabled = true;
      $('testOutput').textContent = 'Running…';
      try {
        const res = await authedApi('/chat', {
          method: 'POST',
          body: JSON.stringify({
            model: $('testModel').value,
            message: $('testPrompt').value,
          }),
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
      await Promise.all([loadLogs(), loadSettings()]);
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
