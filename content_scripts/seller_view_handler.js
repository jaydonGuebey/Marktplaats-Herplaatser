// ============================================
// SELLER VIEW HANDLER
// Combineert scraping EN verwijdering op de /seller/view/ pagina
// ============================================

// Log functie - stuurt ALLES naar background
function log(message) {
  console.log(message); // Ook lokaal
  try {
    chrome.runtime.sendMessage({
      action: 'DEBUG_LOG',
      source: 'SellerView',
      message: message
    });
  } catch (e) {
    // Negeer fouten
  }
}

log('📄 Script geladen op: ' + window.location.href);

// Wacht tot pagina geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    log('[SellerView] 🔍 Check wat we moeten doen...');
    
    // Check of extensie enabled is
    const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
    const isEnabled = extensionEnabled !== false; // Default = true
    
    if (!isEnabled) {
      log('[SellerView] ⛔ Extensie is uitgeschakeld, stop');
      return;
    }
    
    // CRITICAL FIX: Haal BEIDE keys op uit storage
    const storage = await chrome.storage.local.get(['repostJob', 'editCopyExecuted']);
    const repostJob = storage.repostJob;
    const editCopyExecuted = storage.editCopyExecuted;
    
    log('[SellerView] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status,
      editCopyExecuted: editCopyExecuted
    });
    
    if (!repostJob) {
      log('[SellerView] ⏭️ Geen repost job - script stopt');
      return;
    }
    
    // Wacht even voor dynamische content
    await sleep(1500);
    
    // Route naar juiste actie op basis van status
    if (repostJob.status === 'SCRAPING_DETAILS') {
      // CRUCIALE FIX: Check of we al de edit page copy hebben gedaan
      if (editCopyExecuted) {
        log('[SellerView] ✅ Edit page copy al gedaan (flag gevonden), skip navigatie');
        log('[SellerView] 📊 Continue met REST van SCRAPING...');
        // Voer ALLEEN scraping uit, niet de edit page navigatie
        await continueScrapingAfterEditCopy(repostJob);
      } else {
        log('[SellerView] 📊 Start SCRAPING (incl. edit page copy)...');
        await handleScraping(repostJob);
      }
    } else if (repostJob.status === 'COPYING_DESCRIPTION') {
      log('[SellerView] ⏭️ Status is COPYING_DESCRIPTION - we navigeren momenteel naar edit pagina, skip');
      return;
    } else if (repostJob.status === 'PENDING_DELETE') {
      log('[SellerView] 🗑️ Start DELETING...');
      await handleDeleting(repostJob);
    } else {
      log('[SellerView] ⏭️ Verkeerde status:', repostJob.status);
    }
    
  } catch (error) {
    log('[SellerView] ❌ FOUT:', error);
    log('[SellerView] Stack:', error.stack);
  }
}

// ============================================
// CONTINUE SCRAPING AFTER EDIT COPY
// Scrape advertentie data ZONDER naar edit pagina te gaan (we zijn net teruggekomen)
// ============================================
async function continueScrapingAfterEditCopy(repostJob) {
  log('[SellerView] CONTINUE SCRAPING (edit copy al gedaan)');
  
  // Clear de flag zodat volgende repost fris begint
  await chrome.storage.local.remove('editCopyExecuted');
  log('[SellerView] FLAG CLEARED: editCopyExecuted verwijderd');
  
  // STAP 2: Scrape alle data (editorText zit nu in storage via plaats_advertentie.js)
  log('[SellerView] STAP 2: Scrape advertentie data');
  
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
  
  log('[SellerView] Scraping voltooid:', {
    title: adData.title,
    price: adData.price?.raw,
    images: adData.imageUrls?.length
  });
  
  // STAP 3: Voeg editor beschrijving toe uit storage (als beschikbaar)
  const { repostJob: updatedJob } = await chrome.storage.local.get('repostJob');
  if (updatedJob?.adData?.description?.editorText) {
    adData.description.editorText = updatedJob.adData.description.editorText;
    log('[SellerView] Editor beschrijving toegevoegd uit storage');
  }
  
  // Stuur data naar background
  log('[SellerView] Verstuur data...');
  await chrome.runtime.sendMessage({
    action: 'DATA_SCRAPED',
    payload: adData
  });
  
  log('[SellerView] Data verzonden, wacht op status update...');
}

