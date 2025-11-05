// ============================================
// MIJN ADVERTENTIES - HERPLAATS KNOP INJECTIE (VERBETERDE VERSIE)
// Injecteert "Herplaats" knoppen in de advertentielijst
// ============================================

// Log functie - stuurt ALLES naar background
function log(message) {
  console.log(message); // Ook lokaal
  try {
    chrome.runtime.sendMessage({
      action: 'DEBUG_LOG',
      source: 'MijnAds',
      message: message
    });
  } catch (e) {
    // Negeer fouten
  }
}

log('📄 Script geladen op: ' + window.location.href);

// Wacht tot de pagina volledig geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  log('[Mijn Advertenties] Initialiseer...');
  
  // Check of extensie enabled is
  const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
  const isEnabled = extensionEnabled !== false; // Default = true
  
  if (!isEnabled) {
    log('[Mijn Advertenties] ⛔ Extensie is uitgeschakeld, stop');
    return;
  }
  
  log('[Mijn Advertenties] ✅ Extensie is actief');
  log('[Mijn Advertenties] Document ready state:', document.readyState);
  
  // Debug: Print de hele HTML structuur van de body
  debugPageStructure();
  
  // Wacht even en probeer dan advertenties te vinden
  setTimeout(() => {
    waitForAds();
  }, 2000);
}

// ============================================
// DEBUG PAGE STRUCTURE
// Print nuttige informatie over de pagina structuur
// ============================================
function debugPageStructure() {
  log('[DEBUG] ===== PAGINA STRUCTUUR ANALYSE =====');
  
  // Check voor veelvoorkomende container elementen
  const possibleContainers = [
    '#ad-listing-table-body',
    '.ad-listing-container',
    '[class*="listing"]',
    '[class*="advertenties"]',
    '[class*="ads"]',
    'main',
    '[role="main"]'
  ];
  
  possibleContainers.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) {
      log(`[DEBUG] ✅ Container gevonden: ${selector}`);
      log(`[DEBUG] Children count:`, el.children.length);
      log(`[DEBUG] innerHTML preview:`, el.innerHTML.substring(0, 500));
    }
  });
  
  // Check alle elementen met 'ad' of 'listing' in de class
  const adElements = document.querySelectorAll('[class*="ad"], [class*="listing"]');
  log(`[DEBUG] Elementen met 'ad' of 'listing' in class:`, adElements.length);
  
  if (adElements.length > 0) {
    log('[DEBUG] Eerste 5 elementen:');
    Array.from(adElements).slice(0, 5).forEach((el, i) => {
      log(`[DEBUG] ${i + 1}. Tag: ${el.tagName}, Class: ${el.className}, ID: ${el.id}`);
    });
  }
  
  // Check voor links naar advertenties
  const adLinks = document.querySelectorAll('a[href*="/a/"], a[href*="/v/"]');
  log(`[DEBUG] Advertentie links gevonden:`, adLinks.length);
  
  if (adLinks.length > 0) {
    log('[DEBUG] Eerste 3 links:');
    Array.from(adLinks).slice(0, 3).forEach((link, i) => {
      log(`[DEBUG] ${i + 1}. Href: ${link.href}, Text: ${link.textContent.substring(0, 50)}`);
    });
  }
  
  log('[DEBUG] ===== EINDE ANALYSE =====');
}

// ============================================
// WACHT OP ADVERTENTIES
// Probeert meerdere strategieën om advertenties te vinden
// ============================================
function waitForAds() {
  log('[Mijn Advertenties] Start zoeken naar advertenties...');
  
  // STRATEGIE 1: Zoek via bekende selectors
  const adElements = findAdsWithKnownSelectors();
  
  if (adElements && adElements.length > 0) {
    log(`[Mijn Advertenties] ✅ Strategie 1 succesvol: ${adElements.length} advertenties gevonden`);
    injectRepostButtons(adElements);
    return;
  }
  
  // STRATEGIE 2: Zoek op basis van advertentie links
  const adsViaLinks = findAdsViaLinks();
  
  if (adsViaLinks && adsViaLinks.length > 0) {
    log(`[Mijn Advertenties] ✅ Strategie 2 succesvol: ${adsViaLinks.length} advertenties gevonden`);
    injectRepostButtons(adsViaLinks);
    return;
  }
  
  // STRATEGIE 3: Gebruik MutationObserver
  log('[Mijn Advertenties] Strategieën 1 & 2 gefaald, start observer');
  observeForAds();
}

