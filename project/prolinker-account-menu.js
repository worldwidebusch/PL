(function (global) {
  'use strict';

  if (!global.customElements || global.customElements.get('prolinker-account-menu')) return;

  var FALLBACK_ICONS = {
    dashboard: '\u25a3',
    network: '\u2723',
    assignments: '\u25a4',
    messages: '\u25b1',
    profile: '\u25ce',
    earnings: '\u25cc',
    settings: '\u2699'
  };

  function initials(name) {
    var parts = String(name || 'ProLinker gebruiker').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(function (part) { return part.charAt(0); }).join('') || 'PL').toUpperCase();
  }

  function safeAvatar(session) {
    var sessionProfile = session && session.profile && typeof session.profile === 'object' ? session.profile : null;
    var candidate = session && (session.avatarUrl || session.avatar || session.photoUrl || session.photo)
      || sessionProfile && (sessionProfile.avatarUrl || sessionProfile.avatar || sessionProfile.photoUrl || sessionProfile.photo);
    if (!candidate) {
      try {
        var profile = JSON.parse(global.localStorage.getItem('plk-profile') || 'null');
        candidate = profile && (profile.avatarUrl || profile.avatar || profile.photoUrl || profile.photo);
      } catch (error) {}
    }
    candidate = typeof candidate === 'string' ? candidate.trim() : '';
    if (/^data:image\/(?:png|jpeg|webp|avif);base64,/i.test(candidate)) return candidate;
    try {
      var url = new URL(candidate, global.location.href);
      var localProtocol = url.protocol === 'capacitor:' || url.protocol === 'ionic:' || url.protocol === 'file:';
      return url.protocol === 'https:' || localProtocol || (url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) ? url.href : '';
    } catch (error) { return ''; }
  }

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
      this._openType = '';
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
      if (!this._openType) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close(true);
        return;
      }
      var activePanel = this._openType === 'main' ? this._mainPanel : this._panel;
      if (event.key !== 'Tab' || !activePanel) return;
      var focusable = Array.prototype.slice.call(activePanel.querySelectorAll('a[href],button:not([disabled])'));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = this.shadowRoot.activeElement || document.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    toggle() {
      this.togglePanel('account');
    }

    toggleMain() {
      this.togglePanel('main');
    }

    togglePanel(type) {
      if (this._openType === type) { this.close(false); return; }
      if (this._openType) this.close(false);
      this.open(type);
    }

    open(type) {
      var isMain = type === 'main';
      var panel = isMain ? this._mainPanel : this._panel;
      var trigger = isMain ? this._mainTrigger : this._trigger;
      if (!panel || !trigger) return;
      this._openType = isMain ? 'main' : 'account';
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (!isMain && this._chevron) this._chevron.setAttribute('data-open', 'true');
      document.addEventListener('pointerdown', this._onDocumentPointer, true);
      document.addEventListener('keydown', this._onDocumentKey, true);
    }

    close(restoreFocus) {
      if (!this._openType) return;
      var isMain = this._openType === 'main';
      var panel = isMain ? this._mainPanel : this._panel;
      var trigger = isMain ? this._mainTrigger : this._trigger;
      this._openType = '';
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (!isMain && this._chevron) this._chevron.setAttribute('data-open', 'false');
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
      if (this._openType) this.close(false);
      var session = readSession();
      this.hidden = !session;
      if (!session) { this.shadowRoot.replaceChildren(); return; }

      var role = session.role === 'client' ? 'client' : 'freelancer';
      var lang = language();
      var items = global.ProLinkerApp && global.ProLinkerApp.routes
        ? global.ProLinkerApp.routes.accountMenu(role)
        : [];
      var current = this.getAttribute('current') || '';
      var storedName = '';
      try { storedName = global.localStorage.getItem('plk-user-name') || ''; } catch (error) {}
      var name = String(storedName || session.name || 'ProLinker gebruiker').trim();
      if (!name) name = 'ProLinker gebruiker';
      var avatarUrl = safeAvatar(session);
      var totalBadge = items.reduce(function (total, item) {
        var count = parseInt(item.badgeText, 10);
        return total + (Number.isFinite(count) && count > 0 ? count : 0);
      }, 0);

      var style = element('style');
      style.textContent = [
        ':host{display:inline-block;color:var(--text,#152431);font-family:inherit;line-height:1.2}',
        '*{box-sizing:border-box}',
        'button,a{font:inherit}',
        '.cluster{display:flex;align-items:center;gap:8px}',
        '.main-wrap,.account-wrap{position:relative;display:flex;align-items:center}',
        '.main-trigger{width:36px;height:36px;min-width:36px;padding:0;border:1px solid var(--border,#e4e5ec);border-radius:50%;background:var(--surface,#fff);color:var(--muted,#667587);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
        '.main-trigger:hover,.main-trigger:focus-visible{border-color:#afc8df;background:var(--panel,#f7f8fb)}',
        '.dot-grid{width:16px;height:16px;display:grid;grid-template-columns:repeat(3,3px);grid-auto-rows:3px;gap:3px}',
        '.dot-grid span{width:3px;height:3px;border-radius:50%;background:currentColor}',
        '.main-panel{position:absolute;right:0;top:46px;z-index:125;width:248px;max-width:calc(100vw - 20px);padding:8px;border:1px solid var(--border,#e4e5ec);border-radius:14px;background:var(--surface,#fff);box-shadow:0 24px 60px -20px rgba(11,17,25,.4)}',
        '.main-panel[hidden]{display:none}',
        '.main-item{display:flex;align-items:center;gap:11px;min-height:40px;padding:10px 12px;border-radius:9px;color:var(--text,#152431);font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}',
        '.main-item:hover,.main-item:focus-visible{background:var(--panel,#f7f8fb);color:var(--text,#152431)}',
        '.main-dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#006bc6}',
        '.main-divider{height:1px;margin:7px 4px;background:var(--hairline,#ecedf2)}',
        '.main-caption{padding:4px 12px 3px;color:var(--faint,#9aa0a6);font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.09em;text-transform:uppercase}',
        '.theme-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:11px;padding:10px 12px;border:0;border-radius:9px;background:transparent;color:var(--text,#152431);font-size:14px;font-weight:500;cursor:pointer}',
        '.theme-button:hover,.theme-button:focus-visible{background:var(--panel,#f7f8fb)}',
        '.theme-label{display:flex;align-items:center;gap:11px}',
        '.theme-icon{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted,#565b62);font-size:16px}',
        '.theme-track{position:relative;width:38px;height:22px;flex:0 0 38px;border-radius:999px;background:var(--border,#e4e5ec);transition:background .2s ease}',
        '.theme-track[data-on="true"]{background:#006bc6}',
        '.theme-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .2s ease}',
        '.theme-knob[data-on="true"]{left:18px}',
        '.trigger{min-height:38px;padding:3px 7px 3px 3px;border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:7px;cursor:pointer;border-radius:5px}',
        '.trigger:hover,.trigger:focus-visible{background:var(--panel,#f5f7f9)}',
        '.main-trigger:focus-visible,.trigger:focus-visible,.main-item:focus-visible,.theme-button:focus-visible,.item:focus-visible{outline:2px solid rgba(47,130,200,.32);outline-offset:2px}',
        '.avatar{position:relative;width:30px;height:30px;flex:0 0 30px;border:1px solid #cbdbe8;border-radius:50%;overflow:visible;background:linear-gradient(145deg,#dfeefa,#edf5fb);color:#1767aa;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}',
        '.avatar img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover}',
        '.avatar-badge{position:absolute;left:-4px;bottom:-2px;min-width:17px;height:15px;padding:0 4px;border:2px solid var(--surface,#fff);border-radius:999px;background:#f04444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;line-height:1}',
        '.name{max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text,#152431);font-size:11px;font-weight:650}',
        '.chevron{width:0;height:0;margin-left:1px;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:5px solid #173247;transform:rotate(0deg);transition:transform .14s ease}',
        '.chevron[data-open="false"]{transform:rotate(180deg)}',
        '.panel{position:absolute;right:0;top:calc(100% + 5px);z-index:125;width:170px;max-width:calc(100vw - 20px);padding:7px 7px 9px;border:1px solid var(--border,#e2e7eb);border-radius:6px;background:var(--surface,#fff);box-shadow:0 16px 38px -20px rgba(16,37,50,.5)}',
        '.panel[hidden]{display:none}',
        '.item{width:100%;min-height:26px;padding:3px 6px;border:0;border-radius:3px;background:transparent;color:var(--muted,#718196);display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:6px;text-align:left;text-decoration:none;cursor:pointer}',
        '.item:hover{background:var(--panel,#f5f7f9);color:var(--text,#345d82)}',
        '.item[aria-current="page"]{background:var(--panel,#f2f6f9);color:var(--text,#315e84);font-weight:700}',
        '.icon{width:18px;color:var(--muted,#7189a0);display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1}',
        '.label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;font-weight:550}',
        '.badge{min-width:17px;height:15px;padding:0 4px;border-radius:999px;background:#f04444;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800}',
        '.logout{margin-top:1px}',
        '@media(max-width:560px){.cluster{gap:5px}.name{display:none}.panel{right:0;width:190px}.trigger{padding-right:5px}.item{min-height:40px;padding-top:7px;padding-bottom:7px}.main-panel{position:fixed;left:10px;right:10px;top:62px;width:auto;max-width:none;max-height:calc(100vh - 74px);overflow:auto}}',
        '@media(prefers-reduced-motion:reduce){.chevron,.theme-track,.theme-knob{transition:none}}'
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
      mainPanel.appendChild(element('div', 'main-caption', lang === 'en' ? 'Settings' : 'Instellingen'));
      var themeButton = element('button', 'theme-button');
      themeButton.type = 'button';
      themeButton.setAttribute('role', 'switch');
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeButton.setAttribute('aria-checked', isDark ? 'true' : 'false');
      themeButton.addEventListener('click', this.toggleTheme.bind(this));
      var themeLabel = element('span', 'theme-label');
      themeLabel.appendChild(element('span', 'theme-icon', '\u263e'));
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

      var trigger = element('button', 'trigger');
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', (lang === 'en' ? 'Open account menu for ' : 'Accountmenu openen voor ') + name);
      trigger.addEventListener('click', this.toggle.bind(this));

      var avatar = element('span', 'avatar');
      if (avatarUrl) {
        var image = element('img');
        image.src = avatarUrl;
        image.alt = '';
        avatar.appendChild(image);
      } else avatar.appendChild(document.createTextNode(initials(name)));
      if (totalBadge > 0) avatar.appendChild(element('span', 'avatar-badge', totalBadge > 99 ? '99+' : totalBadge));
      trigger.appendChild(avatar);
      trigger.appendChild(element('span', 'name', name));
      var chevron = element('span', 'chevron');
      chevron.setAttribute('aria-hidden', 'true');
      chevron.setAttribute('data-open', 'false');
      trigger.appendChild(chevron);

      var panel = element('div', 'panel');
      panel.hidden = true;
      panel.setAttribute('role', 'menu');
      panel.setAttribute('aria-label', lang === 'en' ? 'My account' : 'Mijn account');
      items.forEach(function (item) {
        var link = element('a', 'item');
        link.href = item.href;
        link.setAttribute('role', 'menuitem');
        if (item.key === current) link.setAttribute('aria-current', 'page');
        link.appendChild(element('span', 'icon', item.icon || FALLBACK_ICONS[item.key] || '\u2022'));
        link.appendChild(element('span', 'label', item.label));
        if (item.badgeText !== undefined && item.badgeText !== null && String(item.badgeText) !== '') link.appendChild(element('span', 'badge', item.badgeText));
        panel.appendChild(link);
      });
      var logout = element('button', 'item logout');
      logout.type = 'button';
      logout.setAttribute('role', 'menuitem');
      logout.appendChild(element('span', 'icon', '\u21aa'));
      logout.appendChild(element('span', 'label', lang === 'en' ? 'Log out' : 'Log uit'));
      logout.addEventListener('click', this.logout.bind(this));
      panel.appendChild(logout);

      var accountWrap = element('div', 'account-wrap');
      accountWrap.appendChild(trigger);
      accountWrap.appendChild(panel);
      cluster.appendChild(mainWrap);
      cluster.appendChild(accountWrap);

      this.shadowRoot.replaceChildren(style, cluster);
      this._mainTrigger = mainTrigger;
      this._mainPanel = mainPanel;
      this._themeButton = themeButton;
      this._themeTrack = themeTrack;
      this._themeKnob = themeKnob;
      this._trigger = trigger;
      this._panel = panel;
      this._chevron = chevron;
      this._openType = '';
    }
  }

  global.customElements.define('prolinker-account-menu', ProLinkerAccountMenu);
})(window);
