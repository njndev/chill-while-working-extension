# Chill While Working - YouTube Picture-in-Picture Extension

A Chrome Extension (Manifest V3) that enhances the YouTube viewing experience by opening videos in a minimalistic, resizable popup window with Picture-in-Picture controls, allowing users to watch content while working without distractions.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)

---

## Features

### Core Functionality
- **Popup Window Playback**: Open YouTube videos in a customizable popup window
- **Configurable Size & Position**: Set window dimensions and anchor position (4 corners)
- **Picture-in-Picture Mode**: Automatic PiP request with enhanced controls
- **Ad Skipping**: Programmatic YouTube ad bypass functionality
- **History Tracking**: Store up to 30 recent videos with automatic title fetching
- **Context Menu Integration**: Add videos to Chill List from any YouTube page or link
- **Theme Support**: Dark and light mode with persistent preference
- **Auto-Next**: Optional autoplay configuration for continuous playback

### User Interface
- **Side Panel Control**: Terminal-inspired UI for configuration and history
- **Floating Button**: "Add to Chill List" button on YouTube pages
- **Minimal Player UI**: Distraction-free video player with hidden YouTube chrome
- **Enhanced Controls**: "Let's Chill" and "Skip Ad" buttons in popup window

---

## Installation

### From Source

1. Clone the repository:
```bash
git clone https://github.com/njndev/chill-while-working-extension.git
cd chill-while-working-extension
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the extension directory

5. Click the extension icon to open the side panel

---

## Usage

### Quick Start

1. **Open Side Panel**: Click the extension icon in Chrome toolbar
2. **Configure Settings**: 
   - Enter YouTube URL or use history
   - Set window size (width/height)
   - Choose anchor position (BR/TR/BL/TL)
   - Enable/disable Auto-Next
3. **Save Settings**: Click "Save Settings" to persist configuration
4. **Play Video**: Click "Play" button to open popup window

### Adding Videos to History

**Method 1: From YouTube Page**
- Navigate to any YouTube video
- Click the floating "Add to Chill List" button (top-right)
- Video is added to history with automatic title fetching

**Method 2: Context Menu**
- Right-click on any YouTube page or link
- Select "Add to Chill List" from context menu
- URL is saved to history for later playback

**Method 3: Direct Input**
- Paste YouTube URL in side panel input field
- Click "Play" to open and automatically add to history

### Enhanced Playback Experience

**Picture-in-Picture Controls:**
- **"Let's Chill" Button**: Activates browser PiP and minimizes popup window
- **"Skip Ad" Button**: Bypasses YouTube advertisements automatically

**Automatic Features:**
- Player automatically requests PiP mode on load
- Theater mode is forced for optimal viewing
- UI chrome (masthead, sidebar, comments) is hidden
- Video player fills entire popup window

### Managing History

- **View History**: Scroll through recent videos in side panel
- **Play from History**: Click "Play" button on any history entry
- **Remove Entry**: Click "Remove" button to delete from history
- **Open Original**: Click URL link to open video in new tab

---

## Architecture

### File Structure
```
chill-while-working-extension/
??? manifest.json                 # Manifest V3 configuration
??? background.js                 # Service worker (background script)
??? side_panel.html              # Side panel UI structure
??? side_panel.css               # Side panel styles (terminal theme)
??? side_panel.js                # Side panel logic and event handlers
??? content_script.js            # Injected on YouTube pages
??? youtube_inject.js            # Injected into popup windows
??? youtube_inject.css           # Styles for popup windows
??? images/                      # Extension icons
?   ??? logo.png
?   ??? logo_16.png
?   ??? logo_32.png
?   ??? logo_48.png
?   ??? logo_128.png
??? README.md                    # Project documentation
```

### Component Architecture

#### 1. Manifest Configuration (`manifest.json`)
- **Manifest Version**: 3
- **Permissions**: 
  - `tabs` - Tab management and querying
  - `scripting` - Dynamic script/CSS injection
  - `storage` - Settings and history persistence
  - `system.display` - Screen dimension detection
  - `sidePanel` - Side panel UI integration
  - `contextMenus` - Context menu registration
- **Host Permissions**: YouTube domains (youtube.com, youtu.be, music.youtube.com)
- **Service Worker**: `background.js`
- **Content Scripts**: Auto-injected on YouTube pages

#### 2. Background Service Worker (`background.js`)

**Message Handlers:**
- `OPEN_YOUTUBE` - Creates popup window with calculated position
- `STOP_YOUTUBE` - Closes active popup window
- `ADD_TO_HISTORY` - Adds URL to history with title fetching
- `MINIMIZE_CHILL_WINDOW` - Minimizes active popup window

**Window Management:**
- Tracks active popup window ID
- Calculates position based on screen dimensions and user preference
- Injects `youtube_inject.css` and `youtube_inject.js` into popup windows
- Tags URLs with `ypip_ext=1` parameter for identification
- Sets `window.name` to `chill-mini-window` for detection

**History Management:**
- Fetches video titles using YouTube oEmbed API
- Stores up to 30 recent entries in `chrome.storage.local`
- De-duplicates entries by URL
- Timestamps with ISO format

**Context Menu:**
- "Add to Chill List" menu item on YouTube pages/links
- Adds clicked URL to history for later playback

#### 3. Side Panel UI (`side_panel.html`, `side_panel.css`, `side_panel.js`)

**Design Pattern**: Terminal-inspired interface with dark/light theme toggle

**Features:**
- YouTube URL input field
- Window size configuration (width, height with number inputs)
- Position selector (4 radio buttons: BR, TR, BL, TL)
- Auto-Next checkbox (appends `&autoplay=1` to URL)
- Save Settings button (persists to `chrome.storage.sync`)
- Play button (opens configured popup window)
- Stop button (closes active popup window)
- Theme toggle (persists to `chrome.storage.local`)
- History panel (displays recent videos with play/remove actions)

**Default Settings:**
```javascript
{
  width: 350,
  height: 200,
  position: "bottom-right",
  autoNext: true
}
```

**Storage Keys:**
- `ypipHistory` (chrome.storage.local) - Array of history entries (max 30)
- `ypipTheme` (chrome.storage.local) - Theme preference ("dark" or "light")
- Settings stored in chrome.storage.sync (width, height, position, autoNext)

#### 4. Content Script (`content_script.js`)

**Injection**: Runs on all YouTube pages (watch, shorts, live, youtu.be)

**Functionality:**
- Detects watch context (video pages)
- Injects floating "Add to Chill List" button
- Button positioned fixed at top-right (80px from top, 20px from right)
- Sends `ADD_TO_HISTORY` message to background script
- Provides visual feedback (Saving..., Added!, Error)
- Automatically hides button in extension-created windows

**Detection Logic:**
- Checks for `ypip_ext=1` URL parameter
- Checks for `window.name === "chill-mini-window"`
- Listens for `CHILL_MINI_MODE` message from background
- Uses MutationObserver to handle SPA navigation

#### 5. YouTube Inject Scripts (`youtube_inject.js`, `youtube_inject.css`)

**CSS Functionality:**
- Hides masthead, sidebar, comments, recommendations, descriptions
- Forces black background
- Maximizes player to full viewport (100vw x 100vh)
- Hides scrollbars

**JavaScript Functionality:**
- Forces theater mode on player
- Makes video player primary focus
- Automatically requests Picture-in-Picture mode
- Creates control dock with two buttons:
  - "Let's Chill" - Toggles PiP and minimizes window
  - "Skip Ad" - Skips YouTube ads programmatically
- Ad skipping logic:
  - Clicks skip buttons when available
  - Fast-forwards to end of video when ad overlay detected
- Uses MutationObserver to maintain player state

---

## User Workflows

### 1. Setup Configuration
1. User clicks extension icon to open side panel
2. Configures window size (width, height)
3. Selects anchor position (BR, TR, BL, TL)
4. Enables/disables Auto-Next
5. Clicks "Save Settings" to persist configuration

### 2. Direct Playback
1. User pastes YouTube URL into input field
2. Clicks "Play" button
3. Extension opens popup window at configured position
4. Video plays in minimal UI with PiP controls
5. URL automatically added to history

### 3. Add to History
1. User navigates to YouTube video
2. Clicks floating "Add to Chill List" button OR
3. Right-clicks page/link and selects "Add to Chill List"
4. URL added to history with fetched title
5. Visual feedback confirms action

### 4. Play from History
1. User opens side panel
2. Views history list with titles and timestamps
3. Clicks "Play" button on history entry
4. Video opens in popup window
5. History entry remains for repeat playback

### 5. Enhanced PiP Experience
1. "Let's Chill" button activates browser PiP
2. Popup window automatically minimizes
3. "Skip Ad" button bypasses YouTube advertisements
4. Native browser PiP controls available

---

## Technical Details

### Chrome Extension APIs Used

- **chrome.runtime**: Message passing, error handling
- **chrome.storage.sync**: Settings persistence (synced across devices)
- **chrome.storage.local**: History and theme storage (local only)
- **chrome.windows**: Window creation, positioning, state management
- **chrome.tabs**: Tab querying, event listening
- **chrome.scripting**: Dynamic CSS/JS injection
- **chrome.system.display**: Screen dimension detection
- **chrome.sidePanel**: Side panel configuration
- **chrome.contextMenus**: Context menu registration

### Position Calculation Algorithm

```javascript
function calculatePosition(bounds, width, height, position) {
  const margin = 16;
  let left = bounds.left + bounds.width - width - margin;
  let top = bounds.top + bounds.height - height - margin;

  if (position.includes("left")) {
    left = bounds.left + margin;
  }
  if (position.includes("top")) {
    top = bounds.top + margin;
  }

  return { left, top };
}
```

### Message Passing Format

All messages follow structured format:
```javascript
{
  type: "ACTION_NAME",
  payload: { /* action-specific data */ }
}
```

**Response Format:**
```javascript
{
  ok: true | false,
  error?: string
}
```

### URL Tagging

Extension windows are identified by:
1. URL parameter: `ypip_ext=1`
2. Window name: `chill-mini-window`
3. Message broadcast: `CHILL_MINI_MODE`

### History Entry Structure

```javascript
{
  url: string,              // YouTube video URL
  title: string,            // Fetched from YouTube oEmbed API
  addedAt: number,          // Unix timestamp
  createdTime: string       // ISO 8601 format
}
```

### Theme Implementation

- CSS custom properties for color scheme
- Data attribute switching: `data-theme="dark|light"`
- Persistent storage in `chrome.storage.local`
- Automatic application on load

---

## Browser Compatibility

- **Minimum Chrome Version**: 109+ (Manifest V3 support)
- **Tested On**: Chrome 120+, Edge 120+
- **Not Compatible**: Firefox (Manifest V3 implementation differs)

---

## Limitations & Known Issues

1. **Playlist Support**: Basic playlist support (plays first video)
2. **YouTube Music**: Limited functionality on music.youtube.com
3. **Ad Blocking**: Ad skipping may not work on all ad types
4. **PiP Restrictions**: Some YouTube videos disable PiP (live streams)
5. **Window State**: Last window position per video not remembered

---

## Development

### Prerequisites
- Chrome Browser (version 109+)
- Basic knowledge of Chrome Extension APIs
- Text editor or IDE

### Local Development

1. Make changes to source files
2. Navigate to `chrome://extensions/`
3. Click "Reload" button on extension card
4. Test changes in browser

