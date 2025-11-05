// ============================================
// PLAATS ADVERTENTIE - FORM FILLER
// Vult het advertentieformulier in op /plaats pagina
// BESTAND: content_scripts/plaats_advertentie.js
// ============================================

// Log functie - stuurt ALLES naar background
function log(message) {
  console.log(message); // Ook lokaal
  try {
    chrome.runtime.sendMessage({
      action: 'DEBUG_LOG',
      source: 'Plaats',
      message: message
    });
  } catch (e) {
    // Negeer fouten
  }
}

log('📄 Script geladen op: ' + window.location.href);

// ============================================
// CONVERT HTML TO PLAIN TEXT MET STRUCTUUR
// Converteert HTML naar platte tekst maar behoudt:
// - Regelbreaks (enters) van <br>, <p>, </li>
// - Bullet points (•) van <li>
// - Bold (*tekst*) van <strong>, <b>
// - Italic (_tekst_) van <em>, <i>
// ============================================
function htmlToPlainTextWithStructure(html) {
  if (!html) return '';
  
  // Vervang HTML tags door newlines en tekst
  let text = html;
  
  // <br> en <br/> en <br/> -> newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // </p> -> newline
  text = text.replace(/<\/p>/gi, '\n');
  
  // <p> verwijderen
  text = text.replace(/<p[^>]*>/gi, '');
  
  // </div> -> newline
  text = text.replace(/<\/div>/gi, '\n');
  
  // <div> verwijderen
  text = text.replace(/<div[^>]*>/gi, '');
  
  // <li> -> bullet point
  text = text.replace(/<li[^>]*>/gi, '• ');
  
  // </li> -> newline
  text = text.replace(/<\/li>/gi, '\n');
  
  // <ul> en </ul> verwijderen
  text = text.replace(/<\/?ul[^>]*>/gi, '');
  
  // <ol> en </ol> verwijderen
  text = text.replace(/<\/?ol[^>]*>/gi, '');
  
  // <strong> en <b> -> *tekst*
  text = text.replace(/<strong[^>]*>/gi, '*');
  text = text.replace(/<\/strong>/gi, '*');
  text = text.replace(/<b[^>]*>/gi, '*');
  text = text.replace(/<\/b>/gi, '*');
  
  // <em> en <i> -> _tekst_
  text = text.replace(/<em[^>]*>/gi, '_');
  text = text.replace(/<\/em>/gi, '_');
  text = text.replace(/<i[^>]*>/gi, '_');
  text = text.replace(/<\/i>/gi, '_');
  
  // HTML entities decoderen
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Verwijder overige HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Clean up: dubbele newlines -> enkele newline
  text = text.replace(/\n\n+/g, '\n');
  
  // Trim whitespace
  text = text.trim();
  
  return text;
}

// Wacht tot pagina geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================
// INIT
// Controleert status en start het invullen
// ============================================
async function init() {
  try {
    log('🚀 INIT gestart');
    log('🔗 URL: ' + window.location.href);
    
    // Check of extensie enabled is
    const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
    const isEnabled = extensionEnabled !== false; // Default = true
    
    if (!isEnabled) {
      log('⛔ Extensie is uitgeschakeld, stop');
      return;
    }
    
    // EERST: Check of we op een EDIT pagina zijn (van scraper via "Wijzig" knop)
    if (window.location.href.includes('/plaats/') && window.location.href.includes('/edit')) {
      log('✏️ EDIT page gedetecteerd');
      
      // CHECK: Hebben we dit al gedaan? Flag in storage voorkomen loop
      const { editCopyExecuted } = await chrome.storage.local.get('editCopyExecuted');
      if (editCopyExecuted) {
        log('⚠️ Edit copy al uitgevoerd, skip');
        return;
      }
      
      log('📋 Start handleEditPageCopy...');
      await handleEditPageCopy();
      log('✅ handleEditPageCopy voltooid');
      return;
    }
    
    // Check of we in een actieve posting job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    log('💾 Storage check: hasJob=' + !!repostJob + ' status=' + (repostJob?.status || 'geen'));
    
    if (!repostJob || !repostJob.status.startsWith('POSTING_')) {
      log('⛔ Geen actieve posting job (status: ' + (repostJob?.status || 'geen') + ')');
      return;
    }
    
    log('✅ Actieve posting job gevonden: ' + repostJob.adData?.title);
    log('📊 Images: ' + (repostJob.imageData_base64?.length || 0));
    
    // Wacht tot pagina volledig geladen is
    log('⏳ Wacht 2 seconden...');
    await sleep(2000);
    
    // Check welke pagina we hebben
    const isInitialPage = checkIfInitialPage();
    
    if (isInitialPage) {
      log('📝 Initial page (categorie selectie)');
      await handleInitialPage(repostJob);
    } else {
      log('📝 Formulier page (details invullen)');
      await fillForm(repostJob);
    }
    
  } catch (error) {
    log('❌ FOUT in init: ' + error.message);
    console.error(error);
  }
}

