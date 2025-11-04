// ============================================
// PLAATS ADVERTENTIE - FORM FILLER
// Vult het advertentieformulier in op /plaats pagina
// BESTAND: content_scripts/plaats_advertentie.js
// ============================================

console.log('='.repeat(60));
console.log('[Plaats] 📄 Script geladen!');
console.log('[Plaats] URL:', window.location.href);
console.log('[Plaats] Timestamp:', new Date().toISOString());
console.log('='.repeat(60));

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
    console.log('[Plaats] ReadyState:', document.readyState);
    
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
    console.log('[Plaats] ⏳ Wacht 2 seconden voor pagina...');
    await sleep(2000);
    
    // Check welke pagina we hebben
    const isInitialPage = checkIfInitialPage();
    
    if (isInitialPage) {
      console.log('[Plaats] 📝 Detectie: Initial /plaats pagina (categorie selectie)');
      await handleInitialPage(repostJob);
    } else {
      console.log('[Plaats] 📝 Detectie: Formulier pagina (details invullen)');
      await fillForm(repostJob);
    }
    
  } catch (error) {
    console.error('[Plaats] ❌ FOUT in init:', error);
    console.error('[Plaats] Stack:', error.stack);
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
  
  console.log('[Plaats] Page check:', {
    hasTitleInput: !!titleInput,
    hasFindCategoryButton: !!findCategoryButton,
    isInitial: isInitial
  });
  
  return isInitial;
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
    await fillDescription(adData.description.text);
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
// Vult de beschrijving - SIMPELE METHODE
// Gebruikt direct value setter zonder chunks
// ============================================
async function fillDescription(description) {
  console.log('[Plaats] 📝 Vul beschrijving in (', description.length, 'karakters)');
  console.log('[Plaats] Beschrijving preview:', description.substring(0, 100) + '...');
  
  // Zoek de Lexical editor
  const editor = document.querySelector('.RichTextEditor-module-editorInput[data-testid="text-editor-input_nl-NL"]');
  
  if (!editor) {
    console.error('[Plaats] ❌ Beschrijving editor niet gevonden');
    
    // Debug: zoek alternatieve editors
    const allEditors = document.querySelectorAll('[contenteditable="true"], [class*="editor"], [class*="Editor"]');
    console.log('[Plaats] 🔍 Gevonden contenteditable elementen:', allEditors.length);
    allEditors.forEach((el, i) => {
      console.log(`  [${i}] Class: ${el.className}`);
    });
    
    return;
  }
  
  console.log('[Plaats] ✅ Editor gevonden');
  
  // Focus op editor
  editor.focus();
  await sleep(500);
  
  // VOLLEDIG LEEGMAKEN - AGRESSIEF
  console.log('[Plaats] 🧹 Clear alle content...');
  editor.innerHTML = '';
  editor.textContent = '';
  editor.innerText = '';
  
  // Selecteer alles en verwijder
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('delete', false);
  
  await sleep(300);
  
  // Check of echt leeg
  console.log('[Plaats] 📋 Na clearen - innerHTML:', editor.innerHTML);
  console.log('[Plaats] 📋 Na clearen - textContent:', editor.textContent);
  
  // Focus opnieuw
  editor.focus();
  await sleep(200);
  
  // Plaats cursor aan begin
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  
  await sleep(200);
  
  // METHODE 1: Probeer insertText in ÉÉN keer (geen chunks!)
  console.log('[Plaats] 📝 Methode 1: Gebruik insertText...');
  const success = document.execCommand('insertText', false, description);
  console.log('[Plaats] insertText success:', success);
  
  // Trigger input event
  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: null
  }));
  
  await sleep(500);
  
  // Verificatie
  const currentContent = editor.textContent || editor.innerText || '';
  console.log('[Plaats] 📋 Content lengte na insertText:', currentContent.length);
  console.log('[Plaats] 📋 Verwachte lengte:', description.length);
  
  if (currentContent.length > 0 && currentContent.length === description.length) {
    console.log('[Plaats] ✅ Beschrijving succesvol ingevuld met insertText');
    
    // Trigger final events
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.blur();
    return;
  }
  
  // METHODE 2: Als insertText faalde, gebruik textContent
  console.log('[Plaats] ⚠️ insertText faalde, probeer textContent...');
  
  // Clear opnieuw
  editor.innerHTML = '';
  editor.textContent = '';
  await sleep(200);
  
  // Set via textContent
  editor.textContent = description;
  
  // Trigger events
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  
  await sleep(500);
  
  const finalContent = editor.textContent || '';
  console.log('[Plaats] 📋 Content lengte na textContent:', finalContent.length);
  
  if (finalContent.length > 0) {
    console.log('[Plaats] ✅ Beschrijving ingevuld met textContent');
  } else {
    console.error('[Plaats] ❌ Beide methodes faalden!');
  }
  
  // Final trigger
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  editor.blur();
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
}

// ============================================
// HELPER: SLEEP
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Plaats] ✅ Script klaar, wachtend op init...');