console.log("[Grammar Addon] Serverloses Analyse-Script ist bereit.");

// Globaler Speicher für geminte Karten im aktuellen Tab Session-Scope
let minedItems = [];
// Globaler Speicher für die statistische und chronologische Auswertung
let analysisMatches = [];
let uniqueIdCounter = 0;

// Empfange das Aktivierungssignal aus dem Kontextmenü
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeSelection") {
    console.log("[Grammar Addon] Starte Analyse...");
    processPage(); 
  }
});

// Hilfsfunktion: Holt alle unberührten, reinen Textknoten (optional innerhalb einer Selektion)
function getAllTextNodes(container, targetRange = null) {
  const textNodes = [];
  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      const parent = node.parentNode;
      if (!parent) return NodeFilter.FILTER_REJECT;
      
      const tagName = parent.tagName.toUpperCase();
      if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      
      if (parent.classList.contains('grammar-match-highlight') || parent.closest('.grammar-match-highlight')) {
        return NodeFilter.FILTER_REJECT;
      }
      
      if (targetRange && !targetRange.intersectsNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walk.nextNode()) {
    textNodes.push(walk.currentNode);
  }
  return textNodes;
}

// Extrahiert den Satzkontext: Löscht HTML-Elemente, behält den Reintext und fettet das Zielwort via <b>
function extractSentenceContext(span) {
  const container = span.closest('p, div, li, td, section, article') || span.parentNode;
  let textBefore = "";
  let textAfter = "";
  let foundTarget = false;

  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentNode;
  
  while (currentNode = walk.nextNode()) {
    if (currentNode.parentNode === span || span.contains(currentNode)) {
      foundTarget = true;
      continue;
    }
    if (!foundTarget) {
      textBefore += currentNode.nodeValue;
    } else {
      textAfter += currentNode.nodeValue;
    }
  }

  const cleanBefore = textBefore.replace(/\s+/g, ' ');
  const cleanAfter = textAfter.replace(/\s+/g, ' ');
  const targetWord = span.textContent.strip ? span.textContent.strip() : span.textContent;

  return `${cleanBefore}<b>${targetWord}</b>${cleanAfter}`.trim();
}