// ============================================
// FIND ADS WITH KNOWN SELECTORS
// Probeert advertenties te vinden met bekende selectors
// ============================================
function findAdsWithKnownSelectors() {
  const selectors = [
    // Originele selectors
    '.row.ad-listing.compact',
    '[id^="ad-listing-row-"]',
    'div.row.ad-listing',
    '.ad-listing-container .row',
    
    // Alternatieve selectors
    '[data-ad-id]',
    '[class*="ad-listing"]',
    '[class*="listing-row"]',
    '.mp-Listing',
    '[class*="MyAds"]',
    'article[class*="ad"]',
    'div[class*="advertisement"]',
    
    // Algemene container selectors
    '#ad-listing-table-body > *',
    '.ad-listing-table > *',
    '[role="list"] > *',
    'main [class*="listing"]'
  ];
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        log(`[Mijn Advertenties] ✅ Selector succesvol: "${selector}" (${elements.length} items)`);
        return elements;
      }
    } catch (e) {
      console.warn(`[Mijn Advertenties] ⚠️ Ongeldige selector: "${selector}"`, e);
    }
  }
  
  log('[Mijn Advertenties] ❌ Geen advertenties gevonden met bekende selectors');
  return null;
}

// ============================================
// FIND ADS VIA LINKS
// Zoekt advertentie-containers op basis van links
// ============================================
function findAdsViaLinks() {
  log('[Mijn Advertenties] Strategie 2: Zoek via advertentie links');
  
  // Zoek alle links naar advertenties
  const adLinks = document.querySelectorAll('a[href*="/a/"], a[href*="/v/"]');
  
  if (adLinks.length === 0) {
    log('[Mijn Advertenties] Geen advertentie links gevonden');
    return null;
  }
  
  log(`[Mijn Advertenties] ${adLinks.length} advertentie links gevonden`);
  
  // Vind de containers van deze links
  const adContainers = new Set();
  
  adLinks.forEach(link => {
    // Zoek de parent container (probeer verschillende niveaus)
    let container = link;
    for (let i = 0; i < 5; i++) {
      container = container.parentElement;
      if (!container) break;
      
      // Check of dit een advertentie container lijkt te zijn
      const hasMultipleElements = container.children.length > 2;
      const hasRelevantClass = /ad|listing|item|row/i.test(container.className);
      
      if (hasMultipleElements || hasRelevantClass) {
        adContainers.add(container);
        break;
      }
    }
  });
  
  if (adContainers.size > 0) {
    log(`[Mijn Advertenties] ✅ ${adContainers.size} advertentie containers gevonden`);
    return Array.from(adContainers);
  }
  
  return null;
}

// ============================================
// OBSERVE FOR ADS
// Gebruikt MutationObserver met verbeterde logica
// ============================================
function observeForAds() {
  let attempts = 0;
  const maxAttempts = 20; // 20 pogingen = 10 seconden
  
  const observer = new MutationObserver(() => {
    attempts++;
    log(`[Mijn Advertenties] Observer poging ${attempts}/${maxAttempts}`);
    
    // Probeer advertenties te vinden
    const ads = findAdsWithKnownSelectors() || findAdsViaLinks();
    
    if (ads && ads.length > 0) {
      log(`[Mijn Advertenties] ✅ Observer succesvol na ${attempts} pogingen`);
      injectRepostButtons(ads);
      observer.disconnect();
      return;
    }
    
    if (attempts >= maxAttempts) {
      observer.disconnect();
      log('[Mijn Advertenties] ❌ Observer timeout - geen advertenties gevonden');
      log('[Mijn Advertenties] 💡 Open de browser console en bekijk de DEBUG logs hierboven');
    }
  });
  
  // Observeer de hele body
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  log('[Mijn Advertenties] Observer gestart (max 10 seconden)');
}

