// ============================================
// MARKTPLAATS HERPLAATSER - BACKGROUND SERVICE WORKER
// Dit is de hersenen van de extensie: beheert de State Machine
// ============================================

console.log('='.repeat(60));
console.log('[Background] 🚀 Marktplaats Herplaatser geïnitialiseerd');
console.log('[Background] Timestamp:', new Date().toISOString());
console.log('='.repeat(60));

// State Machine Status Constanten
const STATUS = {
  IDLE: 'IDLE',
  SCRAPING_DETAILS: 'SCRAPING_DETAILS',
  PENDING_DELETE: 'PENDING_DELETE',
  POSTING_STEP_1_DETAILS: 'POSTING_STEP_1_DETAILS',
  POSTING_STEP_2_IMAGES: 'POSTING_STEP_2_IMAGES',
  POSTING_STEP_3_PRICE: 'POSTING_STEP_3_PRICE',
  POSTING_STEP_4_LOCATION: 'POSTING_STEP_4_LOCATION',
  POSTING_STEP_5_ATTRIBUTES: 'POSTING_STEP_5_ATTRIBUTES',
  POSTING_STEP_FINAL: 'POSTING_STEP_FINAL'
};

// ============================================
// MESSAGE LISTENER - Luistert naar berichten van content scripts
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('\n' + '='.repeat(60));
  console.log('[Background] 📨 Bericht ontvangen!');
  console.log('[Background] Action:', message.action);
  console.log('[Background] Timestamp:', new Date().toISOString());
  console.log('[Background] Sender tab ID:', sender.tab?.id);
  console.log('[Background] Sender URL:', sender.tab?.url);
  console.log('[Background] Volledige message:', JSON.stringify(message, null, 2));
  console.log('='.repeat(60));
  
  try {
    switch (message.action) {
      case 'START_REPOST_PROCESS':
        console.log('[Background] ✅ START_REPOST_PROCESS gedetecteerd');
        handleStartRepost(message.url, sender.tab.id)
          .then(() => {
            console.log('[Background] ✅ handleStartRepost voltooid');
            sendResponse({ success: true, message: 'Repost process gestart' });
          })
          .catch(error => {
            console.error('[Background] ❌ Fout in handleStartRepost:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;
        
      case 'DATA_SCRAPED':
        console.log('[Background] ✅ DATA_SCRAPED gedetecteerd');
        handleDataScraped(message.payload, sender.tab.id)
          .then(() => {
            console.log('[Background] ✅ handleDataScraped voltooid');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[Background] ❌ Fout in handleDataScraped:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;
        
      case 'STEP_COMPLETED':
        console.log('[Background] ✅ STEP_COMPLETED gedetecteerd');
        handleStepCompleted(message.nextStatus, sender.tab.id)
          .then(() => {
            console.log('[Background] ✅ handleStepCompleted voltooid');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[Background] ❌ Fout in handleStepCompleted:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;
        
      case 'CLEANUP':
        console.log('[Background] ✅ CLEANUP gedetecteerd');
        handleCleanup()
          .then(() => {
            console.log('[Background] ✅ handleCleanup voltooid');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[Background] ❌ Fout in handleCleanup:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;
        
      default:
        console.warn('[Background] ⚠️ Onbekende actie:', message.action);
        sendResponse({ success: false, error: 'Onbekende actie' });
    }
  } catch (error) {
    console.error('[Background] ❌ KRITIEKE FOUT in message listener:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  // Return true voor async response support
  return true;
});

// ============================================
// START REPOST PROCESS
// Initialiseert een nieuwe herplaatsing-workflow
// ============================================
async function handleStartRepost(adUrl, tabId) {
  console.log('\n[Background] 🎬 START REPOST PROCESS');
  console.log('[Background] Ad URL:', adUrl);
  console.log('[Background] Tab ID:', tabId);
  
  try {
    // Initialiseer de repost job in storage
    const repostJob = {
      status: STATUS.SCRAPING_DETAILS,
      adUrl: adUrl,
      adData: null,
      imageData_base64: [],
      tabId: tabId,
      startTime: Date.now()
    };
    
    console.log('[Background] Sla repost job op in storage...');
    await chrome.storage.local.set({ repostJob });
    console.log('[Background] ✅ Repost job opgeslagen:', repostJob);
    
    // Verificatie: lees het terug
    const verification = await chrome.storage.local.get('repostJob');
    console.log('[Background] 📋 Verificatie - opgeslagen data:', verification.repostJob);
    
    // Navigeer naar de advertentie detailpagina
    console.log('[Background] 🔄 Navigeer naar advertentie pagina:', adUrl);
    await chrome.tabs.update(tabId, { url: adUrl });
    console.log('[Background] ✅ Navigatie gestart');
    
  } catch (error) {
    console.error('[Background] ❌ FOUT in handleStartRepost:', error);
    throw error;
  }
}

// ============================================
// DATA SCRAPED
// Verwerkt gescrapete advertentiegegevens en download afbeeldingen
// ============================================
async function handleDataScraped(adData, tabId) {
  console.log('\n[Background] 📊 DATA SCRAPED');
  console.log('[Background] Advertentietitel:', adData.title);
  console.log('[Background] Aantal afbeeldingen:', adData.imageUrls?.length || 0);
  console.log('[Background] Tab ID:', tabId);
  
  try {
    // Download en converteer alle afbeeldingen naar Base64
    console.log('[Background] Start downloaden van afbeeldingen...');
    const imageData_base64 = await downloadAndConvertImages(adData.imageUrls || []);
    console.log('[Background] ✅ Afbeeldingen gedownload:', imageData_base64.length);
    
    // Update de repost job met de data en afbeeldingen
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob) {
      throw new Error('Geen actieve repost job gevonden in storage');
    }
    
    repostJob.adData = adData;
    repostJob.imageData_base64 = imageData_base64;
    repostJob.status = STATUS.PENDING_DELETE;
    
    await chrome.storage.local.set({ repostJob });
    console.log('[Background] ✅ Data opgeslagen, status:', repostJob.status);
    
    // BELANGRIJK: Herlaad de pagina zodat het seller_view_handler script
    // de nieuwe status (PENDING_DELETE) oppikt en de verwijdering start
    console.log('[Background] 🔄 Herlaad pagina om delete proces te starten...');
    await chrome.tabs.reload(tabId);
    
  } catch (error) {
    console.error('[Background] ❌ FOUT in handleDataScraped:', error);
    await handleError('Fout bij downloaden afbeeldingen: ' + error.message);
    throw error;
  }
}

// ============================================
// DOWNLOAD EN CONVERTEER AFBEELDINGEN
// Fetcht afbeeldingen en converteert ze naar Base64
// ============================================
async function downloadAndConvertImages(imageUrls) {
  console.log('\n[Background] 📥 DOWNLOAD IMAGES');
  console.log('[Background] Aantal afbeeldingen:', imageUrls.length);
  
  const base64Images = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    console.log(`[Background] Download afbeelding ${i + 1}/${imageUrls.length}:`, url);
    
    try {
      // Fetch de afbeelding
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log(`[Background] Blob ontvangen: ${blob.type}, ${Math.round(blob.size / 1024)}KB`);
      
      // Converteer blob naar Base64
      const base64 = await blobToBase64(blob);
      base64Images.push({
        url: url,
        base64: base64,
        type: blob.type,
        size: blob.size
      });
      
      console.log(`[Background] ✅ Afbeelding ${i + 1} geconverteerd`);
      
    } catch (error) {
      console.error(`[Background] ❌ Fout bij afbeelding ${i + 1}:`, error);
      // Ga door met de volgende afbeelding
    }
  }
  
  console.log(`[Background] ✅ Totaal gedownload: ${base64Images.length}/${imageUrls.length}`);
  return base64Images;
}

// ============================================
// BLOB NAAR BASE64
// Helper functie om Blob te converteren naar Base64 data URL
// ============================================
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================
// DELETE CONFIRMED (Nu aangeroepen door onUpdated listener)
// Verwerkt bevestiging van verwijdering
// ============================================
async function handleDeleteConfirmed(tabId) {
  console.log('\n[Background] 🗑️ DELETE CONFIRMED (via URL detectie)');
  console.log('[Background] Tab ID:', tabId);
  
  try {
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob) {
      throw new Error('Geen actieve repost job gevonden');
    }

    // === BELANGRIJKE CHECK ===
    // Voorkom dat deze functie 2x wordt uitgevoerd
    // Alleen doorgaan als de status nog PENDING_DELETE is.
    if (repostJob.status !== STATUS.PENDING_DELETE) {
        console.log('[Background] ⚠️ Delete al verwerkt, navigatie wordt genegeerd.');
        return;
    }
    
    // Update status VOOR navigatie
    repostJob.status = STATUS.POSTING_STEP_1_DETAILS;
    await chrome.storage.local.set({ repostJob });
    console.log('[Background] ✅ Status geüpdatet naar:', repostJob.status);
    
    // Wacht even om zeker te zijn dat de status opgeslagen is
    await new Promise(resolve => setTimeout(resolve, 200)); 
    
    // Navigeer naar het plaats-advertentie formulier
    // Gebruik de DIRECTE Marktplaats URL
    const postUrl = 'https://www.marktplaats.nl/plaats';
    console.log('[Background] 🔄 Navigeer naar plaats-advertentie:', postUrl);
    
    // === GECORRIGEERDE LOGICA (GEEN NIEUW TABBLAD) ===
    try {
      await chrome.tabs.update(tabId, { url: postUrl });
      console.log('[Background] ✅ Navigatie gelukt in bestaand tabblad.');
    } catch (navError) {
      console.error('[Background] ❌ Navigatie fout in bestaand tabblad:', navError);
      console.log('[Background] 🔄 Probeer het opnieuw na 1 seconde...');
      // Probeer het na een korte vertraging opnieuw, voor het geval de tab nog 'locked' was.
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
          await chrome.tabs.update(tabId, { url: postUrl });
          console.log('[Background] ✅ Navigatie gelukt (2e poging).');
      } catch (e2) {
          console.error('[Background] ❌ Navigatie mislukt (2e poging):', e2);
          // Geef het op, maar open GEEN nieuw tabblad.
      }
    }
    
  } catch (error) {
    console.error('[Background] ❌ FOUT in handleDeleteConfirmed:', error);
    throw error;
  }
}

// ============================================
// STEP COMPLETED
// Verwerkt voltooiing van een formulier-stap
// ============================================
async function handleStepCompleted(nextStatus, tabId) {
  console.log('\n[Background] ⏭️ STEP COMPLETED');
  console.log('[Background] Nieuwe status:', nextStatus);
  console.log('[Background] Tab ID:', tabId);
  
  try {
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (!repostJob) {
      throw new Error('Geen actieve repost job gevonden');
    }
    
    repostJob.status = nextStatus;
    await chrome.storage.local.set({ repostJob });
    console.log('[Background] ✅ Status geüpdatet');
    
  } catch (error) {
    console.error('[Background] ❌ FOUT in handleStepCompleted:', error);
    throw error;
  }
}

// ============================================
// CLEANUP
// Ruimt de repost job op na voltooiing
// ============================================
async function handleCleanup() {
  console.log('\n[Background] 🧹 CLEANUP');
  
  try {
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (repostJob) {
      const duration = Date.now() - repostJob.startTime;
      console.log('[Background] Herplaatsing duur:', Math.round(duration / 1000), 'seconden');
    }
    
    await chrome.storage.local.remove('repostJob');
    console.log('[Background] ✅ Repost job verwijderd');
    console.log('[Background] 🎉 HERPLAATSING VOLTOOID!');
    
  } catch (error) {
    console.error('[Background] ❌ FOUT in handleCleanup:', error);
    throw error;
  }
}

// ============================================
// ERROR HANDLER
// Behandelt fouten en reset de state
// ============================================
async function handleError(errorMessage) {
  console.error('\n[Background] ⚠️ ERROR HANDLER');
  console.error('[Background] Error:', errorMessage);
  
  try {
    const { repostJob } = await chrome.storage.local.get('repostJob');
    
    if (repostJob) {
      repostJob.error = errorMessage;
      repostJob.status = 'ERROR';
      repostJob.errorTime = Date.now();
      await chrome.storage.local.set({ repostJob });
      console.log('[Background] ✅ Error opgeslagen in storage');
    }
  } catch (error) {
    console.error('[Background] ❌ Kon error niet opslaan:', error);
  }
}

// ============================================
// TAB UPDATE LISTENER (GECORRIGEERD)
// Monitort pagina-navigatie voor state machine management
// ============================================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // === GECORRIGEERDE LOGICA ===
  // We wachten NIET op 'complete'. We checken elke update.
  // We gebruiken changeInfo.url omdat tab.url verouderd kan zijn.
  
  const urlToCheck = changeInfo.url || tab.url;
  if (!urlToCheck) return;

  // Check of er een actieve repost job is
  const { repostJob } = await chrome.storage.local.get('repostJob');
  
  // Snel filteren: alleen doorgaan als er een job is voor deze tab
  if (!repostJob || repostJob.tabId !== tabId) return;

  // Log alleen als de URL daadwerkelijk verandert, om spam te voorkomen
  if (changeInfo.url) {
      console.log('\n[Background] 📄 Pagina update gedetecteerd');
      console.log('[Background] URL:', changeInfo.url);
      console.log('[Background] Status:', repostJob.status);
  }

  // === NIEUWE LOGICA ===
  // Dit is nu de ENIGE manier om het plaatsen te starten na verwijdering.
  // We reageren onmiddellijk op de URL, zelfs als 'status' nog 'loading' is.
  if (repostJob.status === STATUS.PENDING_DELETE && 
      urlToCheck.includes('my-account/sell') &&
      urlToCheck.includes('previousAction=deleteAdSuccess')) {
    
    console.log('[Background] 🎯 Verwijdering succesvol gedetecteerd (via URL)!');
    console.log('[Background] 🚀 Start plaats-advertentie proces...');
    // We roepen de functie aan, maar hoeven er niet op te wachten
    handleDeleteConfirmed(tabId);
  }
});

// ============================================
// INSTALLATIE LISTENER
// Logt wanneer de extensie geïnstalleerd/geüpdatet wordt
// ============================================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('\n' + '='.repeat(60));
  console.log('[Background] 🎉 Extensie geïnstalleerd/geüpdatet');
  console.log('[Background] Reden:', details.reason);
  console.log('[Background] Versie:', chrome.runtime.getManifest().version);
  console.log('='.repeat(60));
});

console.log('[Background] ✅ Alle event listeners geregistreerd');
console.log('[Background] 👂 Wachtend op berichten...\n');