// ============================================
// VERWIJDER ADVERTENTIE
// Automatiseert het bevestigen van advertentie verwijdering
// Handelt 2-staps proces: Verwijder knop → Modal keuze
// ============================================

console.log('='.repeat(60));
console.log('[Verwijder] 🗑️ Script geladen!');
console.log('[Verwijder] URL:', window.location.href);
console.log('[Verwijder] Timestamp:', new Date().toISOString());
console.log('='.repeat(60));

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
    console.log('[Verwijder] 🔍 Check of we moeten verwijderen...');
    
    // Check of we in de delete fase zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    console.log('[Verwijder] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status
    });
    
    if (!repostJob || repostJob.status !== 'PENDING_DELETE') {
      console.log('[Verwijder] ⏭️ Geen actieve delete job - script stopt');
      return;
    }
    
    console.log('[Verwijder] ✅ Actieve delete job gevonden!');
    console.log('[Verwijder] ⏳ Wacht 1 seconde voor pagina...');
    
    // Wacht even tot de pagina volledig geladen is
    await sleep(1000);
    
    // Debug: analyseer de pagina
    debugDeletePage();
    
    // STAP 1: Klik op de "Verwijder" knop
    console.log('[Verwijder] 🎯 STAP 1: Zoek en klik Verwijder knop...');
    const deleteButtonClicked = await clickDeleteButton();
    
    if (!deleteButtonClicked) {
      console.error('[Verwijder] ❌ Kon Verwijder knop niet vinden/klikken');
      return;
    }
    
    console.log('[Verwijder] ✅ Verwijder knop geklikt!');
    console.log('[Verwijder] ⏳ Wacht 1 seconde op modal...');
    
    // Wacht tot modal verschijnt
    await sleep(1000);
    
    // STAP 2: Klik op modal keuze
    console.log('[Verwijder] 🎯 STAP 2: Zoek en klik modal keuze...');
    const modalClicked = await clickModalChoice();
    
    if (!modalClicked) {
      console.error('[Verwijder] ❌ Kon modal keuze niet vinden/klikken');
      return;
    }
    
    console.log('[Verwijder] ✅ Modal keuze geklikt!');
    console.log('[Verwijder] ⏳ Wacht 2 seconden voor verwerking...');
    
    // Wacht tot verwijdering verwerkt is
    await sleep(2000);
    
    // Stuur bevestiging naar background script
    console.log('[Verwijder] 📤 Stuur DELETE_CONFIRMED naar background...');
    const response = await chrome.runtime.sendMessage({
      action: 'DELETE_CONFIRMED'
    });
    
    console.log('[Verwijder] ✅ Bevestiging verzonden:', response);
    console.log('[Verwijder] 🎉 Verwijdering succesvol voltooid!');
    
  } catch (error) {
    console.error('[Verwijder] ❌ FOUT bij verwijderen:', error);
    console.error('[Verwijder] Error stack:', error.stack);
  }
}

// ============================================
// DEBUG DELETE PAGE
// Analyseert de verwijder pagina
// ============================================
function debugDeletePage() {
  console.log('\n[Verwijder DEBUG] ===== PAGINA ANALYSE =====');
  
  // Zoek verwijder knoppen
  const deleteButtons = document.querySelectorAll('button[class*="delete"], button[class*="Delete"], .deleteButton');
  console.log('[Verwijder DEBUG] Verwijder knoppen gevonden:', deleteButtons.length);
  deleteButtons.forEach((btn, i) => {
    console.log(`  [${i + 1}] Class: ${btn.className}, Text: ${btn.textContent.trim()}`);
  });
  
  // Zoek modals
  const modals = document.querySelectorAll('[class*="Modal"], [role="dialog"]');
  console.log('[Verwijder DEBUG] Modals gevonden:', modals.length);
  modals.forEach((modal, i) => {
    console.log(`  [${i + 1}] Class: ${modal.className}, Visible: ${modal.offsetParent !== null}`);
  });
  
  console.log('[Verwijder DEBUG] ===== EINDE ANALYSE =====\n');
}

