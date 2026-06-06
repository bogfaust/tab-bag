let locales = {};
let currentLang = 'en';
let t = {};

async function loadLocales() {
  const url = chrome.runtime.getURL('locales.json');
  const res = await fetch(url);
  return await res.json();
}

function applyLang(lang) {
  currentLang = lang;
  t = locales[lang] || locales['en'];

  document.getElementById('pageTitle').textContent = t.settingsTitle;
  document.getElementById('sectionLang').textContent = t.sectionLang;
  document.getElementById('sectionSound').textContent = t.sectionSound;
  document.getElementById('labelSoundEnabled').textContent = t.labelSoundEnabled;
  document.getElementById('labelVolume').textContent = t.labelVolume;
  document.getElementById('saveBtn').textContent = t.saveBtn;
  document.getElementById('savedMsg').textContent = t.savedMsg;
  document.getElementById('testSound').textContent = t.testSound;
  document.title = t.settingsTitle;

  document.getElementById('langEN').classList.toggle('active', lang === 'en');
  document.getElementById('langRU').classList.toggle('active', lang === 'ru');
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['lang', 'soundEnabled', 'volume']);
  currentLang = result.lang || 'en';
  applyLang(currentLang);
  document.getElementById('soundEnabled').checked = result.soundEnabled !== undefined ? result.soundEnabled : true;
  const vol = result.volume !== undefined ? result.volume : 80;
  document.getElementById('volume').value = vol;
  document.getElementById('volumeDisplay').textContent = vol + '%';
}

function playQuack(volume) {
  const audio = new Audio(chrome.runtime.getURL('assets/sounds/quack.mp3'));
  audio.volume = volume / 100;
  audio.play().catch(() => {});
}

document.addEventListener('DOMContentLoaded', async () => {
  locales = await loadLocales();
  await loadSettings();
});

document.getElementById('langEN').addEventListener('click', () => applyLang('en'));
document.getElementById('langRU').addEventListener('click', () => applyLang('ru'));

document.getElementById('volume').addEventListener('input', (e) => {
  document.getElementById('volumeDisplay').textContent = e.target.value + '%';
});

document.getElementById('testSound').addEventListener('click', () => {
  const vol = parseInt(document.getElementById('volume').value);
  playQuack(vol);
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const soundEnabled = document.getElementById('soundEnabled').checked;
  const volume = parseInt(document.getElementById('volume').value);
  await chrome.storage.local.set({ lang: currentLang, soundEnabled, volume });

  const msg = document.getElementById('savedMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
});
