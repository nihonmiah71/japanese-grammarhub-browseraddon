document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('grammar-container');
  
  try {
    // 🚀 ÄNDERUNG: Wir laden die Daten jetzt direkt aus dem lokalen Add-on-Ordner statt vom Server!
    const localGrammarUrl = chrome.runtime.getURL('data/grammar_data.json');
    const response = await fetch(localGrammarUrl);
    const grammarMap = await response.json();
    
    // Da grammar_data.json ein Objekt/Dictionary {nid: {daten}} ist,
    // wandeln wir es für die Schleife kurz in ein Array um
    const grammarData = Object.values(grammarMap);
    
    // Daten nach Level (N5 bis N1) sortieren/gruppieren & Tags sammeln
    const levels = { 'N5': [], 'N4': [], 'N3': [], 'N2': [], 'N1': [], 'Unbekannt': [] };
    const allTagsMap = new Set(); // Speichert alle einzigartigen Tags
    
    grammarData.forEach(item => {
      if (!item) return; // Überspringe leere Einträge, falls vorhanden
      
      // Die Tags aus dem Item holen (entweder als Array oder als String)
      let itemTags = item.tags || '';
      if (Array.isArray(itemTags)) {
        itemTags = itemTags.join(' ');
      }
      
      // Extrahiere die einzelnen Tags für die UI-Buttons und die Zuordnung
      const currentItemTagsList = [];
      if (typeof itemTags === 'string') {
        itemTags.split(/[\s,]+/).forEach(t => {
          const cleanTag = t.trim();
          if (cleanTag) {
            allTagsMap.add(cleanTag);
            // WICHTIG: Wir behalten die exakte Schreibweise für Eure Tags bei,
            // packen aber eine Kopie für den sicheren Abgleich in die Liste
            currentItemTagsList.push(cleanTag);
          }
        });
      }

      // EURE ABSOLUTE, UNFEHLBARE LOGIK:
      // Wir prüfen AUSSCHLIESSLICH, ob genau dieses exakte Tag in der Liste existiert!
      // Keine Namens-Prüfung mehr! Nur die reinen, geladenen Tags bestimmen das Level!
      if (currentItemTagsList.includes('N5') || currentItemTagsList.includes('n5')) {
        levels['N5'].push(item);
      } else if (currentItemTagsList.includes('N4') || currentItemTagsList.includes('n4')) {
        levels['N4'].push(item);
      } else if (currentItemTagsList.includes('N3') || currentItemTagsList.includes('n3')) {
        levels['N3'].push(item);
      } else if (currentItemTagsList.includes('N2') || currentItemTagsList.includes('n2')) {
        levels['N2'].push(item);
      } else if (currentItemTagsList.includes('N1') || currentItemTagsList.includes('n1')) {
        levels['N1'].push(item);
      } else {
        levels['Unbekannt'].push(item);
      }
    });

    container.innerHTML = '';

    // Geladene, bereits vorher gespeicherte Haken über ein sicheres Promise aus dem Storage abrufen
    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['selectedNids'], (result) => resolve(result || {}));
    });
    const savedNids = storage.selectedNids || [];

    // Für jedes Level ein visuelles Segment aufbauen
    ['N1', 'N2', 'N3', 'N4', 'N5', 'Unbekannt'].forEach(lvl => {
      if (levels[lvl].length === 0) return;

      // Sortiere die Punkte innerhalb des Levels alphabetisch
      levels[lvl].sort((a, b) => {
        const nameA = a['Level And Grammar Point'] || a.level_and_point || '';
        const nameB = b['Level And Grammar Point'] || b.level_and_point || '';
        return nameA.localeCompare(nameB, 'ja');
      });

      const groupDiv = document.createElement('div');
      groupDiv.className = 'group';
      groupDiv.innerHTML = `
        <h3>
          <span>Level ${lvl} (${levels[lvl].length} Punkte)</span>
          <div class="lvl-actions">
            <button class="select-lvl-all" data-lvl="${lvl}" style="padding:4px 8px; font-size:11px; background:#747d8c;">Alle ${lvl}</button>
            <button class="select-lvl-none" data-lvl="${lvl}" style="padding:4px 8px; font-size:11px; background:#747d8c;">Keine ${lvl}</button>
          </div>
        </h3>
        <div class="level-grid" id="grid-${lvl}"></div>
      `;
      container.appendChild(groupDiv);

      const grid = groupDiv.querySelector(`#grid-${lvl}`);
      levels[lvl].forEach(item => {
        const label = document.createElement('label');
        const nidStr = String(item.nid);
        // Prüfen, ob dieser Punkt vorher schon aktiviert war
        const isChecked = savedNids.includes(nidStr) ? 'checked' : '';
        
        // Tags für das Data-Attribut vorbereiten
        const itemTagsAttr = Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || '');

        label.innerHTML = `
          <input type="checkbox" class="grammar-cb" data-nid="${nidStr}" data-tags="${itemTagsAttr}" ${isChecked}>
          <span>${item['Level And Grammar Point'] || item.level_and_point}</span>
        `;
        grid.appendChild(label);
        // Minimalinvasiver Hover-Vorschau-Timer (1 Sekunde) für Eure Majestät
        let hoverTimeout;
        label.addEventListener('mouseenter', () => {
          hoverTimeout = setTimeout(() => {
            // Ruft die grandiose Vorschau mit der einzelnen NID auf
            showModalPopup([nidStr], grammarMap);
          }, 1000); // Exakt 1 Sekunde Verzögerung
        });
        
        label.addEventListener('mouseleave', () => {
          clearTimeout(hoverTimeout);
        });
      });
    });

    // Event-Listener für die Bereichs-Buttons (Alle auswählen / Abwählen pro Level)
    document.querySelectorAll('.select-lvl-all').forEach(btn => {
      btn.addEventListener('click', () => {
        const lvl = btn.getAttribute('data-lvl');
        document.querySelectorAll(`#grid-${lvl} .grammar-cb`).forEach(cb => cb.checked = true);
      });
    });
    document.querySelectorAll('.select-lvl-none').forEach(btn => {
      btn.addEventListener('click', () => {
        const lvl = btn.getAttribute('data-lvl');
        document.querySelectorAll(`#grid-${lvl} .grammar-cb`).forEach(cb => cb.checked = false);
      });
    });

