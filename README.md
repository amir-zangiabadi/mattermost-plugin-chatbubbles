# Chat Bubbles — Telegram-style chat for Mattermost

A webapp-only Mattermost plugin that turns your channels and direct messages into a Telegram-style chat experience: message bubbles, floating hover actions, Telegram-style replies, forwarding, a pinned-message bar, chat wallpapers, and more.

No server binary required — the plugin is pure JavaScript/CSS and works on Mattermost Web and Desktop.

![Chat Bubbles preview](assets/preview.png)

## Features

- **Message bubbles** — your messages on the right, received messages on the left, with Telegram-style bubble tails on the last message of each group
- **Chat wallpaper** — a recreation of Telegram's default wallpaper (soft green gradient + subtle doodle pattern), or your own custom image; the wallpaper stays fixed while messages scroll over it, exactly like Telegram
- **Frosted-glass bubbles** — when a wallpaper is on, bubbles get a backdrop blur so text stays readable
- **Telegram-style reply** — a non-editable preview bar above the message box; double-click any message to reply without opening the thread panel
- **Forward** — forward button in the hover menu with a destination chat picker and a "Forwarded from" header
- **Pinned message bar** — the latest pinned message in a bar at the top of the chat; click to jump, × to unpin
- **Time inside bubble** — send time in the bottom corner next to the read ticks
- **Floating date chip** — Today / Yesterday / date label while scrolling
- **Scroll-to-bottom button** — round button with a new-message counter
- **Message sounds** — subtle send/receive sounds in the open chat
- **Quote jump** — click a quote card to scroll to the original message in place
- Fully theme-aware (`auto` colors follow the active Mattermost theme, including dark themes)

## Installation

1. Download the latest `com.karman.chatbubbles-x.y.z.tar.gz` from the [Releases](../../releases) page (or build it yourself, see below).
2. In Mattermost, go to **System Console → Plugins → Plugin Management**.
3. Upload the `.tar.gz` file and **Enable** the plugin.
4. Ask users to refresh their Mattermost page.

> Uploading requires **Enable Plugin Uploads** (`PluginSettings.EnableUploads: true` in `config.json`).

## Settings

All settings live in **System Console → Plugins → Chat Bubbles**. After changing settings, users must refresh their page.

| Setting | Default | Description |
| --- | --- | --- |
| Enable chat bubbles | `true` | Master switch for the whole bubble mode |
| Only in DMs and group messages | `false` | Restrict bubbles to DMs/group messages (no channels) |
| My bubble color | `auto` | Your bubble color; `auto` follows the theme, or a hex like `#effdde` |
| Their bubble color | `auto` | Received bubble color |
| Bubble text color | `auto` | Text color inside bubbles |
| Max bubble width (%) | `70` | 30–95 |
| Hide my avatar | `true` | Hide the avatar on your own messages |
| Telegram-style reply | `true` | Reply preview bar above the message box |
| Time inside bubble | `true` | Send time in the bubble corner |
| Pinned message bar | `true` | Telegram-style pinned bar at the top |
| Floating date chip | `true` | Date label while scrolling |
| Scroll-to-bottom button | `true` | With new-message counter |
| Double-click to reply | `true` | Double-click a message to reply |
| Forward button | `true` | Forward with chat picker |
| Bubble tail | `true` | Telegram-style bubble tails |
| Message sounds | `true` | Send/receive sounds |
| Chat background (wallpaper) | `telegram` | `off`, `telegram` (default pattern), or `custom` |
| Custom background image URL | *(empty)* | `https://...` or a server path like `/files/...`; used with `custom` |
| Background dim (%) | `0` | 0–80; darkens the wallpaper for readability (30–50 recommended for dark themes) |

### Custom wallpapers

Set **Chat background** to *Custom image* and put an image URL in **Custom background image URL**. Any image reachable by the client browser works:

- a public URL (`https://example.com/wallpaper.jpg`), or
- a file served by your own Mattermost server (e.g. a path under `/static/` or any relative path starting with `/`).

The image is rendered `cover`-fit and fixed, so it does not move while messages scroll. Use **Background dim** if text is hard to read on a bright image.

## Building the bundle

The webapp bundle is plain, dependency-free JavaScript — there is no compile step. Packaging just stages the files into the layout Mattermost expects:

```bash
make dist
# → dist/com.karman.chatbubbles-<version>.tar.gz
```

Or manually:

```bash
mkdir -p build/com.karman.chatbubbles/webapp/dist
cp plugin.json build/com.karman.chatbubbles/
cp webapp/dist/main.js build/com.karman.chatbubbles/webapp/dist/
tar -C build -czf com.karman.chatbubbles-1.7.0.tar.gz com.karman.chatbubbles
```

## How it works

The plugin registers a webapp bundle that:

- injects a `<style>` element built from the admin settings (bubbles, tails, wallpaper, etc.), keyed on Mattermost's own post classes — no DOM rewriting of message content;
- reads its settings from `/api/v4/config` (plugin settings are exposed to clients);
- adds small DOM widgets (reply bar, pinned bar, date chip, scroll button, forward modal) and event listeners for double-click reply and quote jumping.

Because it is CSS-driven and webapp-only, it cannot break message data and can be disabled instantly from the System Console.

## Compatibility

- Mattermost Web and Desktop apps (the desktop app embeds the web client).
- Mobile apps are **not** affected (they don't load webapp plugins).
- Tested with recent Mattermost releases; selectors target the standard `post` DOM classes.

## License

[MIT](LICENSE)
