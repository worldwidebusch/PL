(function () {
  'use strict';

  var COPY = {
    en: {
      eyebrow: 'ONE INTELLIGENT NETWORK',
      title: 'Hire. Work. Connect.',
      intro: 'ProLinker helps employers find the right people, professionals find the right opportunities, and trusted connections create better matches.',
      employerLabel: 'FOR EMPLOYERS',
      employerTitle: 'AI Instant Match',
      employerCopy: 'Describe who you need and instantly receive the 5–10 most relevant professionals. No waiting for applications.',
      employerCta: 'Find professionals',
      matches: '5 relevant matches',
      instant: 'Instant',
      agentBadge: 'Applies automatically',
      referralBadge: 'Earn 2%',
      professionalLabel: 'FOR PROFESSIONALS',
      professionalTitle: 'AI Application Assistant',
      professionalCopy: 'Upload your CV and you are set. The assistant ranks every job within your radius by relevance and applies on your behalf automatically, while you simply keep working.',
      professionalCta: 'Find work',
      comingSoon: 'COMING SOON',
      jobAgentStatus: 'Automatic applications are not available yet.',
      referralLabel: 'FOR YOUR NETWORK',
      referralTitle: 'Earn Passive Income',
      referralCopy: 'Introduce a professional or employer you know. Once they work together through ProLinker, you automatically receive 2% of the paid work value.',
      referralCta: 'Invite someone',
      trust: 'One direct referral layer. Automatically tracked.',
      referralBasis: 'The 2% is calculated on eligible work value paid through ProLinker for your direct referral: professional fees excluding VAT, platform fees, expenses, refunds and chargebacks.',
      employerAlt: 'An employer reviewing work in a bright office',
      professionalAlt: 'An independent professional working from a calm home workspace',
      referralAlt: 'Two trusted professionals reviewing work together'
    },
    nl: {
      eyebrow: 'EEN INTELLIGENT NETWERK',
      title: 'Huur in. Werk. Verbind.',
      intro: 'ProLinker helpt werkgevers de juiste mensen te vinden, professionals de juiste kansen en vertrouwde connecties betere matches te maken.',
      employerLabel: 'VOOR WERKGEVERS',
      employerTitle: 'AI Instant Match',
      employerCopy: 'Beschrijf wie je zoekt en ontvang direct de 5–10 meest relevante professionals. Je hoeft niet op reacties te wachten.',
      employerCta: 'Vind professionals',
      matches: '5 relevante matches',
      instant: 'Direct',
      agentBadge: 'Solliciteert automatisch',
      referralBadge: 'Verdien 2%',
      professionalLabel: 'VOOR PROFESSIONALS',
      professionalTitle: 'AI Sollicitatie Assistent',
      professionalCopy: 'Upload je cv en je bent klaar. De assistent rangschikt alle opdrachten in jouw regio op relevantie en solliciteert automatisch namens jou, terwijl jij gewoon doorwerkt.',
      professionalCta: 'Vind werk',
      comingSoon: 'BINNENKORT',
      jobAgentStatus: 'Automatisch solliciteren is nog niet beschikbaar.',
      referralLabel: 'VOOR JOUW NETWERK',
      referralTitle: 'Verdien Passief Inkomen',
      referralCopy: 'Introduceer een professional of werkgever die je kent. Zodra zij via ProLinker samenwerken, ontvang jij automatisch 2% van de betaalde opdrachtwaarde.',
      referralCta: 'Nodig iemand uit',
      trust: 'Eén directe referrallaag. Automatisch bijgehouden.',
      referralBasis: 'De 2% wordt berekend over de betaalde arbeidswaarde van je directe referral via ProLinker: professionele vergoedingen exclusief btw, platformkosten, onkosten, refunds en chargebacks.',
      employerAlt: 'Een werkgever die werk bekijkt in een lichte kantooromgeving',
      professionalAlt: 'Een zelfstandige professional in een rustige thuiswerkplek',
      referralAlt: 'Twee vertrouwde professionals die samen werk bekijken'
    }
  };

  function currentLanguage() {
    var lang = String(document.documentElement.lang || '').toLowerCase();
    if (lang.indexOf('nl') === 0) return 'nl';
    if (lang.indexOf('en') === 0) return 'en';
    try {
      var saved = localStorage.getItem('plk-language');
      if (saved === 'nl' || saved === 'en') return saved;
    } catch (error) {}
    return 'en';
  }

  class ProLinkerHomeNetwork extends HTMLElement {
    connectedCallback() {
      this.style.display = 'block';
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      this.render();
      this._languageObserver = new MutationObserver(() => this.render());
      this._languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }

    disconnectedCallback() {
      if (this._languageObserver) this._languageObserver.disconnect();
    }

    render() {
      var t = COPY[currentLanguage()];
      var session = null;
      try { session = window.ProLinkerApp && window.ProLinkerApp.session ? window.ProLinkerApp.session.get() : null; } catch (error) {}
      var ctaHref = function (target, role) {
        if (session) return target;
        return 'Prolinker Login.dc.html?mode=login' + (role ? '&role=' + role : '') + '&next=' + encodeURIComponent(target);
      };
      var pageStyles = Array.prototype.map.call(document.querySelectorAll('head style'), function (style) {
        return style.textContent || '';
      }).join('\n');
      this.shadowRoot.innerHTML = `<style>:host{display:block}${pageStyles}</style>
        <section class="plk-network-section" aria-labelledby="plk-network-title">
          <div class="plk-network-inner">
            <p class="plk-network-eyebrow">${t.eyebrow}</p>
            <h2 class="plk-network-title" id="plk-network-title">${t.title}</h2>
            <p class="plk-network-intro">${t.intro}</p>

            <div class="plk-network-grid">
              <span class="plk-network-node is-first" aria-hidden="true"></span>
              <span class="plk-network-node is-second" aria-hidden="true"></span>

              <article class="plk-network-card">
                <div class="plk-network-media">
                  <img src="assets/home-visual-1.png" alt="${t.employerAlt}" loading="lazy" decoding="async">
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.employerLabel}</p></div>
                  <h3 class="plk-network-card-title">${t.employerTitle}</h3>
                  <p class="plk-network-card-copy">${t.employerCopy}</p>
                  <a class="plk-network-cta" href="${ctaHref('Prolinker Brief.dc.html', 'client')}"><span>${t.employerCta}</span><span aria-hidden="true">&rarr;</span></a>
                </div>
              </article>

              <article class="plk-network-card">
                <div class="plk-network-media">
                  <img src="assets/home-visual-2.png" alt="${t.professionalAlt}" loading="lazy" decoding="async">
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.professionalLabel}</p></div>
                  <h3 class="plk-network-card-title">${t.professionalTitle}</h3>
                  <p class="plk-network-card-copy">${t.professionalCopy}</p>
                  <a class="plk-network-cta" href="${ctaHref('Prolinker Voor jou v2.dc.html', 'freelancer')}"><span>${t.professionalCta}</span><span aria-hidden="true">&rarr;</span></a>
                </div>
              </article>

              <article class="plk-network-card">
                <div class="plk-network-media">
                  <img src="assets/home-visual-3.png" alt="${t.referralAlt}" loading="lazy" decoding="async">
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.referralLabel}</p></div>
                  <h3 class="plk-network-card-title">${t.referralTitle}</h3>
                  <p class="plk-network-card-copy">${t.referralCopy}</p>
                  <a class="plk-network-cta" href="${ctaHref('Prolinker Netwerk.dc.html', '')}"><span>${t.referralCta}</span><span aria-hidden="true">&rarr;</span></a>
                </div>
              </article>
            </div>
          </div>
        </section>`;
    }
  }

  if (!customElements.get('prolinker-home-network')) {
    customElements.define('prolinker-home-network', ProLinkerHomeNetwork);
  }
})();
