// ============================================
// ADVERTENTIE SCRAPER
// Scrapet alle gegevens van een advertentie detailpagina
// ============================================

// Log functie - stuurt ALLES naar background
function log(message) {
  console.log(message); // Ook lokaal
  try {
    chrome.runtime.sendMessage({
      action: 'DEBUG_LOG',
      source: 'Scraper',
      message: message
    });
  } catch (e) {
    // Negeer fouten
  }
}

log('📄 Script geladen op: ' + window.location.href);

// Wacht tot pagina geladen is en check storage
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndScrape);
} else {
  checkAndScrape();
}

// ============================================
// CHECK EN SCRAPE
// Controleert of we moeten scrapen en start het proces
// ============================================
async function checkAndScrape() {
  try {
    log('[Scraper] 🔍 Check of we moeten scrapen...');
    
    // Check of extensie enabled is
    const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
    const isEnabled = extensionEnabled !== false; // Default = true
    
    if (!isEnabled) {
      log('[Scraper] ⛔ Extensie is uitgeschakeld, stop');
      return;
    }
    
    // Check of we in een actieve repost job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    log('[Scraper] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status,
      url: repostJob?.adUrl
    });
    
    if (!repostJob) {
      log('[Scraper] ⏭️ Geen repost job gevonden - script stopt');
      return;
    }
    
    if (repostJob.status !== 'SCRAPING_DETAILS') {
      log('[Scraper] Status is niet SCRAPING_DETAILS:', repostJob.status);
      return;
    }
    
    log('[Scraper] Actieve scraping job gevonden!');
    log('[Scraper] Wacht 2 seconden voor dynamische content...');
    
    // Wacht tot alle dynamische content geladen is
    await sleep(2000);
    
    log('[Scraper] Start scrapen...');
    
    // Debug: Analyseer de pagina structuur
    debugPageStructure();
    
    // STAP 1: Lees ad ID uit URL en navigeer naar edit pagina
    log('[Scraper] STAP 1: Navigeer naar edit pagina');
    const navigationResult = await navigateToEditPage();
    
    if (!navigationResult) {
      console.warn('[Scraper] Navigatie naar edit pagina faalde');
      return;
    }
    
    // STAP 2: Scrape alle data
    log('[Scraper] STAP 2: Scrape advertentie data');
    const adData = await scrapeAdvertisement();
    
    log('[Scraper] Scrapen voltooid!');
    log('[Scraper] Data samenvatting:', {
      title: adData.title,
      price: adData.price?.raw,
      images: adData.imageUrls?.length,
      description_length: adData.description?.text?.length
    });
    
    // STAP 3: Voeg editor beschrijving toe uit storage
    const { repostJob: updatedJob } = await chrome.storage.local.get('repostJob');
    if (updatedJob?.adData?.description?.editorText) {
      adData.description.editorText = updatedJob.adData.description.editorText;
      log('[Scraper] Editor beschrijving toegevoegd aan data');
    }
    
    // Stuur data naar background script
    log('[Scraper] Verstuur data naar background...');
    const response = await chrome.runtime.sendMessage({
      action: 'DATA_SCRAPED',
      payload: adData
    });
    
    log('[Scraper] ✅ Data verzonden, response:', response);
    
  } catch (error) {
    log('[Scraper] ❌ FOUT bij scrapen:', error);
    log('[Scraper] Error stack:', error.stack);
  }
}

// ============================================
// DEBUG PAGE STRUCTURE
// Analyseert de pagina om de juiste selectors te vinden
// ============================================
function debugPageStructure() {
  log('\n[Scraper DEBUG] ===== PAGINA ANALYSE =====');
  
  // Check voor belangrijke elementen
  const checks = [
    { name: 'Titel (h1)', selector: 'h1' },
    { name: 'Prijs elementen', selector: '[class*="price"], [class*="Price"]' },
    { name: 'Beschrijving', selector: '[class*="description"], [class*="Description"]' },
    { name: 'Afbeeldingen', selector: 'img' },
    { name: 'Kenmerken', selector: '[class*="attribute"], [class*="Attribute"]' }
  ];
  
  checks.forEach(check => {
    const elements = document.querySelectorAll(check.selector);
    log(`[Scraper DEBUG] ${check.name}: ${elements.length} gevonden`);
    if (elements.length > 0 && elements.length <= 3) {
      elements.forEach((el, i) => {
        log(`  [${i + 1}] Class: ${el.className}, Text: ${el.textContent?.substring(0, 50)}`);
      });
    }
  });
  
  // Print alle class names die interessant kunnen zijn
  const allElements = document.querySelectorAll('[class*="vip"], [class*="VIP"], [class*="ad"], [class*="Ad"]');
  log(`[Scraper DEBUG] Elementen met VIP/Ad classes: ${allElements.length}`);
  
  log('[Scraper DEBUG] ===== EINDE ANALYSE =====\n');
}

