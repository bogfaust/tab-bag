let isOpening = false;
let shouldStop = false;
let currentOperation = null;
let currentLang = 'en';
let t = {};
let locales = {};
let soundEnabled = false;
let soundVolume = 80;
let showStatsEnabled = true;

const CHROME_GROUP_COLORS = {
  grey: '#9e9e9e', blue: '#4a90e2', red: '#e25151', yellow: '#f5c842',
  green: '#4caf50', pink: '#e91e8c', purple: '#9c27b0', cyan: '#00bcd4',
  orange: '#ff9800', white: '#e0e0e0',
};
function dotColor(c) { return CHROME_GROUP_COLORS[c] || '#9e9e9e'; }
function makeDot(colorName) {
  const d = document.createElement('span');
  d.className = 'group-dot';
  d.style.backgroundColor = dotColor(colorName);
  return d;
}

// ── Locales ────────────────────────────────────────────────────────────────
async function loadLocales() {
  const res = await fetch(chrome.runtime.getURL('locales.json'));
  return res.json();
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyThemeVal(val) {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', val === 'system' ? (dark ? 'dark' : 'light') : val);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const { theme } = await chrome.storage.local.get(['theme']);
  if ((theme || 'system') === 'system') applyThemeVal('system');
});

// ── Lang ───────────────────────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang;
  t = locales[lang] || locales['en'];
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const ph  = (id, val) => { const el = document.getElementById(id); if (el) el.placeholder = val; };

  set('openSettings',             t.openSettings);
  set('tabBtnClassic',            t.tabClassic);
  set('tabBtnGroups',             t.tabGroups);
  set('subBtnRestoration',        t.subTabRestoration);
  set('subBtnSaving',             t.subTabSaving);
  set('collectUrls',              t.collectUrls);
  set('collectSelectedUrls',      t.collectSelectedUrls);
  set('labelSkipDuplicates',      t.skipDuplicates);
  set('labelDelay',               t.delayLabel);
  set('statsTitle',               t.statsTitle);
  set('statsTitleGroups',         t.statsTitle);
  set('sectionGroups',            t.sectionGroups);
  set('saveGroupBtn',             '💾');
  set('sectionChromeGroups',      t.sectionChromeGroups);
  set('sectionSaveFromTabs',      t.sectionSaveFromTabs);
  set('labelIgnoreGroupedTabs',   t.labelIgnoreGroupedTabs);
  set('labelDeduplicateSave',     t.labelDeduplicateSave || 'Save only unique URLs');
  const dedupHint = document.getElementById('deduplicateSaveHint');
  if (dedupHint) dedupHint.title = t.deduplicateSaveHint || 'If multiple tabs have the same URL, only one copy will be saved';
  set('labelShowStats',           t.labelShowStats || 'Show tab statistics');
  set('restoreAllBtn',            t.restoreAllGroups || 'Restore all groups');
  set('checkConflictsBtn',        t.checkGroupConflicts || 'Check conflicts between groups');
  const tpb = document.getElementById('togglePreviewBtn');
  if (tpb && !tpb.dataset.open) tpb.textContent = t.previewTabsBtn || '👁 Preview tabs to save';
  set('labelSkipExistingGroups',  t.labelSkipExistingGroups);
  set('labelSkipExistingUrls',    t.labelSkipExistingUrls);
  set('labelTopUpMissing',        t.labelTopUpMissing);
  set('labelReportConflicts',     t.labelReportConflicts);
  ph('groupName',                 t.groupNamePlaceholder);

  if (!isOpening) {
    set('openUrls', t.openUrls);
    document.getElementById('openUrls').classList.remove('stop');
  }
  updateTabsInfo();
  renderGroups();
  renderChromeGroups();
  syncConflictSubOption();
  // Re-apply showStats using the stored variable (not the checkbox, which may be stale)
  applyShowStats(showStatsEnabled);
}

// ── Sound ──────────────────────────────────────────────────────────────────
function playErrorSound() {
  if (!soundEnabled) return;
  const a = new Audio(chrome.runtime.getURL('assets/sounds/quack.mp3'));
  a.volume = soundVolume / 100;
  a.play().catch(() => {});
}

