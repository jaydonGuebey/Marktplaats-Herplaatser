// ============================================
// PLAATS ADVERTENTIE - FORM FILLER
// Vult het advertentieformulier in op /plaats pagina
// ============================================

console.log('[Plaats] Script geladen op:', window.location.href);

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
    console.log('[Plaats] 🔍 Script init gestart...');
    console.log('[Plaats] URL:', window.location.href);
    
    // Check of we in een actieve posting job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    console.log('[Plaats] Storage check:', {
      hasJob: !!repostJob,
      status: repostJob?.status,
      hasData: !!repostJob?.adData,
      hasImages: !!repostJob?.imageData_base64
    });
    
    if (!repostJob || !repostJob.status.startsWith('POSTING_')) {
      console.log('[Plaats] ⏭️ Geen actieve posting job');
      return;
    }
    
    console.log('[Plaats] ✅ Actieve posting job gevonden!');
    console.log('[Plaats] 📋 Data:', {
      title: repostJob.adData?.title,
      price: repostJob.adData?.price?.raw,
      images: repostJob.imageData_base64?.length,
      description: repostJob.adData?.description?.text?.substring(0, 50) + '...'
    });
    
    // Wacht tot pagina volledig geladen is
    console.log('[Plaats] ⏳ Wacht 3 seconden voor pagina...');
    await sleep(3000);
    
    // Start het invullen van het formulier
    console.log('[Plaats] 🚀 Start formulier invullen...');
    await fillForm(repostJob);
    
  } catch (error) {
    console.error('[Plaats] ❌ FOUT in init:', error);
    console.error('[Plaats] Stack:', error.stack);
  }
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
    await fillDescription(adData.description.text);
    await sleep(1000);
    
    // STAP 3: Selecteer prijstype
    console.log('[Plaats] 💰 STAP 3: Selecteer prijstype');
    await selectPriceType(adData.priceType);
    await sleep(1000);
    
    // STAP 4: Vul prijs in (als niet gratis)
    if (adData.priceType !== 'GRATIS' && adData.price?.numeric) {
      console.log('[Plaats] 💵 STAP 4: Vul prijs in');
      await fillPrice(adData.price.numeric);
      await sleep(1000);
    }
    
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
  console.log('[Plaats] 📤 Start uploaden van', imageData_base64.length, 'afbeeldingen');
  
  if (!imageData_base64 || imageData_base64.length === 0) {
    console.warn('[Plaats] ⚠️ Geen afbeeldingen om te uploaden');
    return;
  }
  
  // Zoek het file input element
  const fileInput = document.querySelector('input[type="file"][accept*=".jpg"]');
  
  if (!fileInput) {
    console.error('[Plaats] ❌ File input niet gevonden');
    return;
  }
  
  console.log('[Plaats] ✅ File input gevonden');
  
  // Converteer Base64 naar File objecten
  console.log('[Plaats] 🔄 Converteer Base64 naar Files...');
  const files = await convertBase64ToFiles(imageData_base64);
  
  if (files.length === 0) {
    console.error('[Plaats] ❌ Geen files geconverteerd');
    return;
  }
  
  console.log('[Plaats] ✅', files.length, 'files klaar voor upload');
  
  // Upload via DataTransfer API
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  
  fileInput.files = dataTransfer.files;
  
  // Trigger events
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  console.log('[Plaats] ✅ Afbeeldingen geüpload!');
  
  // Wacht op verwerking
  console.log('[Plaats] ⏳ Wacht op verwerking...');
  await sleep(3000);
}

// ============================================
// CONVERT BASE64 TO FILES
// ============================================
async function convertBase64ToFiles(imageData) {
  console.log('[Plaats] 🔄 Converteer', imageData.length, 'Base64 strings');
  const files = [];
  
  for (let i = 0; i < imageData.length; i++) {
    try {
      const { base64, type } = imageData[i];
      
      // Verwijder data URL prefix
      const base64Data = base64.split(',')[1];
      
      // Decode Base64
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      
      // Creëer File
      const blob = new Blob([bytes], { type: type || 'image/jpeg' });
      const file = new File([blob], `image_${i + 1}.jpg`, {
        type: type || 'image/jpeg',
        lastModified: Date.now()
      });
      
      files.push(file);
      console.log(`[Plaats] ✅ File ${i + 1}: ${file.name} (${Math.round(file.size / 1024)}KB)`);
      
    } catch (error) {
      console.error(`[Plaats] ❌ Fout bij converteren afbeelding ${i + 1}:`, error);
    }
  }
  
  return files;
}

// ============================================
// FILL DESCRIPTION
// Vult de beschrijving in de RichTextEditor
// ============================================
async function fillDescription(description) {
  console.log('[Plaats] 📝 Vul beschrijving in (', description.length, 'karakters)');
  
  const editor = document.querySelector('.RichTextEditor-module-editorInput[data-testid="text-editor-input_nl-NL"]');
  
  if (!editor) {
    console.error('[Plaats] ❌ Beschrijving editor niet gevonden');
    return;
  }
  
  console.log('[Plaats] ✅ Editor gevonden');
  
  // Focus de editor
  editor.focus();
  await sleep(200);
  
  // Vul tekst in
  editor.textContent = description;
  
  // Trigger events voor Lexical editor
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Blur
  editor.blur();
  
  console.log('[Plaats] ✅ Beschrijving ingevuld');
}

// ============================================
// SELECT PRICE TYPE
// Selecteert het juiste prijstype
// ============================================
async function selectPriceType(priceType) {
  console.log('[Plaats] 💰 Selecteer prijstype:', priceType);
  
  const select = document.querySelector('#Dropdown-prijstype');
  
  if (!select) {
    console.error('[Plaats] ❌ Prijstype dropdown niet gevonden');
    return;
  }
  
  // Map prijstype naar dropdown value
  const typeMap = {
    'GRATIS': 'FREE',
    'BIEDEN': 'FAST_BID',
    'VAST_PRIJS': 'FIXED'
  };
  
  const value = typeMap[priceType] || 'FIXED';
  
  console.log('[Plaats] 🔍 Selecteer value:', value);
  
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  
  console.log('[Plaats] ✅ Prijstype geselecteerd');
}

// ============================================
// FILL PRICE
// Vult de prijs in
// ============================================
async function fillPrice(price) {
  console.log('[Plaats] 💵 Vul prijs in:', price);
  
  // Zoek prijs input veld
  const priceInput = document.querySelector('input[type="text"][name*="price"], input[id*="price"]');
  
  if (!priceInput) {
    console.error('[Plaats] ❌ Prijs input niet gevonden');
    return;
  }
  
  priceInput.focus();
  await sleep(100);
  
  priceInput.value = price;
  priceInput.dispatchEvent(new Event('input', { bubbles: true }));
  priceInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  priceInput.blur();
  
  console.log('[Plaats] ✅ Prijs ingevuld');
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
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Plaats] ✅ Script klaar');