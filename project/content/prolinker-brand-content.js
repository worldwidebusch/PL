(function (global) {
  'use strict';

  var content = {
    nl: {
      employer: {
        homepage: {
          title: 'Huur direct skilled freelancers in, op locatie of remote | Prolinker',
          headline: 'Huur iemand die echt goed is. Niet zomaar iemand die beschikbaar is.',
          intro: 'Vertel ons wat je nodig hebt. Onze AI vindt direct drie beschikbare, aanbevolen professionals. Jij kiest. Klaar.',
          searchLabel: 'Beschrijf wie je nodig hebt',
          categoriesTitle: 'Waar heb je iemand voor nodig?',
          categoriesIntro: 'Kies een vakgebied. We nemen het mee in je opdracht.',
          manualCta: 'Opdracht zelf schrijven',
          footerTagline: 'Het vertrouwde netwerk voor goed werk.'
        },
        brief: {
          title: 'Vertel ons wat je nodig hebt',
          intro: 'Hoe duidelijker je opdracht, hoe beter de match.',
          descriptionLabel: 'Wat moet er gebeuren?',
          descriptionPlaceholder: 'Beschrijf het gewenste resultaat, wat belangrijk is en wanneer het klaar moet zijn.',
          aiCta: 'Schrijf met AI',
          aiStatus: 'We schrijven je opdracht…',
          workplaceLabel: 'Waar wordt gewerkt?',
          continueCta: 'Bekijk je matches'
        },
        results: {
          loadingTitle: 'We vinden de juiste professionals',
          loadingSteps: ['Je opdracht begrijpen', 'Ons aanbevolen netwerk bekijken', 'Rangschikken op match en beschikbaarheid'],
          summary: '{count} aanbevolen professionals · gerangschikt op match en beschikbaarheid',
          poweredBy: 'Gematcht op je opdracht en beschikbaarheid',
          inviteSelected: 'Nodig geselecteerden uit',
          contactCta: 'Neem contact op'
        },
        registration: {
          title: 'Aanmelden als opdrachtgever',
          intro: 'Vertel ons wie je bent. Daarna verifieer je je WhatsApp-nummer.',
          roleLabel: 'Ik zoek een professional',
          safety: 'Betaal via ProLinker. Zo zijn je afspraken en betalingen beschermd.',
          successTitle: 'Klaar om iemand goeds te vinden?'
        },
        dashboard: {
          title: 'Goed werk begint hier',
          intro: 'Je opdrachten, aanbevolen professionals en gesprekken op één plek.',
          activityTitle: 'Wat er nu speelt',
          actionsTitle: 'Jouw volgende stap',
          postProject: 'Vertel wie je nodig hebt',
          findPeople: 'Bekijk aanbevolen professionals'
        },
        assignments: {
          title: 'Mijn opdrachten',
          intro: 'Volg je opdrachten, reacties en samenwerkingen zonder ruis.',
          emptyTitle: 'Klaar voor goed werk?',
          emptyText: 'Plaats een opdracht. We laten direct zien wie er het beste bij past.',
          emptyCta: 'Plaats een opdracht'
        },
        network: {
          title: 'Mijn vertrouwde netwerk',
          intro: 'Bouw verder op aanbevelingen van mensen die je vertrouwt.',
          inviteTitle: 'Beveel iemand aan via WhatsApp',
          inviteHelp: 'Ken je iemand die goed werk levert? Stuur een persoonlijke uitnodiging. Niets gaat weg zonder jouw bevestiging.'
        },
        messages: {
          title: 'Gesprekken',
          intro: 'Houd afspraken, vragen en vervolgstappen helder bij.',
          emptyTitle: 'Nog geen gesprekken',
          emptyText: 'Zodra je contact legt met een professional, verschijnt het gesprek hier.'
        },
        referrals: {
          title: 'Jouw aanbevelingen',
          intro: 'Draag iemand aan die je vertrouwt. Hier volg je wat je daarmee verdient.',
          explain: 'Draag een goede professional aan. Zodra die via ProLinker betaald werk afrondt, ontvang jij 2% van de betaalde opdrachtwaarde.',
          cta: 'Delen via WhatsApp'
        }
      },
      freelancer: {
        guidingIdea: 'Werk waar je wilt. Leef zonder grenzen. Bouw op jouw voorwaarden.',
        registration: {
          title: 'Je bent te goed om op prijs te concurreren.',
          intro: 'Werk op jouw voorwaarden. Vul je gegevens in en verifieer je WhatsApp-nummer.',
          roleLabel: 'Ik werk als professional',
          referral: 'Iemand uit het ProLinker-netwerk heeft je aanbevolen. Na je registratie koppelen we die aanbeveling aan je profiel.',
          safety: 'Ontvang betalingen via ProLinker. Zo blijven je werk en afspraken beschermd.',
          successTitle: 'Welkom in het netwerk.',
          successIntro: 'Je profiel staat klaar. Bekijk werk dat bij je past.'
        },
        feed: {
          title: 'Werk dat bij jou past',
          intro: 'Opdrachten en vacatures van bedrijven die jouw ervaring waarderen — gerangschikt op match.',
          searchPlaceholder: 'Zoek op vakgebied, opdracht of opdrachtgever',
          remoteOnly: 'Werk vanaf waar jij wilt',
          bestTitle: 'Beste matches voor jou',
          bestIntro: 'De sterkste match staat bovenaan.',
          newTitle: 'Nieuwe opdrachten en vacatures',
          loadMore: 'Meer werk laden',
          respond: 'Reageer',
          autoRespond: 'Reageer automatisch',
          noMatches: 'Geen passende opdrachten over',
          sent: 'Reactie verstuurd'
        },
        dashboard: {
          title: 'Werk op jouw voorwaarden',
          intro: 'Passend werk, reacties en samenwerkingen op één plek.',
          activityTitle: 'Wat er nu speelt',
          actionsTitle: 'Jouw volgende stap',
          viewWork: 'Bekijk werk dat bij je past',
          improveProfile: 'Laat zien waar je goed in bent'
        },
        assignments: {
          title: 'Mijn werk',
          intro: 'Volg je reacties en samenwerkingen van eerste contact tot afronding.',
          emptyTitle: 'Klaar voor werk dat bij je past?',
          emptyText: 'Bekijk opdrachten en vacatures van bedrijven die jouw ervaring waarderen.',
          emptyCta: 'Bekijk passend werk'
        },
        profile: {
          title: 'Mijn profiel',
          intro: 'Laat zien wie je bent, waar je goed in bent en hoe je wilt werken.',
          cvTitle: 'Laat je cv het werk doen',
          cvIntro: 'Upload je cv. Wij zetten je ervaring klaar; jij controleert en past aan.',
          completeTitle: 'Maak je profiel herkenbaar',
          completeIntro: 'Een sterk profiel helpt goede bedrijven jou te vinden om wie je bent, niet om wie het laagst biedt.'
        },
        messages: {
          title: 'Gesprekken',
          intro: 'Houd afspraken, vragen en vervolgstappen helder bij.',
          emptyTitle: 'Nog geen gesprekken',
          emptyText: 'Wanneer een bedrijf contact opneemt of jij reageert, verschijnt het gesprek hier.'
        },
        network: {
          title: 'Mijn netwerk',
          intro: 'Bouw verder op mensen die jouw werk kennen en waarderen.',
          inviteTitle: 'Nodig iemand persoonlijk uit'
        },
        referrals: {
          title: 'Verdiensten & aanbevelingen',
          intro: 'Bekijk wat je hebt verdiend en wat er nog onderweg is.',
          explain: 'Draag een goede professional aan. Zodra die via ProLinker betaald werk afrondt, ontvang jij 2% van de betaalde opdrachtwaarde.',
          cta: 'Delen via WhatsApp'
        }
      },
      neutral: {
        loginIntro: 'Log in met je WhatsApp-nummer. Geen wachtwoord nodig.',
        phoneLabel: 'WhatsApp-nummer',
        privacy: 'We delen je gegevens alleen met jouw toestemming.',
        settings: {
          title: 'Instellingen',
          eyebrow: 'Jouw voorkeuren',
          intro: 'Kies wat je ontvangt, hoe je gevonden wordt en welke werkvorm bij je past.',
          account: 'Je WhatsApp-nummer houdt je account veilig en herkenbaar.',
          notifications: 'Kies waarover je een seintje krijgt.',
          freelancerMatchNotice: 'Nieuw passend werk',
          clientMatchNotice: 'Nieuwe aanbevolen professionals',
          privacy: 'Jij bepaalt wie je kan vinden en benaderen.',
          save: 'Opslaan',
          saved: 'Alles is bijgewerkt.'
        }
      }
    },
    en: {
      employer: {
        homepage: {
          title: 'Hire someone great. Not just someone available. | ProLinker',
          headline: 'Hire someone great. Not just someone available.',
          intro: 'Tell us what you need. Our AI finds three available, recommended professionals instantly. You choose. Done.',
          searchLabel: 'Describe who you need',
          categoriesTitle: 'What do you need someone for?',
          categoriesIntro: 'Choose a field. We will add it to your brief.',
          manualCta: 'Write the project yourself',
          footerTagline: 'The trusted network for great work.'
        },
        brief: {
          title: 'Tell us what you need',
          intro: 'The clearer the brief, the better the match.',
          descriptionLabel: 'What needs to get done?',
          descriptionPlaceholder: 'Describe the result, what matters and when it needs to be ready.',
          aiCta: 'Write with AI',
          aiStatus: 'We are writing your project…',
          workplaceLabel: 'Where will the work happen?',
          continueCta: 'View your matches'
        },
        results: {
          loadingTitle: 'We are finding the right professionals',
          loadingSteps: ['Understanding your brief', 'Reviewing our recommended network', 'Ranking by match and availability'],
          poweredBy: 'Matched to your brief and availability'
        }
      },
      freelancer: {
        guidingIdea: 'Work from anywhere. Live without limits. Build it on your own terms.',
        registration: {
          title: "You're too good to compete on price.",
          intro: 'Work on your own terms. Add your details and verify your WhatsApp number.',
          referral: 'Someone in the ProLinker network recommended you. We will connect that recommendation to your profile after registration.',
          successTitle: 'Welcome to the network.',
          successIntro: 'Your profile is ready. Discover work that fits you.'
        },
        feed: {
          title: 'Work that fits you',
          intro: 'Projects and roles from companies that value your experience — ranked by match.',
          searchPlaceholder: 'Search by field, project or company',
          remoteOnly: 'Work from wherever you choose',
          bestTitle: 'Your best matches',
          bestIntro: 'The strongest match comes first.',
          loadMore: 'Load more work',
          respond: 'Respond'
        },
        dashboard: {
          title: 'Work on your own terms',
          intro: 'Fitting work, responses and collaborations in one place.'
        },
        profile: {
          title: 'My profile',
          intro: 'Show who you are, what you do well and how you want to work.',
          cvTitle: 'Build your profile from your CV'
        },
        referrals: {
          title: 'Earnings and recommendations',
          intro: 'Your payouts and earnings from personal recommendations in one place.'
        }
      },
      neutral: {
        loginIntro: 'Log in with your WhatsApp number. No password needed.',
        phoneLabel: 'WhatsApp number',
        privacy: 'We only share your details with your permission.',
        settings: {
          title: 'Settings',
          intro: 'Choose how ProLinker works for you.'
        }
      }
    }
  };

  var imagery = {
    employer: {
      hero: 'assets/brand-imagery/employer/people-reviewing-work.jpg',
      supporting: 'assets/brand-imagery/employer/team-at-work.jpg',
      direction: 'Candid professional moments, natural light, real conversations and considered workplaces.'
    },
    freelancer: {
      hero: 'assets/brand-imagery/freelancer/independent-creative.jpg',
      supporting: 'assets/brand-imagery/freelancer/own-terms-remote-work.jpg',
      home: 'assets/brand-imagery/freelancer/independent-home-work.jpg',
      direction: 'Freedom, independent craft, own spaces and a life made possible by work — never a generic job-board image.'
    }
  };

  var language = {
    employer: {
      tone: ['confident, not arrogant', 'human, not corporate', 'direct, not blunt', 'exclusive, not elitist', 'optimistic, not naive'],
      prefer: ['aanbevolen', 'gematcht', 'netwerk', 'professionals', 'goed werk', 'snel', 'vertrouwen', 'zelfstandig', 'de juiste'],
      avoid: ['geverifieerd', 'algoritme', 'platform', 'resources', 'talent pool', 'hoogwaardige deliverables', 'quick turnaround', 'naadloos', 'leverage', 'oplossingen']
    },
    freelancer: {
      tone: ['inspiring, not cheesy', 'personal, not generic', 'freedom-forward, not salesy', 'proud, not boastful'],
      prefer: ['vrij', 'zelfstandig', 'gekozen', 'aanbevolen', 'erkend', 'remote', 'eigen voorwaarden', 'leven', 'werk waar je wilt', 'bouwen'],
      avoid: ['solliciteer nu', 'meld je gratis aan', 'meer klanten', 'gig', 'side hustle', 'marketplace', 'talent pool', 'kansen', 'exposure']
    }
  };

  function get(languageCode, audience, section) {
    var locale = languageCode === 'en' ? 'en' : 'nl';
    var group = content[locale] && content[locale][audience];
    return group && section ? group[section] : group || null;
  }

  global.ProLinkerBrandContent = Object.freeze({
    copy: content,
    imagery: imagery,
    language: language,
    get: get
  });
})(window);
