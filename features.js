// Interactive extras: filter chips, card sizes, favorites, command palette,
// section dots, shortcuts, voice input and extra assistant intents.
(() => {
  "use strict";

  const app = window.CertApp;
  if (!app || typeof gsap === "undefined") return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const { items, categories, cards, reduce, D, plural } = app;

  const cardCol = (card) => card.parentElement;
  let currentList = items;
  app.visibleItems = () => currentList;

  /* ------------------------------------------------------------------ */
  /* Filter chips                                                        */
  /* ------------------------------------------------------------------ */
  const chipsEl = $("#tb-chips");
  const chipDefs = [
    { id: "all", label: "All", count: () => items.length },
    ...categories.map((c, i) => ({ id: `cat${i}`, label: c.name, count: () => c.items.length, items: () => c.items })),
    { id: "fav", label: "Favorites", icon: "fas fa-heart", count: () => app.favs().length, items: () => app.favs() },
  ];
  let activeChip = "all";
  const chipEls = new Map();

  chipDefs.forEach((def) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tb-chip";
    b.classList.toggle("active", def.id === activeChip);
    b.setAttribute("aria-pressed", String(def.id === activeChip));
    if (def.icon) {
      const i = document.createElement("i");
      i.className = def.icon;
      b.appendChild(i);
    }
    const label = document.createElement("span");
    label.textContent = def.label;
    const count = document.createElement("span");
    count.className = "tb-count";
    b.append(label, count);
    b.addEventListener("click", () => selectChip(def.id));
    chipsEl.appendChild(b);
    chipEls.set(def.id, { el: b, count, def });
  });

  function refreshCounts() {
    chipEls.forEach(({ count, def }) => (count.textContent = def.count()));
  }
  refreshCounts();

  window.addEventListener("certfavs", () => {
    refreshCounts();
    const fav = chipEls.get("fav");
    gsap.fromTo(fav.el, { y: -4 }, { y: 0, duration: D(0.5), ease: "elastic.out(1, 0.4)" });
    if (activeChip === "fav") {
      if (app.favs().length) selectChip("fav", false, true);
      else selectChip("all", false);
    }
  });

  const visibleCards = () => cards.filter((c) => !cardCol(c).classList.contains("is-hidden"));

  function selectChip(id, animate = true, silent = false) {
    const entry = chipEls.get(id);
    if (!entry) return;
    const list = entry.def.items ? entry.def.items() : items;
    if (id === "fav" && !list.length) {
      if (!silent) app.showToast("No favorites yet. Tap the heart on a certificate.");
      return;
    }

    activeChip = id;
    chipEls.forEach(({ el }, key) => {
      el.classList.toggle("active", key === id);
      el.setAttribute("aria-pressed", String(key === id));
    });
    currentList = list.length ? list : items;
    app.clearFilter();

    const keep = new Set(list.flatMap((i) => i.imgs));
    const apply = () => {
      cards.forEach((c) => cardCol(c).classList.toggle("is-hidden", !keep.has(c)));
      $$("section").forEach((s) => {
        if (!$("h2", s)) return;
        s.classList.toggle("is-hidden", !$$(".cert-card", s).some((c) => keep.has(c)));
      });
      ScrollTrigger.refresh();
      const shown = cards.filter((c) => keep.has(c));
      gsap.fromTo(
        shown,
        { autoAlpha: 0, y: 30, scale: 0.92, rotationX: 0 },
        { autoAlpha: 1, y: 0, scale: 1, duration: D(0.5), stagger: { amount: D(Math.min(0.6, shown.length * 0.05)) }, ease: "power3.out", overwrite: "auto" }
      );
    };

    if (!animate || reduce) apply();
    else {
      const out = visibleCards();
      if (!out.length) apply();
      else gsap.to(out, { autoAlpha: 0, y: -10, scale: 0.95, duration: 0.2, stagger: { amount: 0.2 }, overwrite: "auto", onComplete: apply });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Card size                                                           */
  /* ------------------------------------------------------------------ */
  const viewBtns = $$(".tb-view");
  function setView(cols, animate = true) {
    ["2", "3", "4"].forEach((n) => document.body.classList.toggle(`view-${n}`, n === String(cols)));
    viewBtns.forEach((b) => {
      const on = b.dataset.cols === String(cols);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    try {
      localStorage.setItem("cert-view", String(cols));
    } catch {}
    ScrollTrigger.refresh();
    if (animate && !reduce) {
      gsap.fromTo(visibleCards(), { scale: 0.9 }, { scale: 1, duration: 0.6, stagger: { amount: 0.4 }, ease: "back.out(1.5)", overwrite: "auto" });
    }
  }
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.cols)));
  let savedView = "3";
  try {
    savedView = localStorage.getItem("cert-view") || "3";
  } catch {}
  setView(savedView, false);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */
  function surprise() {
    const pool = currentList.length ? currentList : items;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    app.openLb(pick, pool);
    return pick;
  }
  const slideshow = () => app.startSlideshow(currentList.length ? currentList : items);

  $("#tb-random").addEventListener("click", surprise);
  $("#tb-slideshow").addEventListener("click", slideshow);
  $("#tb-search").addEventListener("click", () => openCmdk());
  $("#tb-help").addEventListener("click", () => openHelp());

  /* ------------------------------------------------------------------ */
  /* Overlay helper (command palette + shortcuts modal)                  */
  /* ------------------------------------------------------------------ */
  function overlay(el, boxSel) {
    const box = $(boxSel, el);
    let open = false;
    return {
      get open() {
        return open;
      },
      show(after) {
        if (open) return;
        open = true;
        el.setAttribute("aria-hidden", "false");
        gsap.to(el, { autoAlpha: 1, duration: D(0.25), overwrite: "auto" });
        gsap.fromTo(box, { y: 24, scale: 0.96 }, { y: 0, scale: 1, duration: D(0.4), ease: "back.out(1.6)", overwrite: "auto" });
        if (after) after();
      },
      hide() {
        if (!open) return;
        open = false;
        el.setAttribute("aria-hidden", "true");
        gsap.to(el, { autoAlpha: 0, duration: D(0.2), overwrite: "auto" });
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Command palette                                                     */
  /* ------------------------------------------------------------------ */
  const cmdkEl = $("#cmdk");
  const cmdkInput = $("#cmdk-input");
  const cmdkList = $("#cmdk-list");
  const cmdk = overlay(cmdkEl, ".cmdk-box");
  let cmdkRows = [];
  let cmdkIndex = 0;

  const actions = [
    { label: "Surprise me with a random certificate", icon: "fa-dice", run: surprise },
    { label: "Start slideshow", icon: "fa-play", run: slideshow },
    { label: "Open AI assistant", icon: "fa-robot", run: () => app.openPanel() },
    { label: "Show favorites", icon: "fa-heart", run: () => selectChip("fav") },
    { label: "Show all certificates", icon: "fa-th", run: () => selectChip("all") },
    { label: "Keyboard shortcuts", icon: "fa-keyboard", run: () => openHelp() },
    ...categories.map((c, i) => ({ label: `Show ${c.name}`, icon: "fa-folder-open", run: () => selectChip(`cat${i}`) })),
  ];

  function computeRows(query) {
    const q = query.trim().toLowerCase();
    const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q)).slice(0, 6);
    let certs = [];
    if (q) {
      const tokens = [...new Set(app.tokenize(q).filter((t) => !app.STOP.has(t)))];
      if (tokens.length) {
        const r = app.search(tokens);
        certs = (r.exact.length ? r.exact : r.partial).slice(0, 8);
      }
    } else {
      certs = items.slice(0, 4);
    }
    const rows = [];
    if (acts.length) rows.push({ heading: "Actions" });
    acts.forEach((a) => rows.push({ action: a }));
    if (certs.length) rows.push({ heading: q ? "Certificates" : "Browse" });
    certs.forEach((c) => rows.push({ item: c }));
    return rows;
  }

  function renderCmdk() {
    cmdkList.innerHTML = "";
    cmdkRows = computeRows(cmdkInput.value);
    const selectable = [];
    cmdkRows.forEach((r) => {
      const li = document.createElement("li");
      if (r.heading) {
        li.className = "cmdk-heading";
        li.textContent = r.heading;
      } else {
        li.className = "cmdk-row";
        li.setAttribute("role", "option");
        const icon = document.createElement("i");
        icon.className = `fas ${r.action ? r.action.icon : "fa-certificate"}`;
        const label = document.createElement("span");
        label.textContent = r.action ? r.action.label : r.item.title;
        li.append(icon, label);
        if (r.item) {
          const small = document.createElement("small");
          small.textContent = r.item.category;
          li.appendChild(small);
        }
        const idx = selectable.length;
        selectable.push({ li, r });
        li.addEventListener("pointermove", () => highlightCmdk(idx));
        li.addEventListener("click", () => runCmdk(idx));
      }
      cmdkList.appendChild(li);
    });
    cmdkRows = selectable;
    cmdkIndex = 0;
    highlightCmdk(0);
    gsap.from(cmdkList.children, { y: 8, autoAlpha: 0, stagger: D(0.02), duration: D(0.25) });
  }

  function highlightCmdk(i) {
    if (!cmdkRows.length) return;
    cmdkIndex = (i + cmdkRows.length) % cmdkRows.length;
    cmdkRows.forEach(({ li }, n) => li.classList.toggle("active", n === cmdkIndex));
    cmdkRows[cmdkIndex].li.scrollIntoView({ block: "nearest" });
  }

  function runCmdk(i) {
    const row = cmdkRows[i];
    if (!row) return;
    cmdk.hide();
    if (row.r.action) row.r.action.run();
    else app.openLb(row.r.item, items);
  }

  function openCmdk() {
    cmdk.show(() => {
      cmdkInput.value = "";
      renderCmdk();
      setTimeout(() => cmdkInput.focus(), 50);
    });
  }

  cmdkInput.addEventListener("input", renderCmdk);
  cmdkInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightCmdk(cmdkIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightCmdk(cmdkIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCmdk(cmdkIndex);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      cmdk.hide();
    }
  });
  cmdkEl.addEventListener("click", (e) => {
    if (e.target === cmdkEl) cmdk.hide();
  });

  /* ------------------------------------------------------------------ */
  /* Shortcuts modal + global keys                                       */
  /* ------------------------------------------------------------------ */
  const helpEl = $("#help-modal");
  const help = overlay(helpEl, ".help-box");
  function openHelp() {
    help.show(() => gsap.from($$("li", helpEl), { x: -16, autoAlpha: 0, stagger: D(0.04), duration: D(0.3), delay: 0.1 }));
  }
  helpEl.addEventListener("click", () => help.hide());

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && help.open) {
        e.stopImmediatePropagation();
        help.hide();
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cmdk.open ? cmdk.hide() : openCmdk();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if ($("#lightbox").getAttribute("aria-hidden") === "false") return;
      switch (e.key.toLowerCase()) {
        case "/":
          e.preventDefault();
          openCmdk();
          break;
        case "?":
          openHelp();
          break;
        case "a":
          app.openPanel();
          break;
        case "r":
          surprise();
          break;
        case "s":
          slideshow();
          break;
        case "f":
          selectChip("fav");
          break;
      }
    },
    true
  );

  /* ------------------------------------------------------------------ */
  /* Section dots (scroll spy)                                           */
  /* ------------------------------------------------------------------ */
  const dots = document.createElement("nav");
  dots.id = "side-dots";
  dots.setAttribute("aria-label", "Sections");
  const dotEls = categories.map((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dot";
    b.setAttribute("aria-label", `Go to ${c.name}`);
    const lab = document.createElement("span");
    lab.textContent = c.name;
    b.appendChild(lab);
    b.addEventListener("click", () => {
      if (activeChip !== "all" && activeChip !== `cat${i}`) selectChip("all", false);
      requestAnimationFrame(() => app.scrollToEl(c.heading));
    });
    dots.appendChild(b);
    return b;
  });
  document.body.appendChild(dots);

  categories.forEach((c, i) => {
    ScrollTrigger.create({
      trigger: c.heading.closest("section"),
      start: "top 55%",
      end: "bottom 55%",
      onToggle: (self) => {
        if (self.isActive) dotEls.forEach((d, n) => d.classList.toggle("active", n === i));
      },
    });
  });

  /* ------------------------------------------------------------------ */
  /* Voice input for the assistant                                       */
  /* ------------------------------------------------------------------ */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const form = $("#ai-form");
    const mic = document.createElement("button");
    mic.type = "button";
    mic.className = "ai-mic";
    mic.setAttribute("aria-label", "Voice input");
    mic.innerHTML = '<i class="fas fa-microphone"></i>';
    form.insertBefore(mic, form.lastElementChild);

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    let listening = false;

    rec.onresult = (e) => app.ask(e.results[0][0].transcript);
    rec.onend = () => {
      listening = false;
      mic.classList.remove("listening");
    };
    rec.onerror = () => app.showToast("Voice input is unavailable");

    mic.addEventListener("click", () => {
      if (listening) return rec.stop();
      try {
        rec.start();
        listening = true;
        mic.classList.add("listening");
      } catch {
        app.showToast("Voice input is unavailable");
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Extra assistant intents                                             */
  /* ------------------------------------------------------------------ */
  app.intents.push((lower) => {
    if (/\b(random|surprise|lucky)\b/.test(lower)) {
      const pool = currentList.length ? currentList : items;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { text: `Here is a random pick: ${pick.title} (${pick.category}).`, items: [pick], run: () => app.openLb(pick, pool) };
    }
    if (/\b(favou?rites?|saved|bookmarks?)\b/.test(lower)) {
      const list = app.favs();
      if (!list.length) return { text: "You have no favorites yet. Tap the heart on any certificate to save it." };
      return { text: `You have ${plural(list.length, "favorite")}.`, items: list, run: () => selectChip("fav") };
    }
    if (/\b(slide ?show|autoplay|play all)\b/.test(lower)) {
      return { text: "Starting the slideshow. Press Space to pause and Esc to exit.", run: slideshow };
    }
    if (/\b(shortcuts?|hotkeys?|keyboard)\b/.test(lower)) {
      return { text: "Here are the keyboard shortcuts.", run: () => openHelp() };
    }
    if (/\b(compact|smaller)\b/.test(lower)) return { text: "Switched to the compact view.", run: () => setView(4) };
    if (/\b(large|bigger)\b/.test(lower)) return { text: "Switched to the large view.", run: () => setView(2) };
    if (/\b(default view|normal view)\b/.test(lower)) return { text: "Switched to the default view.", run: () => setView(3) };
    return null;
  });

  /* ------------------------------------------------------------------ */
  /* Entrance                                                            */
  /* ------------------------------------------------------------------ */
  if (!reduce) {
    gsap.from("#toolbar", { y: 30, autoAlpha: 0, duration: 0.8, delay: 2.2, ease: "power3.out" });
    gsap.from(".tb-chip", { y: 14, autoAlpha: 0, stagger: 0.06, duration: 0.4, delay: 2.5, ease: "back.out(2)" });
    gsap.from(dotEls, { x: 20, autoAlpha: 0, stagger: 0.08, duration: 0.5, delay: 3, ease: "power3.out" });
  }
})();