// ============================================
// CHECK IF INITIAL PAGE
// Controleert of we op de eerste /plaats pagina zijn (categorie selectie)
// ============================================
function checkIfInitialPage() {
  // Zoek naar de specifieke titel input op de initial page
  const titleInput = document.querySelector('#TextField-vulEenTitelIn');
  
  // Zoek naar de "Vind categorie" knop
  const findCategoryButton = document.querySelector('button[data-testid="findCategory"]');
  
  // Als we deze elementen hebben, zijn we op de initial page
  const isInitial = !!(titleInput && findCategoryButton);
  
  log('🔍 Page check: titleInput=' + !!titleInput + ' categoryBtn=' + !!findCategoryButton + ' isInitial=' + isInitial);
  
  return isInitial;
}

// ============================================
// HANDLE EDIT PAGE COPY
// Ctrl+A, Ctrl+C beschrijving en gaat terug
// ============================================
async function handleEditPageCopy() {
  try {
    // ZEER BELANGRIJK: Set flag om te voorkomen dat dit 2x wordt uitgevoerd
    await chrome.storage.local.set({ editCopyExecuted: true });
    log('[Plaats] FLAG SET: editCopyExecuted = true');
    
    log('='.repeat(60));
    log('[Plaats] HANDLE EDIT PAGE COPY GESTART');
    log('[Plaats] URL: ' + window.location.href);
    log('[Plaats] Timestamp: ' + new Date().toISOString());
    log('='.repeat(60));
    
    // Wacht tot editor geladen is EN bevat inhoud
    log('[Plaats] STAP 1: Wacht tot editor met inhoud laadt...');
    
    let editorLoaded = false;
    let attempts = 0;
    const maxAttempts = 40; // 40 * 500ms = 20 seconden max
    
    while (!editorLoaded && attempts < maxAttempts) {
      attempts++;
      
      // Zoek editor
      const testEditor = document.querySelector('.RichTextEditor-module-editorInput[data-testid="text-editor-input_nl-NL"]');
      if (testEditor) {
        const content = testEditor.innerText || testEditor.textContent || '';
        const contentLength = (content || '').trim().length;
        
        if (contentLength > 10) { // Meer dan 10 karakters = echte content
          log('[Plaats] STAP 1 OK: Editor geladen met ' + contentLength + ' karakters (poging ' + attempts + ')');
          editorLoaded = true;
          break;
        }
      }
      
      await sleep(500); // Wacht 500ms en probeer opnieuw
    }
    
    if (!editorLoaded) {
      log('[Plaats] STAP 1 WAARSCHUWING: Editor laadde niet volledig, ga toch door');
    }
    
    // Zoek de editor
    log('[Plaats] STAP 2: Zoek editor element...');
    const selectors = [
      '.RichTextEditor-module-editorInput[data-testid="text-editor-input_nl-NL"]',
      '.RichTextEditor-module-editorInput',
      '[data-testid="text-editor-input_nl-NL"]',
      '[contenteditable="true"]',
      '.editor-input',
      '[class*="editorInput"]'
    ];
    
    let editor = null;
    let foundSelector = null;
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      log('[Plaats]   Probeer selector: ' + selector + ' -> Gevonden: ' + !!el);
      if (el) {
        editor = el;
        foundSelector = selector;
        break;
      }
    }
    
    if (!editor) {
      log('[Plaats] STAP 2 FOUT: Editor niet gevonden');
      return;
    }
    
    log('[Plaats] STAP 2 OK: Editor gevonden');
    log('[Plaats] STAP 2 DETAILS: Selector= ' + foundSelector);
    
    // Focus op editor
    log('[Plaats] STAP 3: Focus op editor...');
    editor.focus();
    await sleep(300);
    log('[Plaats] STAP 3 OK: Focus ingesteld');
    
    // Ctrl+A - Select all
    log('[Plaats] STAP 4: Doe Ctrl+A (Select all)...');
    document.execCommand('selectAll', false, null);
    await sleep(300);
    log('[Plaats] STAP 4 OK: Ctrl+A uitgevoerd');
    
    // Ctrl+C - Copy
    log('[Plaats] STAP 5: Doe Ctrl+C (Copy)...');
    document.execCommand('copy', false, null);
    await sleep(500);
    log('[Plaats] STAP 5 OK: Ctrl+C uitgevoerd');
    
    // Lees editor content
    log('[Plaats] STAP 6: Lees editor content...');
    let editorContent = editor.innerText || editor.textContent || '';
    log('[Plaats] STAP 6 OK: Content gelezen');
    log('[Plaats] STAP 6 DETAILS: Lengte= ' + editorContent.length);
    log('[Plaats] STAP 6 PREVIEW: ' + editorContent.substring(0, 100));
    
    // Sla op in storage
    log('[Plaats] STAP 7: Haal repostJob uit storage...');
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob) {
      log('[Plaats] STAP 7 FOUT: Geen repostJob in storage');
      return;
    }
    log('[Plaats] STAP 7 OK: repostJob gevonden');
    
    // Update storage
    log('[Plaats] STAP 8: Update storage met editorText...');
    if (!repostJob.adData) {
      repostJob.adData = {};
    }
    if (!repostJob.adData.description) {
      repostJob.adData.description = {};
    }
    
    repostJob.adData.description.editorText = editorContent;
    
    log('[Plaats] STAP 8: Sla op in chrome.storage.local...');
    await chrome.storage.local.set({ repostJob });
    log('[Plaats] STAP 8 OK: Opgeslagen in storage');
    
    // Ga terug
    log('[Plaats] STAP 9: Ga terug met history.back()...');
    log('[Plaats] STAP 9 DETAILS: Huidige URL = ' + window.location.href);
    
    // BELANGRIJK: Zet status terug naar SCRAPING_DETAILS VOOR history.back()
    // Zodat als we terugkomen naar /seller/view/, het scraping kan beginnen
    repostJob.status = 'SCRAPING_DETAILS';
    await chrome.storage.local.set({ repostJob });
    log('[Plaats] STAP 9 STATUS UPDATE: Zet status terug naar SCRAPING_DETAILS');
    
    // Nu gaan we terug
    window.history.back();
    log('[Plaats] STAP 9 OK: history.back() aangeroepen');
    
    log('[Plaats] ALLE STAPPEN VOLTOOID');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('[Plaats] FOUT in handleEditPageCopy:', error);
    console.error('[Plaats] Stack:', error.stack);
  }
}

