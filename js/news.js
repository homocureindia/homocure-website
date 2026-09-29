/* ===========================================================
   HOMOCURE LIVE NEWS
   - Floating "Live News" pill (rotating headline) + popup list
   - "Live" section injected just before the footer
   - Headline rotates every 2 seconds
   - Only news from the last 24 hours (falls back to 7 days
     if nothing is found, so the widget is never empty)
   Source: Google News RSS, converted to JSON by rss2json.
=========================================================== */

(function () {
    "use strict";

    /* ---------- CONFIG ---------- */
    var ROTATE_MS  = 2000;             // headline change speed
    var REFRESH_MS = 10 * 60 * 1000;   // re-fetch news every 10 minutes
    var MAX_AGE_MS = 24 * 60 * 60 * 1000;
    var FALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    var QUERIES = [
        "homeopathy",
        "homeopathic medicine",
        "homoeopathy India",
        "homeopathy AYUSH"
    ];

    function feedUrl(query, when) {
        var rss = "https://news.google.com/rss/search?q=" +
            encodeURIComponent(query + " when:" + when) +
            "&hl=en-IN&gl=IN&ceid=IN:en";
        return "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rss);
    }

    /* ---------- STATE ---------- */
    var news = [];
    var current = 0;
    var timer = null;
    var paused = false;
    var els = {};

    /* ---------- HELPERS ---------- */
    function esc(str) {
        var d = document.createElement("div");
        d.textContent = str == null ? "" : String(str);
        return d.innerHTML;
    }

    // rss2json gives "YYYY-MM-DD HH:MM:SS" in UTC
    function parseDate(s) {
        if (!s) return 0;
        var t = Date.parse(String(s).replace(" ", "T") + "Z");
        return isNaN(t) ? 0 : t;
    }

    function timeAgo(ts) {
        var diff = Math.max(0, Date.now() - ts);
        var m = Math.floor(diff / 60000);
        if (m < 1) return "Just now";
        if (m < 60) return m + " min ago";
        var h = Math.floor(m / 60);
        if (h < 24) return h + " hr ago";
        var d = Math.floor(h / 24);
        return d + (d === 1 ? " day ago" : " days ago");
    }

    // Google News titles look like "Headline - Source"
    function splitTitle(raw) {
        var i = raw.lastIndexOf(" - ");
        if (i === -1) return { title: raw, source: "News" };
        return { title: raw.slice(0, i), source: raw.slice(i + 3) };
    }

    function normalize(items) {
        return items.map(function (it) {
            var parts = splitTitle(it.title || "");
            return {
                title: parts.title,
                source: parts.source,
                link: it.link,
                ts: parseDate(it.pubDate)
            };
        }).filter(function (n) { return n.title && n.link && n.ts; });
    }

    function dedupe(list) {
        var seen = {};
        return list.filter(function (n) {
            var key = n.title.toLowerCase().slice(0, 60);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    function fetchAll(when) {
        return Promise.all(QUERIES.map(function (q) {
            return fetch(feedUrl(q, when))
                .then(function (r) { return r.json(); })
                .then(function (d) { return d && d.items ? normalize(d.items) : []; })
                .catch(function () { return []; });
        })).then(function (lists) {
            return dedupe([].concat.apply([], lists))
                .sort(function (a, b) { return b.ts - a.ts; });
        });
    }

    /* ---------- BUILD UI ---------- */
    function buildUI() {
        // Floating pill
        var pill = document.createElement("button");
        pill.className = "hn-pill";
        pill.setAttribute("aria-label", "Open live homeopathy news");
        pill.innerHTML =
            '<span class="hn-dot"></span>' +
            '<span class="hn-pill-label">Live</span>' +
            '<span class="hn-pill-text">Loading latest news…</span>';

        // Overlay + panel
        var overlay = document.createElement("div");
        overlay.className = "hn-overlay";

        var panel = document.createElement("aside");
        panel.className = "hn-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Live homeopathy news");
        panel.innerHTML =
            '<div class="hn-panel-head">' +
                '<h3><span class="hn-dot"></span> Live Homeopathy News</h3>' +
                '<button class="hn-close" aria-label="Close">✕</button>' +
            '</div>' +
            '<div class="hn-panel-meta">' +
                '<span class="hn-meta-text">Last 24 hours</span>' +
                '<button class="hn-refresh">↻ Refresh</button>' +
            '</div>' +
            '<ul class="hn-list"><li class="hn-state">Loading news…</li></ul>';

        document.body.appendChild(overlay);
        document.body.appendChild(panel);
        document.body.appendChild(pill);

        // Live section before footer
        var section = document.createElement("section");
        section.className = "hn-live";
        section.innerHTML =
            '<div class="container">' +
                '<div class="hn-live-head">' +
                    '<span class="hn-dot"></span>' +
                    '<span class="hn-live-tag">LIVE</span>' +
                    '<span>Homeopathy News · Last 24 Hours</span>' +
                '</div>' +
                '<a class="hn-live-card" href="#" target="_blank" rel="noopener noreferrer">' +
                    '<span class="hn-src">Loading…</span>' +
                    '<h3 class="hn-title">Fetching the latest homeopathy news…</h3>' +
                    '<span class="hn-time"></span>' +
                '</a>' +
                '<div class="hn-live-foot">' +
                    '<span class="hn-counter"></span>' +
                    '<button class="hn-view-all">View all news</button>' +
                '</div>' +
            '</div>';

        var footer = document.querySelector("footer.footer") || document.querySelector("footer");
        if (footer) footer.parentNode.insertBefore(section, footer);
        else document.body.appendChild(section);

        els = {
            pill: pill,
            pillText: pill.querySelector(".hn-pill-text"),
            overlay: overlay,
            panel: panel,
            list: panel.querySelector(".hn-list"),
            metaText: panel.querySelector(".hn-meta-text"),
            refresh: panel.querySelector(".hn-refresh"),
            close: panel.querySelector(".hn-close"),
            card: section.querySelector(".hn-live-card"),
            src: section.querySelector(".hn-src"),
            title: section.querySelector(".hn-title"),
            time: section.querySelector(".hn-time"),
            counter: section.querySelector(".hn-counter"),
            viewAll: section.querySelector(".hn-view-all")
        };

        // Events
        function open()  { els.panel.classList.add("open"); els.overlay.classList.add("open"); }
        function close() { els.panel.classList.remove("open"); els.overlay.classList.remove("open"); }

        pill.addEventListener("click", open);
        els.viewAll.addEventListener("click", open);
        els.close.addEventListener("click", close);
        overlay.addEventListener("click", close);
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
        els.refresh.addEventListener("click", function () { load(true); });

        // Pause rotation while user hovers the live card (so it's easy to click)
        els.card.addEventListener("mouseenter", function () { paused = true; });
        els.card.addEventListener("mouseleave", function () { paused = false; });
    }

    /* ---------- RENDER ---------- */
    function renderList(isFallback) {
        if (!news.length) {
            els.list.innerHTML =
                '<li class="hn-state">Abhi koi news nahi mili. Thodi der baad refresh karein.</li>';
            els.metaText.textContent = "No news found";
            return;
        }

        els.metaText.textContent = isFallback
            ? "Latest available (last 7 days)"
            : "Last 24 hours · " + news.length + " stories";

        els.list.innerHTML = news.map(function (n) {
            return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' +
                '<span class="hn-item-title">' + esc(n.title) + '</span>' +
                '<span class="hn-item-meta"><span class="hn-src">' + esc(n.source) + '</span>' +
                '<span>•</span><span>' + timeAgo(n.ts) + '</span></span>' +
                '</a></li>';
        }).join("");
    }

    function showItem(index, animate) {
        if (!news.length) return;
        var n = news[index % news.length];

        function apply() {
            els.pillText.textContent = n.title;
            els.card.href = n.link;
            els.src.textContent = n.source;
            els.title.textContent = n.title;
            els.time.textContent = "🕒 " + timeAgo(n.ts);
            els.counter.textContent = (index % news.length + 1) + " / " + news.length;
        }

        if (!animate) { apply(); return; }

        els.card.classList.add("hn-fade");
        els.pillText.classList.add("hn-fade");
        setTimeout(function () {
            apply();
            els.card.classList.remove("hn-fade");
            els.pillText.classList.remove("hn-fade");
        }, 250);
    }

    function startRotation() {
        clearInterval(timer);
        current = 0;
        showItem(current, false);
        timer = setInterval(function () {
            if (paused || document.hidden || news.length < 2) return;
            current = (current + 1) % news.length;
            showItem(current, true);
        }, ROTATE_MS);
    }

    /* ---------- LOAD ---------- */
    function load(manual) {
        if (manual) els.list.innerHTML = '<li class="hn-state">Refreshing…</li>';

        fetchAll("1d").then(function (list) {
            var cutoff = Date.now() - MAX_AGE_MS;
            var fresh = list.filter(function (n) { return n.ts >= cutoff; });
            if (fresh.length) return { list: fresh, fallback: false };

            // Nothing in 24h → widen the window so the widget isn't empty
            return fetchAll("7d").then(function (list7) {
                var c7 = Date.now() - FALLBACK_AGE_MS;
                return { list: list7.filter(function (n) { return n.ts >= c7; }), fallback: true };
            });
        }).then(function (res) {
            news = res.list;
            renderList(res.fallback);

            if (news.length) {
                startRotation();
            } else {
                els.pillText.textContent = "Live news unavailable right now";
                els.src.textContent = "Homocure";
                els.title.textContent = "Latest news abhi load nahi ho pa rahi. Please thodi der baad try karein.";
                els.time.textContent = "";
                els.counter.textContent = "";
            }
        });
    }

    /* ---------- INIT ---------- */
    document.addEventListener("DOMContentLoaded", function () {
        buildUI();
        load(false);
        setInterval(function () { load(false); }, REFRESH_MS);
    });

})();