// Hauptprozess der Analyse
async function processPage() {
  try {
    const patternsUrl = chrome.runtime.getURL('data/patterns_data.json');
    const grammarUrl = chrome.runtime.getURL('data/grammar_data.json');

    const [patternsRes, grammarRes, storage] = await Promise.all([
      fetch(patternsUrl),
      fetch(grammarUrl),
      chrome.storage.local.get(['selectedNids'])
    ]);

    const sortedPatterns = await patternsRes.json();
    const grammarData = await grammarRes.json();
    const selectedNids = storage.selectedNids || [];

    const selection = window.getSelection();
    let targetRange = null;
    if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
      targetRange = selection.getRangeAt(0).cloneRange();
    }

    console.log(`[Grammar Addon] Starte optimierte In-Memory Analyse mit ${sortedPatterns.length} Patterns...`);

    const textNodes = getAllTextNodes(document.body, targetRange);
    
    let totalTextLength = 0;
    const nodeEntries = textNodes.map(node => {
      const startOffsetInTotal = totalTextLength;
      totalTextLength += node.nodeValue.length;
      return {
        node: node,
        text: node.nodeValue,
        startOffsetInTotal: startOffsetInTotal,
        matches: []
      };
    });

    function isOverlapping(start, end, existingMatches) {
      for (const m of existingMatches) {
        if (start < m.end && end > m.start) {
          return true;
        }
      }
      return false;
    }

    for (const pObj of sortedPatterns) {
      const activeNids = pObj.nids.filter(nid => selectedNids.includes(String(nid)));
      if (activeNids.length === 0) continue;

      let regex;
      try {
        regex = new RegExp(pObj.pattern, 'g');
      } catch (e) {
        console.error("[Grammar Addon] Fehlerhafte Regex übersprungen:", pObj.pattern, e);
        continue;
      }

      const nidsString = activeNids.join(',');

      for (const entry of nodeEntries) {
        let match;
        regex.lastIndex = 0;

        if (!regex.test(entry.text)) continue;
        regex.lastIndex = 0;

        while ((match = regex.exec(entry.text)) !== null) {
          const start = match.index;
          const end = regex.lastIndex;

          if (!isOverlapping(start, end, entry.matches)) {
            entry.matches.push({
              start,
              end,
              text: match[0],
              nidsString
            });
          }

          if (match[0].length === 0) regex.lastIndex++;
        }
      }
    }

    let localNewMatchesCount = 0;

    for (const entry of nodeEntries) {
      if (entry.matches.length === 0) continue;

      entry.matches.sort((a, b) => a.start - b.start);

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;

      for (const m of entry.matches) {
        if (m.start > lastIdx) {
          fragment.appendChild(document.createTextNode(entry.text.substring(lastIdx, m.start)));
        }

        uniqueIdCounter++;
        const uniqueMatchId = `grammar-match-${uniqueIdCounter}`;

        const span = document.createElement('span');
        span.id = uniqueMatchId;
        span.className = 'grammar-match-highlight';
        span.setAttribute('data-nids', m.nidsString);
        span.textContent = m.text;

        span.style.backgroundColor = '#ffeaa7';
        span.style.color = '#2d3436';
        span.style.padding = '2px 4px';
        span.style.borderRadius = '4px';
        span.style.cursor = 'pointer';
        span.style.fontWeight = '500';
        span.style.transition = 'background-color 0.2s';

        span.addEventListener('mouseenter', () => span.style.backgroundColor = '#fdcb6e');
        span.addEventListener('mouseleave', () => span.style.backgroundColor = '#ffeaa7');

        fragment.appendChild(span);

        const absoluteCharPos = entry.startOffsetInTotal + m.start;
        const relativePercentage = totalTextLength > 0 ? ((absoluteCharPos / totalTextLength) * 100).toFixed(2) : "0.00";

        const firstNid = m.nidsString.split(',')[0];
        const gInfo = grammarData[firstNid];
        const grammarName = gInfo ? (gInfo.level_and_point || gInfo.Level_And_Grammar_Point || 'Unbekannt') : 'Unbekannt';

        analysisMatches.push({
          elementId: uniqueMatchId,
          text: m.text,
          grammarName: grammarName,
          percentage: relativePercentage,
          absolutePos: absoluteCharPos
        });

        lastIdx = m.end;
        localNewMatchesCount++;
      }

      if (lastIdx < entry.text.length) {
        fragment.appendChild(document.createTextNode(entry.text.substring(lastIdx)));
      }

      const parent = entry.node.parentNode;
      if (parent) {
        parent.insertBefore(fragment, entry.node);
        parent.removeChild(entry.node);
      }
    }

    analysisMatches.sort((a, b) => a.absolutePos - b.absolutePos);

    attachPopupEvents(grammarData);

    const greenHub = document.getElementById('grammar-miner-hub');
    if (!greenHub) {
      setupFloatingHub();
    } else {
      updateFloatingHubState();
      const shadow = greenHub.shadowRoot;
      const panel = shadow.getElementById('miner-panel');
      if (panel && panel.style.display === 'flex') {
        const activeBtn = shadow.querySelector('.tab-btn.active');
        let tab = "single";
        if (activeBtn && activeBtn.id === 'btn-tab-update') tab = "update";
        renderMinerTable(shadow, tab);
      }
    }

    const blueHub = document.getElementById('grammar-stats-hub');
    if (!blueHub) {
      setupStatsHub();
    } else {
      adjustBlueHubPosition();
      const shadow = blueHub.shadowRoot;
      const panel = shadow.getElementById('stats-panel');
      if (panel && panel.style.display === 'flex') {
        const activeBtn = shadow.querySelector('.tab-btn.active');
        let tab = "freq";
        if (activeBtn) {
          if (activeBtn.id === 'btn-tab-chrono') tab = "chrono";
          if (activeBtn.id === 'btn-tab-sorted') tab = "sorted";
        }
        renderStatsTable(shadow, tab);
      }
    }

    console.log(`[Grammar Addon] Analyse beendet. ${localNewMatchesCount} neue Treffer hinzugefügt.`);

  } catch (error) {
    console.error("[Grammar Addon] Kritischer Fehler bei der Analyse:", error);
  }
}