// ============================================
// HANDLE INITIAL PAGE
// Handelt de eerste /plaats pagina af (titel + categorie selectie)
// ============================================
async function handleInitialPage(repostJob) {
  console.log('[Plaats] 🎯 INITIAL PAGE: Titel invullen en categorie selecteren');
  
  const { adData } = repostJob;
  
  try {
    // STAP 1: Vul titel in
    console.log('[Plaats] 📝 STAP 1: Vul titel in');
    const titleFilled = await fillTitleInitialPage(adData.title);
    
    if (!titleFilled) {
      console.error('[Plaats] ❌ Kon titel niet invullen');
      return;
    }
    
    await sleep(500);
    
    // STAP 2: Klik op "Vind categorie" knop
    console.log('[Plaats] 🔍 STAP 2: Klik op "Vind categorie" knop');
    const buttonClicked = await clickFindCategoryButton();
    
    if (!buttonClicked) {
      console.error('[Plaats] ❌ Kon "Vind categorie" knop niet klikken');
      return;
    }
    
    await sleep(1500); // Wacht op suggesties
    
    // STAP 3: Selecteer eerste suggestie uit de lijst
    console.log('[Plaats] 🎯 STAP 3: Selecteer eerste categorie suggestie');
    const categorySelected = await selectFirstCategorySuggestion();
    
    if (!categorySelected) {
      console.error('[Plaats] ❌ Kon geen categorie selecteren');
      return;
    }
    
    await sleep(500);
    
    // STAP 4: Klik op "Verder" knop
    console.log('[Plaats] ➡️ STAP 4: Klik op "Verder" knop');
    const continueClicked = await clickContinueButton();
    
    if (!continueClicked) {
      console.error('[Plaats] ❌ Kon "Verder" knop niet vinden');
      return;
    }
    
    console.log('[Plaats] ✅ Initial page voltooid! Wacht op formulier pagina...');
    
  } catch (error) {
    console.error('[Plaats] ❌ FOUT in handleInitialPage:', error);
  }
}

