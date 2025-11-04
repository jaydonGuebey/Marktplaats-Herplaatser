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
// HANDLE DELETING
// Klik op verwijder knop en handel modal af
// VERBETERDE VERSIE met betere modal detectie
// ============================================
async function handleDeleting(repostJob) {
  console.log('[SellerView] 🗑️ DELETING MODE');
  
  // STAP 1: Klik op verwijder knop
  console.log('[SellerView] 🎯 STAP 1: Zoek verwijder knop...');
  const deleteButton = findDeleteButton();
  
  if (!deleteButton) {
    console.error('[SellerView] ❌ Verwijder knop niet gevonden!');
    return;
  }
  
  console.log('[SellerView] ✅ Verwijder knop gevonden!');
  deleteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  
  console.log('[SellerView] 🖱️ Klik op verwijder knop...');
  deleteButton.click();
  
  // STAP 2: Wacht actief op modal met LANGERE timeout
  console.log('[SellerView] ⏳ Wacht op modal (max 10 seconden)...');
  const modal = await waitForModal(10);
  
  if (!modal) {
    console.error('[SellerView] ❌ Modal niet gevonden na 10 seconden!');
    console.log('[SellerView] 🔄 Probeer backup methode...');
    
    // BACKUP: Zoek knop direct zonder modal container
    const button = await findModalButtonWithRetry(5);
    
    if (button) {
      console.log('[SellerView] ✅ Knop gevonden via backup methode!');
      await handleModalButton(button);
      return;
    } else {
      console.error('[SellerView] ❌ Ook backup methode gefaald!');
      return;
    }
  }
  
  console.log('[SellerView] ✅ Modal gevonden!');
  
  // STAP 3: Zoek de juiste knop in de modal
  const targetButton = findButtonInModal(modal);
  
  if (!targetButton) {
    console.error('[SellerView] ❌ Geen geschikte knop gevonden in modal!');
    return;
  }
  
  // STAP 4: Handle de knop
  await handleModalButton(targetButton);
}

// ============================================
// HANDLE MODAL BUTTON
// Stuur DELETE_CONFIRMED en klik op knop
// ============================================
async function handleModalButton(button) {
  console.log('[SellerView] 🎯 Handle modal knop...');
  console.log('[SellerView] Knop tekst:', button.textContent.trim());
  
  // BELANGRIJK: Stuur DELETE_CONFIRMED VOOR de klik
  console.log('[SellerView] 📤 Stuur DELETE_CONFIRMED VOOR klik...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'DELETE_CONFIRMED'
    });
    console.log('[SellerView] ✅ DELETE_CONFIRMED verzonden:', response);
  } catch (error) {
    console.error('[SellerView] ❌ Fout bij versturen DELETE_CONFIRMED:', error);
  }
  
  // Wacht even
  await sleep(500);
  
  // Scroll en highlight
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  
  // Highlight voor debugging
  highlightElement(button);
  await sleep(300);
  
  // Nu pas klikken
  console.log('[SellerView] 🖱️ Klik op modal knop...');
  button.click();
  
  console.log('[SellerView] 🎉 Verwijdering voltooid!');
  console.log('[SellerView] ⏳ Wacht op redirect en navigatie...');
}

// ============================================
// FIND BUTTON IN MODAL
// Zoekt de juiste knop in de modal
// ============================================
function findButtonInModal(modal) {
  console.log('[SellerView] 🔍 Zoek knop in modal...');
  
  const buttons = modal.querySelectorAll('button');
  console.log('[SellerView] Knoppen in modal:', buttons.length);
  
  buttons.forEach((btn, i) => {
    console.log(`  [${i + 1}] "${btn.textContent.trim()}" - Class: ${btn.className}`);
  });
  
  // Zoek de "Niet verkocht via Marktplaats" knop (secondary button)
  for (const button of buttons) {
    const text = button.textContent.trim().toLowerCase();
    const isSecondary = button.className.includes('secondary');
    
    if (isSecondary || text.includes('niet verkocht')) {
      console.log('[SellerView] ✅ Target knop gevonden:', button.textContent.trim());
      return button;
    }
  }
  
  // Fallback: laatste knop (vaak de secondary)
  if (buttons.length > 0) {
    const lastButton = buttons[buttons.length - 1];
    console.log('[SellerView] ⚠️ Fallback naar laatste knop:', lastButton.textContent.trim());
    return lastButton;
  }
  
  return null;
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

function findModal() {
  const selectors = [
    '.ReactModal__Content--after-open',
    '.deleteModal',
    '[role="dialog"]',
    '.hz-Modal',
    'div[class*="Modal"][role="dialog"]',
    '[class*="Modal"]'
  ];
  
  console.log('[SellerView] 🔍 Zoek modal...');
  
  for (const selector of selectors) {
    const modals = document.querySelectorAll(selector);
    
    console.log(`[SellerView] Selector "${selector}": ${modals.length} gevonden`);
    
    for (const modal of modals) {
      const style = window.getComputedStyle(modal);
      const isVisible = modal.offsetParent !== null && 
                       modal.offsetHeight > 0 &&
                       style.display !== 'none' &&
                       style.visibility !== 'hidden' &&
                       style.opacity !== '0';
      
      console.log(`[SellerView]   Modal class="${modal.className}" visible=${isVisible}`);
      
      if (isVisible) {
        console.log('[SellerView] ✅ Zichtbare modal gevonden!');
        return modal;
      }
    }
  }
  
  console.warn('[SellerView] ⚠️ Geen zichtbare modal gevonden');
  return null;
}

// Wacht actief tot modal verschijnt - LANGERE TIMEOUT
async function waitForModal(maxSeconds = 10) {
  console.log(`[SellerView] 🔍 Wacht actief op modal (max ${maxSeconds} sec)...`);
  const maxAttempts = maxSeconds * 10; // Check elke 100ms
  
  for (let i = 0; i < maxAttempts; i++) {
    const modal = findModal();
    
    if (modal) {
      console.log(`[SellerView] ✅ Modal gevonden na ${i * 100}ms`);
      return modal;
    }
    
    // Log elke seconde
    if (i % 10 === 0 && i > 0) {
      console.log(`[SellerView] ⏳ Nog geen modal na ${i / 10} seconden...`);
    }
    
    await sleep(100);
  }
  
  console.error(`[SellerView] ❌ Modal niet gevonden na ${maxSeconds} seconden`);
  return null;
}

// BACKUP: Zoek modal knop direct met meerdere pogingen
async function findModalButtonWithRetry(maxAttempts = 5) {
  console.log('[SellerView] 🔄 Start backup methode: zoek knop direct...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[SellerView] Poging ${attempt}/${maxAttempts}...`);
    
    // Zoek alle buttons op de hele pagina
    const allButtons = document.querySelectorAll('button');
    console.log(`[SellerView] Totaal buttons op pagina: ${allButtons.length}`);
    
    for (const button of allButtons) {
      const text = button.textContent.trim().toLowerCase();
      const isSecondary = button.className.includes('secondary');
      
      // Zoek "Niet verkocht" knop die zichtbaar is
      if ((text.includes('niet verkocht') || isSecondary) && button.offsetParent !== null) {
        console.log('[SellerView] ✅ Knop gevonden!', button.textContent.trim());
        return button;
      }
    }
    
    // Wacht 1 seconde voor volgende poging
    if (attempt < maxAttempts) {
      console.log('[SellerView] ⏳ Wacht 1 seconde...');
      await sleep(1000);
    }
  }
  
  console.error('[SellerView] ❌ Geen geschikte knop gevonden na alle pogingen');
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