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
    var candidate = session && (session.avatarUrl || session.avatar || session.photoUrl || session.photo);
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
    }

    disconnectedCallback() {
      global.removeEventListener('storage', this._onStorage);
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
      if (event.key !== 'Tab' || !this._panel) return;
      var focusable = Array.prototype.slice.call(this._panel.querySelectorAll('a[href],button:not([disabled])'));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = this.shadowRoot.activeElement || document.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    toggle() {
      if (this._open) this.close(false);
      else {
        this.render();
        this.open();
      }
    }

    open() {
      if (!this._panel || !this._trigger) return;
      this._open = true;
      this._panel.hidden = false;
      this._trigger.setAttribute('aria-expanded', 'true');
      this._chevron.setAttribute('data-open', 'true');
      document.addEventListener('pointerdown', this._onDocumentPointer, true);
      document.addEventListener('keydown', this._onDocumentKey, true);
    }

    close(restoreFocus) {
      if (!this._open) return;
      this._open = false;
      if (this._panel) this._panel.hidden = true;
      if (this._trigger) this._trigger.setAttribute('aria-expanded', 'false');
      if (this._chevron) this._chevron.setAttribute('data-open', 'false');
      document.removeEventListener('pointerdown', this._onDocumentPointer, true);
      document.removeEventListener('keydown', this._onDocumentKey, true);
      if (restoreFocus && this._trigger) this._trigger.focus();
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
      var items = global.ProLinkerApp && global.ProLinkerApp.routes
        ? global.ProLinkerApp.routes.accountMenu(role)
        : [];
      var current = this.getAttribute('current') || '';
      var storedName = '';
      try { storedName = global.localStorage.getItem('plk-user-name') || ''; } catch (error) {}
      var name = String(session.name || storedName || 'ProLinker gebruiker').trim();
      if (!name) name = 'ProLinker gebruiker';
      var avatarUrl = safeAvatar(session);
      var totalBadge = items.reduce(function (total, item) {
        var count = parseInt(item.badgeText, 10);
        return total + (Number.isFinite(count) && count > 0 ? count : 0);
      }, 0);

      var style = element('style');
      style.textContent = [
        ':host{position:relative;display:inline-block;margin-left:auto;color:var(--text,#152431);font-family:inherit;line-height:1.2}',
        '*{box-sizing:border-box}',
        'button,a{font:inherit}',
        '.trigger{min-height:42px;padding:4px 7px 4px 4px;border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:7px;cursor:pointer;border-radius:5px}',
        '.trigger:hover,.trigger:focus-visible{background:var(--panel,#f5f7f9)}',
        '.trigger:focus-visible,.item:focus-visible{outline:2px solid rgba(47,130,200,.32);outline-offset:2px}',
        '.avatar{position:relative;width:32px;height:32px;flex:0 0 32px;border:1px solid #cbdbe8;border-radius:50%;overflow:visible;background:linear-gradient(145deg,#dfeefa,#edf5fb);color:#1767aa;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}',
        '.avatar img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover}',
        '.avatar-badge{position:absolute;left:-4px;bottom:-2px;min-width:17px;height:15px;padding:0 4px;border:2px solid var(--surface,#fff);border-radius:999px;background:#f04444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;line-height:1}',
        '.name{max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text,#152431);font-size:11px;font-weight:650}',
        '.chevron{width:0;height:0;margin-left:1px;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:5px solid #173247;transform:rotate(0deg);transition:transform .14s ease}',
        '.chevron[data-open="false"]{transform:rotate(180deg)}',
        '.panel{position:absolute;right:0;top:calc(100% + 1px);z-index:120;width:170px;max-width:calc(100vw - 20px);padding:7px 7px 9px;border:1px solid var(--border,#e2e7eb);border-radius:0 0 7px 7px;background:var(--surface,#fff);box-shadow:0 10px 24px -18px rgba(16,37,50,.5)}',
        '.panel[hidden]{display:none}',
        '.item{width:100%;min-height:26px;padding:3px 6px;border:0;border-radius:3px;background:transparent;color:var(--muted,#718196);display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:6px;text-align:left;text-decoration:none;cursor:pointer}',
        '.item:hover{background:var(--panel,#f5f7f9);color:var(--text,#345d82)}',
        '.item[aria-current="page"]{background:var(--panel,#f2f6f9);color:var(--text,#315e84);font-weight:700}',
        '.icon{width:18px;color:var(--muted,#7189a0);display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1}',
        '.label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;font-weight:550}',
        '.badge{min-width:17px;height:15px;padding:0 4px;border-radius:999px;background:#f04444;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800}',
        '.logout{margin-top:1px}',
        '@media(max-width:560px){.name{max-width:108px}.panel{right:0}.trigger{padding-right:5px}.item{min-height:40px;padding-top:7px;padding-bottom:7px}.panel{width:190px}}',
        '@media(prefers-reduced-motion:reduce){.chevron{transition:none}}'
      ].join('');

      var trigger = element('button', 'trigger');
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Accountmenu openen');
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
      panel.setAttribute('aria-label', 'Mijn account');
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
      logout.appendChild(element('span', 'label', 'Log uit'));
      logout.addEventListener('click', this.logout.bind(this));
      panel.appendChild(logout);

      this.shadowRoot.replaceChildren(style, trigger, panel);
      this._trigger = trigger;
      this._panel = panel;
      this._chevron = chevron;
      this._open = false;
    }
  }

  global.customElements.define('prolinker-account-menu', ProLinkerAccountMenu);
})(window);