// ============================================
// FILL TITLE INITIAL PAGE
// Vult de titel in op de initial page
// ============================================
async function fillTitleInitialPage(title) {
  console.log('[Plaats] 📝 Vul titel in:', title);
  
  const input = document.querySelector('#TextField-vulEenTitelIn');
  
  if (!input) {
    console.error('[Plaats] ❌ Titel input niet gevonden');
    return false;
  }
  
  console.log('[Plaats] ✅ Titel input gevonden');
  
  input.focus();
  await sleep(200);
  
  input.value = title;
  
  // Trigger events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  
  await sleep(200);
  
  console.log('[Plaats] ✅ Titel ingevuld:', input.value);
  return true;
}

// ============================================
// CLICK FIND CATEGORY BUTTON
// Klikt op de "Vind categorie" knop
// ============================================
async function clickFindCategoryButton() {
  console.log('[Plaats] 🔍 Zoek "Vind categorie" knop...');
  
  const button = document.querySelector('button[data-testid="findCategory"]');
  
  if (!button) {
    console.error('[Plaats] ❌ "Vind categorie" knop niet gevonden');
    return false;
  }
  
  console.log('[Plaats] ✅ "Vind categorie" knop gevonden');
  
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  
  button.click();
  
  console.log('[Plaats] ✅ "Vind categorie" knop geklikt');
  return true;
}

// ============================================
// SELECT FIRST CATEGORY SUGGESTION
// Selecteert de eerste suggestie uit de lijst
// ============================================
async function selectFirstCategorySuggestion() {
  console.log('[Plaats] 🔍 Wacht op categorie suggesties lijst...');
  
  // Wacht max 5 seconden op suggesties
  const maxWait = 5000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    // Zoek naar suggestie lijst items
    const suggestions = document.querySelectorAll('li[role="listitem"].CategorySuggestions-listItem');
    
    if (suggestions.length > 0) {
      console.log('[Plaats] ✅ Suggesties lijst gevonden:', suggestions.length, 'items');
      
      // Selecteer de eerste suggestie
      const firstSuggestion = suggestions[0];
      const categoryText = firstSuggestion.textContent.trim();
      console.log('[Plaats] 📌 Selecteer eerste suggestie:', categoryText.substring(0, 50));
      
      // Zoek de radio button in de eerste suggestie
      const radioButton = firstSuggestion.querySelector('input[type="radio"]');
      
      if (radioButton) {
        console.log('[Plaats] ✅ Radio button gevonden');
        
        firstSuggestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);
        
        // Klik op de radio button
        radioButton.click();
        radioButton.checked = true;
        
        // Trigger change event
        radioButton.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log('[Plaats] ✅ Categorie geselecteerd');
        return true;
      } else {
        // Fallback: klik op het hele list item
        console.log('[Plaats] ⚠️ Radio button niet gevonden, klik op list item');
        firstSuggestion.click();
        return true;
      }
    }
    
    await sleep(200);
  }
  
  console.error('[Plaats] ⏱️ Timeout: Geen suggesties gevonden na 5 seconden');
  return false;
}

