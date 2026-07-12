(function (global) {
  'use strict';

  if (!global.customElements || global.customElements.get('prolinker-signup-menu')) return;

  function language() {
    try {
      var saved = global.localStorage.getItem('plk-language');
      if (saved === 'nl' || saved === 'en') return saved;
    } catch (error) {}
    var htmlLang = ((document.documentElement && document.documentElement.lang) || '').toLowerCase();
    if (htmlLang.indexOf('nl') === 0) return 'nl';
    if (htmlLang.indexOf('en') === 0) return 'en';
    var browserLang = (global.navigator.language || global.navigator.userLanguage || 'en').toLowerCase();
    return browserLang.indexOf('nl') === 0 ? 'nl' : 'en';
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  class ProLinkerSignupMenu extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._open = false;
      this._onDocumentPointer = this._onDocumentPointer.bind(this);
      this._onDocumentKey = this._onDocumentKey.bind(this);
      this._onStorage = this._onStorage.bind(this);
      this._onLanguageMutation = this.render.bind(this);
    }

    connectedCallback() {
      this.render();
      global.addEventListener('storage', this._onStorage);
      if (global.MutationObserver && document.documentElement) {
        this._languageObserver = new global.MutationObserver(this._onLanguageMutation);
        this._languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      }
    }

    disconnectedCallback() {
      global.removeEventListener('storage', this._onStorage);
      if (this._languageObserver) this._languageObserver.disconnect();
      document.removeEventListener('pointerdown', this._onDocumentPointer, true);
      document.removeEventListener('keydown', this._onDocumentKey, true);
    }

    _onStorage(event) {
      if (!event || event.key === 'plk-language') this.render();
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
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this._items.length) {
        event.preventDefault();
        var active = this.shadowRoot.activeElement;
        var index = this._items.indexOf(active);
        if (event.key === 'ArrowDown') index = index < this._items.length - 1 ? index + 1 : 0;
        else index = index > 0 ? index - 1 : this._items.length - 1;
        this._items[index].focus();
        return;
      }
      if (event.key === 'Tab') {
        global.setTimeout(function () {
          if (!this.matches(':focus-within')) this.close(false);
        }.bind(this), 0);
      }
    }

    toggle() {
      if (this._open) this.close(false);
      else this.open();
    }

    open(focusIndex) {
      if (!this._panel || !this._trigger) return;
      Array.prototype.forEach.call(document.querySelectorAll('details.plk-public-menu-wrap[open]'), function (details) {
        details.removeAttribute('open');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.plk-public-menu-trigger[aria-expanded="true"],.plk-auth-menu-trigger[aria-expanded="true"]'), function (trigger) {
        if (typeof trigger.click === 'function') trigger.click();
      });
      this._open = true;
      this._panel.hidden = false;
      this._trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', this._onDocumentPointer, true);
      document.addEventListener('keydown', this._onDocumentKey, true);
      global.setTimeout(function () {
        if (!this._open || !this._items.length) return;
        var index = typeof focusIndex === 'number' ? focusIndex : 0;
        this._items[Math.max(0, Math.min(index, this._items.length - 1))].focus();
      }.bind(this), 0);
    }

    close(restoreFocus) {
      if (!this._open) return;
      this._open = false;
      if (this._panel) this._panel.hidden = true;
      if (this._trigger) this._trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', this._onDocumentPointer, true);
      document.removeEventListener('keydown', this._onDocumentKey, true);
      if (restoreFocus && this._trigger) this._trigger.focus();
    }

    render() {
      if (this._open) this.close(false);
      var nl = language() === 'nl';
      var labels = nl
        ? { trigger: 'Aanmelden', menu: 'Kies hoe je je wilt aanmelden', freelancer: 'Aanmelden als freelancer', client: 'Aanmelden als opdrachtgever' }
        : { trigger: 'Sign up', menu: 'Choose how you want to sign up', freelancer: 'Sign up as a freelancer', client: 'Sign up as a client' };

      var style = element('style');
      style.textContent = [
        ':host{position:relative;z-index:130;display:inline-flex;flex:0 0 auto;color:#fff;font-family:inherit;line-height:1.2}',
        '*{box-sizing:border-box}',
        'button,a{font:inherit}',
        '.trigger{min-height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 15px;border:1px solid #E65F39;border-radius:8px;background:#E65F39;color:#fff;font-size:13px;font-weight:700;line-height:1;white-space:nowrap;cursor:pointer}',
        '.trigger:hover{border-color:#C94F2D;background:#C94F2D}',
        '.trigger:focus-visible,.option:focus-visible{outline:3px solid rgba(230,95,57,.28);outline-offset:2px}',
        '.panel{position:absolute;right:0;top:calc(100% + 7px);z-index:140;width:206px;max-width:calc(100vw - 28px);display:grid;gap:7px;padding:10px 12px;border:1px solid var(--border,#DCDFE2);border-radius:12px;background:var(--surface,#fff);box-shadow:0 12px 28px -16px rgba(16,37,50,.48)}',
        '.panel[hidden]{display:none}',
        '.option{width:100%;min-height:32px;display:flex;align-items:center;justify-content:center;padding:6px 10px;border:1px solid transparent;border-radius:6px;color:#fff;text-align:center;text-decoration:none;font-size:11.5px;font-weight:700;line-height:1.2;white-space:normal;cursor:pointer}',
        '.freelancer{border-color:#E65F39;background:#E65F39}',
        '.freelancer:hover{border-color:#C94F2D;background:#C94F2D}',
        '.client{border-color:#2F5B85;background:#2F5B85}',
        '.client:hover{border-color:#24476A;background:#24476A}',
        '@media(max-width:520px){.trigger{min-height:36px;padding:0 10px;font-size:11px}.panel{right:0;width:210px}.option{min-height:40px;font-size:12px}}',
        '@media(prefers-reduced-motion:reduce){*{transition:none!important}}'
      ].join('');

      var trigger = element('button', 'trigger', labels.trigger);
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'plk-signup-options');
      trigger.addEventListener('click', this.toggle.bind(this));
      trigger.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        this.open(event.key === 'ArrowUp' ? this._items.length - 1 : 0);
      }.bind(this));

      var panel = element('div', 'panel');
      panel.id = 'plk-signup-options';
      panel.hidden = true;
      panel.setAttribute('role', 'menu');
      panel.setAttribute('aria-label', labels.menu);

      var freelancer = element('a', 'option freelancer', labels.freelancer);
      freelancer.href = 'Prolinker Login.dc.html?mode=register&role=freelancer';
      freelancer.setAttribute('role', 'menuitem');
      var client = element('a', 'option client', labels.client);
      client.href = 'Prolinker Login.dc.html?mode=register&role=client';
      client.setAttribute('role', 'menuitem');
      freelancer.addEventListener('click', this.close.bind(this, false));
      client.addEventListener('click', this.close.bind(this, false));
      panel.appendChild(freelancer);
      panel.appendChild(client);

      this.shadowRoot.replaceChildren(style, trigger, panel);
      this._trigger = trigger;
      this._panel = panel;
      this._items = [freelancer, client];
    }
  }

  global.customElements.define('prolinker-signup-menu', ProLinkerSignupMenu);
})(window);
