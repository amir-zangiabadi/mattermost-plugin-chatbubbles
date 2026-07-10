# Changelog

All notable changes to this project will be documented in this file.

## [1.11.1] - 2026-07-10

### Added

- **Favicon unread badge**: the browser-tab icon becomes a red circle with the total unread-message count in white, exactly like Telegram Web (`99+` above 99). Restores the original favicon when everything is read. New `Unread badge on browser tab` setting (default on).
- Console helpers for troubleshooting: `cbTestBadge(n)` forces the badge, and a `[ChatBubbles] unread badge count:` line is logged whenever the count changes.

### Fixed

- Competing favicon `<link>` elements from Mattermost are temporarily disabled while the badge is shown, so the browser reliably displays the badge instead of picking its own icon.

## [1.9.0] - 2026-07-10

### Removed

- **Chat wallpaper** feature and its three settings (`Chat background`, `Custom background image URL`, `Background dim`) — it caused layout issues on some setups.

## [1.8.1] - 2026-07-10

### Added

- **Message font size** setting (10–28 px, `0` = theme default); code blocks and quotes scale along, Telegram-style.

### Fixed

- Responsive layout on narrow screens (mobile web): bubbles widen to 90%, the reserved space for the in-bubble time shrinks, so text no longer wraps one word per line.

## [1.7.0] - 2026-07-10

### Added

- **Chat wallpaper**: new `Chat background` setting with three modes — off, a Telegram-style default wallpaper (soft green gradient + subtle doodle pattern), or a custom image URL.
- **Background dim** setting (0–80%) to darken the wallpaper for better readability.
- Frosted-glass (backdrop blur) bubbles when a wallpaper is active.
- Telegram-style chip styling for date and new-message separators on top of wallpapers.

### Changed

- With a wallpaper active, `auto` bubble colors become more opaque so text stays readable.

## [1.6.4]

- Previous release: bubbles, Telegram-style reply, forward with chat picker, pinned bar, time in bubble, floating date chip, scroll-to-bottom button, bubble tails, message sounds.