// ── Status ─────────────────────────────────────────────────────────────────
function updateStatus(msg, persist = false, isError = false, elId = 'status') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
  if (isError) playErrorSound();
  if (!persist) setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function decodeUrl(u) { try { return decodeURIComponent(u); } catch { return u; } }
function normalizeUrl(u) { try { return new URL(u).href.replace(/\/$/, ''); } catch { return u.trim(); } }

async function updateTabsInfo() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const txt = (t.openTabsCount || 'Open tabs: ') + tabs.length;
  document.getElementById('tabsInfo').textContent = txt;
  const el2 = document.getElementById('tabsInfoGroups');
  if (el2) el2.textContent = txt;
}

function syncConflictSubOption() {
  const skip = document.getElementById('groupSkipExistingUrls');
  const sub  = document.getElementById('subSettingConflict');
  if (skip && sub) sub.classList.toggle('hidden', !skip.checked);
}

function applyShowStats(show) {
  showStatsEnabled = show;
  document.querySelectorAll('.stats-block').forEach(el => { el.style.display = show ? '' : 'none'; });
}

function saveInlineSettings() {
  const skip  = document.getElementById('skipDuplicates').checked;
  const delay = Math.max(0, parseInt(document.getElementById('delay').value) || 0);
  document.getElementById('delay').value = delay;
  chrome.storage.local.set({ skipDuplicates: skip, delay });
}

function saveGroupOptions() {
  chrome.storage.local.set({
    groupSkipExistingGroups: document.getElementById('groupSkipExistingGroups').checked,
    groupSkipExistingUrls:   document.getElementById('groupSkipExistingUrls').checked,
    groupTopUpMissing:       document.getElementById('groupTopUpMissing').checked,
    groupReportConflicts:    document.getElementById('groupReportConflicts').checked,
    ignoreGroupedTabs:       document.getElementById('ignoreGroupedTabs') ? document.getElementById('ignoreGroupedTabs').checked : false,
    deduplicateSave:         document.getElementById('deduplicateSave') ? document.getElementById('deduplicateSave').checked : true,
  });
  syncConflictSubOption();
}

async function loadSettings() {
  const r = await chrome.storage.local.get([
    'skipDuplicates','delay','lang','soundEnabled','volume','theme',
    'groupSkipExistingGroups','groupSkipExistingUrls','groupTopUpMissing','groupReportConflicts','ignoreGroupedTabs','showStats','deduplicateSave'
  ]);
  document.getElementById('skipDuplicates').checked        = r.skipDuplicates !== undefined ? r.skipDuplicates : true;
  document.getElementById('delay').value                   = Math.max(0, r.delay || 0);
  document.getElementById('groupSkipExistingGroups').checked = r.groupSkipExistingGroups !== undefined ? r.groupSkipExistingGroups : true;
  document.getElementById('groupSkipExistingUrls').checked   = r.groupSkipExistingUrls !== undefined ? r.groupSkipExistingUrls : true;
  document.getElementById('groupTopUpMissing').checked       = r.groupTopUpMissing || false;
  document.getElementById('groupReportConflicts').checked    = r.groupReportConflicts || false;
  const igt = document.getElementById('ignoreGroupedTabs');
  if (igt) igt.checked = r.ignoreGroupedTabs || false;
  const dds = document.getElementById('deduplicateSave');
  if (dds) dds.checked = r.deduplicateSave !== false;
  soundEnabled = r.soundEnabled !== undefined ? r.soundEnabled : true;
  soundVolume  = r.volume !== undefined ? r.volume : 80;
  applyThemeVal(r.theme || 'system');
  applyShowStats(r.showStats !== false);
  syncConflictSubOption();
  return r.lang || 'en';
}

function updateButtonText(processed, unique, total) {
  const btn = document.getElementById('openUrls');
  if (isOpening) {
    btn.textContent = `${t.stopOpening} ${processed}/${unique} (${total})`;
    btn.classList.add('stop');
  } else {
    btn.textContent = t.openUrls;
    btn.classList.remove('stop');
  }
}

// ── Tab/Sub-tab switching ──────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel' + tabId[0].toUpperCase() + tabId.slice(1));
  });
  if (tabId === 'groups') { renderGroups(); renderChromeGroups(); }
}
function switchSubTab(subId) {
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === subId));
  document.querySelectorAll('.sub-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'subPanel' + subId[0].toUpperCase() + subId.slice(1));
  });
}

