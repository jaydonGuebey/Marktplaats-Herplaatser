// ============================================
// MARKTPLAATS HERPLAATSER - BACKGROUND SERVICE WORKER
// Dit is de hersenen van de extensie: beheert de State Machine
// ============================================

console.log('[Background] Marktplaats Herplaatser geïnitialiseerd');

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
  console.log('[Background] Bericht ontvangen:', message.action);
  
  switch (message.action) {
    case 'START_REPOST_PROCESS':
      handleStartRepost(message.url, sender.tab.id);
      break;
      
    case 'DATA_SCRAPED':
      handleDataScraped(message.payload, sender.tab.id);
      break;
      
    case 'DELETE_CONFIRMED':
      handleDeleteConfirmed(sender.tab.id);
      break;
      
    case 'STEP_COMPLETED':
      handleStepCompleted(message.nextStatus, sender.tab.id);
      break;
      
    case 'CLEANUP':
      handleCleanup();
      break;
      
    default:
      console.warn('[Background] Onbekende actie:', message.action);
  }
  
  return true; // Async response support
});

// ============================================
// START REPOST PROCESS
// Initialiseert een nieuwe herplaatsing-workflow
// ============================================
async function handleStartRepost(adUrl, tabId) {
  console.log('[Background] Start herplaatsing voor:', adUrl);
  
  // Initialiseer de repost job in storage
  const repostJob = {
    status: STATUS.SCRAPING_DETAILS,
    adUrl: adUrl,
    adData: null,
    imageData_base64: [],
    tabId: tabId,
    startTime: Date.now()
  };
  
  await chrome.storage.local.set({ repostJob });
  
  // Navigeer naar de advertentie detailpagina
  chrome.tabs.update(tabId, { url: adUrl });
}

// ============================================
// DATA SCRAPED
// Verwerkt gescrapete advertentiegegevens en download afbeeldingen
// ============================================
async function handleDataScraped(adData, tabId) {
  console.log('[Background] Data ontvangen, start afbeeldingen downloaden');
  console.log('[Background] Advertentietitel:', adData.title);
  console.log('[Background] Aantal afbeeldingen:', adData.imageUrls?.length || 0);
  
  try {
    // Download en converteer alle afbeeldingen naar Base64
    const imageData_base64 = await downloadAndConvertImages(adData.imageUrls || []);
    
    // Update de repost job met de data en afbeeldingen
    const { repostJob } = await chrome.storage.local.get('repostJob');
    repostJob.adData = adData;
    repostJob.imageData_base64 = imageData_base64;
    repostJob.status = STATUS.PENDING_DELETE;
    
    await chrome.storage.local.set({ repostJob });
    
    console.log('[Background] Data opgeslagen, navigeer naar verwijder-pagina');
    
    // Navigeer naar de verwijder-pagina
    // Hypothetische URL - pas aan naar de werkelijke Marktplaats structuur
    const deleteUrl = adData.deleteUrl || `${adData.adUrl}/verwijderen`;
    chrome.tabs.update(tabId, { url: deleteUrl });
    
  } catch (error) {
    console.error('[Background] Fout bij verwerken data:', error);
    await handleError('Fout bij downloaden afbeeldingen');
  }
}

// ============================================
// DOWNLOAD EN CONVERTEER AFBEELDINGEN
// Fetcht afbeeldingen en converteert ze naar Base64
// ============================================
async function downloadAndConvertImages(imageUrls) {
  console.log('[Background] Start downloaden van', imageUrls.length, 'afbeeldingen');
  const base64Images = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    console.log(`[Background] Download afbeelding ${i + 1}/${imageUrls.length}`);
    
    try {
      // Fetch de afbeelding
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Converteer blob naar Base64
      const base64 = await blobToBase64(blob);
      base64Images.push({
        url: url,
        base64: base64,
        type: blob.type,
        size: blob.size
      });
      
      console.log(`[Background] Afbeelding ${i + 1} geconverteerd (${blob.type}, ${Math.round(blob.size / 1024)}KB)`);
      
    } catch (error) {
      console.error(`[Background] Fout bij downloaden afbeelding ${url}:`, error);
      // Ga door met de volgende afbeelding
    }
  }
  
  console.log('[Background] Alle afbeeldingen gedownload:', base64Images.length);
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
// DELETE CONFIRMED
// Verwerkt bevestiging van verwijdering
// ============================================
async function handleDeleteConfirmed(tabId) {
  console.log('[Background] Verwijdering bevestigd, start nieuw plaatsen');
  
  const { repostJob } = await chrome.storage.local.get('repostJob');
  repostJob.status = STATUS.POSTING_STEP_1_DETAILS;
  await chrome.storage.local.set({ repostJob });
  
  // Navigeer naar het plaats-advertentie formulier
  chrome.tabs.update(tabId, { url: 'https://www.marktplaats.nl/v/plaats-advertentie' });
}

// ============================================
// STEP COMPLETED
// Verwerkt voltooiing van een formulier-stap
// ============================================
async function handleStepCompleted(nextStatus, tabId) {
  console.log('[Background] Stap voltooid, update naar:', nextStatus);
  
  const { repostJob } = await chrome.storage.local.get('repostJob');
  repostJob.status = nextStatus;
  await chrome.storage.local.set({ repostJob });
}

// ============================================
// CLEANUP
// Ruimt de repost job op na voltooiing
// ============================================
async function handleCleanup() {
  console.log('[Background] Cleanup: verwijder repost job');
  
  await chrome.storage.local.remove('repostJob');
  console.log('[Background] Herplaatsing voltooid!');
}

// ============================================
// ERROR HANDLER
// Behandelt fouten en reset de state
// ============================================
async function handleError(errorMessage) {
  console.error('[Background] ERROR:', errorMessage);
  
  // Optioneel: bewaar de fout in storage voor debugging
  const { repostJob } = await chrome.storage.local.get('repostJob');
  if (repostJob) {
    repostJob.error = errorMessage;
    repostJob.status = 'ERROR';
    await chrome.storage.local.set({ repostJob });
  }
}

// ============================================
// TAB UPDATE LISTENER
// Monitort pagina-navigatie voor state machine management
// ============================================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Alleen reageren op complete page loads
  if (changeInfo.status !== 'complete') return;
  
  // Check of er een actieve repost job is
  const { repostJob } = await chrome.storage.local.get('repostJob');
  if (!repostJob || repostJob.tabId !== tabId) return;
  
  const currentUrl = tab.url || '';
  console.log('[Background] Pagina geladen:', currentUrl, 'Status:', repostJob.status);
  
  // State machine navigatie logica
  // Deze listener zorgt ervoor dat de juiste acties worden uitgevoerd
  // na elke pagina-navigatie, afhankelijk van de huidige status
  
  // Voorbeeld: Als we wachten op verwijdering en de URL bevat 'verwijderd' of 'success'
  if (repostJob.status === STATUS.PENDING_DELETE && 
      (currentUrl.includes('verwijderd') || currentUrl.includes('success'))) {
    console.log('[Background] Verwijdering succesvol, start plaatsen');
    await handleDeleteConfirmed(tabId);
  }
});