// ============================================
// SCRAPE ADVERTISEMENT
// Hoofdfunctie die alle advertentiegegevens verzamelt
// ============================================
async function scrapeAdvertisement() {
  log('[Scraper] 📊 Start verzamelen van data...');
  
  const adData = {
    url: window.location.href,
    title: scrapeTitle(),
    description: scrapeDescription(),
    price: scrapePrice(),
    priceType: scrapePriceType(),
    category: scrapeCategory(),
    location: scrapeLocation(),
    attributes: scrapeAttributes(),
    imageUrls: scrapeImageUrls(),
    deleteUrl: scrapeDeleteUrl(),
    scrapedAt: new Date().toISOString()
  };
  
  log('[Scraper] 📋 Gescrapete data:', {
    title: adData.title,
    price: adData.price,
    images: adData.imageUrls?.length,
    attributes: Object.keys(adData.attributes || {}).length
  });
  
  return adData;
}

// ============================================
// SCRAPE TITLE
// ============================================
function scrapeTitle() {
  log('[Scraper] 🔍 Zoek titel...');
  
  const selectors = [
    'h1[data-testid="ad-title"]',
    'h1.hz-Listing-title',
    'h1[class*="Listing-title"]',
    'h1[class*="vip-title"]',
    '[data-testid="listing-title"]',
    'h1.listing-title',
    'h1',
    '.ad-title',
    '[class*="AdTitle"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const title = element.textContent.trim();
      log('[Scraper] ✅ Titel gevonden:', title, `(selector: ${selector})`);
      return title;
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen titel gevonden');
  return 'Geen titel';
}

// ============================================
// SCRAPE DESCRIPTION
// Behoudt HTML formatting van de beschrijving
// ============================================
function scrapeDescription() {
  log('[Scraper] 🔍 Zoek beschrijving...');
  
  const selectors = [
    '[data-testid="ad-description"]',
    '.hz-Listing-description',
    '[class*="Listing-description"]',
    '[class*="vip-description"]',
    '.ad-description',
    '[data-testid="description"]',
    '.description-content',
    '#description',
    '[class*="Description"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const html = element.innerHTML.trim();
      const text = element.textContent.trim();
      log('[Scraper] ✅ Beschrijving gevonden:', text.substring(0, 100) + '...', `(selector: ${selector})`);
      
      // DEBUG: Log de HTML structuur
      log('[Scraper] 🔍 DEBUG - HTML preview (eerste 300 chars):', html.substring(0, 300));
      log('[Scraper] 🔍 DEBUG - Bevat <br>:', html.includes('<br'));
      log('[Scraper] 🔍 DEBUG - Bevat <p>:', html.includes('<p'));
      log('[Scraper] 🔍 DEBUG - Bevat <div>:', html.includes('<div'));
      log('[Scraper] 🔍 DEBUG - Bevat \\n:', text.includes('\n'));
      
      return {
        html: html,
        text: text
      };
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen beschrijving gevonden');
  return { html: '', text: '' };
}

// ============================================
// CONVERT HTML TO PLAIN TEXT MET STRUCTUUR
// Converteert HTML naar platte tekst maar behoudt:
// - Regelbreaks (enters)
// - Bullet points (•)
// - Bold (*tekst*)
// - Italic (_tekst_)
// ============================================
function htmlToPlainTextWithStructure(html) {
  if (!html) return '';
  
  // Maak een temp container
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  let text = '';
  
  // Walk through alle nodes
  function walkNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Gewoon tekst - voeg toe
      const content = node.textContent.trim();
      if (content) {
        text += content;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      
      // Behandel verschillende elementen
      if (tag === 'br') {
        // Line break
        text += '\n';
      } else if (tag === 'strong' || tag === 'b') {
        // Bold - wrap met *
        text += '*';
        // Walk children
        for (let child of node.childNodes) {
          walkNodes(child);
        }
        text += '*';
      } else if (tag === 'em' || tag === 'i') {
        // Italic - wrap met _
        text += '_';
        // Walk children
        for (let child of node.childNodes) {
          walkNodes(child);
        }
        text += '_';
      } else if (tag === 'p' || tag === 'div') {
        // Paragraph/div - walk children
        for (let child of node.childNodes) {
          walkNodes(child);
        }
        if (node.nextSibling) {
          text += '\n';
        }
      } else if (tag === 'li') {
        // List item - add bullet
        text += '• ';
        // Walk children
        for (let child of node.childNodes) {
          walkNodes(child);
        }
        text += '\n';
      } else if (tag === 'ul' || tag === 'ol') {
        // List - walk children
        for (let child of node.childNodes) {
          walkNodes(child);
        }
      } else {
        // Andere tags - walk children maar behoud structuur
        for (let child of node.childNodes) {
          walkNodes(child);
        }
      }
    }
  }
  
  walkNodes(temp);
  
  // Clean up: verwijder dubbele newlines en trim
  text = text.replace(/\n\n+/g, '\n').trim();
  
  return text;
}

// ============================================
// SCRAPE PRICE
// ============================================
function scrapePrice() {
  log('[Scraper] 🔍 Zoek prijs...');
  
  const selectors = [
    '[data-testid="ad-price"]',
    '.hz-Listing-price',
    '[class*="Listing-price"]',
    '[class*="vip-price"]',
    '.price-label',
    '[data-testid="price"]',
    '.listing-price',
    'span[class*="price"]',
    '[class*="Price"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const priceText = element.textContent.trim();
      log('[Scraper] ✅ Prijs gevonden:', priceText, `(selector: ${selector})`);
      
      // Extract numeric value
      const numericPrice = priceText.replace(/[^0-9,.-]/g, '').replace(',', '.');
      return {
        raw: priceText,
        numeric: numericPrice
      };
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen prijs gevonden');
  return { raw: '', numeric: '' };
}

// ============================================
// SCRAPE PRICE TYPE
// Bepaalt of het een vaste prijs, bod, of gratis is
// ============================================
function scrapePriceType() {
  log('[Scraper] 🔍 Bepaal prijstype...');
  
  const pageText = document.body.textContent.toLowerCase();
  
  let priceType = 'VAST_PRIJS';
  
  if (pageText.includes('gratis') || pageText.includes('te koop: gratis')) {
    priceType = 'GRATIS';
  } else if (pageText.includes('bieden') || pageText.includes('bod')) {
    priceType = 'BIEDEN';
  }
  
  log('[Scraper] ✅ Prijstype:', priceType);
  return priceType;
}

// ============================================
// SCRAPE CATEGORY
// ============================================
function scrapeCategory() {
  log('[Scraper] 🔍 Zoek categorie...');
  
  const breadcrumbSelectors = [
    '[data-testid="breadcrumb"]',
    '.hz-Breadcrumb',
    '[class*="Breadcrumb"]',
    '.breadcrumb',
    'nav[aria-label="breadcrumb"]',
    '.category-breadcrumb'
  ];
  
  for (const selector of breadcrumbSelectors) {
    const breadcrumb = document.querySelector(selector);
    if (breadcrumb) {
      const links = breadcrumb.querySelectorAll('a');
      const categories = Array.from(links).map(link => link.textContent.trim()).filter(t => t);
      if (categories.length > 0) {
        log('[Scraper] ✅ Categorieën gevonden:', categories);
        return categories;
      }
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen categorie gevonden');
  return [];
}

// ============================================
// SCRAPE LOCATION
// ============================================
function scrapeLocation() {
  log('[Scraper] 🔍 Zoek locatie...');
  
  const selectors = [
    '[data-testid="location"]',
    '.hz-Listing-location',
    '[class*="Listing-location"]',
    '.location-label',
    '[data-testid="seller-location"]',
    '.seller-location',
    'span[class*="location"]',
    '[class*="Location"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const location = element.textContent.trim();
      log('[Scraper] ✅ Locatie gevonden:', location, `(selector: ${selector})`);
      
      // Probeer postcode te extracten
      const postcodeMatch = location.match(/\d{4}\s*[A-Z]{2}/i);
      return {
        full: location,
        postcode: postcodeMatch ? postcodeMatch[0] : ''
      };
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen locatie gevonden');
  return { full: '', postcode: '' };
}

// ============================================
// SCRAPE ATTRIBUTES
// Scrapet alle kenmerken (key-value paren)
// ============================================
function scrapeAttributes() {
  log('[Scraper] 🔍 Zoek kenmerken...');
  
  const attributes = {};
  
  const attributeSelectors = [
    '[data-testid="attributes"]',
    '.hz-Listing-attributes',
    '[class*="Attributes"]',
    '.attributes-list',
    '.ad-attributes',
    '.kenmerken',
    '[class*="attribute"]'
  ];
  
  for (const selector of attributeSelectors) {
    const container = document.querySelector(selector);
    if (!container) continue;
    
    log('[Scraper] 📦 Kenmerken container gevonden:', selector);
    
    // Zoek alle key-value paren
    const items = container.querySelectorAll('[data-testid="attribute-item"], .attribute-item, li, dl, dt');
    
    items.forEach(item => {
      const keyElement = item.querySelector('[data-testid="attribute-key"], dt, .attribute-key, .key');
      const valueElement = item.querySelector('[data-testid="attribute-value"], dd, .attribute-value, .value');
      
      if (keyElement && valueElement) {
        const key = keyElement.textContent.trim();
        const value = valueElement.textContent.trim();
        attributes[key] = value;
      } else {
        // Alternatieve methode: split op ':'
        const text = item.textContent.trim();
        if (text.includes(':')) {
          const [key, ...valueParts] = text.split(':');
          attributes[key.trim()] = valueParts.join(':').trim();
        }
      }
    });
    
    if (Object.keys(attributes).length > 0) {
      log('[Scraper] ✅ Kenmerken gevonden:', Object.keys(attributes).length);
      return attributes;
    }
  }
  
  console.warn('[Scraper] ⚠️ Geen kenmerken gevonden');
  return attributes;
}

// ============================================
// SCRAPE IMAGE URLS
// Verzamelt alle afbeeldings-URL's
// ============================================
function scrapeImageUrls() {
  log('[Scraper] 🔍 Zoek afbeeldingen in carousel...');
  
  const imageUrls = [];
  
  // Zoek de carousel UL
  const carouselUl = document.querySelector('.Carousel-container ul, .carousel-root ul, .Gallery-root ul');
  
  if (!carouselUl) {
    log('[Scraper] ⚠️ Carousel UL niet gevonden, probeer fallback selectors...');
    return scrapeImageUrlsFallback();
  }
  
  log('[Scraper] ✅ Carousel UL gevonden');
  
  // Loop door alle LI's
  const listItems = carouselUl.querySelectorAll('li');
  log('[Scraper] 📋 Aantal LI items gevonden: ' + listItems.length);
  
  listItems.forEach((li, index) => {
    // Zoek img in deze LI
    const img = li.querySelector('img');
    
    if (img) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
      
      if (src && !imageUrls.includes(src) && !src.includes('placeholder') && !src.includes('loading')) {
        // Probeer hoge resolutie variant te krijgen
        let highResSrc = src;
        
        // Marktplaats specifieke conversies
        if (src.includes('$_')) {
          highResSrc = src.replace(/\$_\d+\.JPG$/i, '$_57.JPG');
        }
        if (src.includes('/thumbs/')) {
          highResSrc = src.replace(/\/thumbs?\//, '/images/');
        }
        
        imageUrls.push(highResSrc);
        log('[Scraper] ✅ Foto ' + (index + 1) + ': ' + highResSrc.substring(0, 80) + '...');
      } else {
        log('[Scraper] ⚠️ LI ' + (index + 1) + ': Geen geldige src gevonden');
      }
    } else {
      log('[Scraper] ⚠️ LI ' + (index + 1) + ': Geen img tag gevonden');
    }
  });
  
  log('[Scraper] 📊 Totaal afbeeldingen gevonden: ' + imageUrls.length);
  return imageUrls;
}

// Fallback functie als carousel niet gevonden wordt
function scrapeImageUrlsFallback() {
  log('[Scraper] 🔄 Gebruik fallback image scraping...');
  
  const imageUrls = [];
  
  const imageSelectors = [
    '[data-testid="gallery-image"] img',
    '.hz-Listing-carousel img',
    '[class*="Gallery"] img',
    '[class*="Carousel"] img',
    '.gallery-image img',
    '.ad-images img',
    '[data-testid="image-viewer"] img',
    '.image-gallery img',
    'img[src*="i.ebayimg.com"]',
    'img[src*="marktplaats"]'
  ];
  
  for (const selector of imageSelectors) {
    const images = document.querySelectorAll(selector);
    if (images.length > 0) {
      log('[Scraper] 📦 Fallback: Afbeeldingen gevonden met: ' + selector);
      
      images.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        
        if (src && !imageUrls.includes(src) && !src.includes('placeholder') && !src.includes('loading')) {
          let highResSrc = src;
          
          if (src.includes('$_') || src.includes('/thumbs/')) {
            highResSrc = src.replace(/\$_\d+\.JPG$/i, '$_57.JPG')
                           .replace(/\/thumbs?\//, '/images/');
          }
          
          imageUrls.push(highResSrc);
        }
      });
      
      if (imageUrls.length > 0) {
        break;
      }
    }
  }
  
  log('[Scraper] 📊 Fallback totaal: ' + imageUrls.length);
  return imageUrls;
}

// ============================================
// NAVIGATE TO EDIT PAGE
// Leest ad ID uit URL en navigeert naar edit pagina
// ============================================
async function navigateToEditPage() {
  try {
    log('='.repeat(60));
    log('[Scraper] NAVIGATE TO EDIT PAGE');
    log('[Scraper] Huidige URL:', window.location.href);
    
    // Lees ad ID uit de URL
    // Formaat: https://www.marktplaats.nl/seller/view/m2316741696
    log('[Scraper] Parse URL om ad ID te vinden...');
    const urlMatch = window.location.href.match(/\/seller\/view\/([^\/]+)/);
    
    if (!urlMatch || !urlMatch[1]) {
      log('[Scraper] FOUT: Kon ad ID niet uit URL halen');
      log('[Scraper] URL regex match faalde');
      log('[Scraper] URL:', window.location.href);
      return false;
    }
    
    const adId = urlMatch[1];
    log('[Scraper] Ad ID gevonden:', adId);
    
    // Bouw de edit URL
    const editUrl = `https://www.marktplaats.nl/plaats/${adId}/edit`;
    log('[Scraper] Edit URL gebouwd:', editUrl);
    
    // Navigeer naar edit pagina
    log('[Scraper] Navigeer naar edit pagina...');
    window.location.href = editUrl;
    
    // Wacht tot navigatie voltooid en plaats_advertentie.js beschrijving kopiert
    log('[Scraper] Wacht max 25 seconden tot handleEditPageCopy voltooid is...');
    await sleep(25000);
    
    log('[Scraper] Sleep voltooid, teruggekeerd naar detail pagina');
    log('[Scraper] Huidige URL na terugkeer:', window.location.href);
    log('='.repeat(60));
    
    return true;
  } catch (error) {
    log('[Scraper] FOUT in navigateToEditPage:', error);
    log('[Scraper] Stack:', error.stack);
    return false;
  }
}

// ============================================
// COPY DESCRIPTION FROM EDITOR
// Klikt "Wijzig", wacht op editor, Ctrl+A, Ctrl+C
// ============================================
async function copyDescriptionFromEditor() {
  log('[Scraper] copyDescriptionFromEditor gestart');
  log('[Scraper] Huidige URL:', window.location.href);
  
  // Zoek "Wijzig" button
  const editButton = document.querySelector('a.editButton');
  
  if (!editButton) {
    console.warn('[Scraper] ⚠️ "Wijzig" button niet gevonden');
    return null;
  }
  
  log('[Scraper] ✅ "Wijzig" button gevonden');
  log('[Scraper] 🖱️ Klik op "Wijzig"...');
  
  // Klik op button - dit zal navigeren naar /plaats/{id}/edit
  editButton.click();
  
  // Beschrijving kopieën zal nu afgehandeld worden door plaats_advertentie.js op de edit pagina
  log('[Scraper] ⏳ Wacht tot plaats_advertentie.js beschrijving kopieert en teruggaat...');
  
  // Wacht max 15 seconden tot we terugkomen (4sec wachten op editor + 3sec teruggaan + buffer)
  await sleep(15000);
  
  log('[Scraper] ✅ Teruggekeerd van edit pagina - URL:', window.location.href);
  
  // De editorText zal nu in storage staan dankzij plaats_advertentie.js
  const { repostJob } = await chrome.storage.local.get('repostJob');
  const editorText = repostJob?.adData?.description?.editorText;
  
  if (editorText) {
    log('[Scraper] ✅ Editor beschrijving gelezen uit storage');
    return editorText;
  } else {
    console.warn('[Scraper] ⚠️ Geen editor beschrijving in storage');
    return null;
  }
}

// ============================================
// SCRAPE DELETE URL
// Geeft NIET een URL terug, maar NULL
// We blijven op de huidige pagina en klikken daar op de verwijder knop
// ============================================
function scrapeDeleteUrl() {
  log('[Scraper] 🔍 DeleteUrl bepalen...');
  
  // We hebben GEEN aparte delete URL nodig!
  // De verwijder knop staat op de huidige pagina (seller/view)
  // Het verwijder_advertentie.js script zal op deze pagina de knop klikken
  
  log('[Scraper] ✅ Blijf op huidige pagina voor verwijdering');
  return null; // Geen navigatie nodig
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

log('[Scraper] ✅ Script klaar, wachtend op DOMContentLoaded...');