// ============================================
// HANDLE SCRAPING
// Scrape advertentie data - EERST naar edit pagina voor beschrijving
// ============================================
async function handleScraping(repostJob) {
  log('[SellerView] SCRAPING MODE');
  
  // RESET: Clear de editCopyExecuted flag zodat volgende keer kan opnieuw
  await chrome.storage.local.remove('editCopyExecuted');
  log('[SellerView] FLAG CLEARED: editCopyExecuted verwijderd');
  
  // ZEER BELANGRIJK: Verander de status VOOR navigatie naar edit pagina
  // Dit voorkomt dat de functie 2x wordt uitgevoerd als we terugkomen
  log('[SellerView] Update status naar COPYING_DESCRIPTION om loop te voorkomen');
  repostJob.status = 'COPYING_DESCRIPTION';
  await chrome.storage.local.set({ repostJob });
  log('[SellerView] Status gewijzigd naar: COPYING_DESCRIPTION');
  
  // STAP 1: Navigeer naar edit pagina om beschrijving te kopieren
  log('[SellerView] STAP 1: Navigeer naar edit pagina voor beschrijving');
  const navigationSuccess = await navigateToEditPageAndCopy();
  
  if (!navigationSuccess) {
    console.warn('[SellerView] Navigatie naar edit pagina faalde, ga toch door');
  }
  
  // OPMERKING: Status wordt TERUGGEZET naar SCRAPING_DETAILS door plaats_advertentie.js
  // voordat het history.back() aanroept. Dus we checken hier gewoon de status.
  const { repostJob: updatedRepostJob } = await chrome.storage.local.get('repostJob');
  log('[SellerView] Status na kopieren:', updatedRepostJob?.status);
  
  // STAP 2: Scrape alle data (editorText zit nu in storage via plaats_advertentie.js)
  log('[SellerView] STAP 2: Scrape advertentie data');
  
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
  
  log('[SellerView] Scraping voltooid:', {
    title: adData.title,
    price: adData.price?.raw,
    images: adData.imageUrls?.length
  });
  
  // STAP 3: Voeg editor beschrijving toe uit storage (als beschikbaar)
  const { repostJob: updatedJob } = await chrome.storage.local.get('repostJob');
  if (updatedJob?.adData?.description?.editorText) {
    adData.description.editorText = updatedJob.adData.description.editorText;
    log('[SellerView] Editor beschrijving toegevoegd uit storage');
  }
  
  // Stuur data naar background
  log('[SellerView] Verstuur data...');
  await chrome.runtime.sendMessage({
    action: 'DATA_SCRAPED',
    payload: adData
  });
  
  log('[SellerView] Data verzonden, wacht op status update...');
}

// ============================================
// NAVIGATE TO EDIT PAGE AND COPY DESCRIPTION
// Navigeert naar edit pagina, Ctrl+A/C, terug
// ============================================
async function navigateToEditPageAndCopy() {
  try {
    log('='.repeat(60));
    log('[SellerView] NAVIGATE TO EDIT PAGE AND COPY');
    log('[SellerView] Timestamp: ' + new Date().toISOString());
    log('[SellerView] Huidige URL: ' + window.location.href);
    log('='.repeat(60));
    
    // Lees ad ID uit de URL
    log('[SellerView] STAP 1: Parse URL om ad ID te vinden...');
    const urlMatch = window.location.href.match(/\/seller\/view\/([^\/]+)/);
    
    if (!urlMatch || !urlMatch[1]) {
      log('[SellerView] STAP 1 FOUT: Kon ad ID niet uit URL halen');
      log('[SellerView] URL: ' + window.location.href);
      log('[SellerView] Regex match result: ' + JSON.stringify(urlMatch));
      return false;
    }
    
    const adId = urlMatch[1];
    log('[SellerView] STAP 1 OK: Ad ID gevonden = ' + adId);
    
    // Bouw de edit URL
    log('[SellerView] STAP 2: Bouw edit URL...');
    const editUrl = `https://www.marktplaats.nl/plaats/${adId}/edit`;
    log('[SellerView] STAP 2 OK: Edit URL = ' + editUrl);
    
    // Navigeer naar edit pagina
    log('[SellerView] STAP 3: Navigeer naar edit pagina...');
    log('[SellerView] STAP 3 DETAILS: Set window.location.href');
    window.location.href = editUrl;
    log('[SellerView] STAP 3 OK: Navigatie aangeroepen');
    
    // Wacht tot navigatie voltooid, Ctrl+A/C gedaan, en terug naar seller/view
    log('[SellerView] STAP 4: Wacht 35 seconden op edit cycle...');
    log('[SellerView] STAP 4 DETAILS: Dit omvat navigatie, Ctrl+A/C, history.back()');
    await sleep(35000);
    
    log('[SellerView] STAP 4 OK: 35 seconden voorbij');
    log('[SellerView] STAP 5: Check huidige URL na teruggaan...');
    log('[SellerView] STAP 5 DETAILS: Huidige URL = ' + window.location.href);
    log('[SellerView] ALLE STAPPEN VOLTOOID - TERUG OP SELLER/VIEW');
    log('='.repeat(60));
    
    return true;
  } catch (error) {
    log('[SellerView] FOUT in navigateToEditPageAndCopy: ' + error.message);
    log('[SellerView] Stack: ' + error.stack);
    return false;
  }
}

