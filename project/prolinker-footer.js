(function (global) {
  'use strict';

  if (!global.customElements || global.customElements.get('prolinker-footer')) return;

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

  function strings(nl) {
    return nl
      ? {
          tagline: 'Hire someone great. Not just someone available.',
          network: 'Netwerk', freelancers: 'Professionals', projects: 'Opdrachten', how: 'Hoe werkt het',
          getStarted: 'Aan de slag', post: 'Opdracht plaatsen', become: 'Professional worden', faq: 'Veelgestelde vragen',
          company: 'ProLinker', careers: 'Werken bij ProLinker', blog: 'Blog', contact: 'Contact',
          languageLabel: 'Taal', rights: 'Alle rechten voorbehouden.', privacy: 'Privacy', terms: 'Algemene Voorwaarden',
          brandAria: 'ProLinker startpagina'
        }
      : {
          tagline: 'Hire someone great. Not just someone available.',
          network: 'Network', freelancers: 'Professionals', projects: 'Projects', how: 'How it works',
          getStarted: 'Get started', post: 'Post a project', become: 'Become a professional', faq: 'Frequently asked questions',
          company: 'ProLinker', careers: 'Careers at ProLinker', blog: 'Blog', contact: 'Contact',
          languageLabel: 'Language', rights: 'All rights reserved.', privacy: 'Privacy', terms: 'Terms and Conditions',
          brandAria: 'ProLinker home'
        };
  }

  class ProLinkerFooter extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
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
    }

    _onStorage(event) {
      if (!event || event.key === 'plk-language') this.render();
    }

    render() {
      var lang = language();
      var t = strings(lang === 'nl');
      var year = new Date().getFullYear();

      this.shadowRoot.innerHTML = [
        '<style>',
        ':host{display:block}',
        '*{box-sizing:border-box}',
        '.footer{background:#152431;color:#fff;padding:54px 28px 24px;font-family:\'Lato\',system-ui,sans-serif}',
        '.inner{width:100%;max-width:1280px;margin:0 auto}',
        '.grid{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(145px,1fr)) minmax(160px,.85fr);gap:34px;align-items:start}',
        '.brand a{display:inline-flex;align-items:center}',
        '.brand img{width:170px;height:auto;display:block}',
        '.tagline{max-width:240px;margin:16px 0 0;color:#ECEEF0;font-size:13px;line-height:1.6}',
        '.col{display:flex;flex-direction:column;gap:10px}',
        '.heading{margin-bottom:5px;color:#9FB0BD;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}',
        'a.link{display:inline-flex;width:fit-content;color:#DCDFE2;text-decoration:none;font-size:13px;line-height:1.45;transition:transform .16s ease,color .15s ease}',
        'a.link:hover{color:#fff;transform:translateX(2px)}',
        'a.link:focus-visible,select:focus-visible,.social:focus-visible,.legal a:focus-visible,.brand a:focus-visible{outline:2px solid #92a9b8;outline-offset:2px}',
        'select{width:100%;height:40px;padding:0 34px 0 12px;border:1px solid #6f8290;border-radius:9px;color:#fff;background:#22374A;font:inherit;font-size:13px;cursor:pointer}',
        '.socials{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin-top:7px}',
        '.social{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 7px;border:1px solid #496170;border-radius:9px;transition:border-color .16s ease,transform .16s ease}',
        '.social img{width:15px;height:15px;display:block;opacity:.92;transition:filter .16s ease,opacity .16s ease}',
        '.social:hover{border-color:#92a9b8;transform:translateY(-1px)}',
        '.social:hover img{filter:brightness(1.45);opacity:1}',
        '.legal{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-top:18px;margin-top:28px;border-top:1px solid #2C3E4E}',
        '.legal-links{display:flex;align-items:center;flex-wrap:wrap;gap:16px}',
        '.legal a,.copyright{font-size:11.5px;color:#8C8E8F;text-decoration:none}',
        '.legal a:hover{color:#fff}',
        '@media(max-width:920px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 36px}.brand{grid-column:1/-1}}',
        '@media(max-width:640px){.footer{padding:38px 18px 22px}.grid{grid-template-columns:1fr;gap:27px}.brand{grid-column:auto}.legal{align-items:flex-start;flex-direction:column;gap:16px}.legal-links{gap:12px 16px}}',
        '@media(prefers-reduced-motion:reduce){*{transition:none!important}}',
        '</style>',
        '<footer class="footer">',
        '<div class="inner">',
        '<div class="grid">',
        '<div class="brand">',
        '<a href="Prolinker Homepage.dc.html" aria-label="' + t.brandAria + '"><img src="assets/prolinker-logo-white.png" alt="ProLinker"></a>',
        '<p class="tagline">' + t.tagline + '</p>',
        '</div>',
        '<nav class="col" aria-label="' + t.network + '">',
        '<div class="heading">' + t.network + '</div>',
        '<a class="link" href="Prolinker Results.dc.html">' + t.freelancers + '</a>',
        '<a class="link" href="Prolinker Voor jou v2.dc.html">' + t.projects + '</a>',
        '<a class="link" href="https://prolinker.com/nl/hoe-werkt-het">' + t.how + '</a>',
        '</nav>',
        '<nav class="col" aria-label="' + t.getStarted + '">',
        '<div class="heading">' + t.getStarted + '</div>',
        '<a class="link" href="Prolinker Brief.dc.html">' + t.post + '</a>',
        '<a class="link" href="Prolinker Login.dc.html?mode=register&amp;role=freelancer">' + t.become + '</a>',
        '<a class="link" href="https://prolinker.com/nl/faq">' + t.faq + '</a>',
        '</nav>',
        '<nav class="col" aria-label="' + t.company + '">',
        '<div class="heading">' + t.company + '</div>',
        '<a class="link" href="https://prolinker.com/nl/vacatures">' + t.careers + '</a>',
        '<a class="link" href="https://prolinker.com/nl/blog?page=1">' + t.blog + '</a>',
        '<a class="link" href="https://prolinker.com/nl/contact">' + t.contact + '</a>',
        '</nav>',
        '<div class="col">',
        '<label class="heading" for="plk-footer-language">' + t.languageLabel + '</label>',
        '<select id="plk-footer-language">',
        '<option value="nl">Nederlands</option>',
        '<option value="en">English</option>',
        '</select>',
        '<div class="socials">',
        '<a class="social" href="https://www.facebook.com/JoinProlinker" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><img src="assets/social/facebook.svg" width="15" height="15" alt="" aria-hidden="true"></a>',
        '<a class="social" href="https://www.linkedin.com/company/prolinker" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><img src="assets/social/linkedin.svg" width="15" height="15" alt="" aria-hidden="true"></a>',
        '<a class="social" href="https://www.instagram.com/prolinker_network/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><img src="assets/social/instagram.svg" width="15" height="15" alt="" aria-hidden="true"></a>',
        '</div>',
        '</div>',
        '</div>',
        '<div class="legal">',
        '<div class="copyright">&copy; 2012-' + year + ' ProLinker. ' + t.rights + '</div>',
        '<div class="legal-links">',
        '<a href="https://prolinker.com/nl/privacy-statement">' + t.privacy + '</a>',
        '<a href="https://prolinker.com/nl/clause-de-non-responsabilit%C3%A9">Disclaimer</a>',
        '<a href="https://prolinker.com/sitemap.xml">Sitemap</a>',
        '<a href="https://prolinker.com/nl/termes-et-conditions">' + t.terms + '</a>',
        '</div>',
        '</div>',
        '</div>',
        '</footer>'
      ].join('');

      var select = this.shadowRoot.getElementById('plk-footer-language');
      if (select) {
        select.value = lang;
        select.addEventListener('change', function (event) {
          var next = event.target.value === 'en' ? 'en' : 'nl';
          try { global.localStorage.setItem('plk-language', next); } catch (error) {}
          document.documentElement.setAttribute('lang', next);
          global.location.reload();
        });
      }
    }
  }

  global.customElements.define('prolinker-footer', ProLinkerFooter);
})(window);