// ── Tab Groups storage ─────────────────────────────────────────────────────
async function loadGroups() { const { tabGroups } = await chrome.storage.local.get(['tabGroups']); return tabGroups || []; }
async function saveGroups(g) { await chrome.storage.local.set({ tabGroups: g }); }

// ── Render saved groups ────────────────────────────────────────────────────
async function renderGroups() {
  const groups = await loadGroups();
  const container = document.getElementById('groupsList');
  container.innerHTML = '';

  if (groups.length === 0) {
    const e = document.createElement('div'); e.className = 'no-items';
    e.textContent = t.noGroups || 'No saved groups yet';
    container.appendChild(e); return;
  }

  groups.forEach((group, index) => {
    const item = document.createElement('div');
    item.className = 'group-item';

    // header row
    const header = document.createElement('div');
    header.className = 'group-item-header';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'group-expand-btn';
    expandBtn.textContent = '▶';
    expandBtn.title = 'Show URLs';

    header.appendChild(makeDot(group.color));
    header.appendChild(expandBtn);

    const name = document.createElement('span');
    name.className = 'group-name'; name.textContent = group.name; name.title = group.name;

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = group.urls.length + ' URL' + (group.urls.length !== 1 ? 's' : '');

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-sm'; restoreBtn.textContent = t.restoreGroup || 'Restore';
    restoreBtn.addEventListener('click', () => restoreGroup(group));

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn-sm-outline'; renameBtn.textContent = '✏';
    renameBtn.title = t.renameGroup || 'Rename';
    renameBtn.addEventListener('click', () => {
      // Toggle inline rename UI
      const existing = item.querySelector('.rename-row');
      if (existing) { existing.remove(); return; }
      const renameRow = document.createElement('div');
      renameRow.className = 'rename-row';
      renameRow.style.cssText = 'display:flex;gap:6px;padding:4px 8px 6px;border-top:1px solid var(--border)';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 60; inp.value = group.name;
      inp.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:12px';
      const saveRenameBtn = document.createElement('button');
      saveRenameBtn.className = 'btn-sm'; saveRenameBtn.textContent = '✔';
      saveRenameBtn.title = t.renameGroupSave || 'Save name';
      saveRenameBtn.style.width = 'auto';
      const doRename = async () => {
        const newName = inp.value.trim();
        if (!newName) return;
        const groups = await loadGroups();
        groups[index].name = newName;
        await saveGroups(groups);
        await renderGroups();
      };
      saveRenameBtn.addEventListener('click', doRename);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') renameRow.remove(); });
      renameRow.appendChild(inp);
      renameRow.appendChild(saveRenameBtn);
      item.appendChild(renameRow);
      inp.focus(); inp.select();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-sm-outline'; deleteBtn.textContent = t.deleteGroup || '✕';
    deleteBtn.title = (t.confirmDeleteGroup || 'Delete group "{name}"?').replace('{name}', group.name);
    deleteBtn.addEventListener('click', () => deleteGroup(index, group.name));

    header.appendChild(name);
    header.appendChild(count);
    header.appendChild(restoreBtn);
    header.appendChild(renameBtn);
    header.appendChild(deleteBtn);

    // expandable URL list
    const urlsDiv = document.createElement('div');
    urlsDiv.className = 'group-urls';
    const inner = document.createElement('div');
    inner.className = 'group-urls-inner';
    group.urls.forEach(u => {
      const row = document.createElement('div');
      row.className = 'group-url-item'; row.textContent = u; row.title = u;
      inner.appendChild(row);
    });
    urlsDiv.appendChild(inner);

    expandBtn.addEventListener('click', () => {
      const open = urlsDiv.classList.toggle('open');
      expandBtn.textContent = open ? '▼' : '▶';
    });

    item.appendChild(header);
    item.appendChild(urlsDiv);
    container.appendChild(item);
  });
}

// ── Save current tabs as group ─────────────────────────────────────────────
async function saveCurrentTabsAsGroup() {
  const nameInput = document.getElementById('groupName');
  const name = nameInput.value.trim();
  if (!name) { updateStatus(t.groupNameEmpty || 'Please enter a group name', false, true, 'statusGroups'); nameInput.focus(); return; }
  const ignoreGrouped = document.getElementById('ignoreGroupedTabs') && document.getElementById('ignoreGroupedTabs').checked;
  const deduplicate   = document.getElementById('deduplicateSave') && document.getElementById('deduplicateSave').checked;
  let allTabs = await chrome.tabs.query({ currentWindow: true });
  if (ignoreGrouped) allTabs = allTabs.filter(tab => !tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
  if (allTabs.length === 0) { updateStatus(t.groupNoTabs || 'No tabs to save (all tabs filtered out)', false, true, 'statusGroups'); return; }
  let urls = allTabs.map(tab => decodeUrl(tab.url));
  let removedCount = 0;
  if (deduplicate) {
    const seen = new Set();
    const unique = [];
    for (const u of urls) {
      const norm = normalizeUrl(u);
      if (!seen.has(norm)) { seen.add(norm); unique.push(u); }
      else removedCount++;
    }
    urls = unique;
  }
  const groups = await loadGroups();
  groups.unshift({ name, urls, color: selectedGroupColor, savedAt: Date.now() });
  await saveGroups(groups);
  nameInput.value = '';
  await renderGroups();
  if (removedCount > 0) {
    updateStatus((t.groupSavedDeduped || 'Group "{name}" saved! ({kept} unique, {removed} duplicate(s) removed)')
      .replace('{name}', name).replace('{kept}', urls.length).replace('{removed}', removedCount), false, false, 'statusGroups');
  } else {
    updateStatus((t.groupSaved || 'Group "{name}" saved!').replace('{name}', name), false, false, 'statusGroups');
  }
}

// ── Conflict dialog ────────────────────────────────────────────────────────
// Returns true = open anyway, false = skip
// groupName — name of the saved group being restored (shown in alert for context)
async function showConflictDialog(url, existingTab, groupName) {
  let msg = (t.conflictMsg || '{url}\nis already open in tab: "{title}"')
    .replace('{url}', url).replace('{title}', existingTab.title || existingTab.url);
  if (groupName) {
    msg += '\n' + (t.conflictInGroup || 'Source group: "{group}"').replace('{group}', groupName);
  }
  return window.confirm((t.conflictTitle || 'URL conflict') + '\n\n' + msg + '\n\n' + (t.conflictOpenAnyway || 'OK = open anyway, Cancel = skip'));
}

// ── Restore group ──────────────────────────────────────────────────────────
async function restoreGroup(group) {
  const skipExistingGroups = document.getElementById('groupSkipExistingGroups').checked;
  const skipExistingUrls   = document.getElementById('groupSkipExistingUrls').checked;
  const topUpMissing       = document.getElementById('groupTopUpMissing').checked;
  const reportConflicts    = document.getElementById('groupReportConflicts').checked;

  const currentWindow = await chrome.windows.getCurrent();
  const existingTabs = await chrome.tabs.query({ currentWindow: true });
  const existingUrlMap = new Map(existingTabs.map(tab => [normalizeUrl(tab.url), tab]));

  // Check if Chrome group with same name already exists
  if (skipExistingGroups && chrome.tabGroups) {
    const liveGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    const match = liveGroups.find(g => g.title === group.name);
    if (match) {
      if (topUpMissing) {
        const liveTabs = await chrome.tabs.query({ currentWindow: true, groupId: match.id });
        const liveSet = new Set(liveTabs.map(tab => normalizeUrl(tab.url)));
        let missing = group.urls.filter(u => !liveSet.has(normalizeUrl(u)));
        if (missing.length === 0) {
          updateStatus((t.groupAlreadyOpen || 'Group "{name}" is already open — skipped').replace('{name}', group.name), false, false, 'statusGroups');
          return;
        }
        if (skipExistingUrls) {
          missing = await filterConflicts(missing, existingUrlMap, reportConflicts, group.name);
        }
        const newIds = await openTabs(missing, currentWindow.id);
        if (newIds.length) await chrome.tabs.group({ tabIds: newIds, groupId: match.id });
        updateStatus((t.groupToppedUp || 'Added {count} missing tab(s) to "{name}"').replace('{count}', newIds.length).replace('{name}', group.name), false, false, 'statusGroups');
        await updateTabsInfo();
        await renderChromeGroups();
        return;
      } else {
        updateStatus((t.groupAlreadyOpen || 'Group "{name}" is already open — skipped').replace('{name}', group.name), false, false, 'statusGroups');
        return;
      }
    }
  }

  let urlsToOpen = group.urls;
  if (skipExistingUrls) {
    urlsToOpen = await filterConflicts(urlsToOpen, existingUrlMap, reportConflicts, group.name);
  }
  if (urlsToOpen.length === 0) {
    updateStatus(t.statusOnlyDuplicates || 'No new URLs to open — all are already open', false, true, 'statusGroups'); return;
  }
  if (urlsToOpen.length > 15) {
    if (!window.confirm((t.confirmOpen || 'Open {count} tabs?').replace('{count}', urlsToOpen.length))) return;
  }

  const newTabIds = await openTabs(urlsToOpen, currentWindow.id);
  if (newTabIds.length > 0 && chrome.tabs.group) {
    try {
      const gid = await chrome.tabs.group({ tabIds: newTabIds, createProperties: { windowId: currentWindow.id } });
      const props = { title: group.name };
      if (group.color && CHROME_GROUP_COLORS[group.color]) props.color = group.color;
      await chrome.tabGroups.update(gid, props);
    } catch (e) { console.error(e); }
  }
  await updateTabsInfo();
  await renderChromeGroups();
}

// Returns filtered list, showing confirm dialogs for conflicts if reportConflicts=true
async function filterConflicts(urls, existingUrlMap, reportConflicts, groupName) {
  const result = [];
  for (const url of urls) {
    const norm = normalizeUrl(url);
    if (existingUrlMap.has(norm)) {
      if (reportConflicts) {
        const openAnyway = await showConflictDialog(url, existingUrlMap.get(norm), groupName);
        if (openAnyway) result.push(url);
      }
      // else skip silently
    } else {
      result.push(url);
    }
  }
  return result;
}

async function openTabs(urls, windowId) {
  const ids = [];
  for (const url of urls) {
    try { const tab = await chrome.tabs.create({ url, active: false, windowId }); ids.push(tab.id); }
    catch (e) { console.error(e); }
  }
  return ids;
}

async function deleteGroup(index, name) {
  if (!window.confirm((t.confirmDeleteGroup || 'Delete group "{name}"?').replace('{name}', name))) return;
  const groups = await loadGroups();
  groups.splice(index, 1);
  await saveGroups(groups);
  await renderGroups();
}

// ── Restore all groups ─────────────────────────────────────────────────────
async function restoreAllGroups() {
  const groups = await loadGroups();
  if (groups.length === 0) { updateStatus(t.noGroups || 'No saved groups', false, true, 'statusGroups'); return; }
  const totalUrls = groups.reduce((s, g) => s + g.urls.length, 0);
  if (!window.confirm((t.restoreAllConfirm || 'Restore all {count} group(s)? This will open many tabs.').replace('{count}', groups.length) + ' (~' + totalUrls + ' URLs)')) return;
  for (const group of groups) {
    await restoreGroup(group);
  }
  updateStatus((t.groupToppedUp || 'All groups restored').replace('{count}', groups.length).replace('{name}', ''), false, false, 'statusGroups');
}

// ── Check conflicts between saved groups ──────────────────────────────────
async function checkGroupConflicts() {
  const groups = await loadGroups();
  if (groups.length < 2) { updateStatus(t.groupConflictsNone || 'No URL conflicts between saved groups.', false, false, 'statusGroups'); return; }
  // Build map: normalized URL → [group names]
  const urlToGroups = new Map();
  for (const group of groups) {
    for (const url of group.urls) {
      const norm = normalizeUrl(url);
      if (!urlToGroups.has(norm)) urlToGroups.set(norm, []);
      urlToGroups.get(norm).push(group.name);
    }
  }
  const conflicts = [];
  for (const [url, names] of urlToGroups) {
    if (names.length > 1) conflicts.push({ url, names });
  }
  if (conflicts.length === 0) {
    updateStatus(t.groupConflictsNone || 'No URL conflicts between saved groups.', false, false, 'statusGroups');
    return;
  }
  // Show summary in an alert
  const lines = conflicts.slice(0, 20).map(c => `• ${c.url}\n  → ${c.names.join(', ')}`);
  if (conflicts.length > 20) lines.push(`… and ${conflicts.length - 20} more`);
  window.alert((t.groupConflictsFound || 'URL conflicts found between groups:') + '\n\n' + lines.join('\n\n'));
}

// ── Render Chrome groups ───────────────────────────────────────────────────
async function renderChromeGroups() {
  const container = document.getElementById('chromeGroupsList');
  container.innerHTML = '';

  if (!chrome.tabGroups) {
    const m = document.createElement('div'); m.className = 'no-items';
    m.textContent = t.noChromeGroups || 'No Chrome tab groups found';
    container.appendChild(m); return;
  }

  const win = await chrome.windows.getCurrent();
  const seen = new Set();
  const allGroups = await chrome.tabGroups.query({ windowId: win.id });
  const groups = allGroups.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });

  if (groups.length === 0) {
    const m = document.createElement('div'); m.className = 'no-items';
    m.textContent = t.noChromeGroups || 'No Chrome tab groups found';
    container.appendChild(m); return;
  }

  for (const group of groups) {
    const tabs = await chrome.tabs.query({ currentWindow: true, groupId: group.id });
    const label = group.title || `(${group.color})`;

    const item = document.createElement('div');
    item.className = 'chrome-group-item';

    // ── header row (always visible) ──
    const header = document.createElement('div');
    header.className = 'chrome-group-header';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'group-expand-btn'; expandBtn.textContent = '▶';

    header.appendChild(makeDot(group.color));
    header.appendChild(expandBtn);

    const nameEl = document.createElement('span');
    nameEl.className = 'chrome-group-name'; nameEl.textContent = label; nameEl.title = label;

    const countEl = document.createElement('span');
    countEl.className = 'chrome-group-count';
    countEl.textContent = tabs.length + ' URL' + (tabs.length !== 1 ? 's' : '');

    header.appendChild(nameEl);
    header.appendChild(countEl);

    // ── save row (always visible, below header) ──
    const saveRow = document.createElement('div');
    saveRow.className = 'chrome-group-save-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.maxLength = 60;
    nameInput.value = group.title || '';
    nameInput.placeholder = t.groupNamePlaceholder || 'Group name…';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-sm'; saveBtn.textContent = '💾 ' + (t.saveChromeGroupAs || 'Save');
    saveBtn.addEventListener('click', async () => {
      const name2 = nameInput.value.trim() || label;
      const urls = tabs.map(tab => decodeUrl(tab.url));
      const gs = await loadGroups();
      gs.unshift({ name: name2, urls, color: group.color, savedAt: Date.now() });
      await saveGroups(gs);
      updateStatus((t.chromeGroupSaved || 'Group "{name}" saved!').replace('{name}', name2), false, false, 'statusGroups');
      switchSubTab('restoration');
      await renderGroups();
    });
    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);

    // ── expandable URL list only ──
    const urlsDiv = document.createElement('div');
    urlsDiv.className = 'chrome-group-urls';
    const urlsInner = document.createElement('div');
    urlsInner.className = 'group-urls-inner';
    tabs.forEach(tab => {
      const row = document.createElement('div');
      row.className = 'group-url-item';
      row.textContent = decodeUrl(tab.url); row.title = tab.title || tab.url;
      urlsInner.appendChild(row);
    });
    urlsDiv.appendChild(urlsInner);

    expandBtn.addEventListener('click', () => {
      const open = urlsDiv.classList.toggle('open');
      expandBtn.textContent = open ? '▼' : '▶';
    });

    item.appendChild(header);
    item.appendChild(saveRow);
    item.appendChild(urlsDiv);
    container.appendChild(item);
  }
}