function attachPopupEvents(grammarData) {
  document.querySelectorAll('.grammar-match-highlight:not(.has-popup-event)').forEach(span => {
    span.classList.add('has-popup-event');
    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const nids = span.getAttribute('data-nids').split(',');
      showModalPopup(nids, grammarData, span);
    });
  });
}

function setupFloatingHub() {
  if (document.getElementById('grammar-miner-hub')) return;

  const hub = document.createElement('div');
  hub.id = 'grammar-miner-hub';
  
  hub.style.position = 'fixed';
  hub.style.top = '20px';
  hub.style.right = '20px';
  hub.style.width = '20px';
  hub.style.height = '20px';
  hub.style.backgroundColor = '#27ae60';
  hub.style.borderRadius = '4px';
  hub.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  hub.style.zIndex = '9999999a';
  hub.style.cursor = 'pointer';
  hub.style.transition = 'transform 0.1s, width 0.2s, height 0.2s';
  hub.style.display = 'block';

  const shadow = hub.attachShadow({ mode: 'open' });
  
  const style = document.createElement('style');
  style.textContent = `
    .badge { position: absolute; top: -8px; left: -8px; background: #e74c3c; color: white; font-size: 10px; font-weight: bold; border-radius: 50%; padding: 2px 5px; min-width: 10px; text-align: center; }
    .panel-container { display: none; width: 100%; height: 100%; flex-direction: column; background: #dfe6e9; box-sizing: border-box; font-family: sans-serif; color: #2d3436; }
    .panel-header { background: #27ae60; color: white; padding: 6px 10px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; cursor: move; font-size: 13px; }
    .tab-bar { display: flex; background: #b2bec3; gap: 2px; padding: 2px 2px 0 2px; }
    .tab-btn { border: none; background: #f8f9fa; padding: 6px 12px; cursor: pointer; font-weight: bold; font-size: 12px; border-radius: 4px 4px 0 0; }
    .tab-btn.active { background: white; color: #27ae60; }
    .table-wrapper { flex: 1; overflow: auto; padding: 6px; background: white; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f2f6; border: 1px solid #ced6e0; padding: 6px; text-align: left; position: sticky; top: 0; }
    td { border: 1px solid #ced6e0; padding: 6px; white-space: pre-wrap; word-break: break-all; }
    td[contenteditable="true"]:focus { outline: 2px solid #27ae60; background: #f5f6fa; }
    .footer-actions { padding: 6px; background: #f1f2f6; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #ced6e0; }
    .action-btn { background: #27ae60; color: white; border: none; padding: 5px 12px; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .action-btn:hover { background: #219653; }
    .close-panel-btn { background: none; border: none; color: white; font-size: 16px; cursor: pointer; }
  `;
  shadow.appendChild(style);

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.id = 'miner-badge';
  badge.textContent = minedItems.length;
  shadow.appendChild(badge);

  const container = document.createElement('div');
  container.className = 'panel-container';
  container.id = 'miner-panel';

  container.innerHTML = `
    <div class="panel-header">
      <span>Anki Mining Hub</span>
      <button class="close-panel-btn">✕</button>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" id="btn-tab-single">Einzelkarten</button>
      <button class="tab-btn" id="btn-tab-update">Grammar Updates</button>
    </div>
    <div class="table-wrapper">
      <table id="miner-table">
        <thead id="miner-thead"></thead>
        <tbody id="miner-tbody"></tbody>
      </table>
    </div>
    <div class="footer-actions">
      <button class="action-btn" id="btn-export">TSV Exportieren</button>
    </div>
  `;
  shadow.appendChild(container);

  document.body.appendChild(hub);

  let currentTab = "single";

  hub.addEventListener('click', (e) => {
    if (hub.style.width === '20px') {
      e.stopPropagation();
      hub.style.width = '650px';
      hub.style.height = '420px';
      hub.style.cursor = 'default';
      hub.style.resize = 'both';
      hub.style.overflow = 'hidden';
      badge.style.display = 'none';
      container.style.display = 'flex';
      renderMinerTable(shadow, currentTab);
    }
  });

  shadow.querySelector('.close-panel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    hub.style.width = '20px';
    hub.style.height = '20px';
    hub.style.cursor = 'pointer';
    hub.style.resize = 'none';
    hub.style.overflow = 'hidden';
    badge.style.display = 'block';
    container.style.display = 'none';
  });

  shadow.querySelector('#btn-tab-single').addEventListener('click', () => {
    currentTab = "single";
    shadow.querySelector('#btn-tab-single').classList.add('active');
    shadow.querySelector('#btn-tab-update').classList.remove('active');
    renderMinerTable(shadow, currentTab);
  });

  shadow.querySelector('#btn-tab-update').addEventListener('click', () => {
    currentTab = "update";
    shadow.querySelector('#btn-tab-update').classList.add('active');
    shadow.querySelector('#btn-tab-single').classList.remove('active');
    renderMinerTable(shadow, currentTab);
  });

  shadow.querySelector('#btn-export').addEventListener('click', () => {
    triggerTSVExport(shadow, currentTab);
  });

  let isDragging = false;
  let offsetX, offsetY;
  const header = shadow.querySelector('.panel-header');

  header.addEventListener('mousedown', (e) => {
    if (e.target.className === 'close-panel-btn') return;
    isDragging = true;
    const rect = hub.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    hub.style.right = 'auto';
    hub.style.left = (e.clientX - offsetX) + 'px';
    hub.style.top = (e.clientY - offsetY) + 'px';
    adjustBlueHubPosition();
  });

  window.addEventListener('mouseup', () => { isDragging = false; });
}

