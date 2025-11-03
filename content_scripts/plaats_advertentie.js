// ============================================
// PLAATS ADVERTENTIE - MULTI-STEP FORM FILLER
// Dit is het meest complexe script: vult het volledige advertentieformulier in
// ============================================

console.log('[Plaats] Script geladen op:', window.location.href);

// Status constanten (moet synchroon zijn met background.js)
const STATUS = {
  POSTING_STEP_1_DETAILS: 'POSTING_STEP_1_DETAILS',
  POSTING_STEP_2_IMAGES: 'POSTING_STEP_2_IMAGES',
  POSTING_STEP_3_PRICE: 'POSTING_STEP_3_PRICE',
  POSTING_STEP_4_LOCATION: 'POSTING_STEP_4_LOCATION',
  POSTING_STEP_5_ATTRIBUTES: 'POSTING_STEP_5_ATTRIBUTES',
  POSTING_STEP_FINAL: 'POSTING_STEP_FINAL'
};

// Wacht tot pagina geladen is
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ============================================
// INIT
// Controleert status en start de juiste stap
// ============================================
async function init() {
  try {
    // Check of we in een actieve posting job zitten
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob || !repostJob.status.startsWith('POSTING_')) {
      console.log('[Plaats] Geen actieve posting job');
      return;
    }
    
    console.log('[Plaats] Actieve status:', repostJob.status);
    
    // Wacht tot pagina volledig geladen is
    await sleep(1500);
    
    // Route naar de juiste stap handler
    await handleCurrentStep(repostJob);
    
  } catch (error) {
    console.error('[Plaats] Fout in init:', error);
  }
}

// ============================================
// HANDLE CURRENT STEP
// Router functie die de juiste stap-handler aanroept
// ============================================
async function handleCurrentStep(repostJob) {
  const { status, adData } = repostJob;
  
  console.log(`[Plaats] Verwerk stap: ${status}`);
  
  switch (status) {
    case STATUS.POSTING_STEP_1_DETAILS:
      await handleStep1Details(adData);
      break;
      
    case STATUS.POSTING_STEP_2_IMAGES:
      await handleStep2Images(repostJob);
      break;
      
    case STATUS.POSTING_STEP_3_PRICE:
      await handleStep3Price(adData);
      break;
      
    case STATUS.POSTING_STEP_4_LOCATION:
      await handleStep4Location(adData);
      break;
      
    case STATUS.POSTING_STEP_5_ATTRIBUTES:
      await handleStep5Attributes(adData);
      break;
      
    case STATUS.POSTING_STEP_FINAL:
      await handleStepFinal();
      break;
      
    default:
      console.warn('[Plaats] Onbekende status:', status);
  }
}

// ============================================
// STAP 1: DETAILS (Titel, Beschrijving, Categorie)
// ============================================
async function handleStep1Details(adData) {
  console.log('[Plaats] Stap 1: Vul details in');
  
  // Titel
  await fillField('[data-testid="title-input"]', adData.title, 'Titel');
  await sleep(randomDelay());
  
  // Beschrijving
  await fillTextField('[data-testid="description-input"]', adData.description.text, 'Beschrijving');
  await sleep(randomDelay());
  
  // Categorie (indien aanwezig)
  if (adData.category && adData.category.length > 0) {
    await selectCategory(adData.category);
    await sleep(randomDelay());
  }
  
  // Klik op "Volgende" knop
  console.log('[Plaats] Stap 1 voltooid, klik op Volgende');
  await clickNextButton();
  
  // Update status
  await updateStatus(STATUS.POSTING_STEP_2_IMAGES);
}