// ── Group color picker ─────────────────────────────────────────────────────
let selectedGroupColor = 'grey';

function initColorPicker() {
  const container = document.getElementById('groupColorPicker');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(CHROME_GROUP_COLORS).forEach(colorName => {
    const btn = document.createElement('button');
    btn.style.cssText = `width:18px;height:18px;border-radius:50%;background:${dotColor(colorName)};border:2px solid transparent;padding:0;cursor:pointer;flex-shrink:0;transition:border-color .15s,transform .15s`;
    btn.title = colorName;
    btn.dataset.color = colorName;
    if (colorName === selectedGroupColor) {
      btn.style.borderColor = 'var(--text)';
      btn.style.transform = 'scale(1.25)';
    }
    btn.addEventListener('click', () => {
      selectedGroupColor = colorName;
      container.querySelectorAll('button').forEach(b => {
        b.style.borderColor = 'transparent';
        b.style.transform = 'scale(1)';
      });
      btn.style.borderColor = 'var(--text)';
      btn.style.transform = 'scale(1.25)';
    });
    container.appendChild(btn);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  locales = await loadLocales();
  const lang = await loadSettings();
  applyLang(lang);
  initColorPicker();
});

document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) {
    const r = await chrome.storage.local.get(['soundEnabled', 'volume', 'lang', 'theme']);
    soundEnabled = r.soundEnabled !== undefined ? r.soundEnabled : true;
    soundVolume  = r.volume !== undefined ? r.volume : 80;
    applyThemeVal(r.theme || 'system');
    const lang = r.lang || 'en';
    if (lang !== currentLang) applyLang(lang);
  }
});