function adjustBlueHubPosition() {
  const greenHub = document.getElementById('grammar-miner-hub');
  const yellowHub = document.getElementById('grammar-stats-hub'); // Strukturell das alte blueHub, farblich jetzt gelb
  
  if (greenHub && yellowHub && yellowHub.style.width === '20px') {
    const greenRect = greenHub.getBoundingClientRect();
    yellowHub.style.left = greenHub.style.left;
    if (greenHub.style.right && greenHub.style.right !== 'auto') {
      yellowHub.style.right = greenHub.style.right;
      yellowHub.style.left = 'auto';
    } else {
      yellowHub.style.right = 'auto';
    }
    yellowHub.style.top = (greenRect.bottom + 10) + 'px';
  }

  // GEÄNDERT/ERWEITERT: Positioniert das neue blaue Viereck des Regexfinders kaskadierend unter dem gelben Hub
  const regexHub = document.getElementById('regex-stats-hub');
  if (regexHub && regexHub.style.width === '20px') {
    const referenceHub = yellowHub || greenHub;
    if (referenceHub) {
      const refRect = referenceHub.getBoundingClientRect();
      regexHub.style.left = referenceHub.style.left;
      if (referenceHub.style.right && referenceHub.style.right !== 'auto') {
        regexHub.style.right = referenceHub.style.right;
        regexHub.style.left = 'auto';
      } else {
        regexHub.style.right = 'auto';
      }
      regexHub.style.top = (refRect.bottom + 10) + 'px';
    }
  }
}

function updateFloatingHubState() {
  const hub = document.getElementById('grammar-miner-hub');
  if (!hub) return;
  const badge = hub.shadowRoot.getElementById('miner-badge');
  if (badge) badge.textContent = minedItems.length;
  adjustBlueHubPosition();
}

