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
      professionalLabel: 'FOR PROFESSIONALS',
      professionalTitle: 'Your personal Job Agent',
      professionalCopy: 'Tell ProLinker what work fits you. Your agent continuously finds relevant jobs and projects, applies automatically where possible, and asks only when your input is needed.',
      professionalCta: 'Activate Job Agent',
      comingSoon: 'COMING SOON',
      jobAgentStatus: 'Automatic applications are not available yet.',
      referralLabel: 'FOR THE NETWORK',
      referralTitle: 'Make the right introduction',
      referralCopy: 'Recommend a professional or employer you genuinely know. When your introduction becomes a collaboration, you receive an ongoing 2% referral reward.',
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
      professionalLabel: 'VOOR PROFESSIONALS',
      professionalTitle: 'Jouw persoonlijke Job Agent',
      professionalCopy: 'Vertel ProLinker welk werk bij je past. Je agent vindt voortdurend relevante vacatures en opdrachten, solliciteert waar mogelijk automatisch en vraagt alleen om jouw input wanneer die nodig is.',
      professionalCta: 'Activeer Job Agent',
      comingSoon: 'BINNENKORT',
      jobAgentStatus: 'Automatisch solliciteren is nog niet beschikbaar.',
      referralLabel: 'VOOR HET NETWERK',
      referralTitle: 'Maak de juiste introductie',
      referralCopy: 'Beveel een professional of werkgever aan die je echt kent. Leidt jouw introductie tot een samenwerking, dan ontvang je een doorlopende referralbeloning van 2%.',
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
      this.render();
      this._languageObserver = new MutationObserver(() => this.render());
      this._languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }

    disconnectedCallback() {
      if (this._languageObserver) this._languageObserver.disconnect();
    }

    render() {
      var t = COPY[currentLanguage()];
      this.innerHTML = `
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
                  <img src="assets/brand-imagery/employer/team-at-work.jpg" alt="${t.employerAlt}" loading="lazy" decoding="async">
                  <span class="plk-network-instant">${t.instant}</span>
                  <div class="plk-network-match-overlay">
                    <span class="plk-network-match-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span>${t.matches}</span>
                  </div>
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.employerLabel}</p></div>
                  <h3 class="plk-network-card-title">${t.employerTitle}</h3>
                  <p class="plk-network-card-copy">${t.employerCopy}</p>
                  <a class="plk-network-cta" href="Prolinker Brief.dc.html"><span>${t.employerCta}</span><span aria-hidden="true">&rarr;</span></a>
                </div>
              </article>

              <article class="plk-network-card">
                <div class="plk-network-media">
                  <img src="assets/brand-imagery/freelancer/independent-home-work.jpg" alt="${t.professionalAlt}" loading="lazy" decoding="async">
                  <span class="plk-focus-square" aria-hidden="true"></span>
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.professionalLabel}</p><span class="plk-network-coming-soon">${t.comingSoon}</span></div>
                  <h3 class="plk-network-card-title">${t.professionalTitle}</h3>
                  <p class="plk-network-card-copy">${t.professionalCopy}</p>
                  <button class="plk-network-cta is-disabled" type="button" disabled aria-describedby="plk-job-agent-status"><span>${t.professionalCta}</span><span aria-hidden="true">&rarr;</span></button>
                  <span class="plk-visually-hidden" id="plk-job-agent-status">${t.jobAgentStatus}</span>
                </div>
              </article>

              <article class="plk-network-card">
                <div class="plk-network-media">
                  <img src="assets/brand-imagery/employer/people-reviewing-work.jpg" alt="${t.referralAlt}" loading="lazy" decoding="async">
                  <div class="plk-network-photo-graphic" aria-hidden="true">
                    <span class="line a"></span><span class="line b"></span><span class="line c"></span>
                    <span class="dot a"></span><span class="dot b"></span><span class="dot c"></span><span class="dot d"></span>
                  </div>
                </div>
                <div class="plk-network-card-body">
                  <div class="plk-network-label-row"><p class="plk-network-card-label">${t.referralLabel}</p></div>
                  <h3 class="plk-network-card-title">${t.referralTitle}</h3>
                  <p class="plk-network-card-copy">${t.referralCopy}</p>
                  <p class="plk-network-trust">${t.trust}</p>
                  <p class="plk-network-referral-basis">${t.referralBasis}</p>
                  <a class="plk-network-cta" href="Prolinker Netwerk.dc.html"><span>${t.referralCta}</span><span aria-hidden="true">&rarr;</span></a>
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