// --- NEU: Tag-Buttons generieren ---
    const tagGrid = document.getElementById('tag-buttons-grid');
    Array.from(allTagsMap).sort().forEach(tag => {
      const tagBtn = document.createElement('button');
      tagBtn.textContent = tag;
      tagBtn.style.cssText = "padding: 6px 12px; font-size: 12px; background: #747d8c; border-radius: 4px;";
      tagBtn.dataset.active = "false";

      tagBtn.addEventListener('click', () => {
        // Toggle-Zustand des Buttons wechseln
        const isNowActive = tagBtn.dataset.active === "false";
        tagBtn.dataset.active = isNowActive ? "true" : "false";
        tagBtn.style.backgroundColor = isNowActive ? "#0984e3" : "#747d8c"; // Blau wenn aktiv

        // Das gesuchte Tag des Buttons in Kleinbuchstaben umwandeln
        const searchTagLower = tag.toLowerCase();

        // Alle Checkboxen finden, die EXAKT diesen Tag beinhalten (case-insensitive!)
        document.querySelectorAll('.grammar-cb').forEach(cb => {
          const cbTagsStr = cb.getAttribute('data-tags') || '';
          
          // Wir wandeln alle Tags der Karte in Kleinbuchstaben um und zerlegen sie in ein Array
          const cbTagsListLower = cbTagsStr.toLowerCase().split(/[\s,]+/);
          
          // EURE UNFEHLBARE LOGIK (JETZT SICHER): Prüft den exakten Match ohne Case-Sensitivity-Bums!
          if (cbTagsListLower.includes(searchTagLower)) {
            cb.checked = isNowActive;
          }
        });
      });
      tagGrid.appendChild(tagBtn);
    });

// --- NEU: TSV Export & Neues Tag vergeben ---
    document.getElementById('export-tag-tsv').addEventListener('click', () => {
      const tagNameInput = document.getElementById('new-tag-name');
      const tagName = tagNameInput.value.trim();

      if (!tagName) {
        alert('Bitte gib einen gültigen Namen für das neue Tag ein.');
        return;
      }

      const selectedCbs = document.querySelectorAll('.grammar-cb:checked');
      if (selectedCbs.length === 0) {
        alert('Bitte wähle zuerst mindestens eine Grammatik-Karte aus.');
        return;
      }

      // TSV Inhalt generieren (Format: nid [TAB] tags [TAB] dummy)
      // Der Header heißt nun korrekt 'tags' und das Feld 'dummy' bleibt leer
      let tsvContent = "nid\ttags\tdummy\n"; 
      selectedCbs.forEach(cb => {
        const nid = cb.getAttribute('data-nid');
        
        // Holt die bereits existierenden Tags der Karte im DOM
        const currentTagsStr = cb.getAttribute('data-tags') || '';
        let currentTagsList = currentTagsStr ? currentTagsStr.split(/[\s,]+/) : [];
        
        // Fügt das neue Tag hinzu, falls es noch nicht existiert
        if (!currentTagsList.includes(tagName)) {
          currentTagsList.push(tagName);
        }
        
        // Verbindet alle alten und neuen Tags sauber mit einem Leerzeichen
        const combinedTags = currentTagsList.join(' ').trim();
        
        // Exportiert die Zeile mit allen Tags und dem komplett leeren Dummy-Feld am Ende
        tsvContent += `${nid}\t${combinedTags}\t\n`;
        
        // Aktualisiert das DOM-Attribut für die weitere Nutzung in der UI
        cb.setAttribute('data-tags', combinedTags);
      });

      // Download-Link erzeugen und klicken
      const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `grammar_assigned_tags_${tagName}.tsv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      tagNameInput.value = '';
      alert(`TSV erfolgreich exportiert! ${selectedCbs.length} Zeilen geschrieben.`);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color: red; font-weight: bold;">Fehler beim Laden der lokalen JSON-Datei! Überprüfe die Browser-Konsole (F12).</div>`;
  }
});