function renderMinerTable(shadow, tab) {
  const thead = shadow.getElementById('miner-thead');
  const tbody = shadow.getElementById('miner-tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (tab === "single") {
    thead.innerHTML = `
      <tr>
        <th>Note ID</th>
        <th>Word</th>
        <th>SentencePlain</th>
        <th>English Defintion Overview</th>
        <th>Frequency</th>
        <th>Correct Japanese Definition</th>
      </tr>
    `;
    
    let tableHtml = "";
    minedItems.forEach((item, index) => {
      tableHtml += `
        <tr data-index="${index}">
          <td contenteditable="true">${item.nidindiv}</td>
          <td contenteditable="true">${item.match}</td>
          <td contenteditable="true">${item.sentence}</td>
          <td contenteditable="true">${item.level_and_point}</td>
          <td contenteditable="true">${item.construction}</td>
          <td contenteditable="true">${item.regexpattern}</td>
        </tr>
      `;
    });
    tbody.innerHTML = tableHtml;
  } else {
    thead.innerHTML = `
      <tr>
        <th style="width: 20%;">NID</th>
        <th style="width: 80%;">Gesammelte Sätze (mit ID)</th>
      </tr>
    `;
    const grouped = {};
    minedItems.forEach(item => {
      if (!grouped[item.nid]) grouped[item.nid] = [];
      grouped[item.nid].push(`${item.sentence} [${item.nidindiv}]`);
    });

    let tableHtml = "";
    Object.keys(grouped).forEach(nid => {
      const combinedSentences = grouped[nid].join('\n');
      tableHtml += `
        <tr data-nid="${nid}">
          <td contenteditable="true">${nid}</td>
          <td contenteditable="true">${combinedSentences}</td>
        </tr>
      `;
    });
    tbody.innerHTML = tableHtml;
  }
}