// ── Event listeners ────────────────────────────────────────────────────────
document.getElementById('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('.sub-tab-btn').forEach(b => b.addEventListener('click', () => switchSubTab(b.dataset.sub)));

// Preview toggle
document.getElementById('togglePreviewBtn').addEventListener('click', async () => {
  const btn = document.getElementById('togglePreviewBtn');
  const wrap = document.getElementById('savePreviewWrap');
  const list = document.getElementById('savePreviewList');
  const isOpen = wrap.style.display !== 'none';
  if (!isOpen) {
    list.innerHTML = '';
    const ignoreGroupedPrev = document.getElementById('ignoreGroupedTabs') && document.getElementById('ignoreGroupedTabs').checked;
    let tabs = await chrome.tabs.query({ currentWindow: true });
    if (ignoreGroupedPrev) tabs = tabs.filter(tab => !tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
    tabs.forEach(tab => {
      const row = document.createElement('div');
      row.className = 'group-url-item';
      row.textContent = decodeUrl(tab.url);
      row.title = tab.title || tab.url;
      list.appendChild(row);
    });
    wrap.style.display = 'block';
    btn.dataset.open = '1';
    btn.textContent = t.hidePreviewBtn || '👁 Hide preview';
  } else {
    wrap.style.display = 'none';
    delete btn.dataset.open;
    btn.textContent = t.previewTabsBtn || '👁 Preview tabs to save';
  }
});

document.getElementById('saveGroupBtn').addEventListener('click', saveCurrentTabsAsGroup);
document.getElementById('groupName').addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrentTabsAsGroup(); });

