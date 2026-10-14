// GSAP animations, lightbox and the in-browser "AI" certificate assistant.
// The assistant is a local rule-based NLP engine (no network, no API key).
(() => {
  "use strict";

  if (typeof window.gsap === "undefined") return; // CDN blocked: page still works without effects

  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const D = (n) => (reduce ? 0 : n);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  // Shared with features.js
  const app = (window.CertApp = { intents: [], visibleItems: null });

  /* ------------------------------------------------------------------ */
  /* 1. Certificate index (built from the DOM)                           */
  /* ------------------------------------------------------------------ */
  const NAMES = { codechef: "CodeChef", leetcode: "LeetCode" };
  const HINTS = {
    codechef: "contest competitive programming",
    leetcode: "coding dsa problem solving badge",
    "inter-college": "inter college mark sheet result",
    "course-completion": "course completion training learning",
    others: "other misc",
  };
  const SYN = {
    sem: "semester",
    cert: "certificate",
    certification: "certificate",
    marksheet: "mark sheet",
    contest: "contest",
  };
  const STOP = new Set(
    ("show me find open go to the a an of my all certificate please give list display take navigate " +
      "scroll what are is there do i have in for about tell with and how many count total number any can " +
      "you see get where which view look search related from on that or ha wa " +
      "hi hello hey namaste summarize summary overview profile who introduce").split(" ")
  );
  const GENERIC = /^(whatsapp|img|image|screenshot|scan|photo|dsc)/i;

  const stem = (t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

  function tokenize(text) {
    const out = [];
    text
      .toLowerCase()
      .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .forEach((raw) => {
        if (!raw) return;
        const t = stem(raw);
        (SYN[t] || t).split(" ").forEach((x) => out.push(x));
      });
    return out;
  }

  const titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const items = [];
  const categories = [];
  const imgToItem = new Map(); // keyed by card element

  function makeCard(img, title, catName) {
    const card = document.createElement("div");
    card.className = "cert-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${title}`);
    const inner = document.createElement("div");
    inner.className = "cert-inner";
    const badge = document.createElement("span");
    badge.className = "cert-badge";
    badge.textContent = catName;
    const fav = document.createElement("button");
    fav.type = "button";
    fav.className = "cert-fav";
    fav.setAttribute("aria-label", `Favorite ${title}`);
    fav.setAttribute("aria-pressed", "false");
    fav.innerHTML = '<i class="far fa-heart"></i>';
    img.replaceWith(card);
    inner.append(img, badge, fav);
    card.appendChild(inner);
    return card;
  }

  $$("section h2").forEach((h2) => {
    const section = h2.closest("section");
    const raw = h2.textContent.trim();
    const key = raw.toLowerCase();
    const cat = { name: NAMES[key] || titleCase(raw.toLowerCase()), heading: h2, items: [] };
    const bySrc = new Map();
    const seq = {};

    $$("img.image", section).forEach((img) => {
      const src = img.currentSrc || img.src;
      if (bySrc.has(src)) {
        const dup = bySrc.get(src);
        const dupCard = makeCard(img, dup.title, dup.category);
        dup.imgs.push(dupCard);
        imgToItem.set(dupCard, dup);
        return;
      }
      const parts = decodeURIComponent(img.getAttribute("src")).split("/");
      const file = parts[parts.length - 1];
      const folders = parts.slice(1, -1);
      const lastFolder = folders[folders.length - 1] || cat.name;
      const base = file.replace(/\.[a-z0-9]+$/i, "");
      const generic = GENERIC.test(base);
      const k = `${lastFolder}`;
      seq[k] = (seq[k] || 0) + 1;

      let title;
      if (img.dataset.title) title = img.dataset.title;
      else if (generic) title = `${titleCase(lastFolder)} certificate #${seq[k]}`;
      else if (/^\d+(st|nd|rd|th)?$/i.test(base)) title = `${titleCase(lastFolder)} ${base}`;
      else title = titleCase(base);

      const haystack = [
        raw,
        folders.join(" "),
        generic ? "" : base,
        img.dataset.tags || "",
        HINTS[key] || "",
      ].join(" ");

      const card = makeCard(img, title, cat.name);
      const item = { title, category: cat.name, cat, src, key: parts.join("/"), imgs: [card], tokens: new Set(tokenize(haystack)) };
      bySrc.set(src, item);
      imgToItem.set(card, item);
      items.push(item);
      cat.items.push(item);
    });
    if (cat.items.length) categories.push(cat);
  });

  /* Favorites (persisted in localStorage) */
  const FAV_KEY = "cert-favs";
  let favs;
  try {
    favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  } catch {
    favs = new Set();
  }
  const isFav = (item) => favs.has(item.key);

  function syncFavUI(item) {
    const on = isFav(item);
    item.imgs.forEach((card) => {
      card.classList.toggle("is-fav", on);
      const b = $(".cert-fav", card);
      b.setAttribute("aria-pressed", String(on));
      $("i", b).className = on ? "fas fa-heart" : "far fa-heart";
    });
  }

  function toggleFav(item) {
    if (isFav(item)) favs.delete(item.key);
    else favs.add(item.key);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
    } catch {}
    syncFavUI(item);
    item.imgs.forEach((card) =>
      gsap.fromTo($(".cert-fav i", card), { scale: 0.3 }, { scale: 1, duration: D(0.6), ease: "elastic.out(1, 0.4)" })
    );
    window.dispatchEvent(new CustomEvent("certfavs"));
    return isFav(item);
  }
  items.forEach(syncFavUI);

  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    gsap.fromTo(t, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: D(0.3), overwrite: true });
    gsap.to(t, { autoAlpha: 0, delay: 1.8, duration: D(0.4) });
  }

  /* ------------------------------------------------------------------ */
  /* 2. Search engine                                                    */
  /* ------------------------------------------------------------------ */
  function withinOneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  function tokenScore(item, t) {
    if (item.tokens.has(t)) return 2;
    const numeric = /^\d+$/.test(t);
    if (numeric) return 0;
    for (const x of item.tokens) {
      if (t.length >= 3 && x.startsWith(t)) return 1.5;
      if (t.length >= 4 && t.startsWith(x) && x.length >= 4) return 1.5;
    }
    if (t.length >= 5) for (const x of item.tokens) if (withinOneEdit(t, x)) return 1;
    return 0;
  }

  function search(tokens) {
    const exact = [];
    const partial = [];
    items.forEach((item) => {
      let matched = 0, score = 0;
      tokens.forEach((t) => {
        const s = tokenScore(item, t);
        if (s) { matched++; score += s; }
      });
      if (matched === tokens.length) exact.push({ item, score });
      else if (matched > 0) partial.push({ item, score });
    });
    const sort = (arr) => arr.sort((a, b) => b.score - a.score).map((x) => x.item);
    return { exact: sort(exact), partial: sort(partial) };
  }

  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function groupByCategory(list) {
    const map = new Map();
    list.forEach((i) => map.set(i.cat, (map.get(i.cat) || 0) + 1));
    return [...map.entries()].map(([cat, n]) => ({ cat, n }));
  }

  function breakdown(list) {
    return groupByCategory(list).map((g) => `${g.cat.name} (${g.n})`).join(", ");
  }

  function interpret(query) {
    const lower = query.toLowerCase();
    const tokens = [...new Set(tokenize(lower).filter((t) => !STOP.has(t)))];
    const total = items.length;

    for (const fn of app.intents) {
      const r = fn(lower, tokens);
      if (r) return r;
    }
    if (/^(hi|hello|hey|namaste)\b/.test(lower) && tokens.length === 0) {
      return { text: "Hello! Ask me to find, count or summarize the certificates." };
    }
    if (/\b(help|what can you|features)\b/.test(lower)) {
      return {
        text:
          'I can find certificates ("show leetcode"), count them ("how many in codechef?"), ' +
          'summarize the portfolio ("summarize"), and filter the page. Click a result to jump to it, or any certificate to open it full screen.',
      };
    }
    if (/\b(clear|reset|remove filter)\b/.test(lower) || (/\b(show|see|view)\b.*\b(all|everything)\b/.test(lower) && tokens.length === 0)) {
      return { text: "Filter cleared. Showing every certificate.", clear: true };
    }
    if (/\b(summar\w*|overview|about|profile|who is|introduce)\b/.test(lower) && tokens.length === 0) {
      const biggest = categories.reduce((a, b) => (b.items.length > a.items.length ? b : a));
      return {
        text:
          `This portfolio holds ${plural(total, "certificate")} in ${plural(categories.length, "section")}: ` +
          `${categories.map((c) => `${c.name} (${c.items.length})`).join(", ")}. ` +
          `The largest section is ${biggest.name}.`,
      };
    }

    const isCount = /\b(how many|count|total|number of)\b/.test(lower);
    if (isCount && tokens.length === 0) {
      return { text: `There are ${plural(total, "certificate")} in total: ${breakdown(items)}.` };
    }
    if (tokens.length === 0) {
      return { text: 'Tell me what to look for, for example "leetcode", "mark sheets" or "typing".' };
    }

    const { exact, partial } = search(tokens);
    const list = exact.length ? exact : partial;
    if (!list.length) {
      return {
        text: `I couldn't find anything for "${tokens.join(" ")}". Try a section such as LeetCode, CodeChef, mark sheets or typing.`,
      };
    }
    const groups = groupByCategory(list);
    const wholeCategory = groups.length === 1 && list.length === groups[0].cat.items.length;
    const lead = exact.length ? "" : "No exact match, but these are the closest: ";
    const where = groups.length > 1 ? `across ${plural(groups.length, "section")}` : `in ${groups[0].cat.name}`;
    const text = isCount
      ? `${lead}${plural(list.length, "certificate")} match ${where}: ${breakdown(list)}.`
      : `${lead}Found ${plural(list.length, "certificate")} ${where}.`;
    return { text, items: list, filter: true, scrollTarget: wholeCategory ? groups[0].cat.heading : list[0].imgs[0] };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Page filter + navigation helpers                                 */
  /* ------------------------------------------------------------------ */
  const allImgs = $$(".cert-card");
  const pill = $("#filter-pill");
  let filterActive = false;

  function applyFilter(list) {
    if (list.length === items.length) return clearFilter();
    const keep = new Set(list.flatMap((i) => i.imgs));
    allImgs.forEach((img) => {
      img.classList.toggle("match", keep.has(img));
      img.classList.toggle("dimmed", !keep.has(img));
    });
    $("#filter-label").textContent = `Showing ${plural(list.length, "certificate")}`;
    filterActive = true;
    gsap.fromTo(pill, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: D(0.4), ease: "power3.out" });
  }

  function clearFilter() {
    allImgs.forEach((img) => img.classList.remove("match", "dimmed"));
    if (filterActive) gsap.to(pill, { y: 20, autoAlpha: 0, duration: D(0.3) });
    filterActive = false;
  }
  $("#filter-clear").addEventListener("click", clearFilter);

  function pulse(el) {
    gsap.fromTo(
      el,
      { boxShadow: "0 0 0 0 rgba(41,211,255,.85)" },
      { boxShadow: "0 0 0 26px rgba(41,211,255,0)", duration: D(0.9), repeat: reduce ? 0 : 2, ease: "power2.out", clearProps: "boxShadow" }
    );
  }

  function scrollToEl(el, after) {
    const offset = el.classList.contains("cert-card") ? Math.max(100, (window.innerHeight - el.offsetHeight) / 2) : 100;
    gsap.to(window, {
      duration: D(1.1),
      scrollTo: { y: el, offsetY: offset, autoKill: true },
      ease: "power3.inOut",
      onComplete: () => after && after(),
    });
  }

  function focusItem(item) {
    const img = item.imgs[0];
    scrollToEl(img, () => pulse(img));
  }

  /* ------------------------------------------------------------------ */
  /* 4. AI assistant UI                                                  */
  /* ------------------------------------------------------------------ */
  const fab = $("#ai-fab");
  const panel = $("#ai-panel");
  const bodyEl = $("#ai-body");
  const input = $("#ai-input");
  let panelOpen = false;
  let greeted = false;
  let busy = false;

  const SUGGESTIONS = [
    "Show LeetCode certificates",
    "Show CodeChef certificates",
    "Mark sheets",
    "Typing certificates",
    "Course completion",
    "Show favorites",
    "Surprise me",
    "Start slideshow",
    "How many certificates?",
    "Summarize my profile",
  ];
  SUGGESTIONS.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ai-chip";
    b.textContent = q;
    b.addEventListener("click", () => ask(q));
    $("#ai-suggest").appendChild(b);
  });

  function addMsg(role) {
    const el = document.createElement("div");
    el.className = `ai-msg ai-${role}`;
    bodyEl.appendChild(el);
    gsap.from(el, { y: 12, autoAlpha: 0, duration: D(0.3) });
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return el;
  }

  function typeText(el, text) {
    return new Promise((resolve) => {
      const o = { n: 0 };
      gsap.to(o, {
        n: text.length,
        duration: D(Math.min(1.8, 0.2 + text.length * 0.014)),
        ease: "none",
        onUpdate: () => {
          el.textContent = text.slice(0, Math.round(o.n));
          bodyEl.scrollTop = bodyEl.scrollHeight;
        },
        onComplete: () => {
          el.textContent = text;
          resolve();
        },
      });
    });
  }

  function renderResults(msg, list) {
    const wrap = document.createElement("div");
    wrap.className = "ai-results";
    list.slice(0, 6).forEach((item) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ai-result";
      const t = document.createElement("span");
      t.textContent = item.title;
      const c = document.createElement("small");
      c.textContent = item.category;
      b.append(t, c);
      b.addEventListener("click", () => focusItem(item));
      wrap.appendChild(b);
    });
    if (list.length > 6) {
      const note = document.createElement("div");
      note.className = "ai-note";
      note.textContent = `+${list.length - 6} more highlighted on the page`;
      wrap.appendChild(note);
    }
    msg.appendChild(wrap);
    gsap.from(wrap.children, { y: 10, autoAlpha: 0, stagger: D(0.06), duration: D(0.35) });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  async function botReply(result) {
    const msg = addMsg("bot");
    msg.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    const bounce = reduce ? null : gsap.to(msg.querySelectorAll(".dots i"), { y: -4, stagger: 0.15, repeat: -1, yoyo: true, duration: 0.35 });
    await wait(450 + Math.random() * 250);
    if (bounce) bounce.kill();
    msg.textContent = "";

    if (result.clear) clearFilter();
    if (result.filter) {
      applyFilter(result.items);
      scrollToEl(result.scrollTarget, result.scrollTarget.classList.contains("cert-card") ? () => pulse(result.scrollTarget) : null);
    }
    await typeText(msg, result.text);
    if (result.items) renderResults(msg, result.items);
    if (result.run) result.run();
  }

  async function ask(query) {
    const q = query.trim();
    if (!q || busy) return;
    busy = true;
    if (!panelOpen) openPanel(true);
    const user = addMsg("user");
    user.textContent = q;
    try {
      await botReply(interpret(q));
    } finally {
      busy = false;
    }
  }

  function openPanel(skipGreeting) {
    if (panelOpen) return;
    panelOpen = true;
    panel.setAttribute("aria-hidden", "false");
    gsap.to(fab, { scale: 0, autoAlpha: 0, duration: D(0.25) });
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 40, scale: 0.92, transformOrigin: "100% 100%" },
      { autoAlpha: 1, y: 0, scale: 1, duration: D(0.5), ease: "back.out(1.4)" }
    );
    if (!greeted && !skipGreeting) {
      greeted = true;
      botReply({
        text: `Hi! I know all ${items.length} certificates on this page. This assistant runs entirely in your browser. Try a suggestion below or type a question.`,
      });
    }
    setTimeout(() => input.focus({ preventScroll: true }), 300);
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.setAttribute("aria-hidden", "true");
    gsap.to(panel, { autoAlpha: 0, y: 30, scale: 0.94, duration: D(0.3), ease: "power2.in" });
    gsap.to(fab, { scale: 1, autoAlpha: 1, duration: D(0.35), ease: "back.out(2)" });
  }

  fab.addEventListener("click", openPanel);
  $("#ai-close").addEventListener("click", closePanel);
  $("#ai-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = "";
    ask(v);
  });

  const heroForm = $("#ai-search-form");
  const heroInput = $("#ai-search-input");
  heroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = heroInput.value;
    heroInput.value = "";
    ask(v);
  });
  $$(".hero-chip").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));

  /* ------------------------------------------------------------------ */
  /* 5. Lightbox (replaces the old hover-to-zoom)                        */
  /* ------------------------------------------------------------------ */
  const lb = $("#lightbox");
  const lbImg = $("#lb-img");
  const lbCap = $("#lb-cap");
  let lbIndex = -1;
  let lbList = items;
  let lbZoom = 1;
  let lbPlaying = false;
  let lbProgress = null;
  const lbFav = $("#lb-fav");
  const lbPlay = $("#lb-play");
  const lbBar = $(".lb-progress span");
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function syncLbFav() {
    const item = lbList[lbIndex];
    if (!item) return;
    const on = isFav(item);
    lbFav.setAttribute("aria-pressed", String(on));
    $("i", lbFav).className = on ? "fas fa-heart" : "far fa-heart";
  }

  function setZoom(z) {
    lbZoom = clamp(z, 1, 4);
    const t = { scale: lbZoom, duration: D(0.25), ease: "power2.out", overwrite: "auto" };
    if (lbZoom === 1) {
      t.x = 0;
      t.y = 0;
    }
    gsap.to(lbImg, t);
    lbImg.style.cursor = lbZoom > 1 ? "grab" : "zoom-in";
  }

  function startProgress() {
    if (lbProgress) lbProgress.kill();
    gsap.set(lbBar, { scaleX: 0 });
    if (!lbPlaying) return;
    lbProgress = gsap.to(lbBar, { scaleX: 1, duration: 4, ease: "none", onComplete: () => showLb(lbIndex + 1, 1) });
  }

  function setPlaying(on) {
    lbPlaying = on;
    $("i", lbPlay).className = on ? "fas fa-pause" : "fas fa-play";
    lbPlay.setAttribute("aria-pressed", String(on));
    startProgress();
  }

  function showLb(i, dir = 0) {
    lbIndex = (i + lbList.length) % lbList.length;
    const item = lbList[lbIndex];
    lbZoom = 1;
    lbImg.style.cursor = "zoom-in";
    lbImg.src = item.src;
    lbImg.alt = item.title;
    lbCap.textContent = `${item.title} · ${item.category} (${lbIndex + 1}/${lbList.length})`;
    syncLbFav();
    startProgress();
    try {
      history.replaceState(null, "", `#cert=${encodeURIComponent(item.key)}`);
    } catch {}
    gsap.fromTo(
      lbImg,
      { x: dir * 60, y: dir ? 0 : 24, scale: dir ? 1 : 0.94, autoAlpha: 0 },
      { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: D(0.5), ease: "power3.out" }
    );
  }

  function openLb(item, list) {
    const pool = list || (app.visibleItems ? app.visibleItems() : items);
    lbList = pool.includes(item) ? pool : items;
    document.body.style.overflow = "hidden";
    lb.setAttribute("aria-hidden", "false");
    gsap.to(lb, { autoAlpha: 1, duration: D(0.3) });
    showLb(lbList.indexOf(item));
  }

  function closeLb() {
    if (lbIndex < 0) return;
    lbIndex = -1;
    setPlaying(false);
    document.body.style.overflow = "";
    lb.setAttribute("aria-hidden", "true");
    gsap.to(lb, { autoAlpha: 0, duration: D(0.25) });
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch {}
  }

  function startSlideshow(list) {
    const pool = list && list.length ? list : app.visibleItems ? app.visibleItems() : items;
    openLb(pool[0], pool);
    setPlaying(true);
  }

  async function copyLink() {
    const item = lbList[lbIndex];
    const url = `${location.href.split("#")[0]}#cert=${encodeURIComponent(item.key)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      ta.remove();
    }
    showToast("Link copied");
  }

  allImgs.forEach((card) => {
    const item = imgToItem.get(card);
    card.addEventListener("click", () => openLb(item));
    card.addEventListener("keydown", (e) => {
      if (e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLb(item);
      }
    });
    $(".cert-fav", card).addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(item);
    });
  });
  $(".lb-close").addEventListener("click", closeLb);
  $(".lb-prev").addEventListener("click", () => showLb(lbIndex - 1, -1));
  $(".lb-next").addEventListener("click", () => showLb(lbIndex + 1, 1));
  $("#lb-zoom-in").addEventListener("click", () => setZoom(lbZoom * 1.4));
  $("#lb-zoom-out").addEventListener("click", () => setZoom(lbZoom / 1.4));
  $("#lb-reset").addEventListener("click", () => setZoom(1));
  lbPlay.addEventListener("click", () => setPlaying(!lbPlaying));
  lbFav.addEventListener("click", () => toggleFav(lbList[lbIndex]));
  $("#lb-link").addEventListener("click", copyLink);
  window.addEventListener("certfavs", syncLbFav);
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLb();
  });

  // Wheel zoom, double-click zoom, drag to pan (zoomed) or swipe to navigate
  lb.addEventListener(
    "wheel",
    (e) => {
      if (lbIndex < 0) return;
      e.preventDefault();
      setZoom(lbZoom * (e.deltaY < 0 ? 1.15 : 0.87));
    },
    { passive: false }
  );
  lbImg.addEventListener("dblclick", () => setZoom(lbZoom > 1 ? 1 : 2.5));
  let drag = null;
  lbImg.addEventListener("pointerdown", (e) => {
    lbImg.setPointerCapture(e.pointerId);
    drag = { sx: e.clientX, sy: e.clientY, ox: gsap.getProperty(lbImg, "x"), oy: gsap.getProperty(lbImg, "y") };
  });
  lbImg.addEventListener("pointermove", (e) => {
    if (!drag || lbZoom === 1) return;
    lbImg.style.cursor = "grabbing";
    gsap.set(lbImg, { x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
  });
  lbImg.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    drag = null;
    lbImg.style.cursor = lbZoom > 1 ? "grab" : "zoom-in";
    if (lbZoom === 1 && Math.abs(dx) > 60) showLb(lbIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lbIndex >= 0) closeLb();
      else closePanel();
      return;
    }
    if (lbIndex < 0) return;
    if (e.key === "ArrowLeft") showLb(lbIndex - 1, -1);
    else if (e.key === "ArrowRight") showLb(lbIndex + 1, 1);
    else if (e.key === "+" || e.key === "=") setZoom(lbZoom * 1.3);
    else if (e.key === "-") setZoom(lbZoom / 1.3);
    else if (e.key === "0") setZoom(1);
    else if (e.key === " ") {
      e.preventDefault();
      setPlaying(!lbPlaying);
    } else if (e.key.toLowerCase() === "f") toggleFav(lbList[lbIndex]);
  });

  /* ------------------------------------------------------------------ */
  /* 6. Smooth anchor scrolling                                          */
  /* ------------------------------------------------------------------ */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id.length > 1 ? $(id) : null;
      if (!target) return;
      e.preventDefault();
      gsap.to(window, { duration: D(1.1), scrollTo: { y: target, offsetY: 90, autoKill: true }, ease: "power3.inOut" });
      if ($("#navbarNav").classList.contains("show")) $("#hamburger-btn").click();
    });
  });

  /* ------------------------------------------------------------------ */
  /* 7. Hero: stats, typed line                                          */
  /* ------------------------------------------------------------------ */
  const stats = {
    total: items.length,
    sections: categories.length,
    coding: categories.filter((c) => /codechef|leetcode/i.test(c.name)).reduce((n, c) => n + c.items.length, 0),
  };
  $$("[data-stat]").forEach((el) => {
    const to = stats[el.dataset.stat] || 0;
    const o = { v: 0 };
    el.textContent = reduce ? to : 0;
    if (reduce) return;
    gsap.to(o, {
      v: to,
      duration: 1.8,
      delay: 1.4,
      ease: "power2.out",
      onUpdate: () => (el.textContent = Math.round(o.v)),
      onComplete: () => (el.textContent = to),
    });
  });

  const phrases = [
    `${plural(items.length, "certificate")} across ${plural(categories.length, "section")}`,
    "Competitive programming, academics and courses",
    "Ask the AI assistant to find anything",
  ];
  const typedEl = $("#typed-text");
  if (reduce) {
    typedEl.textContent = phrases[0];
  } else {
    const tl = gsap.timeline({ repeat: -1, delay: 1.6 });
    phrases.forEach((p) => {
      const o = { n: 0 };
      const set = () => (typedEl.textContent = p.slice(0, Math.round(o.n)));
      tl.to(o, { n: p.length, duration: p.length * 0.04, ease: "none", onUpdate: set })
        .to({}, { duration: 1.8 })
        .to(o, { n: 0, duration: p.length * 0.02, ease: "none", onUpdate: set });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. GSAP motion                                                      */
  /* ------------------------------------------------------------------ */
  function splitWords(el) {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.textContent = "";
    text.split(" ").forEach((w, i, arr) => {
      const word = document.createElement("span");
      word.className = "word";
      word.setAttribute("aria-hidden", "true");
      [...w].forEach((ch) => {
        const c = document.createElement("span");
        c.className = "char";
        c.textContent = ch;
        word.appendChild(c);
      });
      el.appendChild(word);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
    return $$(".char", el);
  }

  const heroChars = splitWords($("#hero-title"));
  const devChars = splitWords($(".dev-name"));
  const headingChars = $$("section h2").map((h) => ({ h, chars: splitWords(h) }));

  if (!reduce) {
    // Scroll progress bar
    gsap.to("#scroll-progress", {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
    });

    // Intro timeline
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .from("header", { yPercent: -120, autoAlpha: 0, duration: 0.9 })
      .from(".navbar .nav-link, .navbar-brand", { y: -18, autoAlpha: 0, stagger: 0.07, duration: 0.5 }, "-=0.5")
      .from(".hero-kicker", { y: 20, autoAlpha: 0, duration: 0.6 }, "-=0.3")
      .from(heroChars, { yPercent: 110, rotationX: -80, autoAlpha: 0, stagger: 0.03, duration: 0.8, ease: "back.out(1.6)" }, "-=0.3")
      .from(".hero-sub", { y: 20, autoAlpha: 0, duration: 0.6 }, "-=0.4")
      .from(".stat", { y: 30, autoAlpha: 0, stagger: 0.1, duration: 0.6 }, "-=0.3")
      .from(".ai-search", { y: 30, autoAlpha: 0, duration: 0.6 }, "-=0.3")
      .from(".hero-chip", { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.4 }, "-=0.3")
      .from(fab, { scale: 0, autoAlpha: 0, duration: 0.6, ease: "back.out(2)" }, "-=0.3")
      .from("footer", { yPercent: 160, autoAlpha: 0, duration: 0.8, ease: "back.out(1.4)" }, "-=0.6")
      .from(".footer-copy, .dev-credit", { y: 14, autoAlpha: 0, stagger: 0.15, duration: 0.5 }, "-=0.3")
      .from(devChars, { y: 12, autoAlpha: 0, stagger: 0.04, duration: 0.4, ease: "back.out(2)" }, "-=0.3");

    // Footer credit: periodic letter wave + heartbeat icon
    gsap
      .timeline({ repeat: -1, repeatDelay: 2.5, delay: 7 })
      .to(devChars, { y: -6, color: "#ffe66d", duration: 0.25, stagger: 0.05, ease: "power2.out" })
      .to(devChars, { y: 0, color: "#ffffff", duration: 0.45, stagger: 0.05, ease: "bounce.out" }, "<0.15");
    gsap.to(".dev-icon", { scale: 1.25, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });

    // Floating orbs + hero parallax
    gsap.to(".orb-1", { x: 70, y: 40, duration: 7, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(".orb-2", { x: -60, y: -40, duration: 9, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(".hero-inner", {
      yPercent: -10,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });

    // Section headings
    headingChars.forEach(({ h, chars }) => {
      gsap
        .timeline({ scrollTrigger: { trigger: h, start: "top 88%", once: true } })
        .from(chars, { y: 30, rotationX: -70, autoAlpha: 0, stagger: 0.035, duration: 0.7, ease: "back.out(1.7)" })
        .fromTo(h, { "--u": 0 }, { "--u": 1, duration: 0.7, ease: "power3.out" }, "-=0.4");
    });

    // Certificate cards: simple staggered fade-up on scroll
    gsap.set(allImgs, { autoAlpha: 0, y: 40 });
    ScrollTrigger.batch(allImgs, {
      start: "top 92%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power3.out", overwrite: "auto" }),
    });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  }

  /* Pointer-driven motion (fine pointers only) */
  if (!reduce && canHover) {
    // Magnetic buttons
    const magnet = (el, strength) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      });
      el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    };
    magnet(fab, 0.35);
    magnet($(".scroll-button a"), 0.35);
  }

  Object.assign(app, {
    items, categories, cards: allImgs, search, tokenize, STOP, plural, reduce, D,
    openLb, closeLb, startSlideshow, focusItem, applyFilter, clearFilter, ask, openPanel,
    scrollToEl, pulse, isFav, toggleFav, showToast,
    favs: () => items.filter(isFav),
    itemOf: (card) => imgToItem.get(card),
  });

  // Deep link: index.html#cert=<path> opens that certificate
  const deep = location.hash.match(/^#cert=(.+)$/);
  if (deep) {
    const key = decodeURIComponent(deep[1]);
    const target = items.find((i) => i.key === key);
    if (target) setTimeout(() => openLb(target, items), reduce ? 0 : 1200);
  }
})();
