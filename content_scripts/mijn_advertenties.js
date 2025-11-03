// ============================================
// MIJN ADVERTENTIES - HERPLAATS KNOP INJECTIE
// Injecteert "Herplaats" knoppen in de advertentielijst
// ============================================

console.log('[Mijn Advertenties] Script geladen');

// Wacht tot de pagina volledig geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('[Mijn Advertenties] Initialiseer...');
  
  // Gebruik MutationObserver om te wachten tot advertenties geladen zijn
  waitForAds();
}

// ============================================
// WACHT OP ADVERTENTIES
// Gebruikt MutationObserver om te detecteren wanneer advertenties geladen zijn
// ============================================
function waitForAds() {
  // Echte Marktplaats selectors gebaseerd op de HTML
  const possibleSelectors = [
    '.row.ad-listing.compact',  // Hoofdselector voor advertentie rijen
    '[id^="ad-listing-row-"]',  // ID begint met ad-listing-row-
    'div.row.ad-listing',
    '.ad-listing-container .row'
  ];
  
  // Probeer advertenties te vinden met verschillende selectors
  let adElements = null;
  for (const selector of possibleSelectors) {
    adElements = document.querySelectorAll(selector);
    if (adElements.length > 0) {
      console.log(`[Mijn Advertenties] ✅ Gevonden ${adElements.length} advertenties met selector: ${selector}`);
      injectRepostButtons(adElements);
      return; // Stop na succesvolle injectie
    }
  }
  
  // Als geen advertenties gevonden, gebruik MutationObserver
  if (!adElements || adElements.length === 0) {
    console.log('[Mijn Advertenties] Geen advertenties gevonden, start observer');
    
    const observer = new MutationObserver((mutations) => {
      for (const selector of possibleSelectors) {
        const ads = document.querySelectorAll(selector);
        if (ads.length > 0) {
          console.log(`[Mijn Advertenties] ✅ Observer detecteerde ${ads.length} advertenties`);
          injectRepostButtons(ads);
          observer.disconnect();
          return;
        }
      }
    });
    
    // Observeer de ad-listing-table-body container
    const tableBody = document.getElementById('ad-listing-table-body');
    if (tableBody) {
      console.log('[Mijn Advertenties] Start observer op ad-listing-table-body');
      observer.observe(tableBody, {
        childList: true,
        subtree: true
      });
    } else {
      // Fallback: observeer hele body
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    // Stop observer na 10 seconden
    setTimeout(() => {
      observer.disconnect();
      console.log('[Mijn Advertenties] ⏱️ Observer timeout');
    }, 10000);
  }
}

// ============================================
// INJECTEER HERPLAATS KNOPPEN
// Voegt een "Herplaats" knop toe aan elke advertentie
// ============================================
function injectRepostButtons(adElements) {
  console.log('[Mijn Advertenties] 🔧 Injecteer knoppen in', adElements.length, 'advertenties');
  
  adElements.forEach((adElement, index) => {
    // Check of de knop al bestaat
    if (adElement.querySelector('.herplaats-button-injected')) {
      console.log(`[Mijn Advertenties] ⏭️ Advertentie ${index + 1}: knop al aanwezig`);
      return;
    }
    
    // Zoek de advertentie URL
    const adUrl = extractAdUrl(adElement);
    if (!adUrl) {
      console.warn(`[Mijn Advertenties] ⚠️ Advertentie ${index + 1}: Geen URL gevonden`);
      return;
    }
    
    console.log(`[Mijn Advertenties] ✅ Advertentie ${index + 1}: ${adUrl}`);
    
    // Creëer de Herplaats knop
    const button = createRepostButton(adUrl);
    
    // Zoek de beste plek om de knop te injecteren
    const actionContainer = findActionContainer(adElement);
    if (actionContainer) {
      actionContainer.appendChild(button);
      console.log(`[Mijn Advertenties] 📍 Knop toegevoegd aan features-column`);
    } else {
      // Fallback: voeg toe aan het einde van het advertentie element
      const cellsContainer = adElement.querySelector('.cells');
      if (cellsContainer) {
        cellsContainer.appendChild(button);
        console.log(`[Mijn Advertenties] 📍 Knop toegevoegd aan cells container (fallback)`);
      } else {
        adElement.appendChild(button);
        console.log(`[Mijn Advertenties] 📍 Knop toegevoegd aan ad element (fallback 2)`);
      }
    }
  });
  
  console.log('[Mijn Advertenties] ✨ Alle knoppen geïnjecteerd!');
}

// ============================================
// EXTRACT AD URL
// Haalt de advertentie URL uit een advertentie element
// ============================================
function extractAdUrl(adElement) {
  // Methode 1: Haal het uit het ID attribuut (bijv. ad-listing-row-m2329920609)
  const elementId = adElement.id;
  if (elementId && elementId.startsWith('ad-listing-row-')) {
    const adId = elementId.replace('ad-listing-row-', '');
    console.log(`[Mijn Advertenties] 🔍 Ad ID uit element ID: ${adId}`);
    
    // Zoek de volledige URL in data-ad-url attributen
    const linkWithUrl = adElement.querySelector('[data-ad-url]');
    if (linkWithUrl) {
      const partialUrl = linkWithUrl.getAttribute('data-ad-url');
      const fullUrl = `https://www.marktplaats.nl${partialUrl}`;
      console.log(`[Mijn Advertenties] 🔗 Volledige URL: ${fullUrl}`);
      return fullUrl;
    }
    
    // Fallback: construeer URL met ad ID
    return `https://www.marktplaats.nl/a/${adId}`;
  }
  
  // Methode 2: Zoek in data-ad-url attributen
  const cells = adElement.querySelectorAll('.cell[data-ad-url]');
  for (const cell of cells) {
    const partialUrl = cell.getAttribute('data-ad-url');
    if (partialUrl) {
      return `https://www.marktplaats.nl${partialUrl}`;
    }
  }
  
  // Methode 3: Zoek link in description-column
  const descriptionLink = adElement.querySelector('.description-column a[href^="/v/"]');
  if (descriptionLink) {
    const href = descriptionLink.getAttribute('href');
    return `https://www.marktplaats.nl${href}`;
  }
  
  // Methode 4: Zoek in thumbnail link
  const thumbnailLink = adElement.querySelector('.thumbnail-column a[href]');
  if (thumbnailLink) {
    const href = thumbnailLink.getAttribute('href');
    return `https://www.marktplaats.nl${href}`;
  }
  
  console.warn('[Mijn Advertenties] ❌ Geen URL gevonden via alle methoden');
  return null;
}

// ============================================
// FIND ACTION CONTAINER
// Zoekt de container waar actie-knoppen staan
// ============================================
function findActionContainer(adElement) {
  // Zoek de features-column waar "Sneller verkopen" en "Bel omhoog" staan
  const possibleSelectors = [
    '.cell.position-column.features-column',
    '.features-column',
    '.cell.position-column',
    '.position-column'
  ];
  
  for (const selector of possibleSelectors) {
    const container = adElement.querySelector(selector);
    if (container) {
      console.log(`[Mijn Advertenties] 📦 Action container gevonden: ${selector}`);
      return container;
    }
  }
  
  console.log('[Mijn Advertenties] 📦 Geen action container gevonden, gebruik fallback');
  return null;
}

// ============================================
// CREATE REPOST BUTTON
// Creëert een gestylede "Herplaats" knop
// ============================================
function createRepostButton(adUrl) {
  // Maak een container div om styling issues te voorkomen
  const container = document.createElement('div');
  container.className = 'herplaats-button-container';
  container.style.cssText = `
    margin-top: 8px;
    width: 100%;
  `;
  
  const button = document.createElement('button');
  button.className = 'herplaats-button-injected';
  button.textContent = '🔄 Herplaats';
  button.title = 'Herplaats deze advertentie automatisch';
  
  // Styling - aangepast om te matchen met Marktplaats stijl
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    width: 100%;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  `;
  
  // Hover effect
  button.onmouseenter = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.5)';
  };
  
  button.onmouseleave = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
  };
  
  // Click handler
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Mijn Advertenties] 🖱️ Herplaats knop geklikt voor:', adUrl);
    
    // Verander knop naar loading state
    button.disabled = true;
    button.textContent = '⏳ Verwerken...';
    button.style.background = '#9ca3af';
    button.style.cursor = 'not-allowed';
    
    // Stuur bericht naar background script om proces te starten
    try {
      console.log('[Mijn Advertenties] 📤 Stuur START_REPOST_PROCESS bericht...');
      await chrome.runtime.sendMessage({
        action: 'START_REPOST_PROCESS',
        url: adUrl
      });
      
      console.log('[Mijn Advertenties] ✅ Herplaatsing gestart!');
      button.textContent = '✅ Gestart!';
      button.style.background = '#10b981';
      
    } catch (error) {
      console.error('[Mijn Advertenties] ❌ Fout bij starten herplaatsing:', error);
      button.disabled = false;
      button.textContent = '❌ Fout';
      button.style.background = '#ef4444';
      button.style.cursor = 'pointer';
      
      setTimeout(() => {
        button.textContent = '🔄 Herplaats';
        button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      }, 3000);
    }
  });
  
  container.appendChild(button);
  return container;
}

console.log('[Mijn Advertenties] Script klaar');