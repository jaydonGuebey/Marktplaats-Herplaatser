// ============================================
// VERWIJDER ADVERTENTIE
// Automatiseert het bevestigen van advertentie verwijdering
// ============================================

console.log('[Verwijder] Script geladen op:', window.location.href);

// Wacht tot pagina geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndDelete);
} else {
  checkAndDelete();
}

// ============================================
// CHECK EN DELETE
// Controleert of we moeten verwijderen en start het proces
// ============================================
async function checkAndDelete() {
  try {
    // Check of we in de delete fase zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob || repostJob.status !== 'PENDING_DELETE') {
      console.log('[Verwijder] Geen actieve delete job');
      return;
    }
    
    console.log('[Verwijder] Start verwijdering van advertentie...');
    
    // Wacht even tot de pagina volledig geladen is
    await sleep(1000);
    
    // Zoek en klik op de bevestigingsknop
    const success = await confirmDeletion();
    
    if (success) {
      console.log('[Verwijder] Verwijdering gelukt!');
      
      // Stuur bevestiging naar background script
      await chrome.runtime.sendMessage({
        action: 'DELETE_CONFIRMED'
      });
    } else {
      console.error('[Verwijder] Kon bevestigingsknop niet vinden');
    }
    
  } catch (error) {
    console.error('[Verwijder] Fout bij verwijderen:', error);
  }
}

// ============================================
// CONFIRM DELETION
// Zoekt en klikt op de definitieve verwijder bevestigingsknop
// ============================================
async function confirmDeletion() {
  console.log('[Verwijder] Zoek naar bevestigingsknop...');
  
  // Hypothetische selectors voor de bevestigingsknop
  const buttonSelectors = [
    'button[data-testid="confirm-delete"]',
    'button[data-testid="delete-confirm"]',
    'button.confirm-delete',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:contains("Verwijder")',
    'button:contains("Bevestig")',
    'button:contains("Ja")'
  ];
  
  // Probeer elke selector
  for (const selector of buttonSelectors) {
    let button = document.querySelector(selector);
    
    // Als selector een :contains heeft, gebruik fallback methode
    if (!button && selector.includes(':contains')) {
      const text = selector.match(/contains\("(.+?)"\)/)?.[1];
      if (text) {
        button = findButtonByText(text);
      }
    }
    
    if (button) {
      console.log('[Verwijder] Bevestigingsknop gevonden:', selector);
      
      // Scroll naar de knop
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);
      
      // Highlight de knop voor debugging (optioneel)
      highlightElement(button);
      await sleep(300);
      
      // Klik op de knop
      console.log('[Verwijder] Klik op bevestigingsknop...');
      button.click();
      
      // Extra: dispatch click event voor React/Vue apps
      button.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      
      await sleep(1000);
      
      return true;
    }
  }
  
  // Als geen knop gevonden, probeer formulier te submitten
  const form = document.querySelector('form');
  if (form) {
    console.log('[Verwijder] Geen knop gevonden, submit formulier');
    form.submit();
    return true;
  }
  
  console.error('[Verwijder] Geen bevestigingsknop of formulier gevonden');
  return false;
}

// ============================================
// FIND BUTTON BY TEXT
// Helper functie om knop te vinden op basis van tekst
// ============================================
function findButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.button'));
  
  return buttons.find(button => {
    const buttonText = button.textContent.trim().toLowerCase();
    return buttonText.includes(text.toLowerCase());
  });
}

// ============================================
// HIGHLIGHT ELEMENT
// Highlight een element voor debugging (tijdelijk)
// ============================================
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

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MUTATION OBSERVER FALLBACK
// Als de knop nog niet aanwezig is, wacht tot deze verschijnt
// ============================================
function waitForDeleteButton() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timeout: bevestigingsknop niet gevonden'));
    }, 10000); // 10 seconden timeout
    
    const observer = new MutationObserver(() => {
      const button = document.querySelector('button[data-testid="confirm-delete"], button[type="submit"]');
      if (button) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(button);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

console.log('[Verwijder] Script klaar');