function triggerTSVExport(shadow, tab) {
  let outputText = "";
  let filename = "";

  const escapeTSVField = (text) => {
    if (!text) return '""';
    let escaped = String(text).replace(/"/g, '""');
    return `"${escaped}"`;
  };

  if (tab === "single") {
    filename = "anki_individual_cards.tsv";
    outputText = ["Note ID", "Word", "SentencePlain", "English Defintion Overview", "Frequency", "Correct Japanese Definition"].join('\t') + '\n';
    
    minedItems.forEach(item => {
      const rowData = [
        escapeTSVField(item.nidindiv),
        escapeTSVField(item.match),
        escapeTSVField(item.sentence),
        escapeTSVField(item.level_and_point),
        escapeTSVField(item.construction),
        escapeTSVField(item.regexpattern)
      ];
      outputText += rowData.join('\t') + '\n';
    });
  } else {
    filename = "anki_grammar_updates.tsv";
    outputText = ["nid", "collected_sentences"].join('\t') + '\n';
    
    const grouped = {};
    minedItems.forEach(item => {
      if (!grouped[item.nid]) grouped[item.nid] = [];
      grouped[item.nid].push(`${item.sentence} [${item.nidindiv}]`);
    });

    Object.keys(grouped).forEach(nid => {
      const combinedSentences = grouped[nid].join('<br>');
      outputText += `${nid}\t${escapeTSVField(combinedSentences)}\n`;
    });
  }

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), outputText], { type: 'text/tab-separated-values;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setupStatsHub() {
  if (document.getElementById('grammar-stats-hub')) {
    adjustBlueHubPosition();
    return;
  }

  const hub = document.createElement('div');
  hub.id = 'grammar-stats-hub';
  
  hub.style.position = 'fixed';
  hub.style.width = '20px';
  hub.style.height = '20px';
  hub.style.backgroundColor = '#f1c40f'; // GEÄNDERT: Von Blau (#2980b9) zu Gelb
  hub.style.borderRadius = '4px';
  hub.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  hub.style.zIndex = '9999999b'; 
  hub.style.cursor = 'pointer';
  hub.style.transition = 'width 0.2s, height 0.2s';
  hub.style.display = 'block'; 

  const greenHub = document.getElementById('grammar-miner-hub');
  if (greenHub) {
    const greenRect = greenHub.getBoundingClientRect();
    hub.style.top = (greenRect.bottom + 10) + 'px';
    hub.style.right = '20px';
  } else {
    hub.style.top = '50px';
    hub.style.right = '20px';
  }

  const shadow = hub.attachShadow({ mode: 'open' });
  
  const style = document.createElement('style');
  // GEÄNDERT: Farbschemata im Stylesheet auf Gelb/Gold angepasst, um optimale Lesbarkeit zu gewährleisten
  style.textContent = `
    .panel-container { display: none; width: 100%; height: 100%; flex-direction: column; background: #dfe6e9; box-sizing: border-box; font-family: sans-serif; color: #2d3436; }
    .panel-header { background: #f1c40f; color: #2d3436; padding: 6px 10px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .tab-bar { display: flex; background: #b2bec3; gap: 2px; padding: 2px 2px 0 2px; }
    .tab-btn { border: none; background: #f8f9fa; padding: 6px 12px; cursor: pointer; font-weight: bold; font-size: 12px; border-radius: 4px 4px 0 0; }
    .tab-btn.active { background: white; color: #b7950b; }
    .table-wrapper { flex: 1; overflow: auto; padding: 6px; background: white; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f2f6; border: 1px solid #ced6e0; padding: 6px; text-align: left; position: sticky; top: 0; }
    td { border: 1px solid #ced6e0; padding: 6px; white-space: pre-wrap; word-break: break-all; }
    .jump-link { color: #b7950b; text-decoration: underline; cursor: pointer; font-weight: bold; }
    .jump-link:hover { color: #7d6608; }
    .close-panel-btn { background: none; border: none; color: #2d3436; font-size: 16px; cursor: pointer; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'panel-container';
  container.id = 'stats-panel';

  container.innerHTML = `
    <div class="panel-header">
      <span>Grammatik Analyse & Navigation</span>
      <button class="close-panel-btn">✕</button>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" id="btn-tab-freq">Häufigkeit</button>
      <button class="tab-btn" id="btn-tab-chrono">Chronologisch</button>
      <button class="tab-btn" id="btn-tab-sorted">Sortiert</button>
    </div>
    <div class="table-wrapper">
      <table id="stats-table">
        <thead id="stats-thead"></thead>
        <tbody id="stats-tbody"></tbody>
      </table>
    </div>
  `;
  shadow.appendChild(container);
  document.body.appendChild(hub);

  let currentTab = "freq";

  hub.addEventListener('click', (e) => {
    if (hub.style.width === '20px') {
      e.stopPropagation();
      hub.style.width = '550px';
      hub.style.height = '380px';
      hub.style.cursor = 'default';
      hub.style.resize = 'both';
      hub.style.overflow = 'hidden';
      container.style.display = 'flex';
      renderStatsTable(shadow, currentTab);
    }
  });

  shadow.querySelector('.close-panel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    collapseBlueHub(hub, container);
  });

  shadow.querySelector('#btn-tab-freq').addEventListener('click', (e) => {
    e.stopPropagation(); currentTab = "freq";
    setActiveTabStyle(shadow, '#btn-tab-freq');
    renderStatsTable(shadow, currentTab);
  });

  shadow.querySelector('#btn-tab-chrono').addEventListener('click', (e) => {
    e.stopPropagation(); currentTab = "chrono";
    setActiveTabStyle(shadow, '#btn-tab-chrono');
    renderStatsTable(shadow, currentTab);
  });

  shadow.querySelector('#btn-tab-sorted').addEventListener('click', (e) => {
    e.stopPropagation(); currentTab = "sorted";
    setActiveTabStyle(shadow, '#btn-tab-sorted');
    renderStatsTable(shadow, currentTab);
  });
}

function collapseBlueHub(hub, container) {
  hub.style.width = '20px';
  hub.style.height = '20px';
  hub.style.cursor = 'pointer';
  hub.style.resize = 'none';
  hub.style.overflow = 'hidden';
  container.style.display = 'none';
  adjustBlueHubPosition();
}

function setActiveTabStyle(shadow, activeId) {
  shadow.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  shadow.querySelector(activeId).classList.add('active');
}

function renderStatsTable(shadow, tab) {
  const thead = shadow.getElementById('stats-thead');
  const tbody = shadow.getElementById('stats-tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (tab === "freq") {
    thead.innerHTML = `
      <tr>
        <th style="width: 70%;">Grammatik ("Level And Grammar Point")</th>
        <th style="width: 30%;">Anzahl Treffer</th>
      </tr>
    `;
    
    const counts = {};
    analysisMatches.forEach(m => {
      counts[m.grammarName] = (counts[m.grammarName] || 0) + 1;
    });

    const sortedFreq = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sortedFreq.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#7f8c8d;">Keine Treffer analysiert.</td></tr>`;
      return;
    }

    let statsHtml = "";
    sortedFreq.forEach(([name, count]) => {
      statsHtml += `<tr><td>${name}</td><td><b>${count}x</b></td></tr>`;
    });
    tbody.innerHTML = statsHtml;

  } else if (tab === "chrono") {
    thead.innerHTML = `
      <tr>
        <th style="width: 30%;">Match (Sprungmarke)</th>
        <th style="width: 50%;">Grammatik Punkt</th>
        <th style="width: 20%;">Position</th>
      </tr>
    `;

    if (analysisMatches.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#7f8c8d;">Keine Matches vorhanden.</td></tr>`;
      return;
    }

    let statsHtml = "";
    analysisMatches.forEach(m => {
      statsHtml += `
        <tr>
          <td><span class="jump-link" data-target="${m.elementId}">${m.text}</span></td>
          <td>${m.grammarName}</td>
          <td>${m.percentage}%</td>
        </tr>
      `;
    });
    tbody.innerHTML = statsHtml;
    attachJumpLinks(tbody);

  } else if (tab === "sorted") {
    thead.innerHTML = `
      <tr>
        <th style="width: 40%;">Match (Sprungmarke)</th>
        <th style="width: 60%;">Position im Text</th>
      </tr>
    `;

    const counts = {};
    analysisMatches.forEach(m => {
      counts[m.grammarName] = (counts[m.grammarName] || 0) + 1;
    });
    const sortedGrammarNames = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    if (sortedGrammarNames.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#7f8c8d;">Keine Matches vorhanden.</td></tr>`;
      return;
    }

    let statsHtml = "";
    sortedGrammarNames.forEach(gName => {
      statsHtml += `<tr><td colspan="2" style="background: #e1b12c; color: white; font-weight: bold; padding: 4px 8px;">${gName} (${counts[gName]}x)</td></tr>`;
      const groupMatches = analysisMatches.filter(m => m.grammarName === gName);
      
      groupMatches.forEach(m => {
        statsHtml += `
          <tr>
            <td><span class="jump-link" data-target="${m.elementId}">${m.text}</span></td>
            <td>${m.percentage}%</td>
          </tr>
        `;
      });
    });
    tbody.innerHTML = statsHtml;
    attachJumpLinks(tbody);
  }
}

