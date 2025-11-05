// Haal huidige status op bij laden
chrome.storage.local.get(['extensionEnabled'], (result) => {
  const isEnabled = result.extensionEnabled !== false; // Default = true
  
  // Update UI
  document.getElementById('toggleExtension').checked = isEnabled;
  updateStatus(isEnabled);
});

// Luister naar toggle changes
document.getElementById('toggleExtension').addEventListener('change', (e) => {
  const isEnabled = e.target.checked;
  
  // Sla op in storage
  chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
    updateStatus(isEnabled);
    
    // Stuur bericht naar background
    chrome.runtime.sendMessage({
      action: 'EXTENSION_TOGGLED',
      enabled: isEnabled
    });
    
    // Herlaad alle Marktplaats tabs
    chrome.tabs.query({ url: '*://*.marktplaats.nl/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.reload(tab.id);
      });
    });
  });
});

function updateStatus(isEnabled) {
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  
  if (isEnabled) {
    statusDiv.className = 'status active';
    statusText.textContent = '✅ Actief';
  } else {
    statusDiv.className = 'status inactive';
    statusText.textContent = '❌ Uitgeschakeld';
  }
}