// ============================================
// HANDLE DELETING (Nieuwe, simpele strategie - GECORRIGEERD)
// Klikt op verwijder knop, wacht, vindt knop, klikt.
// Stuurt GEEN bericht, wacht op URL-detectie door background.js
// ============================================
async function handleDeleting(repostJob) {
  log('[SellerView] DELETING MODE');
  
  // STAP 1: Klik op de hoofdpagina "Verwijder" knop
  log('[SellerView] STAP 1: Zoek en klik hoofd "Verwijder" knop...');
  const deleteButton = findDeleteButton(); // We gebruiken de bestaande helper
  
  if (!deleteButton) {
    log('[SellerView] ❌ Hoofd "Verwijder" knop niet gevonden!');
    return;
  }
  
  deleteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  deleteButton.click();
  log('[SellerView] ✅ Hoofdknop geklikt.');

  // STAP 2: Wacht tot de modal (pop-up) is verschenen
  // We wachten een vaste tijd (1.5s), omdat de zichtbaarheids-checks falen.
  log('[SellerView] ⏳ Wacht 1.5 seconde op de modal...');
  await sleep(1500);

  // STAP 3: Zoek de "Niet verkocht" knop in het HELE document
  log('[SellerView] 🎯 STAP 3: Zoek "Niet verkocht..." knop');
  let targetButton = null;
  
  // Zoek alle knoppen op de pagina
  const allButtons = document.querySelectorAll('button');
  log(`[SellerView] 🔍 Zoek door ${allButtons.length} knoppen...`);

  for (const button of allButtons) {
    const text = button.textContent.trim().toLowerCase();
    const isSecondary = button.className.includes('hz-Button--secondary');
    
    // We zoeken de knop die EN secondary is EN de juiste tekst heeft
    if (isSecondary && text.includes('niet verkocht')) {
        // Check of hij ook daadwerkelijk zichtbaar is (offsetParent is de beste check)
        if (button.offsetParent !== null) {
            log('[SellerView] ✅ Target knop gevonden:', button.textContent.trim());
            targetButton = button;
            break; // Stop met zoeken
        } else {
            log('[SellerView] ⚠️ Knop gevonden, maar nog niet zichtbaar:', text);
            // We stoppen niet, misschien is er nog een? (Onwaarschijnlijk)
        }
    }
  }

  if (!targetButton) {
    log('[SellerView] ❌ "Niet verkocht..." knop niet gevonden of was niet zichtbaar.');
    return;
  }

  // STAP 4: Klik op de modal knop
  log('[SellerView] 🎯 STAP 4: Klik op modal knop...');
  highlightElement(targetButton); // Highlight de knop
  await sleep(500);
  targetButton.click();
  log('[SellerView] ✅ Modal knop geklikt.');

  // STAP 5: Wacht op verwerking
  log('[SellerView] ⏳ Wacht 1.5 seconde op verwerking van de klik...');
  await sleep(1500);

  // STAP 6: VERWIJDERD. We sturen geen bericht meer.
  log('[SellerView] 🎉 Verwijdering voltooid! Wacht op URL-detectie door background.js...');
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
      log('[SellerView] ✅ Delete button gevonden met:', selector);
      return button;
    }
  }
  
  // Fallback: zoek button met "Verwijder" tekst
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent.toLowerCase().includes('verwijder')) {
      log('[SellerView] ✅ Delete button gevonden via tekst');
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
  
  log('[SellerView] Afbeeldingen gevonden:', images.length);
  return images;
}

log('[SellerView] ✅ Script klaar');
