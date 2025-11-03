// ============================================
// ADVERTENTIE SCRAPER
// Scrapet alle gegevens van een advertentie detailpagina
// ============================================

console.log('[Scraper] Script geladen op:', window.location.href);

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
    // Check of we in een actieve repost job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob || repostJob.status !== 'SCRAPING_DETAILS') {
      console.log('[Scraper] Geen actieve scraping job');
      return;
    }
    
    console.log('[Scraper] Start scrapen van advertentiegegevens...');
    
    // Wacht even tot alle dynamische content geladen is
    await sleep(1500);
    
    // Scrape alle data
    const adData = await scrapeAdvertisement();
    
    console.log('[Scraper] Scrapen voltooid:', adData);
    
    // Stuur data naar background script
    await chrome.runtime.sendMessage({
      action: 'DATA_SCRAPED',
      payload: adData
    });
    
  } catch (error) {
    console.error('[Scraper] Fout bij scrapen:', error);
  }
}

// ============================================
// SCRAPE ADVERTISEMENT
// Hoofdfunctie die alle advertentiegegevens verzamelt
// ============================================
async function scrapeAdvertisement() {
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
  
  console.log('[Scraper] Gescrapete data:', {
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
  const selectors = [
    'h1[data-testid="ad-title"]',
    '[data-testid="listing-title"]',
    'h1.listing-title',
    'h1',
    '.ad-title'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      console.log('[Scraper] Titel gevonden:', element.textContent.trim());
      return element.textContent.trim();
    }
  }
  
  console.warn('[Scraper] Geen titel gevonden');
  return 'Geen titel';
}

// ============================================
// SCRAPE DESCRIPTION
// Behoudt HTML formatting van de beschrijving
// ============================================
function scrapeDescription() {
  const selectors = [
    '[data-testid="ad-description"]',
    '.ad-description',
    '[data-testid="description"]',
    '.description-content',
    '#description'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Bewaar de HTML voor formatting
      const html = element.innerHTML.trim();
      const text = element.textContent.trim();
      console.log('[Scraper] Beschrijving gevonden:', text.substring(0, 100) + '...');
      return {
        html: html,
        text: text
      };
    }
  }
  
  console.warn('[Scraper] Geen beschrijving gevonden');
  return { html: '', text: '' };
}

// ============================================
// SCRAPE PRICE
// ============================================
function scrapePrice() {
  const selectors = [
    '[data-testid="ad-price"]',
    '.price-label',
    '[data-testid="price"]',
    '.listing-price',
    'span[class*="price"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const priceText = element.textContent.trim();
      console.log('[Scraper] Prijs gevonden:', priceText);
      
      // Extract numeric value
      const numericPrice = priceText.replace(/[^0-9,.-]/g, '').replace(',', '.');
      return {
        raw: priceText,
        numeric: numericPrice
      };
    }
  }
  
  console.warn('[Scraper] Geen prijs gevonden');
  return { raw: '', numeric: '' };
}

// ============================================
// SCRAPE PRICE TYPE
// Bepaalt of het een vaste prijs, bod, of gratis is
// ============================================
function scrapePriceType() {
  const pageText = document.body.textContent.toLowerCase();
  
  if (pageText.includes('gratis') || pageText.includes('te koop: gratis')) {
    return 'GRATIS';
  } else if (pageText.includes('bieden') || pageText.includes('bod')) {
    return 'BIEDEN';
  } else {
    return 'VAST_PRIJS';
  }
}

// ============================================
// SCRAPE CATEGORY
// ============================================
function scrapeCategory() {
  // Zoek breadcrumb navigatie
  const breadcrumbSelectors = [
    '[data-testid="breadcrumb"]',
    '.breadcrumb',
    'nav[aria-label="breadcrumb"]',
    '.category-breadcrumb'
  ];
  
  for (const selector of breadcrumbSelectors) {
    const breadcrumb = document.querySelector(selector);
    if (breadcrumb) {
      const links = breadcrumb.querySelectorAll('a');
      const categories = Array.from(links).map(link => link.textContent.trim());
      console.log('[Scraper] Categorieën gevonden:', categories);
      return categories;
    }
  }
  
  console.warn('[Scraper] Geen categorie gevonden');
  return [];
}