// ============================================
// CLICK CONTINUE BUTTON
// Klikt op de "Verder" knop
// ============================================
async function clickContinueButton() {
  console.log('[Plaats] 🔍 Zoek "Verder" knop...');
  
  const button = document.querySelector('button[data-testid="redirectToPlaceAd"]');
  
  if (!button) {
    console.error('[Plaats] ❌ "Verder" knop niet gevonden');
    return false;
  }
  
  console.log('[Plaats] ✅ "Verder" knop gevonden');
  
  // Check of knop enabled is
  if (button.disabled) {
    console.warn('[Plaats] ⚠️ Knop is disabled, wacht 1 seconde...');
    await sleep(1000);
    
    if (button.disabled) {
      console.error('[Plaats] ❌ Knop blijft disabled');
      return false;
    }
  }
  
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  
  button.click();
  
  console.log('[Plaats] ✅ "Verder" knop geklikt');
  return true;
}

// ============================================
// FILL FORM
// Vult het complete formulier in
// ============================================
async function fillForm(repostJob) {
  const { adData, imageData_base64 } = repostJob;
  
  try {
    // STAP 1: Upload afbeeldingen
    console.log('[Plaats] 📸 STAP 1: Upload afbeeldingen');
    await uploadImages(imageData_base64);
    await sleep(2000);
    
    // STAP 2: Vul beschrijving in
    console.log('[Plaats] 📝 STAP 2: Vul beschrijving in');
    // Gebruik editorText als beschikbaar (gekopieerd uit editor), anders vallen we terug op normale text
    const descriptionToUse = adData.description.editorText || adData.description.text;
    console.log('[Plaats] 🔍 Gebruik beschrijving bron:', adData.description.editorText ? 'FROM EDITOR' : 'FROM SCRAPER');
    await fillDescription(descriptionToUse);
    await sleep(1000);
    
    // STAP 3: Selecteer prijstype (altijd "Zie omschrijving")
    console.log('[Plaats] 💰 STAP 3: Selecteer prijstype');
    await selectPriceType(adData.priceType);
    await sleep(1000);
    
    // STAP 4: Prijs wordt NIET ingevuld (staat in beschrijving)
    // Overslaan van fillPrice()
    console.log('[Plaats] ℹ️ STAP 4: Prijs overgeslagen (zie omschrijving)');
    
    // STAP 5: Selecteer "Ophalen"
    console.log('[Plaats] 📦 STAP 5: Selecteer "Ophalen"');
    await selectDeliveryMethod('Ophalen');
    await sleep(1000);
    
    // STAP 6: Klik op "Gratis" bundel optie
    console.log('[Plaats] 🎁 STAP 6: Selecteer "Gratis" bundel');
    await selectFreeBundle();
    await sleep(2000);
    
    // STAP 7: Plaats advertentie
    console.log('[Plaats] 🚀 STAP 7: Plaats advertentie');
    await placeAd();
    
    console.log('[Plaats] ✅ Formulier volledig ingevuld!');
    
    // Wacht en stuur cleanup
    await sleep(3000);
    console.log('[Plaats] 🧹 Stuur CLEANUP bericht');
    await chrome.runtime.sendMessage({ action: 'CLEANUP' });
    
    console.log('[Plaats] 🎉 HERPLAATSING VOLTOOID!');
    
  } catch (error) {
    console.error('[Plaats] ❌ FOUT bij invullen formulier:', error);
    console.error('[Plaats] Stack:', error.stack);
  }
}

// ============================================
// UPLOAD IMAGES
// Upload alle afbeeldingen via file input
// ============================================
async function uploadImages(imageData_base64) {
  log('📤 Start uploaden van ' + imageData_base64.length + ' afbeeldingen');
  
  if (!imageData_base64 || imageData_base64.length === 0) {
    log('⚠️ Geen afbeeldingen om te uploaden');
    return;
  }
  
  // Zoek het file input element
  const fileInput = document.querySelector('input[type="file"][accept*=".jpg"]');
  
  if (!fileInput) {
    log('❌ File input niet gevonden');
    return;
  }
  
  log('✅ File input gevonden');
  
  // Converteer Base64 naar File objecten
  log('🔄 Converteer Base64 naar Files...');
  const files = await convertBase64ToFiles(imageData_base64);
  
  if (files.length === 0) {
    log('❌ Geen files geconverteerd');
    return;
  }
  
  log('✅ ' + files.length + ' files klaar voor upload');
  
  // Upload via DataTransfer API
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  
  fileInput.files = dataTransfer.files;
  
  log('📋 Files toegevoegd aan input: ' + fileInput.files.length + ' bestanden');
  
  // Trigger events
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  log('✅ Afbeeldingen geüpload!');
  
  // Wacht op verwerking
  log('⏳ Wacht 5 seconden op verwerking...');
  await sleep(5000); // Verhoog naar 5 seconden
  
  // Check hoeveel thumbnails er zijn
  const thumbnails = document.querySelectorAll('[data-testid="image-thumbnail"]');
  log('📊 Aantal thumbnails zichtbaar: ' + thumbnails.length);
}