function attachJumpLinks(tbody) {
  tbody.querySelectorAll('.jump-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = link.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalBg = targetEl.style.backgroundColor;
        targetEl.style.backgroundColor = '#9b59b6';
        targetEl.style.color = '#ffffff';
        setTimeout(() => {
          targetEl.style.backgroundColor = originalBg;
          targetEl.style.color = '#2d3436';
        }, 1000);
      }
    });
  });
}

function showModalPopup(nids, grammarData, clickedSpan) {
  const existingModal = document.getElementById('grammar-analysis-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'grammar-analysis-modal';
  modal.style.position = 'fixed';
  modal.style.top = '100px';
  modal.style.right = '20px';
  modal.style.width = '320px';          
  modal.style.height = '350px';         
  modal.style.minWidth = '250px';       
  modal.style.minHeight = '200px';      
  modal.style.resize = 'both';          
  modal.style.overflow = 'hidden';      
  modal.style.backgroundColor = '#dfe6e9';
  modal.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
  modal.style.borderRadius = '10px';
  modal.style.zIndex = '99999999';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.fontFamily = 'sans-serif';

  const shadow = modal.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { --base-font-size: 14px; }
    .modal-container { display: flex; flex-direction: column; height: 100%; background: #dfe6e9; color: #2d3436; box-sizing: border-box; }
    .drag-handle { background: #0984e3; color: #ffffff; padding: 8px 12px; cursor: move; display: flex; justify-content: space-between; align-items: center; font-size: var(--base-font-size); font-weight: bold; flex-shrink: 0; }
    .close-btn { cursor: pointer; font-size: 18px; border: none; background: none; color: #ffffff; padding: 0; line-height: 1; }
    .modal-content-scroll { padding: 10px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; }
    .card-container { background-color: white; border-radius: 6px; width: 100%; padding: 12px; border: 1px solid #d1d8e0; box-sizing: border-box; position: relative; }
    .grammar-header-wrapper { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; gap: 8px; }
    .grammar-header { font-size: var(--base-font-size); font-weight: bold; color: #0984e3; text-align: left; }
    .add-anki-btn { background: #27ae60; color: white; border: none; padding: 3px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; transition: background 0.1s; flex-shrink: 0; }
    .add-anki-btn:hover { background: #219653; }
    .tags-badge { font-size: 11px; color: #636e72; margin-bottom: 8px; display: block; }
    .separator { border: none; height: 1px; background: #eee; margin: 8px 0; }
    .content-section { margin-bottom: 10px; }
    .label { font-size: var(--base-font-size); font-weight: bold; color: #b2bec3; margin-bottom: 2px; }
    .text-content { font-size: var(--base-font-size); color: #2d3436; line-height: 1.4; word-break: break-word; white-space: pre-line; }
    .box-style { background: #f8f9fa; padding: 6px; border-radius: 4px; border-left: 3px solid #0984e3; }
    .link-box a { font-size: var(--base-font-size); color: #0984e3; text-decoration: none; font-weight: bold; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'modal-container';

  const header = document.createElement('div');
  header.className = 'drag-handle';
  header.innerHTML = `<span>Match (${nids.length})</span><button class="close-btn">✕</button>`;
  container.appendChild(header);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'modal-content-scroll';

  nids.forEach(nid => {
    const g = grammarData[nid];
    if (!g) return;

    const card = document.createElement('div');
    card.className = 'card-container';
    card.innerHTML = `
      <div class="grammar-header-wrapper">
        <div class="grammar-header">${g.level_and_point || g.Level_And_Grammar_Point || ''}</div>
        <button class="add-anki-btn" data-nid="${nid}">+ Anki</button>
      </div>
      <span class="tags-badge">${g.tags || ''}</span>
      <hr class="separator">
      
      <div class="content-section">
        <div class="label">Construction</div>
        <div class="text-content">${g.construction || ''}</div>
      </div>
      
      <div class="content-section">
        <div class="label">Examples</div>
        <div class="text-content box-style">${g.examplesentences || ''}</div>
      </div>
      
      <div class="content-section">
        <div class="link-box">
          <a href="${g.link || g.Link || '#'}" target="_blank">→ JLPT Sensei</a>
        </div>
      </div>

      <div class="content-section">
        <div class="label">Regexpatterns</div>
        <div class="text-content">${g.regexpattern || ''}</div>
      </div>
    `;

    card.querySelector('.add-anki-btn').addEventListener('click', (e) => {
      const targetNid = e.target.getAttribute('data-nid');
      const targetGrammar = grammarData[targetNid];
      
      if (targetGrammar) {
        const sentenceContext = extractSentenceContext(clickedSpan);
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const newMinedItem = {
          nidindiv: `${targetNid}-${randomSuffix}`,
          nid: targetNid,
          match: clickedSpan.textContent.trim(),
          sentence: sentenceContext,
          level_and_point: targetGrammar.level_and_point || targetGrammar.Level_And_Grammar_Point || '',
          construction: targetGrammar.construction || '',
          regexpattern: targetGrammar.regexpattern || ''
        };

        minedItems.push(newMinedItem);
        updateFloatingHubState();
        
        e.target.textContent = "✓ Geadded";
        e.target.style.backgroundColor = "#219653";
        setTimeout(() => {
          e.target.textContent = "+ Anki";
          e.target.style.backgroundColor = "#27ae60";
        }, 1500);
      }
    });

    scrollArea.appendChild(card);
  });

  container.appendChild(scrollArea);
  shadow.appendChild(container);

  header.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);

  let isDragging = false;
  let offsetX, offsetY;
  header.addEventListener('mousedown', (e) => {
    if (e.target.className === 'close-btn') return;
    isDragging = true;
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modal.style.right = 'auto';
    modal.style.left = (e.clientX - offsetX) + 'px';
    modal.style.top = (e.clientY - offsetY) + 'px';
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
}