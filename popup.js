let isOpening = false;
let shouldStop = false;
let currentOperation = null;
let currentLang = 'en';
let t = {};
let locales = {};
// Sound settings (loaded from storage)
let soundEnabled = false;
let soundVolume = 80;

async function loadLocales() {
  const url = chrome.runtime.getURL('locales.json');
  const res = await fetch(url);
  return await res.json();
}

function applyLang(lang) {
  currentLang = lang;
  t = locales[lang] || locales['en'];

  document.getElementById('openSettings').textContent = t.openSettings;
  document.getElementById('collectUrls').textContent = t.collectUrls;
  document.getElementById('collectSelectedUrls').textContent = t.collectSelectedUrls;
  document.getElementById('labelSkipDuplicates').textContent = t.skipDuplicates;
  document.getElementById('labelDelay').textContent = t.delayLabel;
  document.getElementById('statsTitle').textContent = t.statsTitle;

  if (!isOpening) {
    document.getElementById('openUrls').textContent = t.openUrls;
    document.getElementById('openUrls').classList.remove('stop');
  }

  updateTabsInfo();
}

// Error sound — plays quack.mp3 on error events
function playErrorSound() {
  if (!soundEnabled) return;
  const audio = new Audio(chrome.runtime.getURL('assets/sounds/quack.mp3'));
  audio.volume = soundVolume / 100;
  audio.play().catch(() => {});
}

function updateStatus(message, persist = false, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status' + (isError ? ' error' : '');
  if (isError) playErrorSound();
  if (!persist) {
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 3000);
  }
}

function decodeUrl(url) {
  try { return decodeURIComponent(url); } catch (e) { return url; }
}

async function updateTabsInfo() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  document.getElementById('tabsInfo').textContent = (t.openTabsCount || 'Open tabs: ') + tabs.length;
}

function saveSettings() {
  const skipDuplicates = document.getElementById('skipDuplicates').checked;
  const delay = Math.max(0, parseInt(document.getElementById('delay').value) || 0);
  document.getElementById('delay').value = delay;
  chrome.storage.local.set({ skipDuplicates, delay });
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['skipDuplicates', 'delay', 'lang', 'soundEnabled', 'volume']);
  document.getElementById('skipDuplicates').checked =
    result.skipDuplicates !== undefined ? result.skipDuplicates : true;
  document.getElementById('delay').value = Math.max(0, result.delay || 0);
  soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;
  soundVolume = result.volume !== undefined ? result.volume : 80;
  return result.lang || 'en';
}

function updateButtonText(processed, unique, total) {
  const button = document.getElementById('openUrls');
  if (isOpening) {
    button.textContent = `${t.stopOpening} ${processed}/${unique} (${total})`;
    button.classList.add('stop');
  } else {
    button.textContent = t.openUrls;
    button.classList.remove('stop');
  }
}

function normalizeUrl(url) {
  try {
    return new URL(url).href.replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  locales = await loadLocales();
  const savedLang = await loadSettings();
  applyLang(savedLang);
});

// Re-load sound settings when popup regains focus (user may have changed them in options)
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) {
    const result = await chrome.storage.local.get(['soundEnabled', 'volume', 'lang']);
    soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;
    soundVolume = result.volume !== undefined ? result.volume : 80;
    const lang = result.lang || 'en';
    if (lang !== currentLang) applyLang(lang);
  }
});

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('skipDuplicates').addEventListener('change', saveSettings);
document.getElementById('delay').addEventListener('change', () => {
  const input = document.getElementById('delay');
  if (isNaN(parseInt(input.value)) || parseInt(input.value) < 0) input.value = 0;
  saveSettings();
});
document.getElementById('delay').addEventListener('input', () => {
  const input = document.getElementById('delay');
  if (!isNaN(parseInt(input.value)) && parseInt(input.value) < 0) input.value = 0;
});

document.getElementById('collectUrls').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs.map(tab => decodeUrl(tab.url)).join('\n');
  document.getElementById('urlList').value = urls;
  updateStatus(t.statusCollected);
  updateTabsInfo();
});

