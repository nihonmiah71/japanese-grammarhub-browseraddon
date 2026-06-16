document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('grammar-container');
  
  try {
    const localGrammarUrl = chrome.runtime.getURL('data/grammar_data.json');
    const response = await fetch(localGrammarUrl);
    const grammarMap = await response.json();
    
    const grammarData = Object.values(grammarMap);
    
    // Daten nach Level (N5 bis N1) sortieren/gruppieren & Tags sammeln
    const levels = { 'N5': [], 'N4': [], 'N3': [], 'N2': [], 'N1': [], 'Unknown': [] };
    const allTagsMap = new Set();
    
    grammarData.forEach(item => {
      if (!item) return;
      
      let itemTags = item.tags || '';
      if (Array.isArray(itemTags)) {
        itemTags = itemTags.join(' ');
      }
      
      const currentItemTagsList = [];
      if (typeof itemTags === 'string') {
        itemTags.split(/[\s,]+/).forEach(t => {
          const cleanTag = t.trim();
          if (cleanTag) {
            allTagsMap.add(cleanTag);
            currentItemTagsList.push(cleanTag);
          }
        });
      }

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
        levels['Unknown'].push(item);
      }
    });

    container.innerHTML = '';

    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['selectedNids'], (result) => resolve(result || {}));
    });
    const savedNids = storage.selectedNids || [];

    ['N1', 'N2', 'N3', 'N4', 'N5', 'Unknown'].forEach(lvl => {
      if (levels[lvl].length === 0) return;

      levels[lvl].sort((a, b) => {
        const nameA = a['Level And Grammar Point'] || a.level_and_point || '';
        const nameB = b['Level And Grammar Point'] || b.level_and_point || '';
        return nameA.localeCompare(nameB, 'ja');
      });

      const groupDiv = document.createElement('div');
      groupDiv.className = 'group';
      groupDiv.innerHTML = `
        <h3>
          <span>Level ${lvl} (${levels[lvl].length} Points)</span>
          <div class="lvl-actions">
            <button class="select-lvl-all" data-lvl="${lvl}" style="padding:4px 8px; font-size:11px; background:#747d8c;">All ${lvl}</button>
            <button class="select-lvl-none" data-lvl="${lvl}" style="padding:4px 8px; font-size:11px; background:#747d8c;">None ${lvl}</button>
          </div>
        </h3>
        <div class="level-grid" id="grid-${lvl}"></div>
      `;
      container.appendChild(groupDiv);

      const grid = groupDiv.querySelector(`#grid-${lvl}`);
      levels[lvl].forEach(item => {
        const label = document.createElement('label');
        const nidStr = String(item.nid);
        const isChecked = savedNids.includes(nidStr) ? 'checked' : '';
        const itemTagsAttr = Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || '');

        label.innerHTML = `
          <input type="checkbox" class="grammar-cb" data-nid="${nidStr}" data-tags="${itemTagsAttr}" ${isChecked}>
          <span>${item['Level And Grammar Point'] || item.level_and_point}</span>
        `;
        grid.appendChild(label);

        let hoverTimeout;
        label.addEventListener('mouseenter', () => {
          hoverTimeout = setTimeout(() => {
            showModalPopup([nidStr], grammarMap);
          }, 1000);
        });
        
        label.addEventListener('mouseleave', () => {
          clearTimeout(hoverTimeout);
        });
      });
    });

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

    const tagGrid = document.getElementById('tag-buttons-grid');
    Array.from(allTagsMap).sort().forEach(tag => {
      const tagBtn = document.createElement('button');
      tagBtn.textContent = tag;
      tagBtn.style.cssText = "padding: 6px 12px; font-size: 12px; background: #747d8c; border-radius: 4px;";
      tagBtn.dataset.active = "false";

      tagBtn.addEventListener('click', () => {
        const isNowActive = tagBtn.dataset.active === "false";
        tagBtn.dataset.active = isNowActive ? "true" : "false";
        tagBtn.style.backgroundColor = isNowActive ? "#0984e3" : "#747d8c";

        const searchTagLower = tag.toLowerCase();

        document.querySelectorAll('.grammar-cb').forEach(cb => {
          const cbTagsStr = cb.getAttribute('data-tags') || '';
          const cbTagsListLower = cbTagsStr.toLowerCase().split(/[\s,]+/);
          if (cbTagsListLower.includes(searchTagLower)) {
            cb.checked = isNowActive;
          }
        });
      });
      tagGrid.appendChild(tagBtn);
    });

    // --- NEU: Contrast Grammars Funktionalität ---
    document.getElementById('contrast-grammars').addEventListener('click', () => {
      const selectedCbs = document.querySelectorAll('.grammar-cb:checked');
      if (selectedCbs.length === 0) {
        alert('Please select at least one grammar card to contrast.');
        return;
      }

      const nidsToContrast = Array.from(selectedCbs).map(cb => cb.getAttribute('data-nid'));
      const N = nidsToContrast.length;
      
      // Berechnet die Grid-Spalten quadratisch auf Basis der Anzahl (z.B. bis 4 -> 2, bis 9 -> 3, bis 16 -> 4...)
      const cols = Math.max(2, Math.ceil(Math.sqrt(N)));

      const contrastWindow = window.open("", "_blank", "width=1200,height=800,scrollbars=yes,resizable=yes");
      if (!contrastWindow) {
        alert('Popup blocked! Please allow popups for this extension.');
        return;
      }

      let cardsHtml = "";
      nidsToContrast.forEach(nid => {
        const g = grammarMap[nid];
        if (!g) return;

        cardsHtml += `
          <div class="card-container">
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
          </div>
        `;
      });

      contrastWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Grammar Contrast View</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f6fa; color: #2f3640; margin: 0; padding: 20px; }
            h2 { text-align: center; color: #2f3542; border-bottom: 2px solid #74b9ff; padding-bottom: 10px; margin-bottom: 20px; }
            .grid-container {
              display: grid;
              grid-template-columns: repeat(${cols}, 320px);
              gap: 20px;
              justify-content: center;
              padding-bottom: 40px;
            }
            .card-container { 
              background-color: white; 
              border-radius: 8px; 
              width: 320px; 
              height: 380px; 
              padding: 15px; 
              border: 1px solid #d1d8e0; 
              box-sizing: border-box; 
              display: flex;
              flex-direction: column;
              gap: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
              overflow-y: auto;
            }
            .grammar-header { font-size: 15px; font-weight: bold; color: #0984e3; text-align: left; }
            .tags-badge { font-size: 11px; color: #636e72; }
            .separator { border: none; height: 1px; background: #eee; margin: 4px 0; }
            .content-section { display: flex; flex-direction: column; gap: 2px; }
            .label { font-size: 11px; font-weight: bold; color: #b2bec3; text-transform: uppercase; letter-spacing: 0.5px; }
            .text-content { font-size: 13px; color: #2d3436; line-height: 1.4; word-break: break-word; white-space: pre-line; }
            .box-style { background: #f8f9fa; padding: 6px; border-radius: 4px; border-left: 3px solid #0984e3; }
            .link-box a { font-size: 13px; color: #0984e3; text-decoration: none; font-weight: bold; }
            .link-box a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h2>Grammar Contrast View (${N} Items)</h2>
          <div class="grid-container">
            ${cardsHtml}
          </div>
        </body>
        </html>
      `);
      contrastWindow.document.close();
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color: red; font-weight: bold;">Error loading local JSON file! Check the browser console (F12).</div>`;
  }
});

document.getElementById('all').addEventListener('click', () => document.querySelectorAll('.grammar-cb').forEach(cb => cb.checked = true));
document.getElementById('none').addEventListener('click', () => document.querySelectorAll('.grammar-cb').forEach(cb => cb.checked = false));

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
    status.textContent = `Successfully saved! (${selectedNids.length} points active)`;
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
});

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
    .drag-handle { background: #0984e3; color: #ffffff; padding: 8px 12px; cursor: move; display: flex; justify-content: space-between; align-items: center; font-size: var(--base-font-size); font-weight: bold; flex-shrink: 0; }
    .close-btn { cursor: pointer; font-size: 18px; border: none; background: none; color: #ffffff; padding: 0; line-height: 1; }
    .modal-content-scroll { padding: 10px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; }
    .card-container { background-color: white; border-radius: 6px; width: 100%; padding: 12px; border: 1px solid #d1d8e0; box-sizing: border-box; }
    .grammar-header { font-size: var(--base-font-size); font-weight: bold; color: #0984e3; margin-bottom: 4px; text-align: left; }
    .tags-badge { font-size: 11px; color: #636e72; margin-bottom: 8px; display: block; }
    .separator { border: none; height: 1px; background: #eee; margin: 8px 0; }
    .content-section { margin-bottom: 10px; }
    .label { font-size: var(--base-font-size); font-weight: bold; color: #b2bec3; margin-bottom: 2px; }
    .text-content { font-size: var(--base-font-size); color: #2d3436; line-height: 1.4; word-break: break-word; white-space: pre-line; }
    .box-style { background: #f8f9fa; padding: 6px; border-radius: 4px; border-left: 3px solid #0984e3; }
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