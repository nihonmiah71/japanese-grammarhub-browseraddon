chrome.runtime.onInstalled.addListener(() => {
  // Verhindert Duplicate-ID-Fehler durch vorheriges Löschen
  chrome.contextMenus.remove("analyzeGrammarSelection", () => {
    if (chrome.runtime.lastError) {
      // Ignorieren, falls das Item beim allerersten Start fehlt
    }
    
    chrome.contextMenus.create({
      id: "analyzeGrammarSelection",
      title: "Start Japanese Grammar Analysis",
      contexts: ["page", "selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeGrammarSelection") {
    // Sendet das Aktivierungssignal an die content.js auf der aktuellen Seite
    chrome.tabs.sendMessage(tab.id, { 
      action: "analyzeSelection"
    });
  }
});