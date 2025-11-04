// ============================================
// ADVERTENTIE SCRAPER
// Scrapet alle gegevens van een advertentie detailpagina
// ============================================

console.log('='.repeat(60));
console.log('[Scraper] 📄 Script geladen!');
console.log('[Scraper] URL:', window.location.href);
console.log('[Scraper] Timestamp:', new Date().toISOString());
console.log('='.repeat(60));

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
    console.log('[Scraper] 🔍 Check of we moeten scrapen...');
    
    // Check of we in een actieve repost job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    console.log('[Scraper] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status,
      url: repostJob?.adUrl
    });
    
    if (!repostJob) {
      console.log('[Scraper] ⏭️ Geen repost job gevonden - script stopt');
      return;
    }
    
    if (repostJob.status !== 'SCRAPING_DETAILS') {
      console.log('[Scraper] ⏭️ Status is niet SCRAPING_DETAILS:', repostJob.status);
      return;
    }
    
    console.log('[Scraper] ✅ Actieve scraping job gevonden!');
    console.log('[Scraper] ⏳ Wacht 2 seconden voor dynamische content...');
    
    // Wacht tot alle dynamische content geladen is
    await sleep(2000);
    
    console.log('[Scraper] 🚀 Start scrapen...');
    
    // Debug: Analyseer de pagina structuur
    debugPageStructure();
    
    // Scrape alle data
    const adData = await scrapeAdvertisement();
    
    console.log('[Scraper] ✅ Scrapen voltooid!');
    console.log('[Scraper] Data samenvatting:', {
      title: adData.title,
      price: adData.price?.raw,
      images: adData.imageUrls?.length,
      description_length: adData.description?.text?.length
    });
    
    // Stuur data naar background script
    console.log('[Scraper] 📤 Verstuur data naar background...');
    const response = await chrome.runtime.sendMessage({
      action: 'DATA_SCRAPED',
      payload: adData
    });
    
    console.log('[Scraper] ✅ Data verzonden, response:', response);
    
  } catch (error) {
    console.error('[Scraper] ❌ FOUT bij scrapen:', error);
    console.error('[Scraper] Error stack:', error.stack);
  }
}

// ============================================
// DEBUG PAGE STRUCTURE
// Analyseert de pagina om de juiste selectors te vinden
// ============================================
function debugPageStructure() {
  console.log('\n[Scraper DEBUG] ===== PAGINA ANALYSE =====');
  
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
    console.log(`[Scraper DEBUG] ${check.name}: ${elements.length} gevonden`);
    if (elements.length > 0 && elements.length <= 3) {
      elements.forEach((el, i) => {
        console.log(`  [${i + 1}] Class: ${el.className}, Text: ${el.textContent?.substring(0, 50)}`);
      });
    }
  });
  
  // Print alle class names die interessant kunnen zijn
  const allElements = document.querySelectorAll('[class*="vip"], [class*="VIP"], [class*="ad"], [class*="Ad"]');
  console.log(`[Scraper DEBUG] Elementen met VIP/Ad classes: ${allElements.length}`);
  
  console.log('[Scraper DEBUG] ===== EINDE ANALYSE =====\n');
}

// ============================================
// SCRAPE ADVERTISEMENT
// Hoofdfunctie die alle advertentiegegevens verzamelt
// ============================================
async function scrapeAdvertisement() {
  console.log('[Scraper] 📊 Start verzamelen van data...');
  
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
  
  console.log('[Scraper] 📋 Gescrapete data:', {
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
  console.log('[Scraper] 🔍 Zoek titel...');
  
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
      console.log('[Scraper] ✅ Titel gevonden:', title, `(selector: ${selector})`);
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
  console.log('[Scraper] 🔍 Zoek beschrijving...');
  
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
      console.log('[Scraper] ✅ Beschrijving gevonden:', text.substring(0, 100) + '...', `(selector: ${selector})`);
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
// SCRAPE PRICE
// ============================================
function scrapePrice() {
  console.log('[Scraper] 🔍 Zoek prijs...');
  
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
      console.log('[Scraper] ✅ Prijs gevonden:', priceText, `(selector: ${selector})`);
      
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
  console.log('[Scraper] 🔍 Bepaal prijstype...');
  
  const pageText = document.body.textContent.toLowerCase();
  
  let priceType = 'VAST_PRIJS';
  
  if (pageText.includes('gratis') || pageText.includes('te koop: gratis')) {
    priceType = 'GRATIS';
  } else if (pageText.includes('bieden') || pageText.includes('bod')) {
    priceType = 'BIEDEN';
  }
  
  console.log('[Scraper] ✅ Prijstype:', priceType);
  return priceType;
}

// ============================================
// SCRAPE CATEGORY
// ============================================
function scrapeCategory() {
  console.log('[Scraper] 🔍 Zoek categorie...');
  
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
        console.log('[Scraper] ✅ Categorieën gevonden:', categories);
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
  console.log('[Scraper] 🔍 Zoek locatie...');
  
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
      console.log('[Scraper] ✅ Locatie gevonden:', location, `(selector: ${selector})`);
      
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
  console.log('[Scraper] 🔍 Zoek kenmerken...');
  
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
    
    console.log('[Scraper] 📦 Kenmerken container gevonden:', selector);
    
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
      console.log('[Scraper] ✅ Kenmerken gevonden:', Object.keys(attributes).length);
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
  console.log('[Scraper] 🔍 Zoek afbeeldingen...');
  
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
      console.log('[Scraper] 📦 Afbeeldingen gevonden met:', selector);
      
      images.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        
        if (src && !imageUrls.includes(src) && !src.includes('placeholder') && !src.includes('loading')) {
          // Probeer hoge resolutie variant te krijgen
          let highResSrc = src;
          
          // Marktplaats specifieke conversies
          if (src.includes('$_') || src.includes('/thumbs/')) {
            highResSrc = src.replace(/\$_\d+\.JPG$/i, '$_57.JPG')
                           .replace(/\/thumbs?\//, '/images/');
          }
          
          imageUrls.push(highResSrc);
        }
      });
      
      if (imageUrls.length > 0) {
        break; // Stop na de eerste succesvolle selector
      }
    }
  }
  
  console.log('[Scraper] ✅ Afbeeldingen gevonden:', imageUrls.length);
  imageUrls.forEach((url, i) => {
    console.log(`  [${i + 1}] ${url.substring(0, 80)}...`);
  });
  
  return imageUrls;
}

// ============================================
// SCRAPE DELETE URL
// Geeft NIET een URL terug, maar NULL
// We blijven op de huidige pagina en klikken daar op de verwijder knop
// ============================================
function scrapeDeleteUrl() {
  console.log('[Scraper] 🔍 DeleteUrl bepalen...');
  
  // We hebben GEEN aparte delete URL nodig!
  // De verwijder knop staat op de huidige pagina (seller/view)
  // Het verwijder_advertentie.js script zal op deze pagina de knop klikken
  
  console.log('[Scraper] ✅ Blijf op huidige pagina voor verwijdering');
  return null; // Geen navigatie nodig
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Scraper] ✅ Script klaar, wachtend op DOMContentLoaded...');