// ============================================
// STAP 2: AFBEELDINGEN (CRUCIAAL - Afbeeldingsupload)
// ============================================
async function handleStep2Images(repostJob) {
  console.log('[Plaats] Stap 2: Upload afbeeldingen');
  
  const { imageData_base64 } = repostJob;
  
  if (!imageData_base64 || imageData_base64.length === 0) {
    console.warn('[Plaats] Geen afbeeldingen om te uploaden');
    await clickNextButton();
    await updateStatus(STATUS.POSTING_STEP_3_PRICE);
    return;
  }
  
  console.log(`[Plaats] Upload ${imageData_base64.length} afbeeldingen`);
  
  try {
    // Converteer Base64 terug naar File objecten
    const files = await convertBase64ToFiles(imageData_base64);
    
    // Zoek het file input element
    const fileInput = await findFileInput();
    
    if (!fileInput) {
      throw new Error('File input niet gevonden');
    }
    
    // Gebruik DataTransfer API om files toe te wijzen
    await uploadFiles(fileInput, files);
    
    // Wacht tot uploads verwerkt zijn (wacht op thumbnails)
    await waitForImageProcessing(files.length);
    
    console.log('[Plaats] Afbeeldingen succesvol geüpload');
    
  } catch (error) {
    console.error('[Plaats] Fout bij uploaden afbeeldingen:', error);
  }
  
  await sleep(randomDelay(1000, 2000));
  
  // Klik op "Volgende"
  await clickNextButton();
  
  // Update status
  await updateStatus(STATUS.POSTING_STEP_3_PRICE);
}

// ============================================
// CONVERT BASE64 TO FILES
// Converteert Base64 strings terug naar File objecten
// ============================================
async function convertBase64ToFiles(imageData) {
  console.log('[Plaats] Converteer Base64 naar File objecten');
  const files = [];
  
  for (let i = 0; i < imageData.length; i++) {
    const imageInfo = imageData[i];
    const { base64, type } = imageInfo;
    
    try {
      // Verwijder data URL prefix
      const base64Data = base64.split(',')[1];
      
      // Decode Base64 naar binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      
      // Creëer Blob
      const blob = new Blob([bytes], { type: type || 'image/jpeg' });
      
      // Creëer File object
      const file = new File([blob], `image_${i + 1}.jpg`, {
        type: type || 'image/jpeg',
        lastModified: Date.now()
      });
      
      files.push(file);
      console.log(`[Plaats] File ${i + 1} geconverteerd: ${file.name} (${Math.round(file.size / 1024)}KB)`);
      
    } catch (error) {
      console.error(`[Plaats] Fout bij converteren afbeelding ${i + 1}:`, error);
    }
  }
  
  return files;
}

// ============================================
// FIND FILE INPUT
// Zoekt het (mogelijk verborgen) file input element
// ============================================
async function findFileInput() {
  const selectors = [
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
    '[data-testid="image-upload-input"]',
    '[data-testid="file-input"]',
    '#image-upload'
  ];
  
  for (const selector of selectors) {
    const input = document.querySelector(selector);
    if (input) {
      console.log('[Plaats] File input gevonden:', selector);
      return input;
    }
  }
  
  // Fallback: zoek in shadow DOM of verborgen elementen
  const allInputs = document.querySelectorAll('input[type="file"]');
  if (allInputs.length > 0) {
    console.log('[Plaats] File input gevonden via fallback');
    return allInputs[0];
  }
  
  return null;
}

// ============================================
// UPLOAD FILES
// Upload files naar input element via DataTransfer API
// ============================================
async function uploadFiles(fileInput, files) {
  console.log('[Plaats] Start file upload via DataTransfer API');
  
  // Creëer DataTransfer object
  const dataTransfer = new DataTransfer();
  
  // Voeg alle files toe
  for (const file of files) {
    dataTransfer.items.add(file);
  }
  
  // Wijs files toe aan input
  fileInput.files = dataTransfer.files;
  
  console.log(`[Plaats] ${dataTransfer.files.length} files toegewezen aan input`);
  
  // Trigger change event
  const changeEvent = new Event('change', { bubbles: true });
  fileInput.dispatchEvent(changeEvent);
  
  // Trigger input event (voor React)
  const inputEvent = new Event('input', { bubbles: true });
  fileInput.dispatchEvent(inputEvent);
  
  console.log('[Plaats] Change events verstuurd');
}