### Debugging

**Service Worker (background.js):**
- Navigate to `chrome://extensions/`
- Click "Service worker" link under extension
- Use DevTools console for logging

**Content Scripts:**
- Open YouTube page
- Right-click page and select "Inspect"
- Check console for content script logs

**Side Panel:**
- Open side panel
- Right-click panel area and select "Inspect"
- Use DevTools for UI debugging

---

## Roadmap

### Planned Features
- Playlist queue management
- Keyboard shortcuts
- Custom themes and color schemes
- Export/import history
- Thumbnail previews in history
- Remember last window position per video
- Fullscreen toggle button
- Volume controls in dock
- Integration with YouTube Music

### Potential Enhancements
- Multi-window support (multiple videos)
- Video bookmark markers
- Playback speed controls
- Video filters and effects
- Statistics and watch time tracking

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style Guidelines
- Use ES6+ features (const, let, arrow functions, async/await)
- Handle `chrome.runtime.lastError` in all Chrome API callbacks
- Use try-catch for error handling in async functions
- Follow existing code patterns and conventions
- All code, comments, and documentation in English

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Author

**njndevai**

- GitHub: [@njndev](https://github.com/njndev)
- Repository: [chill-while-working-extension](https://github.com/njndev/chill-while-working-extension)

---

## Acknowledgments

- Inspired by the need for distraction-free video playback while working
- Built with vanilla JavaScript and Chrome Extension APIs
- Terminal-inspired UI design for clean, minimal aesthetic

---

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/njndev/chill-while-working-extension/issues) page
2. Create a new issue with detailed description
3. Include browser version, extension version, and steps to reproduce

---

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Picture-in-Picture popup window functionality
- Configurable size and position
- History tracking with title fetching
- Context menu integration
- Dark/light theme support
- Ad skipping functionality
- Enhanced PiP controls
- Terminal-inspired UI

---

**Enjoy distraction-free YouTube playback while staying productive!**