// Globale Selektoren (Alle aktivieren / Alle deaktivieren über die gesamte Seite)
document.getElementById('all').addEventListener('click', () => document.querySelectorAll('.grammar-cb').forEach(cb => cb.checked = true));
document.getElementById('none').addEventListener('click', () => document.querySelectorAll('.grammar-cb').forEach(cb => cb.checked = false));

// Speicher-Logik (Speichert ein Array von nids im lokalen Chrome-Speicher)
document.getElementById('save').addEventListener('click', () => {
  const selectedNids = [];
  
  document.querySelectorAll('.grammar-cb:checked').forEach(cb => {
    const nid = cb.getAttribute('data-nid');
    if (nid) {
      selectedNids.push(String(nid));
    }
  });

  chrome.storage.local.set({ selectedNids: selectedNids }, () => {
    const status = document.getElementById('status');
    status.textContent = `Erfolgreich gespeichert! (${selectedNids.length} Punkte aktiv)`;
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
});

// Eure perfektionierte Vorschaufunktion im neuen Anki-Design
function showModalPopup(nids, grammarData) {
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
    
    .drag-handle { 
      background: #0984e3; 
      color: #ffffff; 
      padding: 8px 12px; 
      cursor: move; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      font-size: var(--base-font-size); 
      font-weight: bold;
      flex-shrink: 0; 
    }
    
    .close-btn { cursor: pointer; font-size: 18px; border: none; background: none; color: #ffffff; padding: 0; line-height: 1; }

    .modal-content-scroll { padding: 10px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; }
    
    .card-container { 
      background-color: white; 
      border-radius: 6px; 
      width: 100%; 
      padding: 12px; 
      border: 1px solid #d1d8e0; 
      box-sizing: border-box; 
    }

    .grammar-header { 
      font-size: var(--base-font-size); 
      font-weight: bold; 
      color: #0984e3; 
      margin-bottom: 4px; 
      text-align: left; 
    }
    
    .tags-badge { font-size: 11px; color: #636e72; margin-bottom: 8px; display: block; }
    
    .separator { border: none; height: 1px; background: #eee; margin: 8px 0; }
    
    .content-section { margin-bottom: 10px; }
    
    .label { 
      font-size: var(--base-font-size); 
      font-weight: bold; 
      color: #b2bec3; 
      margin-bottom: 2px; 
    }
    
    .text-content { 
      font-size: var(--base-font-size); 
      color: #2d3436; 
      line-height: 1.4; 
      word-break: break-word; 
      white-space: pre-line; 
    }

    .box-style { 
      background: #f8f9fa; 
      padding: 6px; 
      border-radius: 4px; 
      border-left: 3px solid #0984e3; 
    }

    .link-box a { font-size: var(--base-font-size); color: #0984e3; text-decoration: none; font-weight: bold; }
    
    table { width: 100%; font-size: var(--base-font-size); border-collapse: collapse; }
    td { padding: 2px 0; border-bottom: 1px solid #f1f1f1; }
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
      <div class="grammar-header">${g.level_and_point || g.Level_And_Grammar_Point || ''}</div>
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
        <div class="label">Notes</div>
        <div class="text-content">${g.notes || g.Notes || ''}</div>
      </div>

      <div class="content-section">
        <div class="label">Regexpatterns</div>
        <div class="text-content">${g.regexpattern || ''}</div>
      </div>
    `;
    scrollArea.appendChild(card);
  });

  container.appendChild(scrollArea);
  shadow.appendChild(container);

  header.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);

  // DRAG LOGIK
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