// ============================================
// WAIT FOR IMAGE PROCESSING
// Wacht tot afbeeldingen verwerkt zijn (thumbnails verschijnen)
// ============================================
async function waitForImageProcessing(expectedCount) {
  console.log(`[Plaats] Wacht op verwerking van ${expectedCount} afbeeldingen`);
  
  const maxWait = 30000; // 30 seconden max
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    // Zoek naar thumbnail elementen
    const thumbnails = document.querySelectorAll('[data-testid="image-thumbnail"], .image-preview, .uploaded-image');
    
    if (thumbnails.length >= expectedCount) {
      console.log('[Plaats] Alle afbeeldingen verwerkt!');
      return true;
    }
    
    await sleep(500);
  }
  
  console.warn('[Plaats] Timeout bij wachten op afbeeldingsverwerking');
  return false;
}

// ============================================
// STAP 3: PRIJS
// ============================================
async function handleStep3Price(adData) {
  console.log('[Plaats] Stap 3: Vul prijs in');
  
  // Selecteer prijstype
  if (adData.priceType) {
    await selectPriceType(adData.priceType);
    await sleep(randomDelay());
  }
  
  // Vul prijs in (als niet gratis)
  if (adData.priceType !== 'GRATIS' && adData.price?.numeric) {
    await fillField('[data-testid="price-input"]', adData.price.numeric, 'Prijs');
    await sleep(randomDelay());
  }
  
  // Klik op "Volgende"
  await clickNextButton();
  
  // Update status
  await updateStatus(STATUS.POSTING_STEP_4_LOCATION);
}

// ============================================
// STAP 4: LOCATIE
// ============================================
async function handleStep4Location(adData) {
  console.log('[Plaats] Stap 4: Vul locatie in');
  
  if (adData.location?.postcode) {
    await fillField('[data-testid="postcode-input"]', adData.location.postcode, 'Postcode');
    await sleep(randomDelay());
  }
  
  // Klik op "Volgende"
  await clickNextButton();
  
  // Update status
  await updateStatus(STATUS.POSTING_STEP_5_ATTRIBUTES);
}

// ============================================
// STAP 5: KENMERKEN/ATTRIBUTEN
// ============================================
async function handleStep5Attributes(adData) {
  console.log('[Plaats] Stap 5: Vul kenmerken in');
  
  if (adData.attributes && Object.keys(adData.attributes).length > 0) {
    for (const [key, value] of Object.entries(adData.attributes)) {
      await fillAttribute(key, value);
      await sleep(randomDelay());
    }
  }
  
  // Klik op "Volgende"
  await clickNextButton();
  
  // Update status
  await updateStatus(STATUS.POSTING_STEP_FINAL);
}