// ============================================
// INJECTEER HERPLAATS KNOPPEN
// Voegt een "Herplaats" knop toe aan elke advertentie
// ============================================
function injectRepostButtons(adElements) {
  log('[Mijn Advertenties] 🔧 Start injectie in', adElements.length, 'advertenties');
  
  let successCount = 0;
  
  adElements.forEach((adElement, index) => {
    // Check of de knop al bestaat
    if (adElement.querySelector('.herplaats-button-injected')) {
      log(`[Mijn Advertenties] ⏭️ Ad ${index + 1}: knop al aanwezig`);
      return;
    }
    
    // Zoek de advertentie URL
    const adUrl = extractAdUrl(adElement);
    if (!adUrl) {
      console.warn(`[Mijn Advertenties] ⚠️ Ad ${index + 1}: Geen URL gevonden`);
      log('[Mijn Advertenties] Element HTML:', adElement.outerHTML.substring(0, 300));
      return;
    }
    
    log(`[Mijn Advertenties] ✅ Ad ${index + 1}: ${adUrl}`);
    
    // Creëer de Herplaats knop
    const button = createRepostButton(adUrl);
    
    // Zoek de beste plek om de knop te injecteren
    const injected = injectButton(adElement, button);
    
    if (injected) {
      successCount++;
    }
  });
  
  log(`[Mijn Advertenties] ✨ ${successCount}/${adElements.length} knoppen succesvol geïnjecteerd!`);
}

// ============================================
// INJECT BUTTON
// Zoekt de beste locatie en injecteert de knop
// ============================================
function injectButton(adElement, button) {
  // Probeer verschillende locaties in volgorde van voorkeur
  const locations = [
    // 1. Actie kolom (bij andere knoppen)
    () => adElement.querySelector('.cell.position-column.features-column, .features-column, .actions'),
    
    // 2. Rechter kolom
    () => adElement.querySelector('.cell:last-child, [class*="right"], [class*="actions"]'),
    
    // 3. Container met andere knoppen
    () => adElement.querySelector('.buttons, .controls, [class*="button-container"]'),
    
    // 4. Algemene cells container
    () => adElement.querySelector('.cells, .content, [class*="container"]'),
    
    // 5. Direct aan advertentie element
    () => adElement
  ];
  
  for (const getLocation of locations) {
    const container = getLocation();
    if (container) {
      container.appendChild(button);
      log('[Mijn Advertenties] 📍 Knop geïnjecteerd');
      return true;
    }
  }
  
  console.warn('[Mijn Advertenties] ⚠️ Geen geschikte locatie gevonden voor knop');
  return false;
}