// ============================================
// CLICK DELETE BUTTON
// Zoekt en klikt op de hoofdverwijder knop
// ============================================
async function clickDeleteButton() {
  console.log('[Verwijder] 🔍 Zoek Verwijder knop...');
  
  // Selectors voor de verwijder knop
  const selectors = [
    // Specifieke Marktplaats classes
    'button.hz-Button--destructive.deleteButton',
    'button.deleteButton',
    'button[class*="deleteButton"]',
    // Algemene patterns
    'button[class*="Delete"]',
    'button[class*="delete"]',
    'button:has(.ActionButtons-deleteLabel)',
    'button:has(.hz-SvgIconDelete)',
    
    // Via tekst
    'button'
  ];
  
  for (const selector of selectors) {
    const buttons = document.querySelectorAll(selector);
    
    for (const button of buttons) {
      const text = button.textContent.trim().toLowerCase();
      const hasDeleteIcon = button.querySelector('.hz-SvgIconDelete, [class*="Delete"]');
      const isDeleteButton = text.includes('verwijder') || hasDeleteIcon;
      
      if (isDeleteButton) {
        console.log('[Verwijder] ✅ Verwijder knop gevonden!');
        console.log('[Verwijder] Class:', button.className);
        console.log('[Verwijder] Text:', button.textContent.trim());
        
        // Scroll naar knop
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);
        
        // Highlight voor debugging
        highlightElement(button);
        await sleep(300);
        
        // Klik op de knop
        console.log('[Verwijder] 🖱️ Klik op knop...');
        button.click();
        
        // Extra: dispatch click events voor React
        button.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        
        return true;
      }
    }
  }
  
  console.error('[Verwijder] ❌ Geen verwijder knop gevonden');
  return false;
}

// ============================================
// CLICK MODAL CHOICE
// Klikt op een keuze in de verwijder modal
// ============================================
async function clickModalChoice() {
  console.log('[Verwijder] 🔍 Zoek modal...');
  
  // Wacht tot modal verschijnt
  const modal = await waitForModal();
  
  if (!modal) {
    console.error('[Verwijder] ❌ Modal niet gevonden');
    return false;
  }
  
  console.log('[Verwijder] ✅ Modal gevonden!');
  console.log('[Verwijder] Modal class:', modal.className);
  
  // Zoek knoppen in de modal
  const buttons = modal.querySelectorAll('button');
  console.log('[Verwijder] Knoppen in modal:', buttons.length);
  
  buttons.forEach((btn, i) => {
    console.log(`  [${i + 1}] Text: "${btn.textContent.trim()}"`);
  });
  
  // Zoek de juiste knop
  // Kies ALTIJD: "Niet verkocht via Marktplaats" (secondary button)
  
  let targetButton = null;
  
  // Zoek de "Niet verkocht via Marktplaats" knop (secondary button)
  for (const button of buttons) {
    const text = button.textContent.trim().toLowerCase();
    const isSecondary = button.className.includes('secondary');
    
    if (isSecondary || text.includes('niet verkocht')) {
      targetButton = button;
      console.log('[Verwijder] ✅ "Niet verkocht via Marktplaats" button gevonden:', button.textContent.trim());
      break;
    }
  }
  
  // Als nog steeds geen knop, neem gewoon de eerste button
  if (!targetButton && buttons.length > 0) {
    targetButton = buttons[0];
    console.log('[Verwijder] ⚠️ Gebruik eerste button (fallback):', targetButton.textContent.trim());
  }
  
  if (!targetButton) {
    console.error('[Verwijder] ❌ Geen geschikte modal knop gevonden');
    return false;
  }
  
  // Scroll naar knop
  targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  
  // Highlight voor debugging
  highlightElement(targetButton);
  await sleep(300);
  
  // Klik op de knop
  console.log('[Verwijder] 🖱️ Klik op modal knop...');
  targetButton.click();
  
  // Extra: dispatch click events
  targetButton.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  }));
  
  return true;
}

// ============================================
// WAIT FOR MODAL
// Wacht tot de modal verschijnt (met timeout)
// ============================================
async function waitForModal(maxWait = 5000) {
  console.log('[Verwijder] ⏳ Wacht op modal (max 5 sec)...');
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    // Zoek modal met verschillende selectors
    const selectors = [
      '.ReactModal__Content--after-open',
      '.deleteModal',
      '[role="dialog"][class*="Modal"]',
      '.hz-Modal',
      '[class*="Modal"][class*="delete"]'
    ];
    
    for (const selector of selectors) {
      const modal = document.querySelector(selector);
      
      // Check of modal zichtbaar is
      if (modal && modal.offsetParent !== null) {
        console.log('[Verwijder] ✅ Modal verschenen!');
        return modal;
      }
    }
    
    await sleep(100);
  }
  
  console.error('[Verwijder] ⏱️ Timeout: modal niet verschenen na 5 seconden');
  return null;
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

console.log('[Verwijder] ✅ Script klaar, wachtend op DOMContentLoaded...');