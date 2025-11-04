// ============================================
// SELLER VIEW HANDLER
// Combineert scraping EN verwijdering op de /seller/view/ pagina
// ============================================

console.log('='.repeat(60));
console.log('[SellerView] 📄 Script geladen!');
console.log('[SellerView] URL:', window.location.href);
console.log('[SellerView] Timestamp:', new Date().toISOString());
console.log('='.repeat(60));

// Wacht tot pagina geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    console.log('[SellerView] 🔍 Check wat we moeten doen...');
    
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    console.log('[SellerView] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status
    });
    
    if (!repostJob) {
      console.log('[SellerView] ⏭️ Geen repost job - script stopt');
      return;
    }
    
    // Wacht even voor dynamische content
    await sleep(1500);
    
    // Route naar juiste actie op basis van status
    if (repostJob.status === 'SCRAPING_DETAILS') {
      console.log('[SellerView] 📊 Start SCRAPING...');
      await handleScraping(repostJob);
    } else if (repostJob.status === 'PENDING_DELETE') {
      console.log('[SellerView] 🗑️ Start DELETING...');
      await handleDeleting(repostJob);
    } else {
      console.log('[SellerView] ⏭️ Verkeerde status:', repostJob.status);
    }
    
  } catch (error) {
    console.error('[SellerView] ❌ FOUT:', error);
    console.error('[SellerView] Stack:', error.stack);
  }
}

// ============================================
// HANDLE SCRAPING
// Scrape advertentie data
// ============================================
async function handleScraping(repostJob) {
  console.log('[SellerView] 📋 SCRAPING MODE');
  
  // Import scraping functies (kopieer ze hieronder)
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
    deleteUrl: null, // Niet nodig, we blijven op deze pagina
    scrapedAt: new Date().toISOString()
  };
  
  console.log('[SellerView] ✅ Scraping voltooid:', {
    title: adData.title,
    price: adData.price?.raw,
    images: adData.imageUrls?.length
  });
  
  // Stuur data naar background
  console.log('[SellerView] 📤 Verstuur data...');
  await chrome.runtime.sendMessage({
    action: 'DATA_SCRAPED',
    payload: adData
  });
  
  console.log('[SellerView] ✅ Data verzonden, wacht op status update...');
}

// ============================================
// HANDLE DELETING (Nieuwe, simpele strategie - GECORRIGEERD)
// Klikt op verwijder knop, wacht, vindt knop, klikt.
// Stuurt GEEN bericht, wacht op URL-detectie door background.js
// ============================================
async function handleDeleting(repostJob) {
  console.log('[SellerView] 🗑️ DELETING MODE (Nieuwe strategie)');
  
  // STAP 1: Klik op de hoofdpagina "Verwijder" knop
  console.log('[SellerView] 🎯 STAP 1: Zoek en klik hoofd "Verwijder" knop...');
  const deleteButton = findDeleteButton(); // We gebruiken de bestaande helper
  
  if (!deleteButton) {
    console.error('[SellerView] ❌ Hoofd "Verwijder" knop niet gevonden!');
    return;
  }
  
  deleteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  deleteButton.click();
  console.log('[SellerView] ✅ Hoofdknop geklikt.');

  // STAP 2: Wacht tot de modal (pop-up) is verschenen
  // We wachten een vaste tijd (1.5s), omdat de zichtbaarheids-checks falen.
  console.log('[SellerView] ⏳ Wacht 1.5 seconde op de modal...');
  await sleep(1500);

  // STAP 3: Zoek de "Niet verkocht" knop in het HELE document
  console.log('[SellerView] 🎯 STAP 3: Zoek "Niet verkocht..." knop');
  let targetButton = null;
  
  // Zoek alle knoppen op de pagina
  const allButtons = document.querySelectorAll('button');
  console.log(`[SellerView] 🔍 Zoek door ${allButtons.length} knoppen...`);

  for (const button of allButtons) {
    const text = button.textContent.trim().toLowerCase();
    const isSecondary = button.className.includes('hz-Button--secondary');
    
    // We zoeken de knop die EN secondary is EN de juiste tekst heeft
    if (isSecondary && text.includes('niet verkocht')) {
        // Check of hij ook daadwerkelijk zichtbaar is (offsetParent is de beste check)
        if (button.offsetParent !== null) {
            console.log('[SellerView] ✅ Target knop gevonden:', button.textContent.trim());
            targetButton = button;
            break; // Stop met zoeken
        } else {
            console.log('[SellerView] ⚠️ Knop gevonden, maar nog niet zichtbaar:', text);
            // We stoppen niet, misschien is er nog een? (Onwaarschijnlijk)
        }
    }
  }

  if (!targetButton) {
    console.error('[SellerView] ❌ "Niet verkocht..." knop niet gevonden of was niet zichtbaar.');
    return;
  }

  // STAP 4: Klik op de modal knop
  console.log('[SellerView] 🎯 STAP 4: Klik op modal knop...');
  highlightElement(targetButton); // Highlight de knop
  await sleep(500);
  targetButton.click();
  console.log('[SellerView] ✅ Modal knop geklikt.');

  // STAP 5: Wacht op verwerking
  console.log('[SellerView] ⏳ Wacht 1.5 seconde op verwerking van de klik...');
  await sleep(1500);

  // STAP 6: VERWIJDERD. We sturen geen bericht meer.
  console.log('[SellerView] 🎉 Verwijdering voltooid! Wacht op URL-detectie door background.js...');
}