document.getElementById('skipDuplicates').addEventListener('change', saveInlineSettings);
document.getElementById('delay').addEventListener('change', () => {
  const i = document.getElementById('delay');
  if (isNaN(parseInt(i.value)) || parseInt(i.value) < 0) i.value = 0;
  saveInlineSettings();
});
document.getElementById('delay').addEventListener('input', () => {
  const i = document.getElementById('delay');
  if (!isNaN(parseInt(i.value)) && parseInt(i.value) < 0) i.value = 0;
});

['groupSkipExistingGroups','groupSkipExistingUrls','groupTopUpMissing','groupReportConflicts','deduplicateSave'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', saveGroupOptions);
});

// ignoreGroupedTabs: save + refresh preview if open
const igtCheckbox = document.getElementById('ignoreGroupedTabs');
if (igtCheckbox) {
  igtCheckbox.addEventListener('change', async () => {
    saveGroupOptions();
    const wrap = document.getElementById('savePreviewWrap');
    if (wrap && wrap.style.display !== 'none') {
      // re-build preview with new filter
      const list = document.getElementById('savePreviewList');
      list.innerHTML = '';
      let tabs = await chrome.tabs.query({ currentWindow: true });
      if (igtCheckbox.checked) tabs = tabs.filter(tab => !tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
      tabs.forEach(tab => {
        const row = document.createElement('div');
        row.className = 'group-url-item';
        row.textContent = decodeUrl(tab.url); row.title = tab.title || tab.url;
        list.appendChild(row);
      });
    }
  });
}

document.getElementById('collectUrls').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  document.getElementById('urlList').value = tabs.map(t => decodeUrl(t.url)).join('\n');
  updateStatus(t.statusCollected);
  updateTabsInfo();
});