// ============================================
// EXTRACT AD URL
// Haalt de advertentie URL uit een advertentie element
// ============================================
function extractAdUrl(adElement) {
  log('[Mijn Advertenties] 🔍 Zoek URL in element...');
  
  // Methode 1: Element ID (bijv. ad-listing-row-m2329920609)
  const elementId = adElement.id;
  if (elementId && elementId.includes('ad')) {
    const idMatch = elementId.match(/[m]?\d{10,}/);
    if (idMatch) {
      const adId = idMatch[0];
      log(`[Mijn Advertenties] 🔍 Ad ID uit element ID: ${adId}`);
      
      // Zoek volledige URL in links
      const linkWithUrl = adElement.querySelector('a[href*="/a/"], a[href*="/v/"]');
      if (linkWithUrl) {
        const href = linkWithUrl.getAttribute('href');
        const fullUrl = href.startsWith('http') ? href : `https://www.marktplaats.nl${href}`;
        log(`[Mijn Advertenties] 🔗 Volledige URL gevonden: ${fullUrl}`);
        return fullUrl;
      }
      
      // Fallback: construeer URL
      return `https://www.marktplaats.nl/a/${adId}`;
    }
  }
  
  // Methode 2: Data attributen
  const dataUrl = adElement.getAttribute('data-ad-url') || 
                  adElement.getAttribute('data-url') ||
                  adElement.getAttribute('data-href');
  
  if (dataUrl) {
    log(`[Mijn Advertenties] 🔗 URL uit data attribuut: ${dataUrl}`);
    return dataUrl.startsWith('http') ? dataUrl : `https://www.marktplaats.nl${dataUrl}`;
  }
  
  // Methode 3: Zoek in alle links
  const links = adElement.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && (href.includes('/a/') || href.includes('/v/'))) {
      const fullUrl = href.startsWith('http') ? href : `https://www.marktplaats.nl${href}`;
      log(`[Mijn Advertenties] 🔗 URL uit link: ${fullUrl}`);
      return fullUrl;
    }
  }
  
  console.warn('[Mijn Advertenties] ❌ Geen URL gevonden');
  return null;
}

// ============================================
// CREATE REPOST BUTTON
// Creëert een gestylede "Herplaats" knop
// ============================================
function createRepostButton(adUrl) {
  const container = document.createElement('div');
  container.className = 'herplaats-button-container';
  container.style.cssText = `
    margin: 8px 0;
    padding: 4px;
  `;
  
  const button = document.createElement('button');
  button.className = 'herplaats-button-injected';
  button.textContent = '🔄 Herplaats';
  button.title = 'Herplaats deze advertentie automatisch';
  
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
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
  
  button.onmouseenter = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.5)';
  };
  
  button.onmouseleave = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
  };
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    log('[Mijn Advertenties] 🖱️ Herplaats knop geklikt!');
    log('[Mijn Advertenties] URL:', adUrl);
    
    // Verander knop naar loading state
    button.disabled = true;
    button.textContent = '⏳ Verwerken...';
    button.style.background = '#9ca3af';
    button.style.cursor = 'not-allowed';
    
    try {
      log('[Mijn Advertenties] 📤 Probeer bericht te versturen naar background script...');
      
      // Check of chrome.runtime beschikbaar is
      if (!chrome || !chrome.runtime) {
        throw new Error('Chrome runtime API niet beschikbaar');
      }
      
      log('[Mijn Advertenties] Chrome runtime beschikbaar, verstuur bericht...');
      
      // Stuur bericht met timeout
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          action: 'START_REPOST_PROCESS',
          url: adUrl
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na 5 seconden')), 5000)
        )
      ]);
      
      log('[Mijn Advertenties] ✅ Bericht verstuurd!');
      log('[Mijn Advertenties] Response:', response);
      
      button.textContent = '✅ Gestart!';
      button.style.background = '#10b981';
      
      // Herlaad na 2 seconden om het proces te laten starten
      setTimeout(() => {
        log('[Mijn Advertenties] Navigeer naar advertentie pagina...');
      }, 2000);
      
    } catch (error) {
      log('[Mijn Advertenties] ❌ FOUT bij versturen bericht:', error);
      log('[Mijn Advertenties] Error naam:', error.name);
      log('[Mijn Advertenties] Error bericht:', error.message);
      log('[Mijn Advertenties] Error stack:', error.stack);
      
      button.disabled = false;
      button.textContent = '❌ Fout';
      button.style.background = '#ef4444';
      button.style.cursor = 'pointer';
      
      // Laat uitgebreide error zien
      alert(`Fout bij starten herplaatsing:\n${error.message}\n\nCheck de console voor details.`);
      
      setTimeout(() => {
        button.textContent = '🔄 Herplaats';
        button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      }, 3000);
    }
  });
  // 
  container.appendChild(button);
  return container;
}

log('[Mijn Advertenties] Script volledig geladen en klaar');
