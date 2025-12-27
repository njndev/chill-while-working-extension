# Privacy Policy for Chill While Working - YouTube Picture-in-Picture Extension

**Last Updated:** [INSERT DATE]

## Overview

Chill While Working is a Chrome extension that enhances your YouTube viewing experience by providing Picture-in-Picture functionality in a customizable floating window. We are committed to protecting your privacy and being transparent about how this extension works.

## Data Collection and Storage

### What Data We Store Locally

This extension stores the following data **locally on your device only**:

1. **User Preferences**
   - Window size (width and height)
   - Window position preference (bottom-right, top-right, bottom-left, top-left)
   - Autoplay setting (on/off)
   - Theme preference (dark/light mode)
   - Stored using: `chrome.storage.sync` (synchronized across your Chrome browsers when signed in)

2. **Watch History**
   - YouTube video URLs you've saved
   - Video titles (fetched from YouTube's public oEmbed API)
   - Timestamps of when videos were added
   - Limited to 30 most recent entries
   - Stored using: `chrome.storage.local` (local to your device only)

### What Data We DO NOT Collect

- We do **NOT** collect any personally identifiable information
- We do **NOT** track your browsing history outside of YouTube videos you explicitly save
- We do **NOT** collect your name, email, or any account information
- We do **NOT** track your location
- We do **NOT** collect financial or payment information
- We do **NOT** monitor your activity across websites

## Data Transmission

**This extension does NOT transmit any data to external servers or third parties.**

The only external network request made is:
- **YouTube oEmbed API** (`https://www.youtube.com/oembed?url=[VIDEO_URL]`) - Used solely to fetch video titles for display in your watch history. This is a read-only operation using YouTube's public API and does not transmit any of your personal data.

All other data remains on your device.

## How We Use Your Data

Your locally stored data is used exclusively for:

1. **User Preferences**: To remember your preferred window size, position, and settings so you don't have to reconfigure them each time
2. **Watch History**: To provide quick access to YouTube videos you've previously saved, allowing you to replay them easily

## Data Control and Deletion

You have full control over your data:

- **Delete Individual History Entries**: Click the "×" button next to any video in your history
- **Clear All Settings**: Remove the extension from Chrome to delete all stored data
- **Clear Browsing Data**: Use Chrome's "Clear browsing data" feature and select "Hosted app data"
- **No Account Required**: Since all data is local, there's no account to manage or data to request from servers

## Permissions Explained

This extension requests the following permissions:

### Required Permissions

1. **tabs**: To create and manage popup windows for YouTube videos
2. **scripting**: To inject minimal CSS and JavaScript into YouTube pages for a distraction-free viewing experience
3. **storage**: To save your preferences and watch history locally
4. **system.display**: To calculate optimal window positioning based on your screen size
5. **sidePanel**: To provide the configuration and control interface
6. **contextMenus**: To add "Add to Chill List" option to right-click menus on YouTube pages

### Host Permissions

- **YouTube domains** (`*.youtube.com`, `*.youtu.be`): Required to interact with YouTube pages, inject player enhancements, and enable Picture-in-Picture functionality

**Important**: This extension only operates on YouTube domains and does not access or modify any other websites.

## Third-Party Services

This extension uses:
- **YouTube oEmbed API**: A public, read-only API provided by YouTube to fetch video metadata (titles). No authentication or personal data is required or transmitted.

This extension does NOT use:
- Analytics services (e.g., Google Analytics)
- Advertising networks
- Social media tracking pixels
- Third-party data collection services

## Children's Privacy

This extension does not knowingly collect any information from children under the age of 13. The extension operates the same way for all users regardless of age, storing only YouTube video URLs and user preferences locally.

## Changes to This Privacy Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this policy. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Data Security

Since all data is stored locally on your device using Chrome's secure storage APIs:
- Data is protected by your device's security measures
- Data is encrypted if your device uses full-disk encryption
- Data is never transmitted over the internet (except the read-only YouTube API call for video titles)

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- Chrome Extension Privacy Requirements
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

Under GDPR and CCPA, you have the right to:
- Access your data (stored locally on your device)
- Delete your data (via extension controls or by removing the extension)
- Opt-out of data collection (by not using the extension)

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/njndev/chill-while-working-extension

## Contact

If you have questions or concerns about this privacy policy or the extension's data practices, please contact:

- **Email**: [INSERT YOUR CONTACT EMAIL]
- **GitHub Issues**: https://github.com/njndev/chill-while-working-extension/issues

## Your Consent

By installing and using this extension, you consent to this privacy policy and the data practices described herein.

---

**Summary in Plain Language:**

This extension stores your settings and YouTube video history on your device only. Nothing is sent to any servers (except fetching video titles from YouTube's public API). You control your data and can delete it anytime. We don't track you, sell your data, or collect personal information.