// ============================================
// HELPER FUNCTIES
// ============================================

function findDeleteButton() {
  const selectors = [
    'button.deleteButton',
    'button.hz-Button--destructive',
    'button:has(.ActionButtons-deleteLabel)',
    'button[class*="delete"]',
    'button[class*="Delete"]'
  ];
  
  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      console.log('[SellerView] ✅ Delete button gevonden met:', selector);
      return button;
    }
  }
  
  // Fallback: zoek button met "Verwijder" tekst
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent.toLowerCase().includes('verwijder')) {
      console.log('[SellerView] ✅ Delete button gevonden via tekst');
      return button;
    }
  }
  
  return null;
}

function highlightElement(element) {
  const originalOutline = element.style.outline;
  const originalBackground = element.style.backgroundColor;
  
  element.style.outline = '3px solid #10b981';
  element.style.backgroundColor = '#d1fae5';
  
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.backgroundColor = originalBackground;
  }, 2000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// SCRAPING FUNCTIES
// ============================================

function scrapeTitle() {
  const selectors = ['h1.Listing-title', 'h1'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el.textContent.trim();
  }
  return 'Geen titel';
}

function scrapeDescription() {
  const selectors = ['.Description-description', '[class*="Description"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return {
        html: el.innerHTML.trim(),
        text: el.textContent.trim()
      };
    }
  }
  return { html: '', text: '' };
}

function scrapePrice() {
  const selectors = ['.Listing-price', 'span[class*="price"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      return {
        raw: text,
        numeric: text.replace(/[^0-9,.-]/g, '').replace(',', '.')
      };
    }
  }
  return { raw: '', numeric: '' };
}

function scrapePriceType() {
  const pageText = document.body.textContent.toLowerCase();
  if (pageText.includes('gratis')) return 'GRATIS';
  if (pageText.includes('bieden')) return 'BIEDEN';
  return 'VAST_PRIJS';
}

function scrapeCategory() {
  const container = document.querySelector('.CategoryInformation-categoryInformation');
  if (container) {
    const categories = Array.from(container.querySelectorAll('p')).map(p => p.textContent.trim());
    return categories;
  }
  return [];
}

function scrapeLocation() {
  // Marktplaats toont locatie vaak bij verkoper info
  const text = document.body.textContent;
  const match = text.match(/\d{4}\s*[A-Z]{2}/i);
  return {
    full: match ? match[0] : '',
    postcode: match ? match[0] : ''
  };
}

function scrapeAttributes() {
  // Op seller/view zijn attributen vaak niet zichtbaar
  return {};
}

function scrapeImageUrls() {
  const images = [];
  const heroImage = document.querySelector('.HeroImage-image');
  
  if (heroImage && heroImage.src) {
    images.push(heroImage.src);
  }
  
  // Zoek ook in gallery
  const galleryImages = document.querySelectorAll('.Gallery-root img, img[src*="marktplaats"]');
  galleryImages.forEach(img => {
    if (img.src && !images.includes(img.src)) {
      images.push(img.src);
    }
  });
  
  console.log('[SellerView] Afbeeldingen gevonden:', images.length);
  return images;
}

console.log('[SellerView] ✅ Script klaar');