// ============================================
// CONVERT BASE64 TO FILES
// ============================================
async function convertBase64ToFiles(imageData) {
  log('🔄 Converteer ' + imageData.length + ' Base64 strings');
  const files = [];
  
  for (let i = 0; i < imageData.length; i++) {
    try {
      const { base64, type } = imageData[i];
      
      if (!base64) {
        log('⚠️ Afbeelding ' + (i + 1) + ' heeft geen base64 data, skip');
        continue;
      }
      
      // Verwijder data URL prefix
      const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
      
      // Decode Base64
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      
      // Creëer Blob
      const blob = new Blob([bytes], { type: type || 'image/jpeg' });
      const originalSizeKB = Math.round(blob.size / 1024);
      
      log('📏 Originele grootte afbeelding ' + (i + 1) + ': ' + originalSizeKB + 'KB');
      
      // Check of compressie nodig is (> 3.5MB = 3584KB, om zeker te zijn onder 4MB)
      let finalBlob = blob;
      if (blob.size > 3.5 * 1024 * 1024) {
        log('⚠️ Afbeelding ' + (i + 1) + ' is te groot, comprimeer...');
        finalBlob = await compressImage(blob);
        const compressedSizeKB = Math.round(finalBlob.size / 1024);
        log('✅ Gecomprimeerd naar ' + compressedSizeKB + 'KB');
      }
      
      // Creëer File
      const file = new File([finalBlob], `image_${i + 1}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
      
      files.push(file);
      log('✅ File ' + (i + 1) + ': ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)');
      
    } catch (error) {
      log('❌ Fout bij converteren afbeelding ' + (i + 1) + ': ' + error.message);
    }
  }
  
  log('📊 Totaal geconverteerd: ' + files.length + '/' + imageData.length + ' files');
  return files;
}

// ============================================
// COMPRESS IMAGE
// Comprimeert een image blob tot onder 3.5MB
// ============================================
async function compressImage(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Maak canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Bereken nieuwe dimensies (max 1920x1920 voor grote bestanden)
      let width = img.width;
      let height = img.height;
      const maxDimension = 1920;
      
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Teken image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Probeer verschillende kwaliteiten tot het onder 3.5MB is
      let quality = 0.8;
      
      const tryCompress = () => {
        canvas.toBlob((compressedBlob) => {
          if (compressedBlob.size > 3.5 * 1024 * 1024 && quality > 0.3) {
            // Nog te groot, probeer lagere kwaliteit
            quality -= 0.1;
            tryCompress();
          } else {
            // Goed genoeg
            resolve(compressedBlob);
          }
        }, 'image/jpeg', quality);
      };
      
      tryCompress();
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: return origineel
      resolve(blob);
    };
    
    img.src = url;
  });
}

// ============================================
// FILL DESCRIPTION
// Wacht tot gebruiker zelf Ctrl+V doet
// ============================================
async function fillDescription(description) {
  log('📝 Vul beschrijving in');
  
  // Zoek de Lexical editor
  const editor = document.querySelector('.RichTextEditor-module-editorInput[data-testid="text-editor-input_nl-NL"]');
  
  if (!editor) {
    log('❌ Beschrijving editor niet gevonden!');
    return;
  }
  
  log('✅ Editor gevonden');
  
  // Focus op editor
  editor.focus();
  await sleep(500);
  
  // Wacht tot gebruiker iets plakt
  log('⏸️ Wacht tot je Ctrl+V doet in de beschrijving...');
  
  const maxWaitTime = 30000; // 30 seconden max
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const content = editor.innerText || editor.textContent || '';
    
    if (content.trim().length > 10) {
      log('✅ Beschrijving gedetecteerd: ' + content.length + ' karakters');
      return;
    }
    
    await sleep(500); // Check elke halve seconde
  }
  
  log('⏱️ Timeout: Geen beschrijving geplakt na 30 seconden');
}

// ============================================
// SELECT PRICE TYPE
// Selecteert het juiste prijstype - ALTIJD "Zie omschrijving"
// ============================================
async function selectPriceType(priceType) {
  console.log('[Plaats] 💰 Selecteer prijstype: Zie omschrijving (altijd)');
  
  const select = document.querySelector('#Dropdown-prijstype');
  
  if (!select) {
    console.error('[Plaats] ❌ Prijstype dropdown niet gevonden');
    return;
  }
  
  // Selecteer altijd "SEE_DESCRIPTION" (Zie omschrijving)
  const value = 'SEE_DESCRIPTION';
  
  console.log('[Plaats] 🔍 Selecteer value:', value);
  
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  
  console.log('[Plaats] ✅ Prijstype geselecteerd: Zie omschrijving');
}

// ============================================
// SELECT DELIVERY METHOD
// Selecteert bezorgmethode (altijd "Ophalen")
// ============================================
async function selectDeliveryMethod(method) {
  console.log('[Plaats] 📦 Selecteer bezorgmethode:', method);
  
  const radio = document.querySelector(`#${method}`);
  
  if (!radio) {
    console.error('[Plaats] ❌ Bezorgmethode radio niet gevonden:', method);
    return;
  }
  
  console.log('[Plaats] ✅ Radio button gevonden');
  
  if (!radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[Plaats] ✅ Bezorgmethode geselecteerd');
  } else {
    console.log('[Plaats] ℹ️ Al geselecteerd');
  }
}

// ============================================
// SELECT FREE BUNDLE
// Klikt op de "Gratis" bundel optie
// ============================================
async function selectFreeBundle() {
  console.log('[Plaats] 🎁 Zoek "Gratis" bundel knop...');
  
  const button = document.querySelector('button[data-testid="bundle-option-FREE"]');
  
  if (!button) {
    console.error('[Plaats] ❌ Gratis bundel knop niet gevonden');
    return;
  }
  
  console.log('[Plaats] ✅ Gratis bundel knop gevonden');
  
  // Scroll naar knop
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  
  // Klik
  console.log('[Plaats] 🖱️ Klik op Gratis bundel');
  button.click();
  
  console.log('[Plaats] ✅ Gratis bundel geselecteerd');
}

// ============================================
// PLACE AD
// Klikt op "Plaats je advertentie" knop
// ============================================
async function placeAd() {
  console.log('[Plaats] 🚀 Zoek "Plaats je advertentie" knop...');
  
  const button = document.querySelector('#syi-place-ad-button');
  
  if (!button) {
    console.error('[Plaats] ❌ Plaats advertentie knop niet gevonden');
    return;
  }
  
  console.log('[Plaats] ✅ Plaats advertentie knop gevonden');
  
  // Check of knop enabled is
  if (button.disabled) {
    console.warn('[Plaats] ⚠️ Knop is disabled, wacht 2 seconden...');
    await sleep(2000);
    
    if (button.disabled) {
      console.error('[Plaats] ❌ Knop blijft disabled');
      return;
    }
  }
  
  // Scroll naar knop
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  
  // Klik
  console.log('[Plaats] 🖱️ Klik op "Plaats je advertentie"');
  button.click();
  
  console.log('[Plaats] ✅ Advertentie geplaatst!');
  
  // Wacht 3 seconden voor redirect naar seller/view
  console.log('[Plaats] ⏳ Wacht 3 seconden voor redirect...');
  await sleep(3000);
  
  // Navigeer naar seller/view pagina
  console.log('[Plaats] 🔄 Navigeer naar seller/view pagina...');
  window.location.href = 'https://www.marktplaats.nl/my-account/sell/index.html';
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Plaats] ✅ Script klaar, wachtend op init...');
