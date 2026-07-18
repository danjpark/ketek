(function () {
  "use strict";

  var STORAGE_KEY = "ketek-draft-v2";
  var LEGACY_KEY = "ketek-draft-v1";
  var LIBRARY_KEY = "ketek-library-v1";
  var SETTINGS_KEY = "ketek-settings-v1";
  var UNDO_LIMIT = 40;
  var COMMIT_DEBOUNCE_MS = 500;

  var EXAMPLES = {
    storm: {
      forward: "Above silence, the illuminating storms",
      pivot: "dying",
      overrides: { 0: "above", 1: "silence", 3: "illuminate" }
    },
    wind: {
      forward: "Alight, winds approach",
      pivot: "deadly",
      overrides: { 0: "alight.", 2: "approaching" }
    }
  };

  function defaultState() {
    return {
      mode: "simple",
      simple: { forward: "", pivot: "", overrides: {} },
      sections: {
        forwards: ["", "", "", "", ""],
        pivot: "",
        overrides: [{}, {}, {}, {}, {}]
      }
    };
  }

  var state = defaultState();
  var library = [];
  var settings = { emDash: false };
  var history = [];
  var historyIndex = -1;
  var historyTimer = null;

  // ---------- DOM refs ----------
  var forwardInput = document.getElementById("forward-input");
  var pivotInput = document.getElementById("pivot-input");
  var forwardMap = document.getElementById("forward-map");
  var mirrorOutput = document.getElementById("mirror-output");

  var sectionInputs = [0, 1, 2, 3, 4].map(function (i) {
    return document.querySelector('[data-section-input="' + i + '"]');
  });
  var sectionsPivotInput = document.getElementById("sections-pivot-input");
  var sectionsMirrorOutput = document.getElementById("sections-mirror-output");

  var modeButtons = Array.prototype.slice.call(document.querySelectorAll(".mode-btn"));
  var simpleEditor = document.getElementById("simple-editor");
  var sectionsEditor = document.getElementById("sections-editor");

  var statsEl = document.getElementById("stats");
  var previewEl = document.getElementById("preview");
  var exampleSelect = document.getElementById("example-select");
  var clearBtn = document.getElementById("clear-btn");
  var undoBtn = document.getElementById("undo-btn");
  var redoBtn = document.getElementById("redo-btn");

  var saveDraftBtn = document.getElementById("save-draft-btn");
  var saveDraftForm = document.getElementById("save-draft-form");
  var saveDraftTitle = document.getElementById("save-draft-title");
  var saveDraftConfirm = document.getElementById("save-draft-confirm");
  var saveDraftCancel = document.getElementById("save-draft-cancel");
  var libraryList = document.getElementById("library-list");
  var libraryEmpty = document.getElementById("library-empty");

  var emDashToggle = document.getElementById("em-dash-toggle");
  var copyBtn = document.getElementById("copy-btn");
  var downloadBtn = document.getElementById("download-btn");

  // ---------- word tokenizing ----------
  function tokenize(text) {
    return text.trim().length ? text.trim().split(/\s+/) : [];
  }

  function mirrorWordsFor(words, overrides) {
    var out = [];
    for (var j = 0; j < words.length; j++) {
      var k = words.length - 1 - j;
      var hasOverride = Object.prototype.hasOwnProperty.call(overrides, k);
      out.push(hasOverride ? overrides[k] : words[k]);
    }
    return out;
  }

  function overridesFor(prefix) {
    if (prefix === "s") return state.simple.overrides;
    var m = /^sec([0-4])$/.exec(prefix);
    if (m) return state.sections.overrides[Number(m[1])];
    return null;
  }

  // ---------- lightweight morphology helpers (best-effort, not a real lemmatizer) ----------
  function splitTrailingPunct(w) {
    var m = /^(.*?)([.,!?;:]*)$/.exec(w);
    return { base: m[1], suffix: m[2] };
  }

  function addIng(w) {
    if (/ing$/i.test(w)) return w;
    if (/e$/i.test(w) && w.length > 1 && !/ee$/i.test(w)) return w.slice(0, -1) + "ing";
    if (w.length <= 5 && /[^aeiou][aeiou][^aeiouwxy]$/i.test(w)) return w + w.slice(-1) + "ing";
    return w + "ing";
  }

  function stripIng(w) {
    if (!/ing$/i.test(w) || w.length <= 4) return w;
    var root = w.slice(0, -3);
    if (root.length >= 3 && /([^aeiou])\1$/i.test(root)) return root.slice(0, -1);
    if (root.length >= 2 && /[aeiou][^aeiouwxy]$/i.test(root)) return root + "e";
    return root;
  }

  function toggleIng(w) {
    var parts = splitTrailingPunct(w);
    var base = /ing$/i.test(parts.base) && parts.base.length > 4 ? stripIng(parts.base) : addIng(parts.base);
    return base + parts.suffix;
  }

  function addS(w) {
    if (/s$/i.test(w)) return w;
    if (/([sxz]|[cs]h)$/i.test(w)) return w + "es";
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
    return w + "s";
  }

  function stripS(w) {
    if (/ies$/i.test(w)) return w.slice(0, -3) + "y";
    if (/(sses|shes|ches|xes|zes)$/i.test(w)) return w.slice(0, -2);
    if (/s$/i.test(w) && !/ss$/i.test(w)) return w.slice(0, -1);
    return w;
  }

  function toggleS(w) {
    var parts = splitTrailingPunct(w);
    var base = /s$/i.test(parts.base) && !/ss$/i.test(parts.base) ? stripS(parts.base) : addS(parts.base);
    return base + parts.suffix;
  }

  function toggleCase(w) {
    var m = /^([^A-Za-z]*)([A-Za-z])/.exec(w);
    if (!m) return w;
    var idx = m[1].length;
    var ch = w[idx];
    var replaced = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
    return w.slice(0, idx) + replaced + w.slice(idx + 1);
  }

  // ---------- rendering ----------
  function renderWordMap(container, words, prefix) {
    container.innerHTML = "";
    for (var k = 0; k < words.length; k++) {
      var chip = document.createElement("span");
      chip.className = "map-chip";
      chip.dataset.pair = prefix + "-" + k;
      chip.textContent = words[k];
      container.appendChild(chip);
      if (k < words.length - 1) container.appendChild(document.createTextNode(" "));
    }
  }

  function buildMirrorUnits(words, overrides, prefix) {
    var frag = document.createDocumentFragment();
    for (var j = 0; j < words.length; j++) {
      var k = words.length - 1 - j;
      var hasOverride = Object.prototype.hasOwnProperty.call(overrides, k);
      var text = hasOverride ? overrides[k] : words[k];

      var unit = document.createElement("span");
      unit.className = "mirror-unit";

      var span = document.createElement("span");
      span.className = "mirror-word " + (hasOverride ? "edited" : "ghost");
      span.contentEditable = "true";
      span.spellcheck = false;
      span.dataset.k = String(k);
      span.dataset.prefix = prefix;
      span.dataset.pair = prefix + "-" + k;
      span.dataset.default = words[k];
      span.title = hasOverride ? "auto: " + words[k] + " (reset available below)" : "";
      span.textContent = text;
      unit.appendChild(span);

      var tools = document.createElement("span");
      tools.className = "mirror-tools";
      tools.innerHTML =
        '<button type="button" data-tool="ing" tabindex="-1" title="toggle -ing">ing</button>' +
        '<button type="button" data-tool="s" tabindex="-1" title="toggle plural -s">s</button>' +
        '<button type="button" data-tool="case" tabindex="-1" title="toggle case">Aa</button>' +
        '<button type="button" data-tool="synonyms" tabindex="-1" title="find similar words">&#8776;</button>' +
        '<button type="button" data-tool="reset" tabindex="-1" title="reset to default">&#8635;</button>';
      unit.appendChild(tools);

      frag.appendChild(unit);
      if (j < words.length - 1) frag.appendChild(document.createTextNode(" "));
    }
    return frag;
  }

  function renderSimpleMap() {
    renderWordMap(forwardMap, tokenize(state.simple.forward), "s");
  }

  function renderSimpleMirror() {
    mirrorOutput.innerHTML = "";
    mirrorOutput.appendChild(buildMirrorUnits(tokenize(state.simple.forward), state.simple.overrides, "s"));
  }

  function renderSectionMaps() {
    for (var i = 0; i < 5; i++) {
      var mapEl = document.querySelector('[data-section-map="' + i + '"]');
      var words = tokenize(state.sections.forwards[i]);
      renderWordMap(mapEl, words, "sec" + i);

      var status = document.querySelector('[data-section-status="' + i + '"]');
      status.classList.toggle("filled", words.length > 0);
      status.title = words.length > 0 ? words.length + " word" + (words.length === 1 ? "" : "s") : "empty";
    }
  }

  function renderSectionsMirror() {
    sectionsMirrorOutput.innerHTML = "";
    for (var i = 4; i >= 0; i--) {
      var words = tokenize(state.sections.forwards[i]);
      if (!words.length) continue;
      var label = document.createElement("span");
      label.className = "section-label-chip";
      label.contentEditable = "false";
      label.textContent = "S" + (i + 1);
      sectionsMirrorOutput.appendChild(label);
      sectionsMirrorOutput.appendChild(buildMirrorUnits(words, state.sections.overrides[i], "sec" + i));
      sectionsMirrorOutput.appendChild(document.createTextNode(" "));
    }
  }

  function applyModeVisibility() {
    var simple = state.mode === "simple";
    simpleEditor.hidden = !simple;
    sectionsEditor.hidden = simple;
    modeButtons.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });
  }

  function composeParts(forwardText, pivot, mirrorText) {
    var parts = [];
    if (forwardText) parts.push(forwardText);
    if (pivot) parts.push(settings.emDash ? ("—" + pivot + "—") : pivot);
    if (mirrorText) parts.push(mirrorText);
    return parts.join(" ");
  }

  function updatePreviewAndStats() {
    var previewText, n, mirroredN, pivot, total, filledSections = null;

    if (state.mode === "simple") {
      var words = tokenize(state.simple.forward);
      var mirror = mirrorWordsFor(words, state.simple.overrides);
      pivot = state.simple.pivot.trim();
      previewText = composeParts(state.simple.forward.trim(), pivot, mirror.join(" "));
      n = words.length;
      mirroredN = words.length;
      total = n + mirroredN + (pivot ? 1 : 0);
    } else {
      var fwdParts = [];
      var mirrorParts = [];
      n = 0;
      for (var i = 0; i < 5; i++) {
        var w = tokenize(state.sections.forwards[i]);
        n += w.length;
        if (w.length) fwdParts.push(state.sections.forwards[i].trim());
      }
      for (var i2 = 4; i2 >= 0; i2--) {
        var w2 = tokenize(state.sections.forwards[i2]);
        if (!w2.length) continue;
        mirrorParts.push(mirrorWordsFor(w2, state.sections.overrides[i2]).join(" "));
      }
      pivot = state.sections.pivot.trim();
      previewText = composeParts(fwdParts.join(" "), pivot, mirrorParts.join(" "));
      mirroredN = n;
      total = n + mirroredN + (pivot ? 1 : 0);
      filledSections = [0, 1, 2, 3, 4].filter(function (i) {
        return tokenize(state.sections.forwards[i]).length > 0;
      }).length;
    }

    previewEl.textContent = previewText || "Your ketek will appear here.";

    var bits = [n + " word" + (n === 1 ? "" : "s") + " forward", mirroredN + " mirrored"];
    if (pivot) bits.push("1 pivot");
    if (filledSections !== null) bits.push(filledSections + "/5 sections");
    bits.push(total + " total");
    statsEl.textContent = bits.join(" · ");
  }

  function renderAll() {
    forwardInput.value = state.simple.forward;
    pivotInput.value = state.simple.pivot;
    renderSimpleMap();
    renderSimpleMirror();

    for (var i = 0; i < 5; i++) sectionInputs[i].value = state.sections.forwards[i];
    sectionsPivotInput.value = state.sections.pivot;
    renderSectionMaps();
    renderSectionsMirror();

    applyModeVisibility();
    emDashToggle.checked = settings.emDash;
    updatePreviewAndStats();
    renderLibrary();
  }

  // ---------- override mutation ----------
  function setOverride(prefix, k, text, defaultText) {
    var overrides = overridesFor(prefix);
    if (!overrides) return;
    if (text === defaultText) delete overrides[k];
    else overrides[k] = text;
  }

  function resetMirrorWord(span) {
    var k = Number(span.dataset.k);
    var overrides = overridesFor(span.dataset.prefix);
    if (overrides) delete overrides[k];
    span.textContent = span.dataset.default;
    span.classList.remove("edited");
    span.classList.add("ghost");
    span.title = "";
    updatePreviewAndStats();
    saveState();
    commitHistory();
  }

  function applyMirrorWordUpdate(span, text) {
    // Avoid reassigning textContent when it's already current — doing so
    // while the user is actively typing would reset the cursor position.
    if (span.textContent !== text) span.textContent = text;
    var k = Number(span.dataset.k);
    var prefix = span.dataset.prefix;
    var isDefault = text === span.dataset.default;
    setOverride(prefix, k, text, span.dataset.default);
    span.classList.toggle("edited", !isDefault);
    span.classList.toggle("ghost", isDefault);
    span.title = isDefault ? "" : "auto: " + span.dataset.default + " (reset available below)";
    updatePreviewAndStats();
    saveState();
  }

  // ---------- synonym lookup (Datamuse) ----------
  function fetchSynonyms(word) {
    var clean = word.replace(/[^A-Za-z']/g, "");
    if (!clean) return Promise.resolve([]);
    return fetch("https://api.datamuse.com/words?ml=" + encodeURIComponent(clean) + "&max=8")
      .then(function (res) {
        if (!res.ok) throw new Error("Datamuse request failed");
        return res.json();
      })
      .then(function (data) {
        return data.map(function (d) { return d.word; }).filter(Boolean);
      });
  }

  function closeSynonymPopovers() {
    document.querySelectorAll(".synonym-popover").forEach(function (p) { p.remove(); });
  }

  function showSynonymPopover(unit, span) {
    closeSynonymPopovers();
    var pop = document.createElement("div");
    pop.className = "synonym-popover";
    pop.textContent = "Looking up “" + span.textContent + "”…";
    unit.appendChild(pop);

    fetchSynonyms(span.textContent).then(function (words) {
      if (!pop.isConnected) return;
      pop.innerHTML = "";
      if (!words.length) {
        pop.textContent = "No suggestions found.";
        return;
      }
      words.forEach(function (w) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "synonym-chip";
        chip.textContent = w;
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          applyMirrorWordUpdate(span, w);
          commitHistory();
          pop.remove();
        });
        pop.appendChild(chip);
      });
    }).catch(function () {
      if (pop.isConnected) pop.textContent = "Couldn't reach the word-lookup service.";
    });
  }

  // ---------- history (undo/redo) ----------
  function snapshotState() {
    return JSON.stringify({ mode: state.mode, simple: state.simple, sections: state.sections });
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
  }

  function commitHistory() {
    clearTimeout(historyTimer);
    var snap = snapshotState();
    if (historyIndex >= 0 && history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    historyIndex++;
    if (history.length > UNDO_LIMIT) {
      history.shift();
      historyIndex--;
    }
    updateUndoRedoButtons();
  }

  function scheduleCommit() {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(commitHistory, COMMIT_DEBOUNCE_MS);
  }

  function restoreSnapshot(snap) {
    var parsed = JSON.parse(snap);
    state.mode = parsed.mode;
    state.simple = parsed.simple;
    state.sections = parsed.sections;
    renderAll();
    saveState();
    updateUndoRedoButtons();
  }

  function undo() {
    if (historyIndex <= 0) return;
    clearTimeout(historyTimer);
    historyIndex--;
    restoreSnapshot(history[historyIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    clearTimeout(historyTimer);
    historyIndex++;
    restoreSnapshot(history[historyIndex]);
  }

  // ---------- persistence: current draft ----------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* draft just won't persist */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state.mode = parsed.mode === "sections" ? "sections" : "simple";
          state.simple = Object.assign({ forward: "", pivot: "", overrides: {} }, parsed.simple || {});
          var sec = parsed.sections || {};
          state.sections = {
            forwards: Array.isArray(sec.forwards) && sec.forwards.length === 5 ? sec.forwards : ["", "", "", "", ""],
            pivot: sec.pivot || "",
            overrides: Array.isArray(sec.overrides) && sec.overrides.length === 5 ? sec.overrides : [{}, {}, {}, {}, {}]
          };
        }
        return;
      }
      var legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        var legacy = JSON.parse(legacyRaw);
        if (legacy && typeof legacy === "object") {
          state.simple.forward = legacy.forward || "";
          state.simple.pivot = legacy.pivot || "";
          state.simple.overrides = legacy.overrides || {};
        }
      }
    } catch (e) { /* corrupt draft — start fresh */ }
  }

  function hasContent() {
    if (state.simple.forward.trim() || state.simple.pivot.trim()) return true;
    for (var i = 0; i < 5; i++) if (state.sections.forwards[i].trim()) return true;
    if (state.sections.pivot.trim()) return true;
    return false;
  }

  // ---------- persistence: settings ----------
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        settings.emDash = !!parsed.emDash;
      }
    } catch (e) { /* corrupt settings — use defaults */ }
  }

  // ---------- persistence: saved-drafts library ----------
  function loadLibrary() {
    try {
      var raw = localStorage.getItem(LIBRARY_KEY);
      library = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(library)) library = [];
    } catch (e) { library = []; }
  }

  function saveLibrary() {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); } catch (e) {}
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return ""; }
  }

  function renderLibrary() {
    libraryList.innerHTML = "";
    libraryEmpty.hidden = library.length > 0;

    library.slice().reverse().forEach(function (entry) {
      var li = document.createElement("li");

      var info = document.createElement("div");
      info.className = "library-item-info";
      var title = document.createElement("div");
      title.className = "library-item-title";
      title.textContent = entry.title;
      var meta = document.createElement("div");
      meta.className = "library-item-meta";
      meta.textContent = (entry.mode === "sections" ? "Five-section" : "Simple") + " · " + formatDate(entry.savedAt);
      info.appendChild(title);
      info.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "library-item-actions";
      var loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", function () { loadFromLibrary(entry.id); });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () { deleteFromLibrary(entry.id); });
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      li.appendChild(info);
      li.appendChild(actions);
      libraryList.appendChild(li);
    });
  }

  function saveCurrentAsDraft(title) {
    var entry = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      title: title,
      savedAt: new Date().toISOString(),
      mode: state.mode,
      simple: JSON.parse(JSON.stringify(state.simple)),
      sections: JSON.parse(JSON.stringify(state.sections))
    };
    library.push(entry);
    saveLibrary();
    renderLibrary();
  }

  function loadFromLibrary(id) {
    var entry = library.filter(function (e) { return e.id === id; })[0];
    if (!entry) return;
    if (hasContent() && !confirm('Load "' + entry.title + '" and replace your current draft?')) return;
    state.mode = entry.mode;
    state.simple = JSON.parse(JSON.stringify(entry.simple));
    state.sections = JSON.parse(JSON.stringify(entry.sections));
    renderAll();
    saveState();
    commitHistory();
  }

  function deleteFromLibrary(id) {
    var entry = library.filter(function (e) { return e.id === id; })[0];
    if (!entry) return;
    if (!confirm('Delete "' + entry.title + '"?')) return;
    library = library.filter(function (e) { return e.id !== id; });
    saveLibrary();
    renderLibrary();
  }

  // ---------- event wiring ----------
  forwardInput.addEventListener("input", function () {
    state.simple.forward = forwardInput.value;
    renderSimpleMap();
    renderSimpleMirror();
    updatePreviewAndStats();
    saveState();
    scheduleCommit();
  });

  pivotInput.addEventListener("input", function () {
    state.simple.pivot = pivotInput.value;
    updatePreviewAndStats();
    saveState();
    scheduleCommit();
  });

  sectionInputs.forEach(function (el, i) {
    el.addEventListener("input", function () {
      state.sections.forwards[i] = el.value;
      renderSectionMaps();
      renderSectionsMirror();
      updatePreviewAndStats();
      saveState();
      scheduleCommit();
    });
  });

  sectionsPivotInput.addEventListener("input", function () {
    state.sections.pivot = sectionsPivotInput.value;
    updatePreviewAndStats();
    saveState();
    scheduleCommit();
  });

  modeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (state.mode === btn.dataset.mode) return;
      state.mode = btn.dataset.mode;
      applyModeVisibility();
      updatePreviewAndStats();
      saveState();
      commitHistory();
    });
  });

  document.addEventListener("input", function (e) {
    var target = e.target;
    if (!target.classList || !target.classList.contains("mirror-word")) return;
    applyMirrorWordUpdate(target, target.textContent);
    scheduleCommit();
  });

  document.addEventListener("keydown", function (e) {
    var target = e.target;
    if (target.classList && target.classList.contains("mirror-word")) {
      if (e.key === "Enter") {
        e.preventDefault();
        target.blur();
      }
      return;
    }
    var tag = target.tagName;
    var editable = tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable;
    if (editable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
  });

  document.addEventListener("dblclick", function (e) {
    var target = e.target;
    if (!target.classList || !target.classList.contains("mirror-word")) return;
    resetMirrorWord(target);
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest || (!e.target.closest(".synonym-popover") && !e.target.closest('[data-tool="synonyms"]'))) {
      closeSynonymPopovers();
    }

    var btn = e.target.closest ? e.target.closest(".mirror-tools button") : null;
    if (!btn) return;
    var unit = btn.closest(".mirror-unit");
    var span = unit.querySelector(".mirror-word");
    var tool = btn.dataset.tool;

    if (tool === "reset") {
      resetMirrorWord(span);
      span.focus();
      return;
    }

    if (tool === "synonyms") {
      showSynonymPopover(unit, span);
      return;
    }

    var current = span.textContent;
    var next = current;
    if (tool === "ing") next = toggleIng(current);
    else if (tool === "s") next = toggleS(current);
    else if (tool === "case") next = toggleCase(current);

    applyMirrorWordUpdate(span, next);
    commitHistory();
    span.focus();
  });

  function setPaired(pairId, on) {
    var nodes = document.querySelectorAll('[data-pair="' + pairId + '"]');
    nodes.forEach(function (n) { n.classList.toggle("paired", on); });
  }

  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest ? e.target.closest("[data-pair]") : null;
    if (!el) return;
    setPaired(el.dataset.pair, true);
  });

  document.addEventListener("mouseout", function (e) {
    var el = e.target.closest ? e.target.closest("[data-pair]") : null;
    if (!el) return;
    setPaired(el.dataset.pair, false);
  });

  exampleSelect.addEventListener("change", function () {
    var key = exampleSelect.value;
    if (!key || !EXAMPLES[key]) return;
    if (hasContent() && !confirm("Load example and replace your current draft?")) {
      exampleSelect.value = "";
      return;
    }
    var ex = EXAMPLES[key];
    state.mode = "simple";
    state.simple.forward = ex.forward;
    state.simple.pivot = ex.pivot;
    state.simple.overrides = Object.assign({}, ex.overrides);
    renderAll();
    saveState();
    commitHistory();
    exampleSelect.value = "";
  });

  clearBtn.addEventListener("click", function () {
    if (!hasContent()) return;
    if (!confirm("Clear the current draft?")) return;
    state.simple = { forward: "", pivot: "", overrides: {} };
    state.sections = { forwards: ["", "", "", "", ""], pivot: "", overrides: [{}, {}, {}, {}, {}] };
    renderAll();
    saveState();
    commitHistory();
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  saveDraftBtn.addEventListener("click", function () {
    saveDraftForm.hidden = false;
    saveDraftTitle.value = "";
    saveDraftTitle.focus();
  });
  saveDraftCancel.addEventListener("click", function () {
    saveDraftForm.hidden = true;
  });
  saveDraftConfirm.addEventListener("click", function () {
    var title = saveDraftTitle.value.trim();
    if (!title) { saveDraftTitle.focus(); return; }
    saveCurrentAsDraft(title);
    saveDraftForm.hidden = true;
  });
  saveDraftTitle.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); saveDraftConfirm.click(); }
    if (e.key === "Escape") { saveDraftForm.hidden = true; }
  });

  emDashToggle.addEventListener("change", function () {
    settings.emDash = emDashToggle.checked;
    updatePreviewAndStats();
    saveSettings();
  });

  copyBtn.addEventListener("click", function () {
    var text = previewEl.textContent;
    var original = copyBtn.textContent;
    function flash(label) {
      copyBtn.textContent = label;
      setTimeout(function () { copyBtn.textContent = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash("Copied!"); }, function () { flash("Couldn't copy"); });
    } else {
      flash("Copy unsupported");
    }
  });

  downloadBtn.addEventListener("click", function () {
    var blob = new Blob([previewEl.textContent], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ketek.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- init ----------
  loadState();
  loadLibrary();
  loadSettings();
  renderAll();
  history = [snapshotState()];
  historyIndex = 0;
  updateUndoRedoButtons();
})();
