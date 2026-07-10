/*
 * Chat Bubbles v1.12.2 — Telegram-style chat experience for Mattermost
 * (web/desktop). Webapp-only plugin: no server binary required.
 *
 * - My messages: bubble on the physical RIGHT; received on the LEFT
 * - Pure-CSS bubble styling driven by Mattermost's own classes
 * - Hover actions float over the bubble like Telegram
 * - Telegram-style reply: non-editable preview bar; quote attached at send
 * - Time inside bubble (bottom-right corner, next to the read ticks)
 * - Telegram-style pinned message bar with unpin (×) button
 * - Floating date chip while scrolling (Today / Yesterday / date)
 * - Scroll-to-bottom round button with new-message counter
 * - Double-click a message to reply (without opening the thread panel)
 * - Click the quote card to scroll to the original message in place
 * - Forward button in the hover menu with a chat picker
 * - Adjustable message font size (admin setting, 10–28px or theme default)
 * - Responsive layout for narrow screens (mobile web): wider bubbles,
 *   less reserved padding, so text no longer wraps one word per line
 * - Favicon unread badge: the tab icon becomes a red circle with the
 *   total unread-message count, exactly like Telegram Web
 */
(function() {
    'use strict';

    var PLUGIN_ID = 'com.karman.chatbubbles';

    // Keys are lowercase because Mattermost lowercases plugin setting keys.
    var DEFAULTS = {
        enablebubbles: true,
        onlydirectandgroup: false,
        mybubblecolor: 'auto',
        theirbubblecolor: 'auto',
        textcolor: 'auto',
        maxwidthpercent: 70,
        hidemyavatar: true,
        telegramreply: true,
        timeinbubble: true,
        pinnedbar: true,
        datechip: true,
        scrollbutton: true,
        dblclickreply: true,
        forwardbutton: true,
        bubbletail: true,
        messagesounds: true,
        messagefontsize: 0,
        faviconbadge: true
    };

    function toBool(v) {
        return v === true || v === 'true' || v === 1;
    }

    function getCsrf() {
        var m = document.cookie.match(/(?:^|;\s*)MMCSRF=([^;]+)/);
        return m ? m[1] : '';
    }

    // Set a value on a React-controlled textarea so React notices the change
    function setNativeValue(el, value) {
        try {
            var proto = window.HTMLTextAreaElement.prototype;
            var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, value);
        } catch (e) {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', {bubbles: true}));
    }

    function colorOr(v, fallback) {
        return (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) ? v.trim() : fallback;
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function formatTime(ts) {
        var d = new Date(ts);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function dateLabel(ts) {
        var d = new Date(ts);
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        var diff = Math.round((today - that) / 86400000);
        if (diff === 0) { return 'Today'; }
        if (diff === 1) { return 'Yesterday'; }
        return d.toLocaleDateString(undefined, {month: 'long', day: 'numeric'});
    }

    // First line of a message with markdown stripped (bold/links/quotes),
    // so previews like the pinned bar never show raw ** or [](...)
    function firstLine(msg) {
        return (msg || '').split('\n')[0]
            .replace(/^[>\s]+/, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[*_~`]/g, '');
    }

    function buildStyle(cfg) {
        var maxw = Math.min(95, Math.max(30, Number(cfg.maxwidthpercent) || 70));

        // "auto" = follow the active Mattermost theme (works on dark themes)
        var mineBg = colorOr(cfg.mybubblecolor, 'rgba(var(--button-bg-rgb, 28, 80, 184), 0.22)');
        var theirsBg = colorOr(cfg.theirbubblecolor, 'rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.10)');
        var text = colorOr(cfg.textcolor, 'var(--center-channel-color, inherit)');

        // Message font size: 0 (or empty) = theme default; otherwise clamp
        // to a sane 10–28px range
        var fontSize = Number(cfg.messagefontsize) || 0;
        if (fontSize > 0) {
            fontSize = Math.min(28, Math.max(10, fontSize));
        }

        var theirs = 'body.rr-bubbles-on .post:not(.post--system)';
        var mine = 'body.rr-bubbles-on .post.current--user:not(.post--system)';

        var css = '';
        // Custom message font size inside bubbles. Scoped to the message
        // text so timestamps, names, and UI chrome keep their own sizes.
        // Code blocks stay slightly smaller, like Telegram.
        if (fontSize > 0) {
            css += 'body.rr-bubbles-on .post:not(.post--system) .post__body .post-message__text,' +
                'body.rr-bubbles-on .post:not(.post--system) .post__body .post-message__text p,' +
                'body.rr-bubbles-on .post:not(.post--system) .post__body .post-message__text li{' +
                'font-size:' + fontSize + 'px !important;' +
                'line-height:1.45 !important;}';
            css += 'body.rr-bubbles-on .post:not(.post--system) .post__body .post-message__text code,' +
                'body.rr-bubbles-on .post:not(.post--system) .post__body .post-message__text pre{' +
                'font-size:' + Math.max(10, fontSize - 2) + 'px !important;}';
            css += 'body.rr-bubbles-on .post:not(.post--system) .post__body blockquote{' +
                'font-size:' + Math.max(10, fontSize - 1) + 'px !important;}';
        }
        // Received messages: bubble pushed to the physical LEFT
        css += theirs + ' .post__body{' +
            'display:block;width:fit-content;max-width:' + maxw + '%;' +
            'border-radius:16px;border-bottom-left-radius:4px;' +
            'padding:6px 14px;' +
            'background:' + theirsBg + ' !important;' +
            'color:' + text + ';' +
            'margin-right:auto !important;margin-left:0 !important;' +
            'margin-top:3px !important;margin-bottom:3px !important;}';
        // Consecutive posts from the same sender: keep a small gap
        css += 'body.rr-bubbles-on .post.same--user:not(.post--system){' +
            'padding-top:2px !important;padding-bottom:2px !important;}';
        // My messages: bubble pushed to the physical RIGHT
        css += mine + ' .post__body{' +
            'margin-left:auto !important;margin-right:8px !important;' +
            'background:' + mineBg + ' !important;' +
            'border-bottom-left-radius:16px;border-bottom-right-radius:4px;}';
        // My name/time header aligned right
        css += mine + ' .post__header{' +
            'display:flex !important;width:fit-content !important;' +
            'margin-left:auto !important;margin-right:8px !important;' +
            'justify-content:flex-end;}';
        // "Commented on X's message" thread label: keep it right ABOVE the
        // bubble it belongs to instead of stretching across the row
        css += theirs + ' .post__link{' +
            'display:block;width:fit-content !important;max-width:' + maxw + '%;' +
            'margin:2px 0 0 0 !important;font-size:12px;opacity:.85;' +
            'text-align:left;}';
        css += mine + ' .post__link{' +
            'margin-left:auto !important;margin-right:8px !important;' +
            'text-align:right;}';
        // Thread replies rendered in the channel (post--comment) carry
        // Mattermost's own side border/indent which clashes with bubbles
        // in channels; neutralize it so channels look like DMs
        css += theirs + '.post--comment .post__body{' +
            'border-left:0 !important;}';
        css += theirs + '.post--comment{padding-left:0 !important;}';
        // My avatar moved to the RIGHT side of the bubble
        css += mine + ' .post__content{' +
            'display:flex !important;flex-direction:row-reverse !important;}';
        css += mine + ' .post__content > div:not(.post__img){' +
            'flex:1 1 auto;min-width:0;}';
        css += mine + ' .post__img{margin-left:8px;}';
        if (toBool(cfg.hidemyavatar)) {
            css += mine + ' .post__img{display:none !important;}';
        }
        // Telegram-style bubble tail: flat bottom continuing the bubble's
        // bottom line out to a sharp point, with a concave top curve
        // (exactly like Telegram Desktop/Web). Shown only on the LAST
        // message of a group, like Telegram.
        if (toBool(cfg.bubbletail)) {
            var tailRight = 'M0 0 C0.6 5.5 2.8 10.2 10 14 L0 14 Z';
            var tailLeft = 'M10 0 C9.4 5.5 7.2 10.2 0 14 L10 14 Z';
            var maskFor = function(p) {
                var svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
                    'viewBox="0 0 10 14"><path d="' + p + '"/></svg>';
                return 'url("data:image/svg+xml,' + encodeURIComponent(svg) +
                    '") no-repeat bottom/100% 100%';
            };
            css += theirs + ' .post__body{position:relative;' +
                'border-bottom-left-radius:0 !important;}';
            css += theirs + ' .post__body::after{content:"";position:absolute;' +
                'left:-9.5px;right:auto;bottom:0;width:10px;height:14px;' +
                'background:' + theirsBg + ';' +
                'pointer-events:none;' +
                '-webkit-mask:' + maskFor(tailLeft) + ';' +
                'mask:' + maskFor(tailLeft) + ';}';
            css += mine + ' .post__body{' +
                'border-bottom-left-radius:16px !important;' +
                'border-bottom-right-radius:0 !important;}';
            css += mine + ' .post__body::after{left:auto;right:-9.5px;' +
                'background:' + mineBg + ';' +
                '-webkit-mask:' + maskFor(tailRight) + ';' +
                'mask:' + maskFor(tailRight) + ';}';
            // Only the last bubble of a consecutive group gets the tail;
            // the ones followed by another message from the same sender
            // stay fully rounded (like Telegram)
            css += 'body.rr-bubbles-on .post:not(.post--system):has(+ .post.same--user) .post__body::after{' +
                'display:none !important;}';
            css += 'body.rr-bubbles-on .post:not(.post--system):has(+ .post.same--user) .post__body{' +
                'border-bottom-left-radius:16px !important;' +
                'border-bottom-right-radius:16px !important;}';
        }
        // Telegram-style hover actions floating over the bubble
        css += 'body.rr-bubbles-on .post:not(.post--system){position:relative !important;}';
        css += theirs + ' .post-menu,' + theirs + ' .col__reply{' +
            'position:absolute !important;top:-14px !important;' +
            'right:auto !important;left:52px !important;' +
            'height:auto !important;min-width:0 !important;width:auto !important;' +
            'background:var(--center-channel-bg,#1b1d22) !important;' +
            'border:1px solid rgba(var(--center-channel-color-rgb,255,255,255),.16) !important;' +
            'border-radius:8px !important;box-shadow:0 4px 12px rgba(0,0,0,.3) !important;' +
            'padding:0 2px !important;z-index:20 !important;}';
        css += mine + ' .post-menu,' + mine + ' .col__reply{' +
            'left:auto !important;right:16px !important;}';
        // Telegram-style quote card inside bubbles; hide MM's quote icon
        css += 'body.rr-bubbles-on .post:not(.post--system) .post__body blockquote{' +
            'padding:4px 10px !important;margin:2px 0 6px 0 !important;' +
            'border-left:3px solid var(--button-bg,#3db2ff) !important;' +
            'border-radius:6px !important;' +
            'background:rgba(var(--button-bg-rgb,61,178,255),.12) !important;' +
            'font-size:13px !important;}';
        css += 'body.rr-bubbles-on .post:not(.post--system) .post__body blockquote::before,' +
            'body.rr-bubbles-on .post:not(.post--system) .post__body blockquote:before{' +
            'display:none !important;content:none !important;}';
        // Non-editable Telegram-style reply bar above the message box
        css += '#rr-reply-bar{display:flex;align-items:center;gap:10px;' +
            'margin:0 24px 4px;padding:6px 12px;' +
            'border-left:3px solid var(--button-bg,#3db2ff);border-radius:8px;' +
            'background:rgba(var(--button-bg-rgb,61,178,255),.10);}' +
            '#rr-reply-bar .rr-rb-body{display:flex;flex-direction:column;min-width:0;flex:1;}' +
            '#rr-reply-bar .rr-rb-name{font-weight:600;font-size:13px;' +
            'color:var(--button-bg,#3db2ff);}' +
            '#rr-reply-bar .rr-rb-snippet{font-size:13px;opacity:.75;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '#rr-reply-bar .rr-rb-cancel{background:transparent;border:0;font-size:18px;' +
            'line-height:1;cursor:pointer;color:var(--center-channel-color,#fff);' +
            'opacity:.6;padding:2px 6px;flex-shrink:0;}' +
            '#rr-reply-bar .rr-rb-cancel:hover{opacity:1;}';
        // Time inside the bubble (bottom-right, left of the read ticks).
        // Constant padding on every bubble so adding the time span never
        // changes the post height (prevents scroll jumps).
        css += 'body.cb-time-on.rr-bubbles-on .post:not(.post--system) .post__body{' +
            'position:relative !important;padding-right:78px !important;}';
        css += '.cb-time{position:absolute;right:32px;bottom:5px;' +
            'font-size:11px;opacity:.6;pointer-events:none;white-space:nowrap;' +
            'line-height:1;}';
        css += 'body.cb-time-on.rr-bubbles-on .post:not(.post--system) .post__header .post__time{' +
            'display:none !important;}';
        // Telegram-style pinned message bar: colored side line, title +
        // text column, and an unpin (×) button
        css += '#cb-pinned-bar{position:absolute;top:0;left:0;right:0;z-index:15;' +
            'display:flex;align-items:center;gap:10px;padding:5px 10px;cursor:pointer;' +
            'background:var(--center-channel-bg,#1b1d22);' +
            'border-bottom:1px solid rgba(var(--center-channel-color-rgb,255,255,255),.12);}' +
            '#cb-pinned-bar .cb-pin-line{width:3px;align-self:stretch;border-radius:2px;' +
            'background:var(--button-bg,#3db2ff);flex-shrink:0;}' +
            '#cb-pinned-bar .cb-pin-col{display:flex;flex-direction:column;flex:1;' +
            'min-width:0;line-height:1.35;}' +
            '#cb-pinned-bar .cb-pin-title{color:var(--button-bg,#3db2ff);' +
            'font-size:12px;font-weight:600;}' +
            '#cb-pinned-bar .cb-pin-text{font-size:13px;opacity:.85;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            'color:var(--center-channel-color,#fff);}' +
            '#cb-pinned-bar .cb-pin-close{background:transparent;border:0;font-size:18px;' +
            'line-height:1;cursor:pointer;color:var(--center-channel-color,#fff);' +
            'opacity:.6;padding:2px 6px;flex-shrink:0;}' +
            '#cb-pinned-bar .cb-pin-close:hover{opacity:1;}';
        // Floating date chip
        css += '#cb-date-chip{position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
            'z-index:14;padding:4px 14px;border-radius:14px;background:rgba(0,0,0,.5);' +
            'color:#fff;font-size:12px;font-weight:600;pointer-events:none;' +
            'opacity:0;transition:opacity .25s;}' +
            '#cb-date-chip.cb-show{opacity:1;}';
        // Scroll-to-bottom button with counter
        css += '#cb-scroll-btn{position:absolute;bottom:24px;right:24px;z-index:16;' +
            'width:44px;height:44px;border-radius:50%;cursor:pointer;' +
            'border:1px solid rgba(var(--center-channel-color-rgb,255,255,255),.16);' +
            'background:var(--center-channel-bg,#1b1d22);' +
            'color:var(--center-channel-color,#fff);' +
            'box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:20px;line-height:1;' +
            'display:none;align-items:center;justify-content:center;}' +
            '#cb-scroll-btn.cb-show{display:flex;}' +
            '#cb-scroll-btn .cb-badge{position:absolute;top:-8px;left:50%;' +
            'transform:translateX(-50%);min-width:20px;height:20px;border-radius:10px;' +
            'background:var(--button-bg,#3db2ff);color:#fff;font-size:11px;' +
            'line-height:20px;padding:0 5px;display:none;}' +
            '#cb-scroll-btn .cb-badge.cb-show{display:block;}';
        // Highlight flash when jumping to a message
        css += '.post.cb-flash{' +
            'background:rgba(var(--button-bg-rgb,61,178,255),.18) !important;' +
            'transition:background .6s;}';
        // Forward picker modal (avatars + status dots, like the sidebar)
        css += '#cb-forward-modal{position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;' +
            'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);' +
            'animation:cbFadeIn .15s ease-out;}' +
            '@keyframes cbFadeIn{from{opacity:0}to{opacity:1}}' +
            '@keyframes cbPopIn{from{opacity:0;transform:translateY(10px) scale(.98)}' +
            'to{opacity:1;transform:none}}' +
            '#cb-forward-modal .cb-fm-box{width:420px;max-width:92vw;max-height:72vh;display:flex;' +
            'flex-direction:column;background:var(--center-channel-bg,#1b1d22);' +
            'color:var(--center-channel-color,#fff);border-radius:14px;padding:0;overflow:hidden;' +
            'box-shadow:0 12px 32px rgba(0,0,0,.5);animation:cbPopIn .18s ease-out;}' +
            '#cb-forward-modal .cb-fm-head{display:flex;align-items:center;' +
            'justify-content:space-between;font-weight:600;font-size:16px;padding:14px 16px 10px;}' +
            '#cb-forward-modal .cb-fm-close{border:0;background:transparent;color:inherit;' +
            'opacity:.6;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px;}' +
            '#cb-forward-modal .cb-fm-close:hover{opacity:1;' +
            'background:rgba(var(--center-channel-color-rgb,255,255,255),.08);}' +
            '#cb-forward-modal input{margin:0 12px 8px;padding:9px 12px;border-radius:20px;' +
            'border:1px solid rgba(var(--center-channel-color-rgb,255,255,255),.16);' +
            'background:rgba(var(--center-channel-color-rgb,255,255,255),.04);' +
            'color:inherit;outline:none;}' +
            '#cb-forward-modal input:focus{border-color:var(--button-bg,#3db2ff);}' +
            '#cb-forward-modal .cb-fm-list{overflow-y:auto;flex:1;min-height:160px;' +
            'padding:2px 8px 10px;}' +
            '#cb-forward-modal .cb-fm-item{display:flex;align-items:center;gap:10px;' +
            'padding:6px 8px;border-radius:10px;cursor:pointer;}' +
            '#cb-forward-modal .cb-fm-item:hover{' +
            'background:rgba(var(--center-channel-color-rgb,255,255,255),.08);}' +
            '#cb-forward-modal .cb-fm-av{position:relative;flex:none;width:34px;height:34px;' +
            'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(var(--center-channel-color-rgb,255,255,255),.09);' +
            'font-size:15px;font-weight:600;' +
            'color:rgba(var(--center-channel-color-rgb,255,255,255),.72);}' +
            '#cb-forward-modal .cb-fm-av img{width:100%;height:100%;border-radius:50%;' +
            'object-fit:cover;}' +
            '#cb-forward-modal .cb-fm-status{position:absolute;left:23px;top:23px;' +
            'width:11px;height:11px;border-radius:50%;' +
            'border:2px solid var(--center-channel-bg,#1b1d22);}' +
            '#cb-forward-modal .cb-st-online{background:#3db887;}' +
            '#cb-forward-modal .cb-st-away{background:#ffbc1f;}' +
            '#cb-forward-modal .cb-st-dnd{background:#d24b4e;}' +
            '#cb-forward-modal .cb-fm-txt{min-width:0;flex:1;}' +
            '#cb-forward-modal .cb-fm-name{font-size:14px;white-space:nowrap;overflow:hidden;' +
            'text-overflow:ellipsis;}' +
            '#cb-forward-modal .cb-fm-sub{font-size:12px;opacity:.56;white-space:nowrap;' +
            'overflow:hidden;text-overflow:ellipsis;}' +
            '#cb-forward-modal .cb-fm-empty{padding:28px 12px;text-align:center;opacity:.6;' +
            'font-size:13px;}';
        // Toast notification (e.g. after forwarding a message)
        css += '#cb-toast{position:fixed;bottom:32px;left:50%;z-index:1100;display:flex;' +
            'align-items:center;gap:8px;max-width:80vw;padding:10px 18px;border-radius:22px;' +
            'background:rgba(0,0,0,.82);color:#fff;font-size:14px;' +
            'box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;transform:translate(-50%,14px);' +
            'transition:opacity .22s,transform .22s;pointer-events:none;}' +
            '#cb-toast.cb-show{opacity:1;transform:translate(-50%,0);}' +
            '#cb-toast .cb-toast-ic{flex:none;width:20px;height:20px;border-radius:50%;' +
            'background:#3db887;color:#fff;font-size:12px;line-height:20px;text-align:center;}' +
            '#cb-toast.cb-toast-error .cb-toast-ic{background:#d24b4e;}';
        // ---- Responsive tweaks for narrow screens (mobile web) ----------
        // On phones the channel column is narrow; the desktop max-width and
        // the constant right padding reserved for the in-bubble time leave
        // almost no room for text. Widen bubbles and shrink the reserved
        // space so messages wrap normally.
        css += '@media (max-width: 900px){' +
            'body.rr-bubbles-on .post:not(.post--system) .post__body{' +
            'max-width:90% !important;padding-left:10px !important;' +
            'box-sizing:border-box;overflow-wrap:break-word;}' +
            'body.cb-time-on.rr-bubbles-on .post:not(.post--system) .post__body{' +
            'padding-right:58px !important;}' +
            '.cb-time{right:24px;bottom:4px;font-size:10px;}' +
            'body.rr-bubbles-on .post:not(.post--system) .post__link{' +
            'max-width:90% !important;}' +
            'body.rr-bubbles-on .post:not(.post--system) .post__content{' +
            'padding-left:4px !important;padding-right:4px !important;}' +
            'body.rr-bubbles-on .post:not(.post--system) .post__content > div:not(.post__img){' +
            'flex:1 1 auto;min-width:0;}' +
            '#rr-reply-bar{margin:0 8px 4px;}' +
            '}';
        return css;
    }

    function ChatBubblesPlugin() {
        this.config = Object.assign({}, DEFAULTS);
        this.lastBadgeCount = -1;
        this.badgeUrl = null;
        this.prevBadgeUrl = null;
        this.toastTimer = null;
        this.lastPostMenuId = null;
        this.pendingReply = null;
        this.pinnedChannelId = null;
        this.pinnedPostId = null;
        this.pinnedText = '';
        this.pinnedList = [];
        this.pinnedShownId = null;
        this.pinnedIndex = -1;
        this.pinnedCount = 0;
        this.lastPinFetch = 0;
        this.lastDomPostId = null;
        this.newCount = 0;
        this.chipTimer = null;
        this.forwardPostId = null;
        this.soundChannelId = null;
        this.lastSoundPostAt = 0;
        this.audioCtx = null;
        this.lastClickPostId = null;
        this.lastClickAt = 0;
    }

    ChatBubblesPlugin.prototype.applyStyle = function() {
        var s = document.getElementById('rr-bubbles-style');
        if (!s) {
            s = document.createElement('style');
            s.id = 'rr-bubbles-style';
            document.head.appendChild(s);
        }
        s.textContent = buildStyle(this.config);
    };

    ChatBubblesPlugin.prototype.initialize = function(registry, store) {
        this.store = store;
        // Manual test hook: run cbTestBadge(5) in the browser console to
        // force the red badge, cbTestBadge(0) or cbTestBadge() to clear it.
        var selfRef = this;
        window.cbTestBadge = function(n) {
            selfRef.badgeOverride = (typeof n === 'number' && n > 0) ? n : null;
            selfRef.lastBadgeCount = -1;
            selfRef.updateFaviconBadge();
            return '[ChatBubbles] badge override: ' + selfRef.badgeOverride;
        };
        this.applyStyle();
        this.loadAdminConfig();

        var self = this;
        setInterval(function() { self.tick(); }, 1000);
        // Fast watchdog for the native Forward dialog (cheap query)
        setInterval(function() {
            try { self.killNativeForwardModal(); } catch (e) { /* ignore */ }
        }, 250);

        var scheduled = false;
        store.subscribe(function() {
            if (scheduled) { return; }
            scheduled = true;
            setTimeout(function() {
                scheduled = false;
                self.tick();
            }, 300);
        });
        this.tick();
        this.initTelegramReply();
        this.initDblClickReply();
        this.initQuoteJump();
        this.initForward();
        this.initPinWatch();
    };

    // ---- Favicon unread badge ------------------------------------------
    // Total unread messages across all channels. Muted channels
    // (mark_unread: "mention") only contribute their mention count.
    ChatBubblesPlugin.prototype.countUnread = function() {
        var st = this.store && this.store.getState();
        if (!st || !st.entities || !st.entities.channels) { return 0; }
        var channels = st.entities.channels.channels || {};
        var members = st.entities.channels.myMembers || {};
        var total = 0;
        Object.keys(members).forEach(function(id) {
            var ch = channels[id];
            var m = members[id];
            if (!ch || !m || ch.delete_at) { return; }
            var markUnread = m.notify_props && m.notify_props.mark_unread;
            if (markUnread === 'mention') {
                total += m.mention_count || 0;
            } else {
                total += Math.max(0, (ch.total_msg_count || 0) - (m.msg_count || 0));
            }
        });
        // Fallback: Mattermost prefixes the tab title with "(N)" for
        // mentions. If the store-based count misses something, trust the
        // bigger number.
        var t = document.title && document.title.match(/^\((\d+)\)/);
        var titleCount = t ? parseInt(t[1], 10) : 0;
        return Math.max(total, titleCount);
    };

    // Telegram Web style: the whole favicon becomes a red circle with the
    // unread count in white. No base image involved, so it cannot fail on
    // cross-origin/tainted-canvas issues and stays readable on tiny tabs.
    function drawBadgeIcon(count) {
        var size = 64;
        var c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        var ctx = c.getContext('2d');
        var label = count > 99 ? '99+' : String(count);
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, 2 * Math.PI);
        ctx.fillStyle = '#e53935';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 ' +
            (label.length >= 3 ? 27 : label.length === 2 ? 34 : 40) +
            'px Arial, Helvetica, sans-serif';
        ctx.fillText(label, 32, 35);
        try {
            return c.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    }

    ChatBubblesPlugin.prototype.updateFaviconBadge = function() {
        if (!document.head) { return; }
        var count = this.badgeOverride != null ?
            this.badgeOverride :
            (toBool(this.config.faviconbadge) ? this.countUnread() : 0);
        if (count !== this.lastBadgeCount) {
            console.log('[ChatBubbles] unread badge count:', count);
        }
        // IMPORTANT: never rename, remove, or hide Mattermost's own icon
        // links — Mattermost looks them up to update its favicon and
        // crashes (white page) if they are missing. We only swap the href
        // of the existing links and restore it later.
        var links = document.querySelectorAll('link[rel~="icon"]');
        var i, href;

        if (count <= 0) {
            this.lastBadgeCount = 0;
            this.badgeUrl = null;
            this.prevBadgeUrl = null;
            for (i = 0; i < links.length; i++) {
                if (links[i].id === 'cb-favicon') {
                    if (links[i].parentNode) { links[i].parentNode.removeChild(links[i]); }
                } else if (links[i].getAttribute('data-cb-orig-href') !== null) {
                    links[i].setAttribute('href', links[i].getAttribute('data-cb-orig-href'));
                    links[i].removeAttribute('data-cb-orig-href');
                }
            }
            return;
        }

        if (count !== this.lastBadgeCount || !this.badgeUrl) {
            this.lastBadgeCount = count;
            this.prevBadgeUrl = this.badgeUrl;
            this.badgeUrl = drawBadgeIcon(count);
        }
        if (!this.badgeUrl) { return; }

        if (!links.length) {
            // No favicon links at all: add our own
            var own = document.createElement('link');
            own.id = 'cb-favicon';
            own.rel = 'icon';
            own.type = 'image/png';
            own.href = this.badgeUrl;
            document.head.appendChild(own);
            return;
        }

        // Point every icon link at the badge. If Mattermost rewrote an
        // href in the meantime, remember that as the new original so we
        // can restore the right icon when everything is read — but never
        // mistake one of our own previous badge URLs for the original.
        for (i = 0; i < links.length; i++) {
            href = links[i].getAttribute('href') || '';
            if (href !== this.badgeUrl) {
                if (href !== this.prevBadgeUrl) {
                    links[i].setAttribute('data-cb-orig-href', href);
                }
                links[i].setAttribute('href', this.badgeUrl);
            }
        }
    };

    ChatBubblesPlugin.prototype.loadAdminConfig = function() {
        var self = this;
        fetch('/api/v4/config', {headers: {'X-Requested-With': 'XMLHttpRequest'}})
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(cfg) {
                if (!cfg || !cfg.PluginSettings || !cfg.PluginSettings.Plugins) { return; }
                var mine = cfg.PluginSettings.Plugins[PLUGIN_ID];
                if (!mine) { return; }
                Object.keys(mine).forEach(function(k) {
                    self.config[k.toLowerCase()] = mine[k];
                });
                self.applyStyle();
            })
            .catch(function() {});
    };

    // ---------------------------------------------------------------- reply

    ChatBubblesPlugin.prototype.initTelegramReply = function() {
        var self = this;
        document.addEventListener('click', function(ev) {
            if (!toBool(self.config.telegramreply)) { return; }
            if (!document.body.classList.contains('rr-bubbles-on')) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            var btn = t.closest('button');
            if (!btn) { return; }
            if (btn.classList.contains('cb-forward')) { return; }
            var label = (btn.getAttribute('aria-label') || '');
            var hasIcon = btn.querySelector('.icon-reply-outline, .icon-reply, .icon-arrow-left-bold-outline');
            if (!hasIcon && !/reply/i.test(label)) { return; }
            var post = btn.closest('div.post');
            if (!post || !post.id || post.id.indexOf('post_') !== 0) { return; }
            if (btn.closest('#sidebar-right, .SidebarRight, .ThreadViewer')) { return; }
            ev.preventDefault();
            ev.stopPropagation();
            self.startTelegramReply(post.id.slice('post_'.length));
        }, true);

        // Attach the quote right before Mattermost sends the message
        document.addEventListener('keydown', function(ev) {
            if (!self.pendingReply) { return; }
            if (ev.key !== 'Enter' || ev.shiftKey) { return; }
            var tb = self.getTextbox();
            if (!tb || ev.target !== tb) { return; }
            self.injectQuote(tb);
        }, true);
        document.addEventListener('click', function(ev) {
            if (!self.pendingReply) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            var send = t.closest('button[data-testid="SendMessageButton"], ' +
                'button.SendMessageButton, button[aria-label*="send" i]');
            if (!send) { return; }
            var tb = self.getTextbox();
            if (tb) { self.injectQuote(tb); }
        }, true);
    };

    // Double-click a message bubble to reply (like swipe in Telegram).
    // We detect two fast clicks ourselves in the CAPTURE phase so we can
    // stop the second click before Mattermost opens the thread panel.
    ChatBubblesPlugin.prototype.initDblClickReply = function() {
        var self = this;
        document.addEventListener('click', function(ev) {
            if (!toBool(self.config.dblclickreply)) { return; }
            if (!toBool(self.config.telegramreply)) { return; }
            if (!document.body.classList.contains('rr-bubbles-on')) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            if (t.closest('a, img, video, audio, button, textarea, input, .post-menu')) { return; }
            var post = t.closest('div.post');
            if (!post || !post.id || post.id.indexOf('post_') !== 0) { return; }
            if (post.closest('#sidebar-right, .SidebarRight, .ThreadViewer')) { return; }
            // Swallow EVERY click on the message body so Mattermost's
            // "click to open threads" never fires — the thread panel must
            // not open. Links, buttons, images etc. are excluded above.
            ev.preventDefault();
            ev.stopPropagation();
            var now = Date.now();
            if (self.lastClickPostId === post.id && now - self.lastClickAt < 400) {
                self.lastClickAt = 0;
                try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
                self.startTelegramReply(post.id.slice('post_'.length));
                // Make sure typing goes to the main box, not a thread panel
                setTimeout(function() {
                    var tb = self.getTextbox();
                    if (tb) { tb.focus(); }
                }, 250);
            } else {
                self.lastClickPostId = post.id;
                self.lastClickAt = now;
            }
        }, true);
        // Kill the text selection a double-click would create
        document.addEventListener('dblclick', function(ev) {
            if (!toBool(self.config.dblclickreply)) { return; }
            if (!document.body.classList.contains('rr-bubbles-on')) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            if (t.closest('a, button, textarea, input')) { return; }
            if (t.closest('div.post')) {
                ev.preventDefault();
                try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
            }
        });
    };

    // Clicking the quote card scrolls to the original message in place
    // (like Telegram) instead of navigating like a normal link.
    // Detect Pin/Unpin actions in the post menus and refresh the pinned
    // bar immediately instead of waiting for the 30s polling cycle
    ChatBubblesPlugin.prototype.initPinWatch = function() {
        var self = this;
        document.addEventListener('click', function(ev) {
            var t = ev.target;
            if (!t || !t.closest) { return; }
            var item = t.closest('[role="menuitem"], .MenuItem, button');
            if (!item) { return; }
            var label = ((item.textContent || '') + ' ' +
                (item.getAttribute('aria-label') || '') + ' ' +
                (item.id || '')).toLowerCase();
            if (label.indexOf('pin') === -1) { return; }
            var refresh = function() {
                try {
                    var st = self.store && self.store.getState();
                    var chId = st && st.entities.channels.currentChannelId;
                    if (chId) { self.fetchPinned(chId); }
                } catch (e) { /* ignore */ }
            };
            // once right after the click, once after the server settles
            setTimeout(refresh, 500);
            setTimeout(refresh, 2000);
        }, true);
    };

    ChatBubblesPlugin.prototype.initQuoteJump = function() {
        var self = this;
        document.addEventListener('click', function(ev) {
            if (!document.body.classList.contains('rr-bubbles-on')) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            var a = t.closest('a');
            if (!a || !a.closest('blockquote')) { return; }
            var href = a.getAttribute('href') || '';
            var m = href.match(/\/pl\/([a-z0-9]+)\/?$/i);
            if (!m) { return; }
            ev.preventDefault();
            ev.stopPropagation();
            self.jumpToPost(m[1]);
        }, true);
    };

    ChatBubblesPlugin.prototype.getTextbox = function() {
        return document.getElementById('post_textbox') ||
            document.querySelector('textarea[data-testid="post_textbox"]') ||
            document.querySelector('.AdvancedTextEditor textarea') ||
            document.querySelector('#advancedTextEditorCell textarea');
    };

    ChatBubblesPlugin.prototype.senderName = function(post) {
        var profiles = this.store.getState().entities.users.profiles;
        var user = profiles[post.user_id];
        if (!user) { return ''; }
        var full = ((user.first_name || '') + ' ' + (user.last_name || '')).trim();
        return user.nickname || full || user.username || '';
    };

    ChatBubblesPlugin.prototype.teamName = function() {
        try {
            var st = this.store.getState();
            var team = st.entities.teams.teams[st.entities.teams.currentTeamId];
            return team ? team.name : '';
        } catch (e) {
            return '';
        }
    };

    ChatBubblesPlugin.prototype.startTelegramReply = function(postId) {
        var state = this.store.getState();
        var post = state.entities.posts.posts[postId];
        if (!post) { return; }

        var name = this.senderName(post);
        var snippet = firstLine(post.message);
        if (!snippet && post.file_ids && post.file_ids.length) {
            snippet = '\uD83D\uDCCE فایل';
        }
        if (snippet.length > 90) { snippet = snippet.slice(0, 90) + '\u2026'; }

        // A new reply target simply replaces the previous one
        this.pendingReply = {
            name: name,
            snippet: snippet,
            postId: postId,
            channelId: state.entities.channels.currentChannelId
        };
        this.renderReplyBar();

        var tb = this.getTextbox();
        if (tb) { tb.focus(); }
    };

    // Attach the quote to the message text at the moment of sending. The
    // quote title is a permalink, so clicking it jumps to the original.
    ChatBubblesPlugin.prototype.injectQuote = function(tb) {
        if (!this.pendingReply) { return; }
        var pr = this.pendingReply;
        var title = '**Reply to ' + pr.name + '**';
        var team = this.teamName();
        var head = (team && pr.postId) ?
            ('[' + title + '](/' + team + '/pl/' + pr.postId + ')') : title;
        var quote = '> ' + head + '\n> ' + pr.snippet + '\n\n';
        setNativeValue(tb, quote + (tb.value || ''));
        this.pendingReply = null;
        this.renderReplyBar();
    };

    // The reply preview bar (non-editable, with a cancel button)
    ChatBubblesPlugin.prototype.renderReplyBar = function() {
        var bar = document.getElementById('rr-reply-bar');
        if (!this.pendingReply) {
            if (bar && bar.parentNode) { bar.parentNode.removeChild(bar); }
            return;
        }
        var tb = this.getTextbox();
        if (!tb) { return; }
        if (!bar || !bar.isConnected) {
            var self = this;
            bar = document.createElement('div');
            bar.id = 'rr-reply-bar';

            var body = document.createElement('div');
            body.className = 'rr-rb-body';
            var nameEl = document.createElement('span');
            nameEl.className = 'rr-rb-name';
            var snippetEl = document.createElement('span');
            snippetEl.className = 'rr-rb-snippet';
            snippetEl.dir = 'auto';
            body.appendChild(nameEl);
            body.appendChild(snippetEl);
            bar.appendChild(body);

            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'rr-rb-cancel';
            cancel.textContent = '\u00d7';
            cancel.onclick = function(e) {
                e.preventDefault();
                self.pendingReply = null;
                self.renderReplyBar();
            };
            bar.appendChild(cancel);

            var host = tb.closest('form') || tb.parentNode;
            if (host && host.parentNode) {
                host.parentNode.insertBefore(bar, host);
            }
        }
        bar.querySelector('.rr-rb-name').textContent = 'Reply to ' + this.pendingReply.name;
        bar.querySelector('.rr-rb-snippet').textContent = this.pendingReply.snippet;
    };

    // -------------------------------------------------------------- forward

    ChatBubblesPlugin.prototype.initForward = function() {
        var self = this;
        // The hover menu is re-created by React on every hover, so we add
        // our forward button with event delegation each time it appears.
        document.addEventListener('mouseover', function(ev) {
            if (!toBool(self.config.forwardbutton)) { return; }
            if (!document.body.classList.contains('rr-bubbles-on')) { return; }
            var t = ev.target;
            if (!t || !t.closest) { return; }
            var postEl = t.closest('div.post');
            if (!postEl || !postEl.id || postEl.id.indexOf('post_') !== 0) { return; }
            if (postEl.closest('#sidebar-right, .SidebarRight, .ThreadViewer')) { return; }
            var menu = postEl.querySelector('.post-menu');
            if (!menu || menu.querySelector('.cb-forward')) { return; }
            var postId = postEl.id.slice('post_'.length);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'post-menu__item cb-forward';
            btn.setAttribute('aria-label', 'forward message');
            btn.title = 'Forward';
            var ic = document.createElement('i');
            ic.className = 'icon icon-share-variant-outline';
            btn.appendChild(ic);
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.openForwardModal(postId);
            };
            menu.appendChild(btn);
        });

        // Hijack Mattermost's own "Forward" item in the post ⋯ menu so it
        // opens our Telegram-style picker instead of the native dialog
        // (the native one refuses to forward DM/GM messages elsewhere).
        // Runs in the capture phase, so it fires before React's handler.
        function findOpenMenuPostId() {
            // The ⋯ button of the open menu carries the post id
            var btns = document.querySelectorAll('button[aria-expanded="true"][id*="_button_"]');
            for (var i = 0; i < btns.length; i++) {
                var m = btns[i].id.match(/_button_([a-z0-9]{26})/i);
                if (m) { return m[1]; }
            }
            // Fallback: the dropdown element id
            var menus = document.querySelectorAll('[id*="_dropdown_"]');
            for (var j = 0; j < menus.length; j++) {
                var m2 = menus[j].id.match(/_dropdown_([a-z0-9]{26})/i);
                if (m2) { return m2[1]; }
            }
            return null;
        }
        document.addEventListener('click', function(ev) {
            var t = ev.target;
            if (!t || !t.closest) { return; }
            // Remember which post's UI was interacted with last; the
            // native-dialog watchdog uses it to know what to forward.
            var pb = t.closest('button[id*="_button_"]');
            if (pb) {
                var pm = pb.id.match(/_button_([a-z0-9]{26})/i);
                if (pm) { self.lastPostMenuId = pm[1]; }
            } else {
                var pEl = t.closest('div.post[id^="post_"]');
                if (pEl) { self.lastPostMenuId = pEl.id.slice('post_'.length); }
            }
            if (!toBool(self.config.forwardbutton)) { return; }
            var item = t.closest('[role="menuitem"], .MenuItem, li[id], button[id]');
            if (!item || item.closest('#cb-forward-modal')) { return; }
            // Only touch items that clearly are the native Forward action
            var idAttr = (item.id || '').toLowerCase();
            var txt = (item.textContent || '').trim().toLowerCase();
            var isForward = idAttr.indexOf('forward') !== -1 ||
                txt === 'forward' || txt === 'forward message';
            if (!isForward) { return; }
            // ...and only inside an open post menu, not elsewhere in the UI
            if (!item.closest('.dropdown-menu, [role="menu"], .Menu')) { return; }
            var postId = findOpenMenuPostId() || self.lastPostMenuId;
            if (!postId) { return; } // cannot resolve: let the native dialog run
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) { ev.stopImmediatePropagation(); }
            console.log('[ChatBubbles] native Forward click intercepted');
            self.lastPostMenuId = postId;
            // Close the native menu, then open our picker
            try {
                item.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape', keyCode: 27, which: 27, bubbles: true
                }));
            } catch (e) { /* ignore */ }
            setTimeout(function() { self.openForwardModal(postId); }, 0);
        }, true);
    };

    // Watchdog: if Mattermost's own "Forward message" dialog appears
    // anyway (menu structures differ between versions, so the click
    // interception can miss), close it and open our picker instead.
    ChatBubblesPlugin.prototype.killNativeForwardModal = function() {
        if (!toBool(this.config.forwardbutton)) { return; }
        var heads = document.querySelectorAll(
            '.modal-title, .modal-header, .GenericModal__header, #genericModalLabel, h1[id*="ModalLabel"]');
        var dialog = null;
        for (var i = 0; i < heads.length; i++) {
            var txt = (heads[i].textContent || '').trim().toLowerCase();
            if (txt.indexOf('forward message') !== -1) {
                dialog = heads[i].closest(
                    '.modal-dialog, .GenericModal, [role="dialog"], .modal, .a11y__modal');
                if (dialog) { break; }
            }
        }
        if (!dialog) { return; }
        console.log('[ChatBubbles] native Forward dialog detected — replacing with plugin picker');
        var closeBtn = dialog.querySelector(
            'button.close, button[aria-label="Close"], .GenericModal__button.cancel, ' +
            'button[data-testid="generic-modal-cancel"], .modal-header button');
        if (closeBtn) {
            closeBtn.click();
        } else {
            try {
                dialog.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape', keyCode: 27, which: 27, bubbles: true
                }));
            } catch (e) { /* ignore */ }
        }
        var pid = this.lastPostMenuId;
        if (pid && !document.getElementById('cb-forward-modal')) {
            var selfRef = this;
            setTimeout(function() { selfRef.openForwardModal(pid); }, 30);
        }
    };

    ChatBubblesPlugin.prototype.channelDisplayName = function(ch) {
        var st = this.store.getState();
        if (ch.type === 'D') {
            var me = st.entities.users.currentUserId;
            var ids = (ch.name || '').split('__');
            var otherId = ids[0] === me ? ids[1] : ids[0];
            var u = st.entities.users.profiles[otherId];
            if (u) {
                var full = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
                return '\uD83D\uDC64 ' + (u.nickname || full || u.username);
            }
            return ch.display_name || 'Direct message';
        }
        if (ch.type === 'G') { return '\uD83D\uDC65 ' + (ch.display_name || ''); }
        return '# ' + (ch.display_name || ch.name || '');
    };

    // Rich info for the forward picker: avatar image, subtitle and online
    // status, matching what the sidebar shows for each chat.
    ChatBubblesPlugin.prototype.channelInfo = function(ch) {
        var st = this.store.getState();
        var info = {
            name: ch.display_name || ch.name || '',
            sub: '',
            glyph: '#',
            img: null,
            statusId: null
        };
        if (ch.type === 'D') {
            var me = st.entities.users.currentUserId;
            var ids = (ch.name || '').split('__');
            var otherId = ids[0] === me ? ids[1] : ids[0];
            var u = st.entities.users.profiles[otherId];
            info.glyph = '\uD83D\uDC64';
            if (u) {
                var full = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
                info.name = u.nickname || full || u.username;
                info.sub = '@' + u.username;
                info.img = '/api/v4/users/' + otherId + '/image?_=' +
                    (u.last_picture_update || 0);
                info.statusId = otherId;
            } else if (!info.name) {
                info.name = 'Direct message';
            }
        } else if (ch.type === 'G') {
            info.glyph = '\uD83D\uDC65';
            info.sub = '\u06af\u0631\u0648\u0647';
        } else if (ch.type === 'P') {
            info.glyph = '\uD83D\uDD12';
            info.sub = '\u06a9\u0627\u0646\u0627\u0644 \u062e\u0635\u0648\u0635\u06cc';
        } else {
            info.glyph = '#';
            info.sub = '\u06a9\u0627\u0646\u0627\u0644';
        }
        return info;
    };

    // Small toast at the bottom of the screen (success / error)
    ChatBubblesPlugin.prototype.showToast = function(text, isError) {
        var old = document.getElementById('cb-toast');
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
        var t = document.createElement('div');
        t.id = 'cb-toast';
        if (isError) { t.classList.add('cb-toast-error'); }
        var ic = document.createElement('span');
        ic.className = 'cb-toast-ic';
        ic.textContent = isError ? '\u2715' : '\u2713';
        t.appendChild(ic);
        var tx = document.createElement('span');
        tx.dir = 'auto';
        tx.textContent = text;
        t.appendChild(tx);
        document.body.appendChild(t);
        setTimeout(function() { t.classList.add('cb-show'); }, 20);
        this.toastTimer = setTimeout(function() {
            t.classList.remove('cb-show');
            setTimeout(function() {
                if (t.parentNode) { t.parentNode.removeChild(t); }
            }, 300);
        }, 2600);
    };

    ChatBubblesPlugin.prototype.openForwardModal = function(postId) {
        this.forwardPostId = postId;
        this.closeForwardModal();

        var self = this;
        var st = this.store.getState();
        var channels = st.entities.channels.channels;
        var myMembers = st.entities.channels.myMembers;

        var list = Object.keys(channels)
            .map(function(id) { return channels[id]; })
            .filter(function(ch) {
                return myMembers[ch.id] && ch.delete_at === 0;
            })
            .sort(function(a, b) {
                return (b.last_post_at || 0) - (a.last_post_at || 0);
            });

        var overlay = document.createElement('div');
        overlay.id = 'cb-forward-modal';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { self.closeForwardModal(); }
        });

        var box = document.createElement('div');
        box.className = 'cb-fm-box';

        var head = document.createElement('div');
        head.className = 'cb-fm-head';
        var headTitle = document.createElement('span');
        headTitle.textContent = 'Forward to\u2026';
        head.appendChild(headTitle);
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'cb-fm-close';
        closeBtn.setAttribute('aria-label', 'close');
        closeBtn.textContent = '\u2715';
        closeBtn.onclick = function() { self.closeForwardModal(); };
        head.appendChild(closeBtn);
        box.appendChild(head);

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '\u062c\u0633\u062a\u062c\u0648...';
        box.appendChild(input);

        var listEl = document.createElement('div');
        listEl.className = 'cb-fm-list';
        box.appendChild(listEl);

        function renderList(filter) {
            listEl.textContent = '';
            var q = (filter || '').toLowerCase();
            var statuses = (st.entities.users && st.entities.users.statuses) || {};
            var shown = 0;
            for (var i = 0; i < list.length && shown < 60; i++) {
                var ch = list[i];
                var info = self.channelInfo(ch);
                if (q && (info.name + ' ' + info.sub).toLowerCase().indexOf(q) === -1) {
                    continue;
                }
                var item = document.createElement('div');
                item.className = 'cb-fm-item';

                var av = document.createElement('div');
                av.className = 'cb-fm-av';
                if (info.img) {
                    var img = document.createElement('img');
                    img.alt = '';
                    img.loading = 'lazy';
                    img.onerror = function() {
                        if (this.parentNode) { this.parentNode.textContent = '\uD83D\uDC64'; }
                    };
                    img.src = info.img;
                    av.appendChild(img);
                } else {
                    av.textContent = info.glyph;
                }
                var stt = info.statusId && statuses[info.statusId];
                if (stt === 'online' || stt === 'away' || stt === 'dnd') {
                    var dot = document.createElement('span');
                    dot.className = 'cb-fm-status cb-st-' + stt;
                    av.appendChild(dot);
                }
                item.appendChild(av);

                var txt = document.createElement('div');
                txt.className = 'cb-fm-txt';
                var nm = document.createElement('div');
                nm.className = 'cb-fm-name';
                nm.dir = 'auto';
                nm.textContent = info.name;
                txt.appendChild(nm);
                if (info.sub) {
                    var sb = document.createElement('div');
                    sb.className = 'cb-fm-sub';
                    sb.dir = 'auto';
                    sb.textContent = info.sub;
                    txt.appendChild(sb);
                }
                item.appendChild(txt);

                item.onclick = (function(chId, chName) {
                    return function() {
                        self.doForward(chId, chName);
                        self.closeForwardModal();
                    };
                })(ch.id, info.name);
                listEl.appendChild(item);
                shown++;
            }
            if (!shown) {
                var empty = document.createElement('div');
                empty.className = 'cb-fm-empty';
                empty.dir = 'auto';
                empty.textContent = '\u0686\u06cc\u0632\u06cc \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f';
                listEl.appendChild(empty);
            }
        }
        input.addEventListener('input', function() { renderList(input.value); });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var first = listEl.querySelector('.cb-fm-item');
                if (first) { first.click(); }
            }
        });
        renderList('');

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.focus();

        this.fmEscHandler = function(e) {
            if (e.key === 'Escape') { self.closeForwardModal(); }
        };
        document.addEventListener('keydown', this.fmEscHandler, true);
    };

    ChatBubblesPlugin.prototype.closeForwardModal = function() {
        var overlay = document.getElementById('cb-forward-modal');
        if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
        if (this.fmEscHandler) {
            document.removeEventListener('keydown', this.fmEscHandler, true);
            this.fmEscHandler = null;
        }
    };

    ChatBubblesPlugin.prototype.doForward = function(channelId, destName) {
        var self = this;
        var st = this.store.getState();
        var post = st.entities.posts.posts[this.forwardPostId];
        if (!post) { return; }

        var name = this.senderName(post);
        var msg = post.message || '';
        // Telegram-style forwarded header: rendered as the same quote card
        // as replies (colored side bar + tinted background), and clicking
        // it jumps to the original message
        var head = '**Forwarded from ' + name + '**';
        var team = this.teamName();
        if (team) {
            head = '[' + head + '](/' + team + '/pl/' + post.id + ')';
        }
        var text = '> ' + head + '\n\n' + msg;

        var fileIds = (post.file_ids || []).slice();
        var fileMetas = (post.metadata && post.metadata.files) || [];
        var storeFiles = (st.entities.files && st.entities.files.files) || {};

        function fail() {
            self.showToast('\u0641\u0648\u0631\u0648\u0627\u0631\u062f \u067e\u06cc\u0627\u0645 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f', true);
        }

        function succeed() {
            self.showToast(destName ?
                '\u067e\u06cc\u0627\u0645 \u0628\u0647 \u00ab' + destName + '\u00bb \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0634\u062f' :
                '\u067e\u06cc\u0627\u0645 \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0634\u062f');
        }

        function createPost(newFileIds) {
            var body = {channel_id: channelId, message: text};
            if (newFileIds && newFileIds.length) {
                body.file_ids = newFileIds;
            }
            fetch('/api/v4/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-Token': getCsrf()
                },
                body: JSON.stringify(body)
            }).then(function(res) {
                if (!res.ok) { fail(); return; }
                succeed();
            }).catch(function() { fail(); });
        }

        if (!fileIds.length) {
            createPost([]);
            return;
        }

        // Attachments can't be re-used across posts in Mattermost, so we
        // download each original file and upload a fresh copy into the
        // destination channel, then attach the new ids to the forward.
        function fileName(fid, idx) {
            for (var i = 0; i < fileMetas.length; i++) {
                if (fileMetas[i] && fileMetas[i].id === fid && fileMetas[i].name) {
                    return fileMetas[i].name;
                }
            }
            if (storeFiles[fid] && storeFiles[fid].name) {
                return storeFiles[fid].name;
            }
            return 'file-' + (idx + 1);
        }

        self.showToast('\u062f\u0631 \u062d\u0627\u0644 \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u067e\u06cc\u0648\u0633\u062a\u200c\u0647\u0627\u2026');

        var uploads = fileIds.map(function(fid, idx) {
            return fetch('/api/v4/files/' + fid, {
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            }).then(function(res) {
                if (!res.ok) { throw new Error('download failed'); }
                return res.blob();
            }).then(function(blob) {
                var fd = new FormData();
                fd.append('channel_id', channelId);
                fd.append('files', blob, fileName(fid, idx));
                return fetch('/api/v4/files', {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-Token': getCsrf()
                    },
                    body: fd
                });
            }).then(function(res) {
                if (!res.ok) { throw new Error('upload failed'); }
                return res.json();
            }).then(function(data) {
                if (!data || !data.file_infos || !data.file_infos.length) {
                    throw new Error('upload failed');
                }
                return data.file_infos[0].id;
            });
        });

        Promise.all(uploads).then(function(newIds) {
            createPost(newIds);
        }).catch(function() {
            fail();
        });
    };

    // --------------------------------------------------- tag my posts

    // In channels Mattermost does not always put the "current--user"
    // class on the viewer's posts the way DMs do (e.g. thread replies
    // rendered inline, consecutive grouped posts, some server versions).
    // Our alignment CSS relies on that class, so we tag own posts
    // ourselves straight from the redux store.
    ChatBubblesPlugin.prototype.tagMyPosts = function(enabled) {
        if (!enabled) { return; }
        var st = this.store.getState();
        var me = st.entities.users && st.entities.users.currentUserId;
        if (!me) { return; }
        var posts = st.entities.posts.posts;
        var els = document.querySelectorAll('.post:not(.post--system)');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el.id || el.id.indexOf('post_') !== 0) { continue; }
            var post = posts[el.id.slice('post_'.length)];
            if (!post) { continue; }
            if (post.user_id === me) {
                if (!el.classList.contains('current--user')) {
                    el.classList.add('current--user');
                }
            } else if (el.classList.contains('current--user')) {
                el.classList.remove('current--user');
            }
        }
    };

    // ----------------------------------------------------- time in bubble

    ChatBubblesPlugin.prototype.renderTimes = function(enabled) {
        var on = enabled && toBool(this.config.timeinbubble);
        document.body.classList.toggle('cb-time-on', on);
        if (!on) { return; }

        var posts = this.store.getState().entities.posts.posts;
        var els = document.querySelectorAll('.post:not(.post--system)');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el.id || el.id.indexOf('post_') !== 0) { continue; }
            var post = posts[el.id.slice('post_'.length)];
            if (!post) { continue; }
            var body = el.querySelector('.post__body');
            if (!body) { continue; }
            var span = null;
            for (var c = 0; c < body.children.length; c++) {
                if (body.children[c].className === 'cb-time') {
                    span = body.children[c];
                    break;
                }
            }
            if (!span) {
                span = document.createElement('span');
                span.className = 'cb-time';
                body.appendChild(span);
            }
            var txt = formatTime(post.create_at);
            if (span.textContent !== txt) { span.textContent = txt; }
        }
    };

    // ------------------------------------------- pinned bar / chip / button

    ChatBubblesPlugin.prototype.getScroller = function() {
        return document.querySelector('.post-list-holder-by-time');
    };

    ChatBubblesPlugin.prototype.jumpToPost = function(postId) {
        var el = document.getElementById('post_' + postId);
        if (el) {
            el.scrollIntoView({block: 'center', behavior: 'smooth'});
            el.classList.add('cb-flash');
            setTimeout(function() { el.classList.remove('cb-flash'); }, 1600);
            return;
        }
        var team = this.teamName();
        if (team) {
            window.location.href = '/' + team + '/pl/' + postId;
        }
    };

    // ---- Telegram-style pinned bar ----
    // pinnedList: all pinned posts sorted oldest -> newest (by create_at)
    // pinnedShownId: the pin currently displayed in the bar
    ChatBubblesPlugin.prototype.fetchPinned = function(channelId) {
        var self = this;
        this.lastPinFetch = Date.now();
        fetch('/api/v4/channels/' + channelId + '/pinned?_=' + Date.now(), {
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            cache: 'no-store'
        }).then(function(res) {
            return res.ok ? res.json() : null;
        }).then(function(data) {
            var list = [];
            if (data && data.posts) {
                Object.keys(data.posts).forEach(function(id) {
                    var p = data.posts[id];
                    if (p.delete_at !== 0) { return; }
                    var t = firstLine(p.message);
                    if (!t && p.file_ids && p.file_ids.length) {
                        t = '\uD83D\uDCCE فایل';
                    }
                    list.push({id: p.id, create_at: p.create_at, text: t});
                });
            }
            list.sort(function(a, b) { return a.create_at - b.create_at; });

            var known = {};
            (self.pinnedList || []).forEach(function(x) { known[x.id] = 1; });
            var hadAny = (self.pinnedList || []).length > 0;
            var freshest = null;
            list.forEach(function(x) { if (!known[x.id]) { freshest = x; } });
            var stillShown = list.some(function(x) {
                return x.id === self.pinnedShownId;
            });

            self.pinnedList = list;
            if (!list.length) {
                self.pinnedShownId = null;
            } else if (freshest && hadAny) {
                // a message was just pinned -> the bar switches to it
                self.pinnedShownId = freshest.id;
            } else if (!stillShown) {
                // default: the newest pin (like Telegram)
                self.pinnedShownId = list[list.length - 1].id;
            }
            self.syncPinnedShown();
            self.refreshPinnedBarDom();
        }).catch(function() {});
    };

    // Derive pinnedPostId/pinnedText/index/count from the shown pin
    ChatBubblesPlugin.prototype.syncPinnedShown = function() {
        var list = this.pinnedList || [];
        var item = null;
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === this.pinnedShownId) {
                item = list[i];
                idx = i;
                break;
            }
        }
        if (!item && list.length) {
            idx = list.length - 1;
            item = list[idx];
            this.pinnedShownId = item.id;
        }
        this.pinnedPostId = item ? item.id : null;
        this.pinnedText = item ? item.text : '';
        this.pinnedIndex = idx;
        this.pinnedCount = list.length;
    };

    // Push the shown pin into the bar DOM immediately
    ChatBubblesPlugin.prototype.refreshPinnedBarDom = function() {
        var bar = document.getElementById('cb-pinned-bar');
        if (!bar) { return; }
        var textEl = bar.querySelector('.cb-pin-text');
        var titleEl = bar.querySelector('.cb-pin-title');
        if (textEl && textEl.textContent !== this.pinnedText) {
            textEl.textContent = this.pinnedText;
        }
        if (titleEl) {
            var title = this.pinnedCount > 1 ?
                'Pinned message #' + (this.pinnedIndex + 1) :
                'Pinned message';
            if (titleEl.textContent !== title) { titleEl.textContent = title; }
        }
        bar.style.display = this.pinnedPostId ? 'flex' : 'none';
    };

    // Telegram behavior: clicking the bar jumps to the shown pin, then the
    // bar moves on to the previous (older) pin; wraps back to the newest
    ChatBubblesPlugin.prototype.cyclePinned = function() {
        var list = this.pinnedList || [];
        if (!list.length) { return; }
        this.syncPinnedShown();
        if (this.pinnedPostId) { this.jumpToPost(this.pinnedPostId); }
        if (list.length > 1) {
            var next = this.pinnedIndex - 1;
            if (next < 0) { next = list.length - 1; }
            this.pinnedShownId = list[next].id;
            this.syncPinnedShown();
            this.refreshPinnedBarDom();
        }
    };

    // Unpin ONLY the pin currently shown in the bar
    ChatBubblesPlugin.prototype.unpinCurrent = function() {
        this.syncPinnedShown();
        if (!this.pinnedPostId) { return; }
        var self = this;
        var target = this.pinnedPostId;
        fetch('/api/v4/posts/' + target + '/unpin', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-Token': getCsrf()
            }
        }).then(function() {
            self.pinnedList = (self.pinnedList || []).filter(function(x) {
                return x.id !== target;
            });
            self.pinnedShownId = self.pinnedList.length ?
                self.pinnedList[self.pinnedList.length - 1].id : null;
            self.syncPinnedShown();
            self.refreshPinnedBarDom();
            self.lastPinFetch = Date.now();
        }).catch(function() {});
    };

    ChatBubblesPlugin.prototype.onScroll = function(scroller) {
        var self = this;

        // Floating date chip
        if (toBool(this.config.datechip)) {
            var chip = document.getElementById('cb-date-chip');
            if (chip) {
                var posts = this.store.getState().entities.posts.posts;
                var els = scroller.querySelectorAll('.post:not(.post--system)');
                var top = scroller.getBoundingClientRect().top;
                for (var i = 0; i < els.length; i++) {
                    var r = els[i].getBoundingClientRect();
                    if (r.bottom > top + 24) {
                        var p = els[i].id && els[i].id.indexOf('post_') === 0 ?
                            posts[els[i].id.slice('post_'.length)] : null;
                        if (p) {
                            chip.textContent = dateLabel(p.create_at);
                            chip.classList.add('cb-show');
                            clearTimeout(this.chipTimer);
                            this.chipTimer = setTimeout(function() {
                                chip.classList.remove('cb-show');
                            }, 1200);
                        }
                        break;
                    }
                }
            }
        }

        // Scroll-to-bottom button visibility
        var btn = document.getElementById('cb-scroll-btn');
        if (btn) {
            var dist = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
            var show = dist > 300;
            btn.classList.toggle('cb-show', show);
            if (!show && this.newCount) {
                this.newCount = 0;
                this.updateBadge();
            }
        }
    };

    ChatBubblesPlugin.prototype.updateBadge = function() {
        var btn = document.getElementById('cb-scroll-btn');
        if (!btn) { return; }
        var badge = btn.querySelector('.cb-badge');
        if (!badge) { return; }
        badge.textContent = String(this.newCount);
        badge.classList.toggle('cb-show', this.newCount > 0);
    };

    ChatBubblesPlugin.prototype.maintainPanels = function(enabled) {
        var self = this;
        var scroller = this.getScroller();
        var container = scroller ? scroller.parentElement : null;

        function removeEl(id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) { el.parentNode.removeChild(el); }
        }

        if (!enabled || !scroller || !container) {
            removeEl('cb-pinned-bar');
            removeEl('cb-date-chip');
            removeEl('cb-scroll-btn');
            return;
        }

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Hook the scroll listener once per scroller instance
        if (scroller.dataset.cbHooked !== '1') {
            scroller.dataset.cbHooked = '1';
            scroller.addEventListener('scroll', function() {
                self.onScroll(scroller);
            }, {passive: true});
        }

        var st = this.store.getState();
        var channelId = st.entities.channels.currentChannelId;

        // Reset per-channel state when switching chats
        if (channelId !== this.pinnedChannelId) {
            this.pinnedChannelId = channelId;
            this.pinnedPostId = null;
            this.pinnedText = '';
            this.pinnedList = [];
            this.pinnedShownId = null;
            this.pinnedIndex = -1;
            this.pinnedCount = 0;
            this.lastPinFetch = 0;
            this.lastDomPostId = null;
            this.newCount = 0;
        }

        // Pinned message bar
        if (toBool(this.config.pinnedbar)) {
            if (channelId && Date.now() - this.lastPinFetch > 30000) {
                this.fetchPinned(channelId);
            }
            var bar = document.getElementById('cb-pinned-bar');
            if (!bar || !bar.isConnected) {
                removeEl('cb-pinned-bar');
                bar = document.createElement('div');
                bar.id = 'cb-pinned-bar';
                var line = document.createElement('span');
                line.className = 'cb-pin-line';
                var col = document.createElement('div');
                col.className = 'cb-pin-col';
                var title = document.createElement('span');
                title.className = 'cb-pin-title';
                title.textContent = 'Pinned message';
                var text = document.createElement('span');
                text.className = 'cb-pin-text';
                text.dir = 'auto';
                col.appendChild(title);
                col.appendChild(text);
                var close = document.createElement('button');
                close.type = 'button';
                close.className = 'cb-pin-close';
                close.title = 'Unpin';
                close.textContent = '\u00d7';
                close.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.unpinCurrent();
                };
                bar.appendChild(line);
                bar.appendChild(col);
                bar.appendChild(close);
                bar.onclick = function() {
                    self.cyclePinned();
                };
                container.appendChild(bar);
            }
            this.refreshPinnedBarDom();
            if (this.pinnedPostId) {
                bar.style.display = 'flex';
            } else {
                bar.style.display = 'none';
            }
        } else {
            removeEl('cb-pinned-bar');
        }

        // Floating date chip element
        if (toBool(this.config.datechip)) {
            var chip = document.getElementById('cb-date-chip');
            if (!chip || !chip.isConnected) {
                removeEl('cb-date-chip');
                chip = document.createElement('div');
                chip.id = 'cb-date-chip';
                container.appendChild(chip);
            }
        } else {
            removeEl('cb-date-chip');
        }

        // Scroll-to-bottom button + new message counter
        if (toBool(this.config.scrollbutton)) {
            var btn = document.getElementById('cb-scroll-btn');
            if (!btn || !btn.isConnected) {
                removeEl('cb-scroll-btn');
                btn = document.createElement('button');
                btn.id = 'cb-scroll-btn';
                btn.type = 'button';
                btn.textContent = '\u2193';
                var badge = document.createElement('span');
                badge.className = 'cb-badge';
                btn.appendChild(badge);
                btn.onclick = function() {
                    var sc = self.getScroller();
                    if (sc) { sc.scrollTop = sc.scrollHeight; }
                    self.newCount = 0;
                    self.updateBadge();
                };
                container.appendChild(btn);
            }
            // Count messages arriving while scrolled up
            var domPosts = scroller.querySelectorAll('.post:not(.post--system)');
            var lastEl = domPosts.length ? domPosts[domPosts.length - 1] : null;
            var lastId = lastEl && lastEl.id ? lastEl.id : null;
            if (lastId && lastId !== this.lastDomPostId) {
                if (this.lastDomPostId && btn.classList.contains('cb-show')) {
                    this.newCount++;
                    this.updateBadge();
                }
                this.lastDomPostId = lastId;
            }
        } else {
            removeEl('cb-scroll-btn');
        }
    };

    // ------------------------------------------------------------------ tick

    // ---- Telegram-like send/receive sounds (generated, no audio files) ----
    ChatBubblesPlugin.prototype.checkSounds = function(enabled) {
        if (!enabled || !toBool(this.config.messagesounds)) { return; }
        var st = this.store.getState();
        var chId = st.entities.channels.currentChannelId;
        if (!chId) { return; }
        var posts = st.entities.posts.posts;
        var newest = null;
        Object.keys(posts).forEach(function(id) {
            var p = posts[id];
            if (p.channel_id !== chId || p.delete_at !== 0) { return; }
            if (p.type && p.type.indexOf('system_') === 0) { return; }
            if (!newest || p.create_at > newest.create_at) { newest = p; }
        });
        // On channel switch just remember the latest post; no sound
        if (this.soundChannelId !== chId) {
            this.soundChannelId = chId;
            this.lastSoundPostAt = newest ? newest.create_at : Date.now();
            return;
        }
        if (!newest || newest.create_at <= this.lastSoundPostAt) { return; }
        this.lastSoundPostAt = newest.create_at;
        var mine = newest.user_id === st.entities.users.currentUserId;
        this.playSound(mine ? 'send' : 'receive');
    };

    ChatBubblesPlugin.prototype.playSound = function(kind) {
        try {
            if (!this.audioCtx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { return; }
                this.audioCtx = new AC();
            }
            var ctx = this.audioCtx;
            if (ctx.state === 'suspended') { ctx.resume(); }
            var t0 = ctx.currentTime;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            if (kind === 'send') {
                // short upward "pop"
                osc.frequency.setValueAtTime(660, t0);
                osc.frequency.exponentialRampToValueAtTime(920, t0 + 0.09);
            } else {
                // soft downward "ding"
                osc.frequency.setValueAtTime(880, t0);
                osc.frequency.exponentialRampToValueAtTime(587, t0 + 0.12);
            }
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.2);
        } catch (e) { /* ignore */ }
    };

    ChatBubblesPlugin.prototype.tick = function() {
        if (!document.body) { return; }
        var enabled = toBool(this.config.enablebubbles);
        if (enabled && toBool(this.config.onlydirectandgroup)) {
            var state = this.store.getState();
            var chId = state.entities.channels.currentChannelId;
            var ch = chId && state.entities.channels.channels[chId];
            enabled = !!ch && (ch.type === 'D' || ch.type === 'G');
        }
        document.body.classList.toggle('rr-bubbles-on', enabled);
        this.tagMyPosts(enabled);
        try {
            this.updateFaviconBadge();
        } catch (e) {
            // Never let the badge break the rest of the plugin
        }

        // Drop the pending reply when switching channels; re-attach the
        // preview bar if a React re-render removed it
        if (this.pendingReply) {
            var st = this.store.getState();
            if (this.pendingReply.channelId &&
                st.entities.channels.currentChannelId !== this.pendingReply.channelId) {
                this.pendingReply = null;
            }
        }
        this.renderReplyBar();

        this.renderTimes(enabled);
        this.maintainPanels(enabled);
        this.checkSounds(enabled);
    };

    if (window.registerPlugin) {
        window.registerPlugin(PLUGIN_ID, new ChatBubblesPlugin());
    }
})();
