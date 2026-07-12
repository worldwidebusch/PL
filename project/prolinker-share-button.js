(function (global) {
  'use strict';

  var activeDialog = null;
  var dialogSequence = 0;

  function isDutch() {
    var lang = '';
    try { lang = global.localStorage.getItem('plk-language') || ''; } catch (error) {}
    if (!lang && global.document && global.document.documentElement) lang = global.document.documentElement.lang || '';
    if (!lang && global.navigator) lang = global.navigator.language || '';
    return String(lang).toLowerCase().indexOf('nl') === 0;
  }

  function strings() {
    if (!isDutch()) {
      return {
        label: 'Share', loading: 'Creating link...', unavailable: 'Sharing is temporarily unavailable.',
        projectTitle: 'Share this project with your network', profileTitle: 'Recommend this professional',
        generalTitle: 'Share ProLinker with your network',
        intro: 'Send this link yourself to someone who is a strong fit.',
        native: 'Share', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', copy: 'Copy link', copied: 'Copied',
        close: 'Close sharing dialog'
      };
    }
    return {
      label: 'Delen', loading: 'Link maken...', unavailable: 'Delen is tijdelijk niet beschikbaar.',
      projectTitle: 'Deel deze opdracht via je netwerk', profileTitle: 'Beveel deze professional aan',
      generalTitle: 'Deel ProLinker via je netwerk',
      intro: 'Stuur deze link zelf naar iemand die hier goed bij past.',
      native: 'Delen', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', copy: 'Kopieer link', copied: 'Gekopieerd',
      close: 'Deelvenster sluiten'
    };
  }

  function safeText(value, fallback, limit) {
    var text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, limit || 180);
  }

  function safeEntityType(value) {
    var type = String(value || 'project').trim().toLowerCase();
    return ['project', 'opportunity', 'profile', 'general'].indexOf(type) >= 0 ? type : 'general';
  }

  function safeUrl(value, fallback) {
    try {
      var url = new URL(String(value || fallback || ''), global.location && global.location.href ? global.location.href : undefined);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.href;
    } catch (error) {
      return '';
    }
  }

  function referralService() {
    var app = global.ProLinkerApp;
    var referrals = app && app.referrals;
    if (!referrals || typeof referrals.createLink !== 'function') {
      throw new Error('REFERRAL_LINK_SERVICE_UNAVAILABLE');
    }
    return referrals;
  }

  function linkFromResult(result) {
    if (typeof result === 'string') return safeUrl(result, '');
    if (!result || typeof result !== 'object') return '';
    return safeUrl(result.shareUrl || result.url || result.link || '', '');
  }

  function copyText(value) {
    if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
      return global.navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = global.document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        area.style.opacity = '0';
        global.document.body.appendChild(area);
        area.select();
        var copied = global.document.execCommand('copy');
        area.remove();
        if (!copied) throw new Error('COPY_FAILED');
        resolve();
      } catch (error) { reject(error); }
    });
  }

  function track(options, event, channel) {
    try {
      var referrals = referralService();
      if (typeof referrals.track !== 'function') return;
      referrals.track({ event: event, shareId: options.shareId || '', channel: channel }).catch(function () {});
    } catch (error) {}
  }

  function actionLink(label, className, href, onSelect) {
    var link = global.document.createElement('a');
    link.className = 'plk-share-action ' + className;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    if (typeof onSelect === 'function') link.addEventListener('click', onSelect);
    return link;
  }

  function dialogTitle(type, t) {
    if (type === 'profile') return t.profileTitle;
    if (type === 'general') return t.generalTitle;
    return t.projectTitle;
  }

  function showDialog(options) {
    if (activeDialog && typeof activeDialog.close === 'function') activeDialog.close();

    var t = strings();
    var previousFocus = global.document.activeElement;
    var previousOverflow = global.document.body.style.overflow;
    var id = 'plk-share-title-' + (++dialogSequence);
    var overlay = global.document.createElement('div');
    overlay.className = 'plk-share-overlay';
    overlay.innerHTML = '<style>' +
      '.plk-share-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(15,26,35,.52);font-family:Lato,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.plk-share-dialog{position:relative;width:min(410px,100%);padding:22px;border:1px solid #DCDFE2;border-radius:12px;background:#fff;color:#152431;box-shadow:0 28px 80px -28px rgba(15,26,35,.62)}' +
      '.plk-share-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border:1px solid #DCDFE2;border-radius:8px;background:#fff;color:#424444;font:700 19px/1 inherit;cursor:pointer}' +
      '.plk-share-close:hover,.plk-share-close:focus-visible{background:#ECEEF0;color:#152431}' +
      '.plk-share-kicker{margin:0 42px 7px 0;color:#2F5B85;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}' +
      '.plk-share-heading{margin:0 42px 0 0;font-family:"Josefin Sans",Lato,system-ui,sans-serif;font-size:22px;line-height:1.18;font-weight:600}' +
      '.plk-share-intro{margin:9px 0 0;color:#424444;font-size:13.5px;line-height:1.5}' +
      '.plk-share-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:18px}' +
      '.plk-share-action{min-height:42px;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;border:1px solid #DCDFE2;border-radius:8px;background:#fff;color:#152431;font:700 13px/1 inherit;text-align:center;text-decoration:none;cursor:pointer}' +
      '.plk-share-action:hover,.plk-share-action:focus-visible{border-color:#2F5B85;background:#F3F4F6}' +
      '.plk-share-native{border-color:#E65F39;background:#E65F39;color:#fff}.plk-share-native:hover,.plk-share-native:focus-visible{border-color:#CF4E29;background:#CF4E29;color:#fff}' +
      '.plk-share-linkedin{border-color:#0A66C2;color:#0A66C2}.plk-share-whatsapp{border-color:#25D366;color:#137A50}' +
      '.plk-share-copy[data-copied="true"]{border-color:#137A50;background:#E9F7F0;color:#137A50}' +
      '.plk-share-action:focus-visible,.plk-share-close:focus-visible{outline:3px solid rgba(47,91,133,.25);outline-offset:2px}' +
      '@media(max-width:420px){.plk-share-actions{grid-template-columns:1fr}.plk-share-dialog{padding:20px}}' +
      'html[data-theme="dark"] .plk-share-dialog{border-color:#43515C;background:#152431;color:#fff}html[data-theme="dark"] .plk-share-intro{color:#D7DDE2}html[data-theme="dark"] .plk-share-close,html[data-theme="dark"] .plk-share-action{border-color:#52616D;background:#1D303E;color:#fff}' +
      '</style>';

    var dialog = global.document.createElement('div');
    dialog.className = 'plk-share-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', id);

    var closeButton = global.document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'plk-share-close';
    closeButton.setAttribute('aria-label', t.close);
    closeButton.textContent = '\u00d7';

    var kicker = global.document.createElement('p');
    kicker.className = 'plk-share-kicker';
    kicker.textContent = 'ProLinker netwerk';

    var heading = global.document.createElement('h2');
    heading.id = id;
    heading.className = 'plk-share-heading';
    heading.textContent = dialogTitle(options.entityType, t);

    var intro = global.document.createElement('p');
    intro.className = 'plk-share-intro';
    intro.textContent = t.intro;

    var actions = global.document.createElement('div');
    actions.className = 'plk-share-actions';

    if (global.navigator && typeof global.navigator.share === 'function') {
      var nativeButton = global.document.createElement('button');
      nativeButton.type = 'button';
      nativeButton.className = 'plk-share-action plk-share-native';
      nativeButton.textContent = t.native;
      nativeButton.addEventListener('click', function () {
        track(options, 'share_selected', 'native');
        global.navigator.share({ title: options.title, text: options.title, url: options.link }).catch(function (error) {
          if (error && error.name !== 'AbortError') global.console && global.console.warn && global.console.warn('ProLinker share failed.');
        });
      });
      actions.appendChild(nativeButton);
    }

    var linkedInUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(options.link);
    actions.appendChild(actionLink(t.linkedin, 'plk-share-linkedin', linkedInUrl, function () { track(options, 'share_selected', 'linkedin'); }));

    var whatsAppText = options.title ? options.title + '\n' + options.link : options.link;
    var whatsAppUrl = 'https://wa.me/?text=' + encodeURIComponent(whatsAppText);
    actions.appendChild(actionLink(t.whatsapp, 'plk-share-whatsapp', whatsAppUrl, function () { track(options, 'share_selected', 'whatsapp'); }));

    var copyButton = global.document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'plk-share-action plk-share-copy';
    copyButton.textContent = t.copy;
    copyButton.addEventListener('click', function () {
      copyText(options.link).then(function () {
        track(options, 'link_copied', 'clipboard');
        copyButton.dataset.copied = 'true';
        copyButton.textContent = t.copied;
        global.setTimeout(function () {
          if (!copyButton.isConnected) return;
          copyButton.dataset.copied = 'false';
          copyButton.textContent = t.copy;
        }, 1800);
      }).catch(function () {
        copyButton.dataset.copied = 'false';
        copyButton.textContent = t.unavailable;
      });
    });
    actions.appendChild(copyButton);

    dialog.appendChild(closeButton);
    dialog.appendChild(kicker);
    dialog.appendChild(heading);
    dialog.appendChild(intro);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    global.document.body.appendChild(overlay);
    global.document.body.style.overflow = 'hidden';

    function focusableElements() {
      return Array.prototype.slice.call(dialog.querySelectorAll('button:not([disabled]),a[href]'));
    }

    function close() {
      if (!overlay.isConnected) return;
      overlay.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      global.document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus();
      if (activeDialog && activeDialog.overlay === overlay) activeDialog = null;
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = focusableElements();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && global.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && global.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', onKeyDown);

    activeDialog = { overlay: overlay, close: close, link: options.link };
    global.setTimeout(function () {
      var focusable = focusableElements();
      if (focusable.length) focusable[0].focus();
    }, 0);
    return activeDialog;
  }

  async function open(options) {
    options = options && typeof options === 'object' ? options : {};
    var entityType = safeEntityType(options.entityType);
    var entityId = safeText(options.entityId, '', 200);
    if (entityType !== 'general' && !entityId) throw new Error('ENTITY_ID_REQUIRED');

    var targetUrl = safeUrl(options.targetUrl, global.location && global.location.href);
    if (!targetUrl) throw new Error('TARGET_URL_INVALID');
    var title = safeText(options.title || options.shareTitle, global.document && global.document.title, 180);
    var result = await referralService().createLink({
      entityType: entityType,
      entityId: entityId,
      targetUrl: targetUrl,
      channel: 'share_sheet'
    });
    var link = linkFromResult(result);
    if (!link) throw new Error('REFERRAL_LINK_INVALID');
    var dialogOptions = { entityType: entityType, entityId: entityId, targetUrl: targetUrl, title: title, link: link, shareId: result && result.shareId ? String(result.shareId) : '' };
    track(dialogOptions, 'share_opened', 'share_sheet');
    return showDialog(dialogOptions);
  }

  global.ProLinkerSharing = Object.freeze({ open: open });

  if (global.customElements && !global.customElements.get('prolinker-share-button')) {
    class ProLinkerShareButton extends HTMLElement {
      static get observedAttributes() { return ['label', 'disabled']; }

      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._onClick = this._onClick.bind(this);
      }

      connectedCallback() {
        this.render();
      }

      disconnectedCallback() {
        if (this._button) this._button.removeEventListener('click', this._onClick);
      }

      isDisabled() {
        if (!this.hasAttribute('disabled')) return false;
        var value = String(this.getAttribute('disabled') || '').trim().toLowerCase();
        return value === '' || value === 'true' || value === '1' || value === 'disabled';
      }

      attributeChangedCallback() {
        if (this.isConnected) this.render();
      }

      render() {
        var t = strings();
        var label = safeText(this.getAttribute('label'), t.label, 80);
        if (this._button) this._button.removeEventListener('click', this._onClick);
        this.shadowRoot.innerHTML = '<style>' +
          ':host{display:inline-flex;font-family:Lato,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
          'button{min-height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--plk-share-border,#DCDFE2);border-radius:var(--plk-share-radius,8px);background:var(--plk-share-bg,#fff);color:var(--plk-share-color,#152431);font:700 13px/1 inherit;cursor:pointer}' +
          'button:hover:not(:disabled){border-color:#2F5B85;background:#F3F4F6}button:focus-visible{outline:3px solid rgba(47,91,133,.25);outline-offset:2px}button:disabled{cursor:not-allowed;opacity:.58}' +
          '.status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
          '</style><button type="button"></button><span class="status" role="status" aria-live="polite"></span>';
        this._button = this.shadowRoot.querySelector('button');
        this._status = this.shadowRoot.querySelector('.status');
        this._button.textContent = label;
        this._button.disabled = this.isDisabled();
        this._button.setAttribute('aria-haspopup', 'dialog');
        this._button.setAttribute('aria-label', label);
        this._button.addEventListener('click', this._onClick);
      }

      async _onClick() {
        if (this._button.disabled) return;
        var t = strings();
        var originalLabel = this._button.textContent;
        this._button.disabled = true;
        this._button.textContent = t.loading;
        this._status.textContent = t.loading;
        try {
          var dialog = await open({
            entityType: this.getAttribute('entity-type'),
            entityId: this.getAttribute('entity-id'),
            targetUrl: this.getAttribute('target-url'),
            title: this.getAttribute('share-title')
          });
          this.dispatchEvent(new CustomEvent('prolinker-share-open', { bubbles: true, composed: true, detail: { link: dialog.link } }));
          this._status.textContent = '';
        } catch (error) {
          this._status.textContent = t.unavailable;
          this.dispatchEvent(new CustomEvent('prolinker-share-error', { bubbles: true, composed: true, detail: { code: error && error.message ? error.message : 'SHARE_FAILED' } }));
        } finally {
          this._button.disabled = this.isDisabled();
          this._button.textContent = originalLabel;
        }
      }
    }

    global.customElements.define('prolinker-share-button', ProLinkerShareButton);
  }
})(window);
