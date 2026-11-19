/**
 * Authorized Built-In Demo Web Application ("Northstar Portal")
 * Served at /sandbox-app for reproducible Playwright testing & academic evaluation.
 * Supports ?defects=true to inject 3 realistic known defects for defect-detection benchmarking.
 */
export function renderDemoTargetAppHtml(injectDefects: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Northstar Portal — Demo Web Application</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
    }
    header {
      background: #0f172a;
      color: #ffffff;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
    }
    header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    nav { display: flex; gap: 8px; }
    nav button {
      background: transparent;
      color: #cbd5e1;
      border: 1px solid transparent;
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    nav button[aria-selected="true"] {
      background: #1e293b;
      color: #ffffff;
      border-color: #334155;
    }
    main { max-width: 960px; margin: 32px auto; padding: 0 24px 64px; }
    .banner {
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      color: #1e3a8a;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .defect-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    .panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 28px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .hidden { display: none !important; }
    h2 { margin-top: 0; font-size: 22px; color: #0f172a; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #334155; }
    input[type="text"], input[type="email"], input[type="password"], input[type="search"], select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
      color: #0f172a;
      background: #ffffff;
    }
    input[aria-invalid="true"] { border-color: #dc2626; background: #fef2f2; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .checkbox-row label { margin: 0; font-weight: 400; }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .alert-error {
      margin-top: 14px;
      padding: 10px 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
    }
    .alert-success {
      margin-top: 14px;
      padding: 10px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
    }
    .catalog-controls { display: grid; grid-template-columns: 2fr 1fr auto; gap: 12px; align-items: end; margin-bottom: 20px; }
    .catalog-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .item-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: #f8fafc;
    }
    .item-card h3 { margin: 0 0 6px; font-size: 15px; }
    .item-meta { font-size: 12px; color: #475569; margin-bottom: 8px; }
    .item-price { font-size: 14px; font-weight: 700; color: #0f172a; }
    .hint-box {
      margin-top: 16px;
      padding: 12px;
      background: #f1f5f9;
      border-radius: 6px;
      font-size: 12px;
      color: #334155;
    }
    code { background: #e2e8f0; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <header>
    <h1>Northstar Portal</h1>
    <nav role="tablist" aria-label="Primary Navigation">
      <button id="tab-login" role="tab" aria-selected="true" data-tab="login">Sign In</button>
      <button id="tab-register" role="tab" aria-selected="false" data-tab="register">Register</button>
      <button id="tab-catalog" role="tab" aria-selected="false" data-tab="catalog">Catalog Search</button>
      <button id="tab-docs" role="tab" aria-selected="false" data-tab="docs">Support Docs</button>
    </nav>
  </header>

  <main>
    <div class="banner ${injectDefects ? 'defect-banner' : ''}">
      ${
        injectDefects
          ? '<strong>Sandbox Evaluation Mode (Known Defects Enabled):</strong> Contains 3 intentional seeded defects in login validation, registration password confirmation, and search filtering for QA benchmark evaluation.'
          : '<strong>Authorized QA Sandbox Application:</strong> Demo credentials for valid sign-in: Email <code>qa.engineer@northstar.test</code> · Password <code>SentinelPass123!</code>'
      }
    </div>

    <!-- LOGIN SECTION -->
    <section id="panel-login" class="panel" aria-labelledby="login-heading">
      <h2 id="login-heading">Account Sign In</h2>
      <p style="color:#475569;font-size:14px;margin-bottom:20px;">
        Enter your Northstar Portal workspace credentials to access your project console.
      </p>
      <form id="login-form" aria-label="Login Form" novalidate>
        <div class="field">
          <label for="login-email">Email Address</label>
          <input id="login-email" name="email" type="email" placeholder="qa.engineer@northstar.test" required autocomplete="username" />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" placeholder="Enter your password" required autocomplete="current-password" />
        </div>
        <div class="checkbox-row">
          <input id="remember-me" type="checkbox" />
          <label for="remember-me">Keep me signed in for 14 days</label>
        </div>
        <button type="submit" class="btn-primary">Sign In</button>
      </form>
      <div id="login-feedback" role="alert" class="hidden"></div>
      <div id="signed-in-view" class="hidden" style="margin-top:20px;padding:18px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;">
        <h3 style="margin:0 0 6px;color:#166534;">Welcome back, QA Engineer</h3>
        <p style="margin:0 0 12px;font-size:13px;color:#15803d;">Workspace session active. Role: Lead Automation Reviewer.</p>
        <button id="logout-btn" type="button" class="btn-secondary">Sign Out</button>
      </div>
      <div class="hint-box">
        Demo Login: <code>qa.engineer@northstar.test</code> / <code>SentinelPass123!</code>
      </div>
    </section>

    <!-- REGISTRATION SECTION -->
    <section id="panel-register" class="panel hidden" aria-labelledby="register-heading">
      <h2 id="register-heading">Create Workspace Account</h2>
      <form id="register-form" aria-label="Registration Form" novalidate>
        <div class="field">
          <label for="reg-name">Full Name</label>
          <input id="reg-name" name="fullName" type="text" placeholder="Ada Lovelace" required />
        </div>
        <div class="field">
          <label for="reg-email">Work Email</label>
          <input id="reg-email" name="workEmail" type="email" placeholder="ada@northstar.test" required />
        </div>
        <div class="field">
          <label for="reg-role">Team Role</label>
          <select id="reg-role" name="role">
            <option value="qa">QA Engineer</option>
            <option value="dev">Software Developer</option>
            <option value="pm">Product Manager</option>
          </select>
        </div>
        <div class="field">
          <label for="reg-password">Create Password</label>
          <input id="reg-password" name="newPassword" type="password" placeholder="Minimum 8 characters" required minlength="8" />
        </div>
        <div class="field">
          <label for="reg-confirm">Confirm Password</label>
          <input id="reg-confirm" name="confirmPassword" type="password" placeholder="Re-enter password" required />
        </div>
        <div class="checkbox-row">
          <input id="reg-terms" type="checkbox" required />
          <label for="reg-terms">I agree to the Workspace Terms of Service</label>
        </div>
        <button type="submit" class="btn-primary">Create Account</button>
      </form>
      <div id="register-feedback" role="alert" class="hidden"></div>
    </section>

    <!-- CATALOG SEARCH SECTION -->
    <section id="panel-catalog" class="panel hidden" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Hardware & Testing Kits Catalog</h2>
      <div class="catalog-controls">
        <div>
          <label for="catalog-search">Search Catalog</label>
          <input id="catalog-search" type="search" placeholder="Search by product name or feature..." />
        </div>
        <div>
          <label for="catalog-category">Category</label>
          <select id="catalog-category">
            <option value="all">All Categories</option>
            <option value="Testing">Testing</option>
            <option value="Networking">Networking</option>
            <option value="Sensors">Sensors</option>
          </select>
        </div>
        <button id="catalog-search-btn" type="button" class="btn-primary">Apply Filter</button>
      </div>
      <div class="checkbox-row">
        <input id="catalog-instock" type="checkbox" />
        <label for="catalog-instock">Show in-stock items only</label>
      </div>
      <p id="catalog-count" style="font-size:13px;color:#475569;margin-bottom:14px;"></p>
      <div id="catalog-results" class="catalog-list"></div>
    </section>

    <!-- SUPPORT DOCS SECTION -->
    <section id="panel-docs" class="panel hidden" aria-labelledby="docs-heading">
      <h2 id="docs-heading">Support Documentation</h2>
      <p style="color:#475569;font-size:14px;">
        Northstar Portal provides standard authentication, role onboarding, and searchable equipment inventory for automated QA validation.
      </p>
      <ul>
        <li><a href="#login" id="doc-link-login">Go to Account Sign In</a></li>
        <li><a href="#register" id="doc-link-register">Open Registration Form</a></li>
        <li><a href="#catalog" id="doc-link-catalog">Browse Hardware Catalog</a></li>
      </ul>
    </section>
  </main>

  <script>
    const DEFECTS_ENABLED = ${injectDefects ? 'true' : 'false'};

    const ITEMS = [
      { id: 1, name: 'Oscilloscope Probe Kit', category: 'Testing', price: '$149', inStock: true },
      { id: 2, name: 'Ethernet Packet Tap', category: 'Networking', price: '$210', inStock: true },
      { id: 3, name: 'Thermal Calibration Sensor', category: 'Sensors', price: '$89', inStock: false },
      { id: 4, name: 'USB-C Power Analyzer', category: 'Testing', price: '$125', inStock: true },
      { id: 5, name: 'Quantum Telemetry Bridge', category: 'Networking', price: '$490', inStock: true },
      { id: 6, name: 'Acoustic Vibration Logger', category: 'Sensors', price: '$175', inStock: false }
    ];

    const tabs = ['login', 'register', 'catalog', 'docs'];

    function activateTab(tabName) {
      if (!tabs.includes(tabName)) tabName = 'login';
      tabs.forEach((t) => {
        const btn = document.getElementById('tab-' + t);
        const panel = document.getElementById('panel-' + t);
        const active = t === tabName;
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        panel.classList.toggle('hidden', !active);
      });
      if (window.location.hash !== '#' + tabName) {
        history.replaceState(null, '', '#' + tabName);
      }
      const titles = {
        login: 'Sign In — Northstar Portal',
        register: 'Register — Northstar Portal',
        catalog: 'Catalog Search — Northstar Portal',
        docs: 'Support Docs — Northstar Portal'
      };
      document.title = titles[tabName];
    }

    tabs.forEach((t) => {
      document.getElementById('tab-' + t).addEventListener('click', () => activateTab(t));
    });

    document.getElementById('doc-link-login').addEventListener('click', (e) => { e.preventDefault(); activateTab('login'); });
    document.getElementById('doc-link-register').addEventListener('click', (e) => { e.preventDefault(); activateTab('register'); });
    document.getElementById('doc-link-catalog').addEventListener('click', (e) => { e.preventDefault(); activateTab('catalog'); });

    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '');
      if (tabs.includes(h)) activateTab(h);
    });

    // LOGIN HANDLER
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginFeedback = document.getElementById('login-feedback');
    const signedInView = document.getElementById('signed-in-view');

    function showFeedback(el, type, msg) {
      el.className = type === 'error' ? 'alert-error' : 'alert-success';
      el.textContent = msg;
      el.classList.remove('hidden');
    }

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loginEmail.removeAttribute('aria-invalid');
      loginPassword.removeAttribute('aria-invalid');
      loginFeedback.classList.add('hidden');
      signedInView.classList.add('hidden');

      const email = loginEmail.value.trim();
      const pwd = loginPassword.value;

      if (!email) {
        loginEmail.setAttribute('aria-invalid', 'true');
        showFeedback(loginFeedback, 'error', 'Email address is required.');
        return;
      }
      if (!email.includes('@')) {
        loginEmail.setAttribute('aria-invalid', 'true');
        showFeedback(loginFeedback, 'error', 'Please enter a valid email address.');
        return;
      }
      if (!pwd) {
        if (DEFECTS_ENABLED) {
          // SEEDED DEFECT #1: Accepts empty password when defect mode is enabled
          signedInView.classList.remove('hidden');
          showFeedback(loginFeedback, 'success', 'Login successful.');
          return;
        }
        loginPassword.setAttribute('aria-invalid', 'true');
        showFeedback(loginFeedback, 'error', 'Password is required.');
        return;
      }

      if (email === 'qa.engineer@northstar.test' && pwd === 'SentinelPass123!') {
        loginForm.classList.add('hidden');
        signedInView.classList.remove('hidden');
        showFeedback(loginFeedback, 'success', 'Authentication succeeded. Welcome back, QA Engineer.');
      } else {
        loginPassword.setAttribute('aria-invalid', 'true');
        showFeedback(loginFeedback, 'error', 'Invalid email or password. Please try again.');
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      signedInView.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginForm.reset();
      showFeedback(loginFeedback, 'success', 'You have been signed out.');
    });

    // REGISTRATION HANDLER
    const regForm = document.getElementById('register-form');
    const regFeedback = document.getElementById('register-feedback');

    regForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('reg-name');
      const emailEl = document.getElementById('reg-email');
      const pwdEl = document.getElementById('reg-password');
      const confirmEl = document.getElementById('reg-confirm');
      const termsEl = document.getElementById('reg-terms');

      [nameEl, emailEl, pwdEl, confirmEl].forEach((el) => el.removeAttribute('aria-invalid'));

      if (!nameEl.value.trim()) {
        nameEl.setAttribute('aria-invalid', 'true');
        showFeedback(regFeedback, 'error', 'Full name is required.');
        return;
      }
      if (!emailEl.value.trim() || !emailEl.value.includes('@')) {
        emailEl.setAttribute('aria-invalid', 'true');
        showFeedback(regFeedback, 'error', 'A valid work email is required.');
        return;
      }
      if (pwdEl.value.length < 8) {
        pwdEl.setAttribute('aria-invalid', 'true');
        showFeedback(regFeedback, 'error', 'Password must be at least 8 characters long.');
        return;
      }
      if (!DEFECTS_ENABLED && pwdEl.value !== confirmEl.value) {
        // SEEDED DEFECT #2: Skips password confirmation match check in defect mode
        confirmEl.setAttribute('aria-invalid', 'true');
        showFeedback(regFeedback, 'error', 'Passwords do not match.');
        return;
      }
      if (!termsEl.checked) {
        showFeedback(regFeedback, 'error', 'You must accept the Workspace Terms of Service.');
        return;
      }

      showFeedback(regFeedback, 'success', 'Account created successfully for ' + nameEl.value.trim() + '.');
    });

    // CATALOG SEARCH HANDLER
    const searchInput = document.getElementById('catalog-search');
    const categorySelect = document.getElementById('catalog-category');
    const inStockCheckbox = document.getElementById('catalog-instock');
    const countEl = document.getElementById('catalog-count');
    const resultsEl = document.getElementById('catalog-results');

    function renderCatalog() {
      const q = searchInput.value.trim().toLowerCase();
      const cat = categorySelect.value;
      const onlyStock = inStockCheckbox.checked;

      // SEEDED DEFECT #3: Search fails on "quantum" query in defect mode
      if (DEFECTS_ENABLED && q.includes('quantum')) {
        countEl.textContent = 'Error 500: Search index failure';
        resultsEl.innerHTML = '<div class="alert-error" role="alert">Unexpected search backend error while querying catalog.</div>';
        return;
      }

      const filtered = ITEMS.filter((item) => {
        if (q && !item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) return false;
        if (cat !== 'all' && item.category !== cat) return false;
        if (onlyStock && !item.inStock) return false;
        return true;
      });

      countEl.textContent = 'Showing ' + filtered.length + ' of ' + ITEMS.length + ' items';
      if (filtered.length === 0) {
        resultsEl.innerHTML = '<p style="color:#64748b;">No matching products found. Try clearing your filters.</p>';
        return;
      }
      resultsEl.innerHTML = filtered
        .map(
          (i) =>
            '<article class="item-card"><h3>' +
            i.name +
            '</h3><div class="item-meta">' +
            i.category +
            ' · ' +
            (i.inStock ? 'In Stock' : 'Out of Stock') +
            '</div><div class="item-price">' +
            i.price +
            '</div></article>'
        )
        .join('');
    }

    searchInput.addEventListener('input', renderCatalog);
    categorySelect.addEventListener('change', renderCatalog);
    inStockCheckbox.addEventListener('change', renderCatalog);
    document.getElementById('catalog-search-btn').addEventListener('click', renderCatalog);

    renderCatalog();
    const initialHash = window.location.hash.replace('#', '');
    if (tabs.includes(initialHash)) activateTab(initialHash);
  </script>
</body>
</html>`;
}
