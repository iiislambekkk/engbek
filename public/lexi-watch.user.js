// ==UserScript==
// @name         Lexi Watch — Stremio & YouTube
// @namespace    lexi-watch
// @version      1.3.3
// @description  Send played subtitles and video details to your Lexi account.
// @match        https://web.stremio.com/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async () => {
  "use strict";
  const SOURCE = location.hostname.endsWith("youtube.com") ? "youtube" : "stremio";
  const DEFAULT_ORIGINS = ["http://localhost:3000", "http://192.168.8.63:3000", "http://10.86.28.84:3000"];
  const STYLE_ID = "lexi-watch-hidden-cues";
  const MAX_QUEUE = 500;
  const hidden = new Map();
  const tab = await new Promise(resolve => GM_getTab(resolve));
  if (!tab.lexiId) { tab.lexiId = crypto.randomUUID(); GM_saveTab(tab); }
  const storageKey = `capture:${tab.lexiId}`;
  let connection = GM_getValue("connection", null);
  let serverOrigins = [...new Set([...DEFAULT_ORIGINS, ...(GM_getValue("serverOrigins", []) || [])])];
  let origin = connection?.origin || GM_getValue("origin", DEFAULT_ORIGINS[0]);
  if (!serverOrigins.includes(origin)) serverOrigins.push(origin);
  let current = null;
  let outbox = [];
  let active = false;
  let pairing = false;
  let ticking = false;
  let sending = false;
  let lastAck = 0;
  let lastPosition = 0;
  let retryAt = 0;
  let failures = 0;
  let lastMediaKey = "";
  let lastDom = [];
  let pending = new Map();
  let cache = new Map();
  let tokenHash = connection ? await sha(connection.token) : "";
  let metadataAt = 0;
  let activeKeys = [];
  let activeTrack = null;
  let lastHeartbeatAt = 0;
  let lastPlaybackSignature = "";
  let observedVideo = null;
  let cueTracks = new Set();
  let videoHandler = null;
  let trackListHandler = null;
  let captionObserver = null;
  let captureTimer = null;
  let recapturePending = false;
  let commandSocket = null;
  let commandConnecting = false;
  let connectionGeneration = 0;
  let sendGeneration = 0;
  let deviceId = connection?.deviceId || "";
  let youtubeTranscript = null;
  let youtubeTranscriptKey = "";
  let youtubeTranscriptLoading = null;

  const saved = GM_getValue(storageKey, null);
  if (saved?.tokenHash === tokenHash) {
    outbox = saved.outbox || [];
    current = saved.current || null;
    pending = new Map(saved.pending || []);
    cache = new Map(saved.cache || []);
  }

  function bytes() {
    return [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, "0")).join("");
  }
  async function sha(text) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function persist() {
    GM_setValue(storageKey, { tokenHash, outbox, current, pending: [...pending], cache: [...cache] });
  }
  function request(path, data, token) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST", url: origin + path, anonymous: true, timeout: 12_000,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        data: JSON.stringify(data), redirect: "error",
        onload(response) {
          let result;
          try { result = JSON.parse(response.responseText); } catch { result = {}; }
          if (response.status >= 200 && response.status < 300) resolve(result);
          else reject(Object.assign(new Error(result.error || `Lexi returned HTTP ${response.status}`), { status: response.status }));
        },
        onerror: () => reject(new Error("Cannot reach Lexi. Check the address and Tampermonkey connection permission.")),
        ontimeout: () => reject(new Error("Lexi timed out. Retrying…")),
      });
    });
  }

  const panel = document.createElement("div");
  panel.id = "lexi-watch-controls";
  Object.assign(panel.style, { position: "fixed", bottom: "96px", right: "16px", zIndex: "2147483647", width: "250px", padding: "12px", borderRadius: "14px", background: "#181624", color: "#fff", font: "13px/1.5 system-ui, sans-serif", boxShadow: "0 4px 24px #0005" });
  const button = document.createElement("button");
  Object.assign(button.style, { width: "100%", padding: "10px", background: "#7b5bf5", color: "white", border: "none", borderRadius: "9px", cursor: "pointer", font: "600 13px system-ui" });
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  Object.assign(status.style, { paddingTop: "8px", overflowWrap: "anywhere", color: "#d6d2e6" });
  const watch = document.createElement("a");
  watch.textContent = "Open Lexi Watch ↗";
  watch.target = "_blank";
  watch.rel = "noopener noreferrer";
  Object.assign(watch.style, { display: "block", marginTop: "8px", color: "#b9a6ff" });
  panel.append(button, status, watch);
  document.body.append(panel);
  Object.assign(panel.style, { transition: "opacity 180ms ease, transform 180ms ease" });
  function message(text, urgent = false) {
    status.textContent = text;
    if (urgent) updateControls();
  }
  function revealControls() { updateControls(); }
  function updateControls() {
    const video = getVideo();
    const hidePanel = video && !video.paused && !video.ended;
    panel.style.opacity = hidePanel ? "0" : "1";
    panel.style.pointerEvents = hidePanel ? "none" : "auto";
    panel.style.transform = hidePanel ? "translateY(6px)" : "translateY(0)";
    panel.inert = Boolean(hidePanel);
    // Keep controls available inside a fullscreen player's DOM subtree.
    const host = document.fullscreenElement || document.body;
    if (host.tagName !== "VIDEO" && panel.parentElement !== host) host.append(panel);
  }
  document.addEventListener("pointermove", revealControls, { passive: true });
  document.addEventListener("keydown", revealControls);
  document.addEventListener("fullscreenchange", revealControls);
  GM_registerMenuCommand("Lexi: show controls", revealControls);
  setInterval(updateControls, 250);
  function labels() {
    button.textContent = pairing ? "Waiting for confirmation…" : active ? "Stop sending to Lexi" : "Send subtitles to Lexi";
    button.disabled = pairing;
    watch.href = origin + "/watch";
  }
  labels();
  message(outbox.length ? "Saved captions are waiting to sync." : "Enable captions in the player before sending.");

  function switchServer(value) {
    if (value === origin) return;
    connectionGeneration++; sendGeneration++; sending = false;
    commandSocket?.close(); commandSocket = null;
    active = false; pairing = false; restore();
    origin = value; connection = null; tokenHash = ""; current = null; pending.clear(); cache.clear();
    outbox = []; deviceId = ""; lastMediaKey = "";
    GM_deleteValue("connection"); GM_deleteValue(storageKey);
    GM_setValue("origin", origin); labels();
    message(`Sending stopped and queued captions cleared. Lexi server set to ${origin}. Click Send subtitles to connect.`);
  }
  function addServer() {
    const value = prompt("Add Lexi server address:", "http://");
    if (!value) return;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      if (!serverOrigins.includes(url.origin)) {
        serverOrigins.push(url.origin);
        GM_setValue("serverOrigins", serverOrigins);
        GM_registerMenuCommand(`Lexi server: ${url.origin}`, () => switchServer(url.origin));
      }
      switchServer(url.origin);
    } catch { alert("Enter an address such as http://192.168.8.63:3000"); }
  }
  for (const serverOrigin of serverOrigins) {
    GM_registerMenuCommand(`Lexi server: ${serverOrigin}`, () => switchServer(serverOrigin));
  }
  GM_registerMenuCommand("Lexi: add server address", addServer);
  GM_registerMenuCommand("Lexi: forget browser token", async () => {
    if (pairing) { message("Finish or cancel the pending connection before forgetting this browser."); return; }
    const previous = connection;
    commandSocket?.close(); commandSocket = null;
    active = false; restore(); labels();
    if (previous?.deviceId) {
      try {
        await new Promise((resolve, reject) => GM_xmlhttpRequest({
          method: "DELETE", url: `${origin}/api/watch`, anonymous: true, timeout: 12_000,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${previous.token}` },
          data: JSON.stringify({ deviceId: previous.deviceId }), redirect: "error",
          onload(response) {
            if (response.status >= 200 && response.status < 300) resolve(null);
            else reject(new Error(`Lexi returned HTTP ${response.status}`));
          },
          onerror: () => reject(new Error("Cannot reach Lexi. Check the address and Tampermonkey connection permission.")),
          ontimeout: () => reject(new Error("Lexi timed out.")),
        }));
      } catch (error) {
        message(`Could not revoke browser in Lexi: ${error.message}. Token was kept.`, true);
        return;
      }
    }
    connection = null; tokenHash = ""; deviceId = ""; outbox = []; pending.clear(); cache.clear(); current = null;
    GM_deleteValue("connection"); GM_deleteValue(storageKey);
    message("Browser disconnected and token removed. Click Send subtitles to Lexi to connect again.", true);
  });

  async function connect() {
    const generation = connectionGeneration;
    // Another source tab may already have connected this userscript.
    const shared = GM_getValue("connection", null);
    if (shared?.origin === origin) connection = shared;
    if (connection) {
      const nextHash = await sha(connection.token);
      if (nextHash !== tokenHash) { outbox = []; pending.clear(); cache.clear(); current = null; }
      tokenHash = nextHash;
      return;
    }
    pairing = true; labels();
    try {
      const token = `lexi_watch_${bytes()}`;
      const hash = await sha(token);
      const result = await request("/api/watch/pair", { action: "create", name: `Video browser (${navigator.platform || "computer"})`, tokenHash: hash });
      if (generation !== connectionGeneration) throw new Error("Lexi server changed. Click Send subtitles to connect to the selected server.");
      message(`Confirm code ${result.code.slice(0, 5)}-${result.code.slice(5)} in Lexi. Then return to this video.`);
      GM_openInTab(`${origin}/connect-browser?code=${result.code}`, { active: true, insert: true });
      while (generation === connectionGeneration && Date.now() < Date.parse(result.expiresAt)) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        const state = await request("/api/watch/pair", { action: "status", deviceCode: result.deviceCode });
        if (generation !== connectionGeneration) throw new Error("Lexi server changed. Click Send subtitles to connect to the selected server.");
        if (!state.approved) continue;
        const ticket = await request("/api/watch/socket-ticket", {}, token);
        if (generation !== connectionGeneration) throw new Error("Lexi server changed. Click Send subtitles to connect to the selected server.");
        connection = { origin, token, deviceId: ticket.deviceId }; deviceId = ticket.deviceId; tokenHash = hash;
        outbox = []; current = null; pending.clear(); cache.clear();
        GM_setValue("connection", connection); persist();
        return;
      }
      throw new Error("Connection code expired. Click Send again.");
    } finally { if (generation === connectionGeneration) { pairing = false; labels(); } }
  }

  function getVideo() {
    return [...document.querySelectorAll("video")].find(video => video.offsetWidth > 0 && video.offsetHeight > 0) || null;
  }
  async function connectCommands() {
    if (!active || !connection || commandConnecting || commandSocket?.readyState === WebSocket.OPEN || commandSocket?.readyState === WebSocket.CONNECTING) return;
    commandConnecting = true;
    try {
    const auth = await request("/api/watch/socket-ticket", {}, connection.token);
    deviceId = auth.deviceId;
    const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/api/watch/socket?ticket=${encodeURIComponent(auth.ticket)}`);
    commandSocket = socket;
    socket.addEventListener("message", event => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.type !== "command" || payload.deviceId !== deviceId || payload.clientSessionId !== current?.clientSessionId) return;
      const video = getVideo();
      if (!video || !active) return;
      try {
        if (payload.command === "pause") video.pause();
        else if (payload.command === "play") void video.play().catch(() => message("The browser blocked playback. Tap play on the computer once."));
        else if (payload.command === "seek" && Number.isInteger(payload.positionMs)) video.currentTime = Math.max(0, Math.min(video.duration || Infinity, payload.positionMs / 1000));
        requestCapture();
      } catch { message("This player could not apply the command."); }
    });
    socket.addEventListener("close", () => { if (commandSocket === socket) commandSocket = null; });
    socket.addEventListener("error", () => socket.close());
    } catch { /* The next capture tick retries the short-lived socket ticket. */ }
    finally { commandConnecting = false; }
  }
  function ytPlayer() { return unsafeWindow.document.getElementById("movie_player"); }
  function isAd() { return SOURCE === "youtube" && document.getElementById("movie_player")?.classList.contains("ad-showing"); }
  function mediaKey() {
    if (SOURCE === "youtube") return new URL(location.href).searchParams.get("v") || location.pathname.match(/^\/shorts\/([^/]+)/)?.[1] || "";
    return `${location.pathname}${location.hash}`;
  }
  function plain(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean).join("\n").slice(0, 8000);
  }
  function cueText(cue) {
    if (typeof cue.getCueAsHTML === "function") return plain(cue.getCueAsHTML().textContent);
    const template = document.createElement("template");
    template.innerHTML = String(cue.text || "").replace(/<br\s*\/?>/gi, "\n");
    template.content.querySelectorAll("script,style").forEach(node => node.remove());
    return plain(template.content.textContent);
  }
  const ms = value => Math.max(0, Math.min(604800000, Math.round((Number.isFinite(value) ? value : 0) * 1000)));
  function imageUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.href.slice(0, 2048) : null; } catch { return null; } }

  async function metadata(video, key) {
    let title = document.title;
    let thumbnail = null;
    let imdbId = null, season = null, episode = null;
    if (SOURCE === "youtube") {
      let details;
      try { details = ytPlayer()?.getVideoData?.(); } catch { /* DOM title is the fallback. */ }
      title = (details?.video_id === key && details.title) || document.querySelector("ytd-watch-metadata h1")?.textContent || title.replace(/\s*-\s*YouTube$/, "");
      thumbnail = `https://i.ytimg.com/vi/${encodeURIComponent(key)}/hqdefault.jpg`;
    } else {
      title = document.querySelector('[class*="video-title"], [class*="videoTitle"], [class*="player-title"]')?.textContent || title.replace(/\s*[-–|]\s*Stremio.*$/i, "");
      thumbnail = imageUrl(document.querySelector('meta[property="og:image"]')?.content);
      let route = key;
      try { route = decodeURIComponent(key); } catch { /* Keep the encoded route. */ }
      const ids = [...route.matchAll(/(tt\d{5,12})(?::(\d{1,3}):(\d{1,4}))?/g)];
      // Stremio detail routes include the series ID first and the selected video ID second.
      // Prefer the episode ID so each episode gets its own Watch media record.
      const match = [...ids].reverse().find(item => item[2] && item[3]) || ids.at(-1);
      if (match) { imdbId = match[1]; season = match[2] ? Number(match[2]) : null; episode = match[3] ? Number(match[3]) : null; }
    }
    return {
      source: SOURCE, sourceId: SOURCE === "youtube" ? key.slice(0, 200) : await sha(key),
      title: plain(title).slice(0, 500) || (SOURCE === "youtube" ? "YouTube video" : "Stremio video"),
      // Stremio player routes may contain stream URLs; do not send those credentials to Lexi.
      url: SOURCE === "youtube" ? `https://www.youtube.com/watch?v=${encodeURIComponent(key)}` : "https://web.stremio.com/",
      thumbnail, durationMs: Number.isFinite(video.duration) ? ms(video.duration) : null, imdbId, season, episode,
    };
  }
  function domTrack() {
    if (SOURCE === "youtube") {
      try {
        const track = ytPlayer()?.getOption?.("captions", "track");
        if (track?.languageCode) return { track: `youtube:${track.vss_id || track.id || track.languageCode}:${track.kind || ""}`.slice(0, 200), language: String(track.languageCode).slice(0, 40) };
      } catch { /* Track metadata is optional. */ }
    }
    return { track: `${SOURCE}:screen`, language: null };
  }
  function getYouTubeCaptionTracks() {
    if (SOURCE !== "youtube") return [];
    try {
      const player = ytPlayer();
      const response = player?.getPlayerResponse?.() || unsafeWindow.ytInitialPlayerResponse;
      return response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch { return []; }
  }
  function getYouTubeTranscript(videoKey) {
    if (youtubeTranscriptKey === videoKey && youtubeTranscript) return Promise.resolve(youtubeTranscript);
    if (youtubeTranscriptKey === videoKey && youtubeTranscriptLoading) return youtubeTranscriptLoading;
    youtubeTranscriptKey = videoKey;
    youtubeTranscript = null;
    const selected = (() => { try { return ytPlayer()?.getOption?.("captions", "track"); } catch { return null; } })();
    const tracks = getYouTubeCaptionTracks();
    const chosen = tracks.find(track => selected && (track.vss_id === selected.vss_id || track.vss_id === selected.id || track.languageCode === selected.languageCode))
      || tracks.find(track => track.languageCode === selected?.languageCode)
      || tracks[0];
    if (!chosen?.baseUrl) return Promise.resolve(null);
    const url = new URL(chosen.baseUrl);
    url.searchParams.set("fmt", "json3");
    const trackKey = `youtube:${chosen.vss_id || chosen.id || chosen.languageCode}:${chosen.kind || ""}`.slice(0, 200);
    youtubeTranscriptLoading = new Promise(resolve => {
      GM_xmlhttpRequest({
        method: "GET", url: url.href, anonymous: true, timeout: 8_000, redirect: "error",
        onload(response) {
          try {
            if (response.status < 200 || response.status >= 300 || youtubeTranscriptKey !== videoKey) { resolve(null); return; }
            const data = JSON.parse(response.responseText);
            const events = (data.events || []).filter(event => Array.isArray(event.segs) && Number.isFinite(Number(event.tStartMs)));
            const cues = events.map(event => {
              const text = plain(event.segs.map(segment => segment.utf8 || "").join(""));
              const startMs = Math.max(0, Math.round(Number(event.tStartMs)));
              const endMs = Math.max(startMs, startMs + Math.max(0, Math.round(Number(event.dDurationMs) || 0)));
              return text ? { text, startMs, endMs } : null;
            }).filter(Boolean);
            if (!cues.length) { resolve(null); return; }
            youtubeTranscript = { track: trackKey, language: chosen.languageCode?.slice(0, 40) || null, cues };
            resolve(youtubeTranscript);
          } catch { resolve(null); }
          finally { if (youtubeTranscriptKey === videoKey) youtubeTranscriptLoading = null; }
        },
        onerror() { if (youtubeTranscriptKey === videoKey) youtubeTranscriptLoading = null; resolve(null); },
        ontimeout() { if (youtubeTranscriptKey === videoKey) youtubeTranscriptLoading = null; resolve(null); },
      });
    });
    return youtubeTranscriptLoading;
  }
  function subtitleElements() {
    const selectors = SOURCE === "youtube" ? [".ytp-caption-window-container .caption-visual-line"] : [".subtitles-container", ".subtitle-container", '[class*="subtitle-text"]', '[class*="subtitles-container"]', '[class*="subtitle-container"]'];
    const candidates = selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
    if (SOURCE === "stremio") {
      // stremio-video/withHTMLSubtitles also renders an unclassed sibling div.
      // Match its text nodes by structure, without collecting subtitle menus.
      const container = getVideo()?.parentElement;
      for (const layer of [...(container?.children || [])]) {
        if (layer.style?.position !== "absolute" || layer.style?.textAlign !== "center") continue;
        for (const node of [...layer.children]) {
          if (node.style?.whiteSpace === "pre-wrap" && node.style?.display === "inline-block") candidates.push(node);
        }
      }
    }
    const all = [...new Set(candidates)].filter(el => plain(el.textContent) && !el.closest("#lexi-watch-controls"));
    return all.filter(el => !all.some(other => other !== el && el.contains(other)));
  }
  function restore() {
    document.getElementById(STYLE_ID)?.remove();
    for (const [element, original] of hidden) {
      if (original.value) element.style.setProperty("opacity", original.value, original.priority);
      else element.style.removeProperty("opacity");
    }
    hidden.clear();
  }
  function hide() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style"); style.id = STYLE_ID;
      style.textContent = "video::cue { color:transparent!important; background:transparent!important; text-shadow:none!important; }";
      // Hide newly inserted caption nodes immediately, including between polls.
      style.textContent += SOURCE === "youtube"
        ? ".ytp-caption-window-container .caption-visual-line { opacity:0!important; }"
        : '.subtitles-container, .subtitle-container, [class*="subtitle-text"], [class*="subtitles-container"], [class*="subtitle-container"], video ~ div[style*="position: absolute"][style*="text-align: center"] > [style*="white-space: pre-wrap"] { opacity:0!important; }';
      document.head.append(style);
    }
    for (const element of subtitleElements()) {
      if (!hidden.has(element)) hidden.set(element, { value: element.style.getPropertyValue("opacity"), priority: element.style.getPropertyPriority("opacity") });
      element.style.setProperty("opacity", "0", "important");
    }
    for (const element of hidden.keys()) if (!element.isConnected) hidden.delete(element);
  }
  function record(cue) { cache.set(cue.cueKey, cue); pending.set(cue.cueKey, { ...cue }); }

  function requestCapture() {
    if (!active) return;
    if (ticking) { recapturePending = true; return; }
    if (captureTimer) return;
    captureTimer = setTimeout(() => { captureTimer = null; void tick(); }, 0);
  }

  function bindPlayerEvents(video) {
    if (observedVideo === video) return;
    captionObserver?.disconnect();
    if (observedVideo && videoHandler) {
      for (const event of ["play", "playing", "pause", "seeking", "seeked", "ended", "ratechange", "loadedmetadata"])
        observedVideo.removeEventListener(event, videoHandler);
      observedVideo.textTracks.removeEventListener?.("addtrack", trackListHandler);
      observedVideo.textTracks.removeEventListener?.("change", trackListHandler);
      for (const track of cueTracks) track.removeEventListener?.("cuechange", videoHandler);
    }
    observedVideo = video;
    videoHandler = requestCapture;
    trackListHandler = () => { bindCueTracks(video); requestCapture(); };
    cueTracks = new Set();
    for (const event of ["play", "playing", "pause", "seeking", "seeked", "ended", "ratechange", "loadedmetadata"])
      video.addEventListener(event, videoHandler);
    video.textTracks.addEventListener?.("addtrack", trackListHandler);
    video.textTracks.addEventListener?.("change", trackListHandler);
    bindCueTracks(video);
    const root = SOURCE === "youtube" ? video.closest("#movie_player") || video.parentElement : video.parentElement;
    const target = root || document.body;
    captionObserver ||= new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === "childList" || mutation.type === "characterData")) requestCapture();
    });
    captionObserver.observe(target, { subtree: true, childList: true, characterData: true });
  }

  function bindCueTracks(video) {
    for (const track of video.textTracks) {
      if (cueTracks.has(track)) continue;
      cueTracks.add(track);
      track.addEventListener?.("cuechange", videoHandler);
    }
  }

  async function capture(video) {
    activeKeys = [];
    activeTrack = null;
    let position = ms(video.currentTime);
    const jumped = video.seeking || Math.abs(position - lastPosition) > 1800;
    lastPosition = position;
    if (jumped) lastDom = [];
    if (video.seeking || video.readyState < 2) return;
    if (SOURCE === "youtube") {
      if (youtubeTranscriptKey !== mediaKey() || (!youtubeTranscript && !youtubeTranscriptLoading)) void getYouTubeTranscript(mediaKey());
      if (youtubeTranscriptKey === mediaKey() && youtubeTranscriptLoading) await youtubeTranscriptLoading;
      position = ms(video.currentTime);
      lastPosition = position;
      const transcript = youtubeTranscriptKey === mediaKey() ? youtubeTranscript : null;
      if (transcript) {
        activeTrack = transcript.track;
        const currentCues = transcript.cues.filter(cue => cue.startMs <= position + 250 && cue.endMs >= position - 500);
        for (const cue of currentCues) {
          const cueKey = await sha(`${transcript.track}|${cue.startMs}|${cue.endMs}|${cue.text}`);
          activeKeys.push(cueKey);
          const old = cache.get(cueKey);
          if (!old) record({ cueKey, track: transcript.track, language: transcript.language, text: cue.text, startMs: cue.startMs, endMs: cue.endMs, approximate: false, revision: 0 });
        }
        return;
      }
    }
    const tracks = [...video.textTracks].filter(track => track.mode === "showing" && ["subtitles", "captions"].includes(track.kind));
    if (tracks.length) {
      lastDom = [];
      activeTrack = `native:${tracks[0].id}:${tracks[0].language}:${tracks[0].label}`.slice(0, 200);
      for (const track of tracks) for (const cue of [...(track.activeCues || [])]) {
        const text = cueText(cue);
        if (!text || !Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime)) continue;
        const startMs = ms(cue.startTime), endMs = Math.max(startMs, ms(cue.endTime));
        const trackKey = `native:${track.id}:${track.language}:${track.label}`.slice(0, 200);
        const cueKey = await sha(`${trackKey}|${startMs}|${endMs}|${cue.id || text}`);
        activeKeys.push(cueKey);
        const old = cache.get(cueKey);
        if (!old || old.text !== text) record({ cueKey, track: trackKey, language: track.language?.slice(0, 40) || null, text, startMs, endMs, approximate: false, revision: (old?.revision ?? -1) + 1 });
      }
      return;
    }
    const track = domTrack();
    activeTrack = track.track;
    const lines = [...new Set(subtitleElements().map(el => plain(el.textContent)).filter(Boolean))];
    const next = [];
    for (const text of lines) {
      // Screen-only captions have observed timing. Reuse a line across rolling text
      // updates, and reuse nearby cached occurrences when rewinding.
      let cue = lastDom.find(old => old.track === track.track && (old.text === text || text.startsWith(old.text + " ")));
      if (!cue) cue = [...cache.values()].find(old => old.approximate && old.track === track.track && old.text === text && position >= old.startMs - 1500 && position <= old.endMs + 1500);
      if (!cue) cue = { cueKey: crypto.randomUUID(), ...track, text, startMs: position, endMs: position, approximate: true, revision: -1 };
      const endMs = Math.max(cue.endMs, position);
      if (cue.text !== text || position - cue.endMs >= 1000 || cue.revision === -1) {
        cue = { ...cue, text, endMs, revision: cue.revision + 1 }; record(cue);
      }
      next.push(cue);
      activeKeys.push(cue.cueKey);
    }
    lastDom = next;
  }

  function enqueue(state) {
    if (!current) return;
    if (outbox.length >= MAX_QUEUE) {
      active = false; restore(); labels(); persist();
      message("Offline queue is full. Capture paused; saved captions will retry when Lexi returns.");
      return;
    }
    // While offline, queue new text but avoid storing redundant heartbeat packets.
    if (!pending.size && outbox.length && !state) return;
    const cues = [...pending.values()].slice(0, 30);
    // Also bound total text so every packet fits the server's 128 KiB limit.
    let length = 0;
    const batch = cues.filter(cue => { length += new TextEncoder().encode(JSON.stringify(cue)).byteLength; return length < 90_000; });
    batch.forEach(cue => pending.delete(cue.cueKey));
    const packet = { clientSessionId: current.clientSessionId, sequence: current.sequence++, media: current.media, positionMs: current.positionMs, state: state || current.state, cues: batch,
      capturedAt: current.capturedAt || new Date().toISOString(), playbackRate: current.playbackRate || 1,
      activeKeys: state === "stopped" ? [] : (current.activeKeys || []).slice(0, 50), activeTrack: current.activeTrack || null };
    outbox.push(packet); persist();
  }
  async function flush() {
    if (sending || !connection || !outbox.length || Date.now() < retryAt) return;
    const generation = sendGeneration;
    sending = true;
    const packet = outbox[0];
    const sentToken = connection.token;
    try {
      await request("/api/watch/ingest", packet, sentToken);
      if (generation !== sendGeneration) return;
      if (connection?.token !== sentToken) return;
      if (outbox[0] === packet) outbox.shift();
      failures = 0; retryAt = 0;
      if (packet.clientSessionId === current?.clientSessionId) lastAck = Date.now();
      persist();
      if (active) message(pending.size || cache.size ? `Sending to Lexi${outbox.length ? ` · ${outbox.length} packets queued` : ""}` : "Connected. Waiting for captions — enable them in the player.");
    } catch (error) {
      if (generation !== sendGeneration) return;
      if (connection?.token !== sentToken) return;
      failures++; retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
      lastAck = 0;
      restore();
      if (error.status === 401) {
        active = false; connection = null; tokenHash = ""; current = null; outbox = []; pending.clear(); cache.clear();
        GM_deleteValue("connection"); GM_deleteValue(storageKey); labels();
        message("Connection revoked or expired. Click Send to connect again.", true);
      } else if ([400, 409, 413].includes(error.status)) {
        active = false; labels();
        message(`Capture stopped: ${error.message}. Queued data is retained.`, true);
      } else message(`${error.message} Captions are visible here while disconnected.`, true);
    } finally { if (generation === sendGeneration) sending = false; }
  }

  async function tick() {
    if (!active || ticking) return;
    ticking = true;
    try {
      const video = getVideo();
      const key = mediaKey();
      if (video) bindPlayerEvents(video);
      if (!video || !key || isAd()) {
        restore(); lastDom = [];
        if (current) { current.state = "waiting"; current.activeKeys = []; current.capturedAt = new Date().toISOString(); }
        message(isAd() ? "Waiting for the advertisement to finish." : "Waiting for a video.");
        return;
      }
      if (key !== lastMediaKey || !current) {
        if (current) {
          while (pending.size && outbox.length < MAX_QUEUE) enqueue();
          if (pending.size || outbox.length >= MAX_QUEUE) {
            active = false; restore(); labels(); persist();
            message("Queue is full. Finish syncing this video before sending another one.");
            return;
          }
          enqueue("stopped");
        }
        restore(); pending.clear(); cache.clear(); lastDom = []; lastAck = 0;
        current = { clientSessionId: crypto.randomUUID(), sequence: 0, media: await metadata(video, key), positionMs: ms(video.currentTime), state: "paused", mediaKey: key };
        lastMediaKey = key; metadataAt = Date.now();
        if (SOURCE === "youtube") void getYouTubeTranscript(key);
      } else if (Date.now() - metadataAt > 5000) {
        const refreshedMedia = await metadata(video, key);
        const identityChanged = current.media.source !== refreshedMedia.source || current.media.sourceId !== refreshedMedia.sourceId || current.media.imdbId !== refreshedMedia.imdbId || current.media.season !== refreshedMedia.season || current.media.episode !== refreshedMedia.episode;
        if (identityChanged) {
          while (pending.size && outbox.length < MAX_QUEUE) enqueue();
          enqueue("stopped");
          if (pending.size || outbox.length >= MAX_QUEUE) {
            active = false; restore(); labels(); persist();
            message("Queue is full. Finish syncing this video before starting its episode session.", true);
            return;
          }
          restore(); pending.clear(); cache.clear(); lastDom = []; lastAck = 0; lastPlaybackSignature = "";
          current = { clientSessionId: crypto.randomUUID(), sequence: 0, media: refreshedMedia, positionMs: ms(video.currentTime), state: "paused", mediaKey: key };
        } else current.media = refreshedMedia;
        metadataAt = Date.now();
      }
      if (connection) connectCommands();
      current.positionMs = ms(video.currentTime);
      current.state = video.ended ? "ended" : video.seeking ? "seeking" : video.paused ? "paused" : video.readyState < 3 ? "waiting" : "playing";
      current.playbackRate = Math.max(0.1, Math.min(16, video.playbackRate || 1));
      current.capturedAt = new Date().toISOString();
      const previousPosition = lastPosition;
      await capture(video);
      current.activeKeys = activeKeys;
      current.activeTrack = activeTrack;
      const signature = `${current.state}|${activeTrack}|${activeKeys.join(",")}`;
      if (signature !== lastPlaybackSignature || Math.abs(current.positionMs - previousPosition) > 1800 || pending.size) {
        lastPlaybackSignature = signature;
        enqueue(); void flush();
      }
      if (active && lastAck && Date.now() - lastAck < 10_000) hide(); else restore();
    } catch (error) { restore(); message(`Caption capture failed: ${error.message}`, true); }
    finally {
      ticking = false;
      if (recapturePending) { recapturePending = false; requestCapture(); }
    }
  }
  function stop() {
    commandSocket?.close(); commandSocket = null;
    active = false; restore(); labels();
    if (current) {
      while (pending.size && outbox.length < MAX_QUEUE) enqueue();
      enqueue("stopped");
    }
    message(outbox.length ? "Stopped. Finishing upload…" : "Stopped. Captions restored.");
    void flush();
  }
  button.addEventListener("click", async () => {
    if (active) { stop(); return; }
    if (!getVideo() || !mediaKey()) { message("Open a video first, then enable its captions."); return; }
    if (!GM_getValue("origin", null) && !connection) addServer();
    try {
      await connect();
      lastMediaKey = current?.mediaKey || "";
      active = true; lastAck = 0; retryAt = 0; lastHeartbeatAt = Date.now(); labels();
      await tick(); enqueue(); void flush();
    } catch (error) { message(error.message); }
  });
  setInterval(() => { void tick(); }, 1000);
  setInterval(() => {
    if (active && current && Date.now() - lastHeartbeatAt >= 5000) {
      lastHeartbeatAt = Date.now();
      enqueue();
    }
    else if (!active && pending.size && current) enqueue("stopped");
    void flush();
  }, 750);
  window.addEventListener("pagehide", () => { active = false; restore(); if (current) enqueue("stopped"); persist(); });
})();