document.getElementById('collectSelectedUrls').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
  if (!tabs.length) { updateStatus(t.noSelectedTabs, false, true); return; }
  document.getElementById('urlList').value = tabs.map(t => decodeUrl(t.url)).join('\n');
  updateStatus(t.selectedCollected);
  updateTabsInfo();
});

document.getElementById('openUrls').addEventListener('click', async () => {
  if (isOpening) {
    shouldStop = true;
    if (currentOperation) { clearTimeout(currentOperation); currentOperation = null; }
    updateStatus(t.statusCancelled, true);
    isOpening = false; shouldStop = false; updateButtonText(0, 0, 0);
    return;
  }
  const urlList = document.getElementById('urlList').value;
  if (!urlList.trim()) { updateStatus(t.statusNoUrls, false, true); return; }

  const urls = urlList.split('\n').filter(u => u.trim());
  const skipDuplicates = document.getElementById('skipDuplicates').checked;
  const delay = Math.max(0, parseInt(document.getElementById('delay').value) || 0);

  if (urls.length > 15) {
    if (!window.confirm((t.confirmOpen || 'Open {count} tabs?').replace('{count}', urls.length))) {
      updateStatus(t.statusCancelled); return;
    }
  }

  try {
    isOpening = true; shouldStop = false;
    const win = await chrome.windows.getCurrent();
    const existingTabs = await chrome.tabs.query({ currentWindow: true });
    const existingUrls = new Set(existingTabs.map(tab => normalizeUrl(tab.url)));
    const normalized = urls.map(u => ({ original: u.trim(), normalized: normalizeUrl(u) }));

    let urlsToOpen;
    if (skipDuplicates) {
      const seen = new Set(existingUrls);
      urlsToOpen = normalized.filter(u => { if (!u.original || seen.has(u.normalized)) return false; seen.add(u.normalized); return true; }).map(u => u.original);
      if (!urlsToOpen.length && normalized.length) {
        updateStatus(t.statusOnlyDuplicates, true, true); isOpening = false; shouldStop = false; updateButtonText(0,0,0); return;
      }
    } else { urlsToOpen = normalized.map(u => u.original); }

    let openedCount = 0;
    updateButtonText(openedCount, urlsToOpen.length, urls.length);

    const openNextUrl = async () => {
      if (shouldStop || openedCount >= urlsToOpen.length) {
        isOpening = false; shouldStop = false; updateButtonText(0,0,0); await updateTabsInfo(); return;
      }
      const url = urlsToOpen[openedCount];
      if (url) {
        try {
          await chrome.tabs.create({ url, active: false, windowId: win.id });
          openedCount++;
          updateButtonText(openedCount, urlsToOpen.length, urls.length);
          updateStatus((t.statusOpened || 'Opened {count} new tabs').replace('{count}', openedCount), true);
          await updateTabsInfo();
        } catch (e) { console.error(e); }
      }
      if (openedCount < urlsToOpen.length) {
        if (delay > 0) { currentOperation = setTimeout(openNextUrl, delay); } else { await openNextUrl(); }
      } else { isOpening = false; updateButtonText(0,0,0); await updateTabsInfo(); }
    };
    await openNextUrl();
  } catch (e) { console.error(e); updateStatus(t.statusError, true, true); }
});

chrome.tabs.onCreated.addListener(updateTabsInfo);
chrome.tabs.onRemoved.addListener(updateTabsInfo);
chrome.tabs.onUpdated.addListener(updateTabsInfo);

// ── Restore all / Check conflicts ─────────────────────────────────────────
const restoreAllBtn = document.getElementById('restoreAllBtn');
if (restoreAllBtn) restoreAllBtn.addEventListener('click', restoreAllGroups);

const checkConflictsBtn = document.getElementById('checkConflictsBtn');
if (checkConflictsBtn) checkConflictsBtn.addEventListener('click', checkGroupConflicts);