// ============================================
// STAP FINAL: PLAATS ADVERTENTIE
// ============================================
async function handleStepFinal() {
  console.log('[Plaats] Finale stap: Plaats advertentie');
  
  await sleep(randomDelay(1000, 2000));
  
  // Zoek "Plaats Advertentie" knop
  const publishButton = await findPublishButton();
  
  if (publishButton) {
    console.log('[Plaats] Klik op Plaats Advertentie knop');
    publishButton.click();
    
    await sleep(2000);
    
    // Stuur cleanup bericht
    console.log('[Plaats] Advertentie geplaatst! Stuur cleanup bericht');
    await chrome.runtime.sendMessage({ action: 'CLEANUP' });
    
  } else {
    console.error('[Plaats] Plaats Advertentie knop niet gevonden');
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Vul een tekstveld in
async function fillField(selector, value, label = 'Veld') {
  const alternatives = Array.isArray(selector) ? selector : [selector];
  
  for (const sel of alternatives) {
    const field = document.querySelector(sel);
    if (field) {
      console.log(`[Plaats] Vul ${label} in:`, value);
      
      field.focus();
      await sleep(100);
      
      field.value = value;
      
      // Trigger events voor React/Vue
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }
  }
  
  console.warn(`[Plaats] ${label} niet gevonden`);
  return false;
}

// Vul textarea in (voor beschrijving)
async function fillTextField(selector, value, label = 'Tekstveld') {
  const field = document.querySelector(selector);
  
  if (field) {
    console.log(`[Plaats] Vul ${label} in (${value.length} karakters)`);
    
    field.focus();
    await sleep(200);
    
    // Simuleer typing voor anti-bot
    await simulateTyping(field, value);
    
    return true;
  }
  
  console.warn(`[Plaats] ${label} niet gevonden`);
  return false;
}

// Simuleer typing (anti-bot maatregel)
async function simulateTyping(field, text) {
  // Voor lange teksten, gebruik direct assignment + events
  if (text.length > 200) {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  
  // Voor korte teksten, type karakter voor karakter
  for (let i = 0; i < text.length; i++) {
    field.value = text.substring(0, i + 1);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    
    if (i % 10 === 0) {
      await sleep(randomDelay(20, 50));
    }
  }
  
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

// Selecteer categorie
async function selectCategory(categories) {
  console.log('[Plaats] Selecteer categorie:', categories);
  // Implementatie hangt af van de specifieke UI van Marktplaats
  // Kan een dropdown, radio buttons, of een multi-step flow zijn
}

// Selecteer prijstype
async function selectPriceType(priceType) {
  console.log('[Plaats] Selecteer prijstype:', priceType);
  
  const selectors = {
    'GRATIS': '[data-testid="price-type-free"], input[value="free"]',
    'BIEDEN': '[data-testid="price-type-bid"], input[value="bid"]',
    'VAST_PRIJS': '[data-testid="price-type-fixed"], input[value="fixed"]'
  };
  
  const selector = selectors[priceType];
  if (selector) {
    const radio = document.querySelector(selector);
    if (radio) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

// Vul kenmerk in
async function fillAttribute(key, value) {
  console.log(`[Plaats] Vul kenmerk in: ${key} = ${value}`);
  // Implementatie hangt af van de specifieke structuur
}

// Klik op "Volgende" knop
async function clickNextButton() {
  const selectors = [
    'button[data-testid="next-button"]',
    'button[type="submit"]',
    'button:contains("Volgende")',
    '.next-button',
    'button.btn-primary'
  ];
  
  for (const selector of selectors) {
    let button = document.querySelector(selector);
    
    if (!button && selector.includes(':contains')) {
      button = findButtonByText('Volgende') || findButtonByText('Next');
    }
    
    if (button) {
      console.log('[Plaats] Klik op Volgende knop');
      await sleep(randomDelay(500, 1000));
      button.click();
      return true;
    }
  }
  
  console.warn('[Plaats] Volgende knop niet gevonden');
  return false;
}

// Zoek "Plaats Advertentie" knop
async function findPublishButton() {
  const selectors = [
    'button[data-testid="publish-button"]',
    'button[data-testid="submit-button"]',
    'button:contains("Plaats")',
    'button:contains("Publiceer")',
    '.publish-button'
  ];
  
  for (const selector of selectors) {
    let button = document.querySelector(selector);
    
    if (!button && selector.includes(':contains')) {
      button = findButtonByText('Plaats') || 
               findButtonByText('Publiceer') || 
               findButtonByText('Bevestig');
    }
    
    if (button) {
      return button;
    }
  }
  
  return null;
}

// Zoek knop op tekst
function findButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
  return buttons.find(btn => btn.textContent.trim().includes(text));
}

// Update status in storage
async function updateStatus(newStatus) {
  const { repostJob } = await chrome.storage.local.get('repostJob');
  repostJob.status = newStatus;
  await chrome.storage.local.set({ repostJob });
  console.log('[Plaats] Status geüpdatet naar:', newStatus);
}

// Random delay voor anti-bot
function randomDelay(min = 500, max = 1500) {
  return Math.floor(Math.random() * (max - min) + min);
}

// Sleep functie
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Plaats] Script klaar');