// ============================================
// SCRAPE LOCATION
// ============================================
function scrapeLocation() {
  const selectors = [
    '[data-testid="location"]',
    '.location-label',
    '[data-testid="seller-location"]',
    '.seller-location',
    'span[class*="location"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const location = element.textContent.trim();
      console.log('[Scraper] Locatie gevonden:', location);
      
      // Probeer postcode te extracten
      const postcodeMatch = location.match(/\d{4}\s*[A-Z]{2}/i);
      return {
        full: location,
        postcode: postcodeMatch ? postcodeMatch[0] : ''
      };
    }
  }
  
  console.warn('[Scraper] Geen locatie gevonden');
  return { full: '', postcode: '' };
}

// ============================================
// SCRAPE ATTRIBUTES
// Scrapet alle kenmerken (key-value paren)
// ============================================
function scrapeAttributes() {
  const attributes = {};
  
  // Hypothetische selectors voor kenmerken sectie
  const attributeSelectors = [
    '[data-testid="attributes"]',
    '.attributes-list',
    '.ad-attributes',
    '.kenmerken'
  ];
  
  for (const selector of attributeSelectors) {
    const container = document.querySelector(selector);
    if (!container) continue;
    
    // Zoek alle key-value paren
    const items = container.querySelectorAll('[data-testid="attribute-item"], .attribute-item, li, dl');
    
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
      console.log('[Scraper] Kenmerken gevonden:', attributes);
      return attributes;
    }
  }
  
  console.warn('[Scraper] Geen kenmerken gevonden');
  return attributes;
}

// ============================================
// SCRAPE IMAGE URLS
// Verzamelt alle afbeeldings-URL's
// ============================================
function scrapeImageUrls() {
  const imageUrls = [];
  
  // Zoek naar afbeelding elementen
  const imageSelectors = [
    '[data-testid="gallery-image"] img',
    '.gallery-image img',
    '.ad-images img',
    '[data-testid="image-viewer"] img',
    '.image-gallery img'
  ];
  
  for (const selector of imageSelectors) {
    const images = document.querySelectorAll(selector);
    if (images.length > 0) {
      images.forEach(img => {
        // Neem de hoogste resolutie afbeelding
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        
        if (src && !imageUrls.includes(src)) {
          // Probeer hoge resolutie variant te krijgen
          const highResSrc = src.replace(/\$_\d+\.JPG$/i, '$_57.JPG') // Marktplaats specifiek formaat
                                .replace(/\/thumbs?\//, '/images/');
          
          imageUrls.push(highResSrc);
        }
      });
      break;
    }
  }
  
  console.log('[Scraper] Afbeeldingen gevonden:', imageUrls.length);
  return imageUrls;
}

// ============================================
// SCRAPE DELETE URL
// Zoekt de URL voor het verwijderen van de advertentie
// ============================================
function scrapeDeleteUrl() {
  const deleteSelectors = [
    'a[href*="verwijder"]',
    '[data-testid="delete-ad"]',
    'a[href*="/delete"]',
    '.delete-button'
  ];
  
  for (const selector of deleteSelectors) {
    const element = document.querySelector(selector);
    if (element && element.href) {
      console.log('[Scraper] Verwijder URL gevonden:', element.href);
      return element.href;
    }
  }
  
  console.warn('[Scraper] Geen verwijder URL gevonden, gebruik fallback');
  // Fallback: construeer de URL
  return window.location.href.replace(/\/a\//, '/v/verwijder-advertentie/');
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Scraper] Script klaar');