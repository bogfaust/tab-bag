# Tab Bag 🛍️

![Version](https://img.shields.io/badge/version-0.0.3-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Platform](https://img.shields.io/badge/platform-Chrome-yellow)

---

## Features

- **Collect all tabs** — grab URLs from every open tab in the current window in one click
- **Collect selected tabs** — hold `Ctrl`/`Cmd` and click tabs to select, then collect only those
- **Open URLs in bulk** — paste a list of URLs and open them all as new tabs
- **Skip duplicates** — optionally filter out URLs already open in the window
- **Open delay** — set a delay (in ms) between each tab opening to avoid browser overload
- **Confirmation prompt** — asks before opening more than 15 tabs at once
- **Stop mid-way** — cancel the opening process at any time
- **Sound on errors** — plays a sound when something goes wrong (enabled by default)
- **Volume control** — adjust notification volume in settings
- **Multilingual** — English and Russian interfaces

---

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the extension folder

---

## Usage

### Collect tabs
Click the extension icon → press **Collect tab URLs** to fill the text area with all open tab URLs.  
To collect only specific tabs — highlight them in the tab bar first, then click **Collect selected tabs**.

### Restore tabs
Paste any list of URLs (one per line) into the text area → click **Open URLs in new tabs**.  
The button turns into a live counter showing progress. Click it again to stop.

### Settings
Click **⚙ Settings** to open the options page:
- Switch interface language (English / Russian)
- Enable or disable error sounds
- Adjust notification volume
- Test the sound before saving

---


### Localization

Supported languages: **English** (`en`), **Russian** (`ru`).  