document.getElementById('collectSelectedUrls').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
  if (tabs.length === 0) {
    updateStatus(t.noSelectedTabs, false, true);
    return;
  }
  const urls = tabs.map(tab => decodeUrl(tab.url)).join('\n');
  document.getElementById('urlList').value = urls;
  updateStatus(t.selectedCollected);
  updateTabsInfo();
});

document.getElementById('openUrls').addEventListener('click', async () => {
  if (isOpening) {
    shouldStop = true;
    if (currentOperation) { clearTimeout(currentOperation); currentOperation = null; }
    updateStatus(t.statusCancelled, true);
    isOpening = false;
    shouldStop = false;
    updateButtonText(0, 0, 0);
    return;
  }

  const urlList = document.getElementById('urlList').value;
  if (!urlList.trim()) {
    updateStatus(t.statusNoUrls, false, true);
    return;
  }

  const urls = urlList.split('\n').filter(url => url.trim());
  const skipDuplicates = document.getElementById('skipDuplicates').checked;
  const delay = Math.max(0, parseInt(document.getElementById('delay').value) || 0);

  if (urls.length > 15) {
    const msg = (t.confirmOpen || 'You are about to open {count} tabs. Continue?').replace('{count}', urls.length);
    if (!window.confirm(msg)) {
      updateStatus(t.statusCancelled);
      return;
    }
  }

  try {
    isOpening = true;
    shouldStop = false;
    const currentWindow = await chrome.windows.getCurrent();

    const existingTabs = await chrome.tabs.query({ currentWindow: true });
    const existingUrls = new Set(existingTabs.map(tab => normalizeUrl(tab.url)));

    const normalizedUrls = urls.map(url => ({
      original: url.trim(),
      normalized: normalizeUrl(url)
    }));

    let urlsToOpen;
    if (skipDuplicates) {
      const seenUrls = new Set(existingUrls);
      urlsToOpen = normalizedUrls.filter(url => {
        if (!url.original || seenUrls.has(url.normalized)) return false;
        seenUrls.add(url.normalized);
        return true;
      }).map(url => url.original);

      if (urlsToOpen.length === 0 && normalizedUrls.length > 0) {
        updateStatus(t.statusOnlyDuplicates, true, true);
        isOpening = false;
        shouldStop = false;
        updateButtonText(0, 0, 0);
        return;
      }
    } else {
      urlsToOpen = normalizedUrls.map(url => url.original);
    }

    let openedCount = 0;
    updateButtonText(openedCount, urlsToOpen.length, urls.length);

    const openNextUrl = async () => {
      if (shouldStop || openedCount >= urlsToOpen.length) {
        isOpening = false;
        shouldStop = false;
        updateButtonText(0, 0, 0);
        await updateTabsInfo();
        return;
      }

      const url = urlsToOpen[openedCount];
      if (url) {
        try {
          await chrome.tabs.create({ url, active: false, windowId: currentWindow.id });
          openedCount++;
          updateButtonText(openedCount, urlsToOpen.length, urls.length);
          const msg = (t.statusOpened || 'Opened {count} new tabs').replace('{count}', openedCount);
          updateStatus(msg, true);
          await updateTabsInfo();
        } catch (error) {
          console.error('Error opening tab:', error);
        }
      }

      if (openedCount < urlsToOpen.length) {
        if (delay > 0) {
          currentOperation = setTimeout(openNextUrl, delay);
        } else {
          await openNextUrl();
        }
      } else {
        isOpening = false;
        updateButtonText(0, 0, 0);
        await updateTabsInfo();
      }
    };

    await openNextUrl();

  } catch (error) {
    console.error('Error:', error);
    updateStatus(t.statusError, true, true);
  }
});

chrome.tabs.onCreated.addListener(updateTabsInfo);
chrome.tabs.onRemoved.addListener(updateTabsInfo);
chrome.tabs.onUpdated.addListener(updateTabsInfo);
