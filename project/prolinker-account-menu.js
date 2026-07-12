(function (global) {
  'use strict';

  if (!global.customElements || global.customElements.get('prolinker-account-menu')) return;

  function readSession() {
    if (global.ProLinkerApp && global.ProLinkerApp.session) return global.ProLinkerApp.session.get();
    try { return JSON.parse(global.localStorage.getItem('plk-auth-session') || 'null'); }
    catch (error) { return null; }
  }

  function language() {
    try {
      var saved = global.localStorage.getItem('plk-language');
      if (saved === 'nl' || saved === 'en') return saved;
    } catch (error) {}
    var htmlLang = String(document.documentElement.lang || '').toLowerCase();
    if (htmlLang.indexOf('en') === 0) return 'en';
    return 'nl';
  }

  function mainNavigationItems(lang) {
    if (lang === 'en') return [
      ['Freelancers', 'Prolinker Results.dc.html'],
      ['Jobs', 'Prolinker Voor jou v2.dc.html'],
      ['Post a job', 'Prolinker Brief.dc.html'],
      ['Blog', 'https://prolinker.com/nl/blog?page=1'],
      ['Earn 2% with referrals', 'Prolinker Verdiensten.dc.html'],
      ['Become a freelancer', 'Prolinker Login.dc.html?mode=register&role=freelancer'],
      ['Become a recruiter', 'Prolinker Login.dc.html?mode=register&role=client']
    ];
    return [
      ['Freelancers', 'Prolinker Results.dc.html'],
      ['Opdrachten', 'Prolinker Voor jou v2.dc.html'],
      ['Opdracht plaatsen', 'Prolinker Brief.dc.html'],
      ['Blog', 'https://prolinker.com/nl/blog?page=1'],
      ['Verdien 2% met referrals', 'Prolinker Verdiensten.dc.html'],
      ['Freelancer worden', 'Prolinker Login.dc.html?mode=register&role=freelancer'],
      ['Recruiter worden', 'Prolinker Login.dc.html?mode=register&role=client']
    ];
  }

  function fallbackAccountItems(role, lang) {
    var safeRole = role === 'client' ? 'client' : 'freelancer';
    var english = lang === 'en';
    return [
      { key: 'dashboard', label: english ? 'My dashboard' : 'Mijn Dashboard', href: 'Prolinker Dashboard.dc.html', badgeText: '' },
      { key: 'network', label: english ? 'My network' : 'Mijn Netwerk', href: 'Prolinker Netwerk.dc.html', badgeText: '' },
      { key: 'assignments', label: english ? 'My jobs' : 'Mijn Opdrachten', href: 'Prolinker Mijn opdrachten.dc.html?role=' + safeRole, badgeText: '' },
      { key: 'messages', label: english ? 'My messages' : 'Mijn Berichten', href: 'Prolinker Berichten.dc.html', badgeText: '' },
      { key: 'profile', label: english ? 'My profile' : 'Mijn Profiel', href: safeRole === 'client' ? 'Prolinker Instellingen.dc.html?section=profiel' : 'Prolinker Profiel.dc.html', badgeText: '' },
      { key: 'earnings', label: english ? 'My transactions' : 'Mijn Transacties', href: 'Prolinker Verdiensten.dc.html', badgeText: '' },
      { key: 'settings', label: english ? 'Settings' : 'Instellingen', href: 'Prolinker Instellingen.dc.html', badgeText: '' }
    ];
  }

  function accountItemLabel(item, lang) {
    if (lang !== 'en') return item.label;
    var labels = {
      dashboard: 'My dashboard',
      network: 'My network',
      assignments: 'My jobs',
      messages: 'My messages',
      profile: 'My profile',
      earnings: 'My transactions',
      settings: 'Settings'
    };
    return labels[item.key] || item.label;
  }

  function localProfile() {
    try {
      var profile = JSON.parse(global.localStorage.getItem('plk-profile') || 'null');
      return profile && typeof profile === 'object' ? profile : {};
    } catch (error) { return {}; }
  }

  function firstString(values) {
    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (value && typeof value === 'object') value = value.name || value.displayName || '';
      value = typeof value === 'string' ? value.trim() : '';
      if (value) return value;
    }
    return '';
  }

  function firstName(value) {
    return String(value || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  }

  function identityDetails(session, role, lang) {
    var sessionProfile = session && session.profile && typeof session.profile === 'object' ? session.profile : {};
    var savedProfile = localProfile();
    var storedName = '';
    try { storedName = global.localStorage.getItem('plk-user-name') || ''; } catch (error) {}
    var label;
    if (role === 'client') {
      label = firstString([
        sessionProfile.companyName, sessionProfile.businessName, sessionProfile.organizationName, sessionProfile.organisationName, sessionProfile.company, sessionProfile.organization, sessionProfile.organisation, sessionProfile.business,
        session.companyName, session.businessName, session.organizationName, session.organisationName, session.company, session.organization, session.organisation, session.business
      ]) || (lang === 'en' ? 'Business' : 'Bedrijf');
    } else {
      label = firstName(firstString([
        sessionProfile.firstName, session.firstName, session.name, storedName,
        savedProfile.firstName, savedProfile.name
      ])) || (lang === 'en' ? 'Profile' : 'Profiel');
    }
    var initials = label.split(/\s+/).filter(Boolean).slice(0, role === 'client' ? 2 : 1).map(function (part) {
      return part.charAt(0);
    }).join('').toUpperCase() || 'PL';
    return { label: label.slice(0, 100), initials: initials };
  }

  function safeAvatar(session, role) {
    var sessionProfile = session && session.profile && typeof session.profile === 'object' ? session.profile : {};
    var savedProfile = localProfile();
    var candidates = [
      session && session.avatarUrl, session && session.avatar, session && session.photoUrl, session && session.photo,
      sessionProfile.avatarUrl, sessionProfile.avatar, sessionProfile.photoUrl, sessionProfile.photo
    ];
    if (role === 'freelancer') candidates = candidates.concat([
      savedProfile.avatarUrl, savedProfile.avatar, savedProfile.photoUrl, savedProfile.photo
    ]);
    var candidate = firstString(candidates);
    if (!candidate) return '';
    if (/^data:image\/(?:png|jpeg|webp|avif);base64,/i.test(candidate)) return candidate;
    try {
      var url = new URL(candidate, global.location.href);
      var localProtocol = url.protocol === 'capacitor:' || url.protocol === 'ionic:' || url.protocol === 'file:';
      return url.protocol === 'https:' || localProtocol || (url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) ? url.href : '';
    } catch (error) { return ''; }
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  class ProLinkerAccountMenu extends HTMLElement {
    static get observedAttributes() { return ['current']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._open = false;
      this._onDocumentPointer = this._onDocumentPointer.bind(this);
      this._onDocumentKey = this._onDocumentKey.bind(this);
      this._onStorage = this.render.bind(this);
    }

    connectedCallback() {
      this.render();
      global.addEventListener('storage', this._onStorage);
      global.addEventListener('plk-session-change', this._onStorage);
      global.addEventListener('plk-profile-change', this._onStorage);
    }

    disconnectedCallback() {
      global.removeEventListener('storage', this._onStorage);
      global.removeEventListener('plk-session-change', this._onStorage);
      global.removeEventListener('plk-profile-change', this._onStorage);
      document.removeEventListener('pointerdown', this._onDocumentPointer, true);
      document.removeEventListener('keydown', this._onDocumentKey, true);
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    _onDocumentPointer(event) {
      if (event.composedPath && event.composedPath().indexOf(this) >= 0) return;
      this.close(false);
    }

    _onDocumentKey(event) {
      if (!this._open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close(true);
        return;
      }
      var activePanel = this._mainPanel;
      if (event.key !== 'Tab' || !activePanel) return;
      var focusable = Array.prototype.slice.call(activePanel.querySelectorAll('a[href],button:not([disabled])'));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = this.shadowRoot.activeElement || document.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    toggleMain() {
      if (this._open) this.close(false);
      else this.open();
    }

    open() {
      var panel = this._mainPanel;
      var trigger = this._mainTrigger;
      if (!panel || !trigger) return;
      this._open = true;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', this._onDocumentPointer, true);
      document.addEventListener('keydown', this._onDocumentKey, true);
    }

    close(restoreFocus) {
      if (!this._open) return;
      var panel = this._mainPanel;
      var trigger = this._mainTrigger;
      this._open = false;
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', this._onDocumentPointer, true);
      document.removeEventListener('keydown', this._onDocumentKey, true);
      if (restoreFocus && trigger) trigger.focus();
    }

    toggleTheme() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = dark ? 'light' : 'dark';
      try {
        if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        global.localStorage.setItem('plk-theme', next);
      } catch (error) {}
      var isDark = next === 'dark';
      if (this._themeButton) this._themeButton.setAttribute('aria-checked', isDark ? 'true' : 'false');
      if (this._themeTrack) this._themeTrack.setAttribute('data-on', isDark ? 'true' : 'false');
      if (this._themeKnob) this._themeKnob.setAttribute('data-on', isDark ? 'true' : 'false');
    }

    logout() {
      this.close(false);
      if (global.ProLinkerApp && global.ProLinkerApp.session) global.ProLinkerApp.session.logout();
      else {
        try { global.localStorage.removeItem('plk-auth-session'); } catch (error) {}
        global.location.href = 'Prolinker Login.dc.html?mode=login';
      }
    }

    render() {
      if (this._open) this.close(false);
      var session = readSession();
      this.hidden = !session;
      if (!session) { this.shadowRoot.replaceChildren(); return; }

      var role = session.role === 'client' ? 'client' : 'freelancer';
      var lang = language();
      var items = global.ProLinkerApp && global.ProLinkerApp.routes && typeof global.ProLinkerApp.routes.accountMenu === 'function'
        ? global.ProLinkerApp.routes.accountMenu(role)
        : fallbackAccountItems(role, lang);
      var current = this.getAttribute('current') || '';
      var identity = identityDetails(session, role, lang);
      var avatarUrl = safeAvatar(session, role);
      var profileItem = items.find(function (item) { return item.key === 'profile'; });
      var profileHref = profileItem ? profileItem.href : fallbackAccountItems(role, lang)[4].href;

      var style = element('style');
      style.textContent = [
        ':host{display:inline-block;color:var(--text,#152431);font-family:inherit;line-height:1.2}',
        '*{box-sizing:border-box}',
        'button,a{font:inherit}',
        '.cluster{display:flex;align-items:center;gap:7px}',
        '.main-wrap{position:relative;display:flex;align-items:center}',
        '.main-trigger{width:36px;height:36px;min-width:36px;padding:0;border:1px solid var(--border,#e4e5ec);border-radius:50%;background:var(--surface,#fff);color:var(--muted,#667587);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
        '.main-trigger:hover,.main-trigger:focus-visible{border-color:#afc8df;background:var(--panel,#f7f8fb)}',
        '.dot-grid{width:16px;height:16px;display:grid;grid-template-columns:repeat(3,3px);grid-auto-rows:3px;gap:3px}',
        '.dot-grid span{width:3px;height:3px;border-radius:50%;background:currentColor}',
        '.identity{min-width:0;min-height:38px;padding:3px 6px 3px 3px;border-radius:5px;color:var(--text,#152431);display:inline-flex;align-items:center;gap:7px;text-decoration:none}',
        '.identity:hover,.identity:focus-visible{background:var(--panel,#f7f8fb);color:var(--text,#152431)}',
        '.identity-avatar{width:30px;height:30px;flex:0 0 30px;overflow:hidden;border:1px solid #cbdbe8;border-radius:50%;background:linear-gradient(145deg,#dfeefa,#edf5fb);color:#1767aa;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:.02em}',
        '.identity-avatar img{width:100%;height:100%;display:block;object-fit:cover}',
        '.identity-name{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650}',
        '.main-panel{position:absolute;right:0;top:46px;z-index:125;width:268px;max-width:calc(100vw - 20px);max-height:calc(100vh - 82px);padding:8px;overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--border,#e4e5ec);border-radius:14px;background:var(--surface,#fff);box-shadow:0 24px 60px -20px rgba(11,17,25,.4)}',
        '.main-panel[hidden]{display:none}',
        '.main-item{display:flex;align-items:center;gap:11px;min-height:40px;padding:10px 12px;border-radius:9px;color:var(--text,#152431);font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}',
        '.main-item:hover,.main-item:focus-visible{background:var(--panel,#f7f8fb);color:var(--text,#152431)}',
        '.main-dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#006bc6}',
        '.main-divider{height:1px;margin:7px 4px;background:var(--hairline,#ecedf2)}',
        '.main-caption{padding:4px 12px 3px;color:var(--faint,#9aa0a6);font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.09em;text-transform:uppercase}',
        '.account-main-item{width:100%;min-height:40px;padding:10px 12px;border:0;border-radius:9px;background:transparent;color:var(--text,#152431);display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;font-size:14px;font-weight:500;text-align:left;text-decoration:none;cursor:pointer}',
        '.account-main-item:hover,.account-main-item:focus-visible{background:var(--panel,#f7f8fb);color:var(--text,#152431)}',
        '.account-main-item[aria-current="page"]{background:var(--panel,#f2f6f9);color:#196399;font-weight:700}',
        '.account-main-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.account-main-badge{min-width:18px;height:17px;padding:0 5px;border-radius:999px;background:#f04444;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800}',
        '.logout{margin-top:1px}',
        '.theme-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:11px;padding:10px 12px;border:0;border-radius:9px;background:transparent;color:var(--text,#152431);font-size:14px;font-weight:500;cursor:pointer}',
        '.theme-button:hover,.theme-button:focus-visible{background:var(--panel,#f7f8fb)}',
        '.theme-label{display:flex;align-items:center;gap:11px}',
        '.theme-track{position:relative;width:38px;height:22px;flex:0 0 38px;border-radius:999px;background:var(--border,#e4e5ec);transition:background .2s ease}',
        '.theme-track[data-on="true"]{background:#006bc6}',
        '.theme-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .2s ease}',
        '.theme-knob[data-on="true"]{left:18px}',
        '.main-trigger:focus-visible,.identity:focus-visible,.main-item:focus-visible,.account-main-item:focus-visible,.theme-button:focus-visible{outline:2px solid rgba(47,130,200,.32);outline-offset:2px}',
        '@media(max-width:560px){.identity-name{max-width:76px;font-size:11px}.main-panel{position:fixed;left:10px;right:10px;top:62px;width:auto;max-width:none;max-height:calc(100vh - 74px)}}',
        '@media(prefers-reduced-motion:reduce){.theme-track,.theme-knob{transition:none}}'
      ].join('');

      var cluster = element('div', 'cluster');
      var mainWrap = element('div', 'main-wrap');
      var mainTrigger = element('button', 'main-trigger');
      mainTrigger.type = 'button';
      mainTrigger.setAttribute('aria-haspopup', 'menu');
      mainTrigger.setAttribute('aria-expanded', 'false');
      mainTrigger.setAttribute('aria-label', lang === 'en' ? 'Open main menu' : 'Hoofdmenu openen');
      mainTrigger.title = lang === 'en' ? 'Menu' : 'Menu';
      mainTrigger.addEventListener('click', this.toggleMain.bind(this));
      var dotGrid = element('span', 'dot-grid');
      dotGrid.setAttribute('aria-hidden', 'true');
      for (var dotIndex = 0; dotIndex < 9; dotIndex += 1) dotGrid.appendChild(element('span'));
      mainTrigger.appendChild(dotGrid);

      var mainPanel = element('div', 'main-panel');
      mainPanel.hidden = true;
      mainPanel.setAttribute('role', 'menu');
      mainPanel.setAttribute('aria-label', lang === 'en' ? 'Main navigation' : 'Hoofdnavigatie');
      mainNavigationItems(lang).forEach(function (entry) {
        var mainLink = element('a', 'main-item');
        mainLink.href = entry[1];
        mainLink.setAttribute('role', 'menuitem');
        mainLink.appendChild(element('span', 'main-dot'));
        mainLink.appendChild(element('span', '', entry[0]));
        mainPanel.appendChild(mainLink);
      });
      mainPanel.appendChild(element('div', 'main-divider'));
      mainPanel.appendChild(element('div', 'main-caption', lang === 'en' ? 'My account' : 'Mijn account'));
      items.forEach(function (item) {
        var accountLink = element('a', 'account-main-item');
        accountLink.href = item.href;
        accountLink.setAttribute('role', 'menuitem');
        if (item.key === current) accountLink.setAttribute('aria-current', 'page');
        accountLink.appendChild(element('span', 'account-main-label', accountItemLabel(item, lang)));
        if (item.badgeText !== undefined && item.badgeText !== null && String(item.badgeText) !== '') {
          accountLink.appendChild(element('span', 'account-main-badge', item.badgeText));
        }
        mainPanel.appendChild(accountLink);
      });
      var logout = element('button', 'account-main-item logout');
      logout.type = 'button';
      logout.setAttribute('role', 'menuitem');
      logout.appendChild(element('span', 'account-main-label', lang === 'en' ? 'Log out' : 'Log uit'));
      logout.addEventListener('click', this.logout.bind(this));
      mainPanel.appendChild(logout);

      mainPanel.appendChild(element('div', 'main-divider'));
      mainPanel.appendChild(element('div', 'main-caption', lang === 'en' ? 'Display' : 'Weergave'));
      var themeButton = element('button', 'theme-button');
      themeButton.type = 'button';
      themeButton.setAttribute('role', 'switch');
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeButton.setAttribute('aria-checked', isDark ? 'true' : 'false');
      themeButton.addEventListener('click', this.toggleTheme.bind(this));
      var themeLabel = element('span', 'theme-label');
      themeLabel.appendChild(element('span', '', lang === 'en' ? 'Dark mode' : 'Donkere modus'));
      themeButton.appendChild(themeLabel);
      var themeTrack = element('span', 'theme-track');
      themeTrack.setAttribute('aria-hidden', 'true');
      themeTrack.setAttribute('data-on', isDark ? 'true' : 'false');
      var themeKnob = element('span', 'theme-knob');
      themeKnob.setAttribute('data-on', isDark ? 'true' : 'false');
      themeTrack.appendChild(themeKnob);
      themeButton.appendChild(themeTrack);
      mainPanel.appendChild(themeButton);
      mainWrap.appendChild(mainTrigger);
      mainWrap.appendChild(mainPanel);

      var identityLink = element('a', 'identity');
      identityLink.href = profileHref;
      identityLink.title = identity.label;
      identityLink.setAttribute('aria-label', (lang === 'en' ? 'Open profile for ' : 'Profiel openen van ') + identity.label);
      var identityAvatar = element('span', 'identity-avatar');
      identityAvatar.setAttribute('aria-hidden', 'true');
      if (avatarUrl) {
        var avatarImage = element('img');
        avatarImage.src = avatarUrl;
        avatarImage.alt = '';
        identityAvatar.appendChild(avatarImage);
      } else identityAvatar.appendChild(document.createTextNode(identity.initials));
      identityLink.appendChild(identityAvatar);
      identityLink.appendChild(element('span', 'identity-name', identity.label));

      cluster.appendChild(mainWrap);
      cluster.appendChild(identityLink);

      this.shadowRoot.replaceChildren(style, cluster);
      this._mainTrigger = mainTrigger;
      this._mainPanel = mainPanel;
      this._themeButton = themeButton;
      this._themeTrack = themeTrack;
      this._themeKnob = themeKnob;
      this._open = false;
    }
  }

  global.customElements.define('prolinker-account-menu', ProLinkerAccountMenu);
})(window);
