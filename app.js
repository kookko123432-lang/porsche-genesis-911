// ============================================================================
// MY PORSCHE : GENESIS 911 — Main controller
// ============================================================================

(function () {
  "use strict";

  const STORAGE_KEY = "PORSCHE_GENESIS_911_STATE_V2";
  const TARGET_DATE = new Date(2029, 3, 18, 23, 59, 59); // end of Day 911
  const TOTAL_DAYS = 911;
  const HALFWAY_DAY = 456;
  const D = window.GENESIS_DATA;
  const audio = window.genesisAudio;
  const $ = (id) => document.getElementById(id);

  const SCREEN_TITLES = {
    s0: "Widgets & Standby",
    s1: "Commissioning Chrono",
    s2: "Cockpit & Night Drive",
    s3: "A Day in 2029",
    s4: "Custodian Logbook"
  };
  const LOG_TAG_LABELS = {
    "FUTURE VLOG": "Future vlog",
    "HIGH-LEVERAGE": "Leverage",
    "RAS EVIDENCE": "RAS evidence",
    "WOOP PROTOCOL": "WOOP"
  };
  const POV_PRESETS = {
    night: { gear: "M5", speed: 128, rpm: 3800 },
    coast: { gear: "M4", speed: 96, rpm: 3400 },
    cabin360: { gear: "P", speed: 0, rpm: 850 }
  };

  const defaultState = {
    modelId: "carrera_gts",
    paintId: "guards_red",
    targetPrice: 7800000,
    allocatedFund: 1850000,
    lastIgnitionDate: "",
    city: "台北信義區",
    business: "高槓桿事業與資產系統",
    partner: "摯愛的家人與伴侶",
    covenantText:
      "「在這 911 天內，我將全面戒除低價值消耗，專注建構可規模化的高毛利商業資產，以頂尖產出兌換這把鑰匙。」",
    sigCount: 0,
    sigDate: "",
    logs: [
      { tag: "FUTURE VLOG", day: "DAY 001", text: "在信義區路口遇見一輛粉筆灰 992 GTS，大腦 RAS 雷達瞬間鎖定目標。" },
      { tag: "HIGH-LEVERAGE", day: "DAY 001", text: "完成核心產品高單價定價重構，推進購車基金第一哩路。" }
    ]
  };

  let state = loadState();
  let activeScreen = "s1";
  let simDayOverride = null;
  let selectedStageIndex = null;
  let affirmIdx = 0;
  let todIdx = 0;
  let activeChapterIdx = 0;
  let activeLineIdx = 0;
  let playToken = 0;
  let psycheIdx = 0;
  let scenarioIdx = 0;
  let strobeTimer = null;
  let igniting = false;
  let standbyOwnsAudio = false;
  let povMode = "night";
  let hudResetTimer = null;
  let toastTimer = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedBlobUrl = null;

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------
  function loadState() {
    const base = JSON.parse(JSON.stringify(defaultState));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const merged = Object.assign(base, JSON.parse(raw));
      delete merged.ignitedToday; // legacy flag, now derived from lastIgnitionDate
      return merged;
    } catch (e) {
      console.warn("State load failed, using defaults:", e);
      return base;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("State save failed:", e);
      toast("無法儲存資料（儲存空間不足？）");
    }
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");
  const fmtMoney = (n) => Math.round(n).toLocaleString("en-US");

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // DST-safe calendar-day index: 2026-10-21 = Day 1
  function realDayNumber() {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const start = Date.UTC(2026, 9, 21);
    const n = Math.round((today - start) / 86400000) + 1;
    return Math.max(1, Math.min(TOTAL_DAYS, n));
  }
  const getDayNumber = () => (simDayOverride !== null ? simDayOverride : realDayNumber());
  const isIgnitedToday = () => state.lastIgnitionDate === todayKey();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 2200);
  }

  function paintRange(el) {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const pct = ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty("--pct", pct + "%");
  }

  const getModel = () => D.models.find((m) => m.id === state.modelId) || D.models[0];
  const getPaint = () => D.paints.find((p) => p.id === state.paintId) || D.paints[0];
  const paintEn = (p) => p.name.split(" · ")[0];
  const paintZh = (p) => p.name.split(" · ")[1] || p.name;

  function openModal(id) {
    $(id).classList.add("is-open");
  }
  function closeModal(id) {
    $(id).classList.remove("is-open");
  }

  // --------------------------------------------------------------------------
  // Telemetry (event-driven + every 30s; the ticker has its own light loop)
  // --------------------------------------------------------------------------
  function syncAllTelemetry() {
    const model = getModel();
    const paint = getPaint();
    const day = getDayNumber();
    const daysLeft = Math.max(0, TOTAL_DAYS - day);
    const fundPct = Math.min(100, (state.allocatedFund / Math.max(1, state.targetPrice)) * 100);
    const ignited = isIgnitedToday();

    document.documentElement.style.setProperty("--car", paint.hex);

    // Header
    $("top-model-label").textContent = `Porsche ${model.name}`;
    $("top-day-num").textContent = pad3(day);

    // 01 · Hero
    $("hero-days-left").textContent = daysLeft;
    $("hero-day-ratio").textContent = `${pad3(day)} / 911`;
    $("hero-progress-pct").textContent = `${((day / TOTAL_DAYS) * 100).toFixed(1)}%`;
    const halfRem = HALFWAY_DAY - day;
    $("chrono-halfway-text").textContent = halfRem > 0 ? `T-${halfRem}D` : "Passed";
    const ringLen = Math.max(2, (day / TOTAL_DAYS) * 289);
    $("ignition-ring-arc").setAttribute("stroke-dasharray", `${ringLen.toFixed(1)} 289`);
    updateTicker(true);

    // 01 · Build + fund + covenant
    renderBuildTelemetry(day);
    $("fund-pct-inline").textContent = `${fundPct.toFixed(1)}%`;
    $("fund-current-big").textContent = `NT$ ${fmtMoney(state.allocatedFund)}`;
    $("fund-target-small").textContent = `/ ${fmtMoney(state.targetPrice)}`;
    $("chrono-fund-bar").style.width = `${fundPct}%`;
    $("card-model-spec").textContent = `${model.code} · ${paintEn(paint)}`;
    $("covenant-text-display").textContent = state.covenantText;
    $("slider-day-label").textContent = `D${pad3(day)}`;

    // 00 · Widgets
    $("widget-lock-inline").textContent = `${model.code} · T-${daysLeft}D · 2029.04.18`;
    $("widget-chrono-day").textContent = pad3(day);
    $("widget-chrono-ratio").textContent = `${pad3(day)}/911`;
    $("widget-chrono-arc").setAttribute("stroke-dasharray", `${Math.max(4, (day / TOTAL_DAYS) * 232).toFixed(1)} 240`);
    $("widget-chrono-hand").setAttribute("transform", `rotate(${((day / TOTAL_DAYS) * 360).toFixed(1)} 50 50)`);
    $("widget-alloc-pct").textContent = `${fundPct.toFixed(1)}%`;
    $("widget-alloc-bar").style.width = `${Math.max(2, fundPct)}%`;
    $("widget-ignition-state").textContent = ignited ? "IGNITED" : "READY";
    $("widget-ignition-state").className = ignited ? "brass strong" : "red strong";
    $("widget-tminus-days").textContent = `T-${daysLeft} DAYS`;
    $("widget-car-code").textContent = model.code;
    $("standby-mini-days").textContent = `${daysLeft}D`;

    // Standby
    $("standby-full-days").textContent = `${daysLeft}D`;
    $("standby-full-daynum").textContent = `DAY ${pad3(day)} / 911`;
    $("standby-full-pct").textContent = `${fundPct.toFixed(1)}%`;

    // Ignition knob state (resets automatically on a new day)
    if (!igniting) {
      $("btn-left-ignition").classList.toggle("ignited", ignited);
      const lbl = $("ignition-label-text");
      lbl.textContent = ignited ? "Ignited today" : "Left ignition";
      lbl.classList.toggle("on", ignited);
    }
  }

  function updateTicker(force) {
    if (!force && (activeScreen !== "s1" || document.hidden)) return;
    const daysLeft = Math.max(0, TOTAL_DAYS - getDayNumber());
    const remMs = Math.max(0, TARGET_DATE.getTime() - Date.now());
    const sec = Math.floor(remMs / 1000);
    const hh = pad2(Math.floor((sec % 86400) / 3600));
    const mm = pad2(Math.floor((sec % 3600) / 60));
    const ss = pad2(sec % 60);
    const tenth = Math.floor((remMs % 1000) / 100);
    $("chrono-live-ticker").textContent = `T-${daysLeft}D · ${hh}:${mm}:${ss}.${tenth}`;
  }

  function buildSegments() {
    const bar = $("build-segments-bar");
    bar.innerHTML = D.buildStages
      .map((s, i) => `<button class="seg" data-sidx="${i}" aria-label="${escapeHtml(s.zhTitle)}"></button>`)
      .join("");
    bar.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedStageIndex = Number(btn.dataset.sidx);
        audio.playTactileClick(820);
        renderBuildTelemetry(getDayNumber());
      });
    });
  }

  function renderBuildTelemetry(day) {
    const stages = D.buildStages;
    let current = 0;
    stages.forEach((s, i) => {
      if (day >= s.day) current = i;
    });
    const idx = selectedStageIndex !== null ? selectedStageIndex : current;
    const st = stages[idx];
    const unlocked = day >= st.day;

    $("build-stage-counter").textContent = `Stage ${st.stage} / 10`;
    $("stage-code-text").textContent = `${st.code} · DAY ${pad3(st.day)}`;
    const tag = $("stage-status-tag");
    tag.textContent = unlocked ? "Unlocked" : `Day ${st.day}`;
    tag.classList.toggle("tag-on", unlocked);
    $("stage-title-text").textContent = st.zhTitle;
    $("stage-spec-text").textContent = st.spec;

    $("build-segments-bar").querySelectorAll(".seg").forEach((seg, i) => {
      seg.classList.toggle("is-on", day >= stages[i].day);
      seg.classList.toggle("is-selected", i === idx);
    });
  }

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------
  function showScreen(target) {
    if (target === activeScreen) return;
    activeScreen = target;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.target === target));
    document.querySelectorAll(".screen").forEach((s) => {
      s.hidden = s.id !== `screen-${target}`;
    });
    $("top-screen-title").textContent = SCREEN_TITLES[target];
    $("app-main").scrollTop = 0;
    if (target === "s2") cockpit.start();
    else cockpit.stop();
    if (target === "s4") signature.resize();
    updateTicker(true);
  }

  // Android hardware back: close modal → return to Chrono → exit
  window.__onBack = function () {
    const open = document.querySelector(".modal.is-open");
    if (open) {
      if (open.id === "modal-standby") closeStandby();
      else if (open.id === "modal-strobe") closeStrobe();
      else closeModal(open.id);
      return true;
    }
    if ($("covenant-flip-card").classList.contains("is-flipped")) {
      $("covenant-flip-card").classList.remove("is-flipped");
      return true;
    }
    if (activeScreen !== "s1") {
      showScreen("s1");
      return true;
    }
    return false;
  };

  // --------------------------------------------------------------------------
  // Ignition
  // --------------------------------------------------------------------------
  function triggerIgnition() {
    if (igniting) return;
    igniting = true;
    const knob = $("btn-left-ignition");
    const lbl = $("ignition-label-text");
    const wState = $("widget-ignition-state");
    const shell = $("main-app-shell");
    knob.classList.add("turning");
    lbl.classList.remove("on");
    lbl.textContent = "Cranking";
    if (wState) {
      wState.textContent = "CRANKING";
      wState.className = "red strong num";
    }
    shell.classList.add("igniting-vibration");
    setTimeout(() => shell.classList.remove("igniting-vibration"), 1300);

    audio.playColdStart(
      (rpm) => {
        lbl.textContent = `${rpm} RPM`;
        $("island-code-text").textContent = rpm;
        if (wState) wState.textContent = `${rpm} RPM`;
      },
      () => {
        knob.classList.remove("turning");
        igniting = false;
        state.lastIgnitionDate = todayKey();
        saveState();
        $("island-code-text").textContent = "911";
        syncAllTelemetry();
        toast("水平對臥六缸已點火 · 今日遙測啟動");
      }
    );
  }

  // --------------------------------------------------------------------------
  // 00 · Widget helpers
  // --------------------------------------------------------------------------
  const TOD_VIEWS = [
    { key: "dawn", label: "Dawn · 06:00" },
    { key: "noon", label: "Noon · 12:00" },
    { key: "dusk", label: "Dusk · 18:00" }
  ];

  function applyTod() {
    const v = TOD_VIEWS[todIdx];
    $("widget-tod-label").textContent = v.label;
    $("widget-car-frame").dataset.tod = v.key;
  }

  function nextAffirmation() {
    affirmIdx = (affirmIdx + 1) % D.affirmations.length;
    return D.affirmations[affirmIdx];
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function exportLockScreenWallpaper() {
    const W = 1080;
    const H = 2340;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const model = getModel();
    const paint = getPaint();
    const day = getDayNumber();
    const daysLeft = Math.max(0, TOTAL_DAYS - day);
    const sans = '-apple-system, Roboto, "Helvetica Neue", "Noto Sans TC", sans-serif';

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#050607");
    bg.addColorStop(0.55, "#0e1014");
    bg.addColorStop(1, "#050607");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, 1180, 40, W / 2, 1180, 620);
    glow.addColorStop(0, "rgba(213,0,28,0.16)");
    glow.addColorStop(1, "rgba(213,0,28,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 600, W, 1200);

    // 911 side profile (same path as the widget)
    const car = new Path2D(
      "M10 50 C10 45 12 42 18 41 L66 35 C76 26 88 19 104 17 C120 15.5 134 17 146 22 C162 28 176 33 186 37 C190 39 191 43 190 48 L186 52 L166 52 A14 14 0 0 0 138 52 L62 52 A14 14 0 0 0 34 52 L14 52 C11 52 10 51 10 50 Z"
    );
    ctx.save();
    ctx.translate(W / 2 - 400, 900);
    ctx.scale(4, 4);
    ctx.fillStyle = "#15171c";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.4;
    ctx.fill(car);
    ctx.stroke(car);
    ctx.strokeStyle = paint.hex;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(177, 35.5);
    ctx.lineTo(189.5, 41);
    ctx.stroke();
    ctx.fillStyle = "#08090b";
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 0.6;
    [48, 152].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, 52, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "#8c909a";
    ctx.font = `500 30px ${sans}`;
    ctx.fillText(`PORSCHE ${model.name.toUpperCase()}  ·  ${paintEn(paint).toUpperCase()}`, W / 2, 1210);

    ctx.fillStyle = "#f2f1ed";
    ctx.font = `200 168px ${sans}`;
    ctx.fillText("2029.04.18", W / 2, 1420);

    ctx.fillStyle = "#c5a059";
    ctx.font = `500 38px ${sans}`;
    ctx.fillText(`DAY ${pad3(day)} / 911   ·   T-${daysLeft} DAYS`, W / 2, 1510);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 120, 1580);
    ctx.lineTo(W / 2 + 120, 1580);
    ctx.stroke();

    ctx.fillStyle = "#c9c7c1";
    ctx.font = `400 36px ${sans}`;
    wrapCanvasText(ctx, state.covenantText, 820).slice(0, 4).forEach((ln, i) => {
      ctx.fillText(ln, W / 2, 1660 + i * 58);
    });

    const dataUrl = c.toDataURL("image/png");
    const filename = `PORSCHE-911-2029-04-18-DAY${pad3(day)}.png`;
    const bridge = window.AndroidBridge;
    if (bridge && typeof bridge.saveImage === "function") {
      const ok = bridge.saveImage(dataUrl.split(",")[1], filename);
      toast(ok ? "已儲存到相簿 Pictures/Porsche911" : "儲存失敗，請再試一次");
      return;
    }
    const a = document.createElement("a");
    a.download = filename;
    a.href = dataUrl;
    a.click();
    toast("桌布已下載");
  }

  // --------------------------------------------------------------------------
  // 02 · Cockpit renderer (runs only while the Cockpit tab is visible)
  // --------------------------------------------------------------------------
  const cockpit = (function () {
    const canvas = $("cockpit-pov-canvas");
    const box = $("cockpit-viewport-box");
    const ctx = canvas.getContext("2d");
    let cw = 0;
    let ch = 0;
    let running = false;
    let rafId = 0;
    let yaw = 0;
    let dragging = false;
    let lastX = 0;
    let lastDragTs = 0;
    let travel = 0;
    let lastTs = 0;

    const stars = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random() * 0.36, r: Math.random() * 0.9 + 0.3, a: Math.random() * 0.5 + 0.2 }));
    const skyline = Array.from({ length: 22 }, (_, i) => ({ x: i / 22, w: 0.025 + Math.random() * 0.03, h: 6 + Math.random() * 22, lit: Math.random() }));

    function resize() {
      const r = box.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = r.width;
      ch = r.height;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onDown(x) {
      dragging = true;
      lastX = x;
      lastDragTs = performance.now();
    }
    function onMove(x) {
      if (!dragging) return;
      const dx = x - lastX;
      lastX = x;
      lastDragTs = performance.now();
      yaw = Math.max(-75, Math.min(75, yaw - dx * 0.35));
    }
    box.addEventListener("mousedown", (e) => onDown(e.clientX));
    window.addEventListener("mousemove", (e) => onMove(e.clientX));
    window.addEventListener("mouseup", () => (dragging = false));
    box.addEventListener("touchstart", (e) => e.touches.length === 1 && onDown(e.touches[0].clientX), { passive: true });
    box.addEventListener("touchmove", (e) => e.touches.length === 1 && onMove(e.touches[0].clientX), { passive: true });
    window.addEventListener("touchend", () => (dragging = false));
    window.addEventListener("resize", () => running && resize());

    function draw(ts) {
      const dt = lastTs ? Math.min(50, ts - lastTs) : 16;
      lastTs = ts;
      const mode = povMode;
      const moving = mode !== "cabin360";
      if (moving) travel += dt * (mode === "night" ? 0.0011 : 0.0008);

      // Auto look-around in cabin mode, gentle return to centre while driving
      const idle = !dragging && ts - lastDragTs > 2500;
      if (idle) {
        const target = mode === "cabin360" ? Math.sin(ts * 0.00035) * 38 : 0;
        yaw += (target - yaw) * 0.02;
      }

      const curve = moving ? Math.sin(ts * 0.00028) * 0.06 : 0;
      const pan = -(yaw / 90) * cw * 0.55;
      const horizon = ch * 0.38;
      const vx = cw * 0.5 + pan * 0.6 + curve * cw;

      ctx.clearRect(0, 0, cw, ch);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      if (mode === "coast") {
        sky.addColorStop(0, "#0f1a2b");
        sky.addColorStop(0.55, "#3a3f55");
        sky.addColorStop(1, "#d98a5c");
      } else if (mode === "cabin360") {
        sky.addColorStop(0, "#141619");
        sky.addColorStop(1, "#202329");
      } else {
        sky.addColorStop(0, "#03050a");
        sky.addColorStop(0.7, "#0a1020");
        sky.addColorStop(1, "#151a28");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, horizon + 1);

      if (mode === "night") {
        stars.forEach((s) => {
          ctx.globalAlpha = s.a;
          ctx.fillStyle = "#dfe6ff";
          ctx.beginPath();
          ctx.arc(((s.x * cw + pan * 0.2) % cw + cw) % cw, s.y * ch * 0.9, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        const cityGlow = ctx.createRadialGradient(vx, horizon, 4, vx, horizon, cw * 0.55);
        cityGlow.addColorStop(0, "rgba(255,140,80,0.22)");
        cityGlow.addColorStop(1, "rgba(255,140,80,0)");
        ctx.fillStyle = cityGlow;
        ctx.fillRect(0, horizon - ch * 0.25, cw, ch * 0.3);
        skyline.forEach((b) => {
          const bx = vx - cw * 0.45 + b.x * cw * 0.9;
          ctx.fillStyle = "#07090f";
          ctx.fillRect(bx, horizon - b.h, b.w * cw, b.h);
          if (b.lit > 0.45) {
            ctx.fillStyle = "rgba(255,200,140,0.5)";
            ctx.fillRect(bx + 2, horizon - b.h + 3, 1.5, 1.5);
          }
        });
      } else if (mode === "coast") {
        const sunX = vx + cw * 0.22;
        const sun = ctx.createRadialGradient(sunX, horizon - 6, 2, sunX, horizon - 6, 90);
        sun.addColorStop(0, "rgba(255,226,170,0.95)");
        sun.addColorStop(0.25, "rgba(255,170,110,0.45)");
        sun.addColorStop(1, "rgba(255,150,90,0)");
        ctx.fillStyle = sun;
        ctx.fillRect(sunX - 100, horizon - 100, 200, 110);
      } else {
        // Garage ceiling light strips
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 2;
        for (let i = -4; i <= 4; i++) {
          const x = cw * 0.5 + pan + i * cw * 0.28;
          ctx.beginPath();
          ctx.moveTo(x - 30, ch * 0.08);
          ctx.lineTo(x + 30, ch * 0.08);
          ctx.stroke();
        }
      }

      // Ground
      const ground = ctx.createLinearGradient(0, horizon, 0, ch);
      ground.addColorStop(0, mode === "coast" ? "#2a3446" : mode === "cabin360" ? "#1a1c20" : "#0b0d12");
      ground.addColorStop(1, "#050607");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, cw, ch - horizon);

      if (mode === "coast") {
        ctx.strokeStyle = "rgba(255,200,150,0.18)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const y = horizon + 4 + i * 5;
          const off = Math.sin(ts * 0.001 + i) * 10;
          ctx.beginPath();
          ctx.moveTo(vx + cw * 0.12 + off, y);
          ctx.lineTo(vx + cw * 0.34 + off, y);
          ctx.stroke();
        }
      }

      // Road
      const roadBottom = ch * 0.64;
      const halfBottom = cw * 0.62;
      ctx.fillStyle = mode === "cabin360" ? "#121417" : "#0e1015";
      ctx.beginPath();
      ctx.moveTo(vx - 6, horizon);
      ctx.lineTo(vx + 6, horizon);
      ctx.lineTo(cw * 0.5 + pan + halfBottom, roadBottom);
      ctx.lineTo(cw * 0.5 + pan - halfBottom, roadBottom);
      ctx.closePath();
      ctx.fill();

      const lerpX = (side, z) => vx + (cw * 0.5 + pan + side * halfBottom - vx) * z;
      const zToY = (z) => horizon + (roadBottom - horizon) * z;

      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1.2;
      [-0.92, 0.92].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(lerpX(side, 0), horizon);
        ctx.lineTo(lerpX(side, 1), roadBottom);
        ctx.stroke();
      });

      // Centre dashes (perspective-correct)
      const N = 9;
      for (let i = 0; i < N; i++) {
        const t0 = ((i + travel) % N) / N;
        const z0 = t0 * t0;
        const z1 = Math.min(1, (t0 + 0.045) * (t0 + 0.045));
        ctx.strokeStyle = `rgba(197,160,89,${0.25 + z0 * 0.5})`;
        ctx.lineWidth = 0.8 + z0 * 3;
        ctx.beginPath();
        ctx.moveTo(lerpX(0, z0), zToY(z0));
        ctx.lineTo(lerpX(0, z1), zToY(z1));
        ctx.stroke();
      }

      // Street lamps (night) passing by
      if (mode === "night") {
        const L = 6;
        for (let i = 0; i < L; i++) {
          const t = ((i + travel * 0.7) % L) / L;
          const z = t * t;
          [-1.25, 1.25].forEach((side) => {
            const x = lerpX(side, z);
            const y = zToY(z) - (8 + z * 75);
            const r = 1 + z * 8;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
            g.addColorStop(0, "rgba(255,214,160,0.9)");
            g.addColorStop(0.25, "rgba(255,180,110,0.35)");
            g.addColorStop(1, "rgba(255,180,110,0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
          });
        }
        // Tail lights ahead
        ctx.fillStyle = "#d5001c";
        ctx.shadowColor = "#d5001c";
        ctx.shadowBlur = 8;
        ctx.fillRect(vx - 12, horizon + 4, 6, 2);
        ctx.fillRect(vx + 6, horizon + 4, 6, 2);
        ctx.shadowBlur = 0;
      }

      // A-pillars (visible when looking around)
      if (mode === "cabin360" || Math.abs(yaw) > 5) {
        ctx.fillStyle = "#040506";
        [-1, 1].forEach((side) => {
          const baseX = cw * 0.5 + pan + side * cw * 0.62;
          ctx.beginPath();
          ctx.moveTo(baseX - side * cw * 0.02, 0);
          ctx.lineTo(baseX + side * cw * 0.16, 0);
          ctx.lineTo(baseX + side * cw * 0.02, ch * 0.58);
          ctx.lineTo(baseX - side * cw * 0.14, ch * 0.58);
          ctx.closePath();
          ctx.fill();
        });
        // Rear-view mirror
        ctx.fillStyle = "#08090b";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(cw * 0.5 + pan - 34, 52, 68, 16, 6) : ctx.rect(cw * 0.5 + pan - 34, 52, 68, 16);
        ctx.fill();
        ctx.stroke();
      }

      // Bonnet in paint colour
      const paintHex = getPaint().hex;
      const cx = cw * 0.5 + pan;
      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.fillStyle = paintHex;
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.72, ch * 0.58);
      ctx.quadraticCurveTo(cx - cw * 0.25, ch * 0.49, cx, ch * 0.505);
      ctx.quadraticCurveTo(cx + cw * 0.25, ch * 0.49, cx + cw * 0.72, ch * 0.58);
      ctx.lineTo(cx + cw * 0.72, ch);
      ctx.lineTo(cx - cw * 0.72, ch);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.48, ch * 0.545);
      ctx.quadraticCurveTo(cx, ch * 0.495, cx + cw * 0.48, ch * 0.545);
      ctx.stroke();

      // Dashboard
      ctx.fillStyle = "#07080a";
      ctx.beginPath();
      ctx.moveTo(0, ch * 0.59);
      ctx.quadraticCurveTo(cx, ch * 0.53, cw, ch * 0.59);
      ctx.lineTo(cw, ch);
      ctx.lineTo(0, ch);
      ctx.closePath();
      ctx.fill();

      const dashGlow = ctx.createRadialGradient(cx - cw * 0.12, ch * 0.72, 4, cx - cw * 0.12, ch * 0.72, cw * 0.48);
      dashGlow.addColorStop(0, "rgba(213,0,28,0.32)");
      dashGlow.addColorStop(1, "rgba(213,0,28,0)");
      ctx.fillStyle = dashGlow;
      ctx.fillRect(0, ch * 0.52, cw, ch * 0.48);

      // Ambient red lighting strip
      ctx.strokeStyle = "rgba(213,0,28,0.88)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, ch * 0.625);
      ctx.quadraticCurveTo(cx, ch * 0.575, cw, ch * 0.625);
      ctx.stroke();

      // Sport Chrono dial on center dash
      const chx = cx + cw * 0.18;
      const chy = ch * 0.55;
      ctx.fillStyle = "#0b0c0f";
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(chx, chy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const ang = (ts / 1000) * ((Math.PI * 2) / 60) - Math.PI / 2;
      ctx.strokeStyle = "#d5001c";
      ctx.beginPath();
      ctx.moveTo(chx, chy);
      ctx.lineTo(chx + Math.cos(ang) * 8, chy + Math.sin(ang) * 8);
      ctx.stroke();

      // Porsche 5-ring instrument cluster behind steering wheel
      const wx = cx - cw * 0.12;
      const gy = ch * 0.675;
      [-32, -16, 16, 32].forEach((dx) => {
        ctx.fillStyle = "#090a0d";
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(wx + dx, gy + 2, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      // Central tachometer
      ctx.fillStyle = "#0d0f14";
      ctx.strokeStyle = "rgba(213,0,28,0.65)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(wx, gy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const rpmRatio = Math.min(1, (POV_PRESETS[mode].rpm || 3800) / 8000);
      const rpmAng = Math.PI * 0.75 + rpmRatio * Math.PI * 1.4;
      ctx.strokeStyle = "#d5001c";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(wx, gy);
      ctx.lineTo(wx + Math.cos(rpmAng) * 13, gy + Math.sin(rpmAng) * 13);
      ctx.stroke();

      // Steering wheel (left-hand drive — visible above PCM overlay)
      const wy = ch * 0.77;
      const wr = Math.min(cw * 0.22, 76);
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(curve * 2.2);
      // Spokes & hub
      ctx.strokeStyle = "#191c22";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-wr * 0.92, -4);
      ctx.lineTo(wr * 0.92, -4);
      ctx.moveTo(0, -4);
      ctx.lineTo(0, wr * 0.9);
      ctx.stroke();
      ctx.fillStyle = "#121419";
      ctx.strokeStyle = "rgba(197,160,89,0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Outer rim
      ctx.strokeStyle = "#20242c";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, wr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, wr + 4.5, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
      // 12-o'clock racing yellow centering stripe
      ctx.strokeStyle = "#f5c400";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, -wr - 4.5);
      ctx.lineTo(0, -wr + 4.5);
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    }

    return {
      start() {
        if (running) return;
        running = true;
        lastTs = 0;
        resize();
        rafId = requestAnimationFrame(draw);
      },
      stop() {
        running = false;
        cancelAnimationFrame(rafId);
      },
      get running() {
        return running;
      }
    };
  })();

  function applyPov(mode) {
    povMode = mode;
    const p = POV_PRESETS[mode];
    document.querySelectorAll(".pov-mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.pov === mode));
    $("viewport-hint").hidden = mode !== "cabin360";
    $("cockpit-pcm").hidden = mode === "cabin360"; // keep the interior visible while looking around
    setHud(p.gear, p.speed, p.rpm);
    audio.updateSoundscapeRpm(Math.max(1200, p.rpm));
  }

  function setHud(gear, speed, rpm) {
    $("hud-gear-speed").textContent = gear === "P" ? "P · PARKED" : `${gear} · ${speed} KM/H`;
    $("hud-rpm-readout").textContent = `${rpm.toLocaleString("en-US")} RPM`;
  }

  // --------------------------------------------------------------------------
  // 03 · Chapters, psyche, scenarios
  // --------------------------------------------------------------------------
  function personalize(raw) {
    const paint = getPaint();
    return raw
      .replace(/\{city\}/g, state.city)
      .replace(/\{business\}/g, state.business)
      .replace(/\{partner\}/g, state.partner)
      .replace(/\{model\}/g, getModel().name)
      .replace(/\{color\}/g, paintZh(paint));
  }

  function renderChapters() {
    const chapters = D.timelineChapters;
    const ch = chapters[activeChapterIdx];
    $("ch-freq-badge").textContent = ch.freq;
    $("ch-code-label").textContent = `${ch.code} · ${ch.time}`;
    $("ch-title-label").textContent = ch.title;

    $("chapter-tabs-bar").innerHTML = chapters
      .map((c, i) => `<button data-cidx="${i}" class="${i === activeChapterIdx ? "is-active" : ""}">${c.time.split(" ")[0]}</button>`)
      .join("");
    $("chapter-tabs-bar").querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopChapter();
        activeChapterIdx = Number(btn.dataset.cidx);
        activeLineIdx = 0;
        audio.playTactileClick(760);
        renderChapters();
        $("ch-lines-container").scrollTop = 0;
      });
    });

    $("ch-lines-container").innerHTML = ch.lines
      .map((ln, i) => `<p data-lidx="${i}" class="${i === activeLineIdx ? "is-current" : ""}">${escapeHtml(personalize(ln))}</p>`)
      .join("");
    $("ch-lines-container").querySelectorAll("p").forEach((p) => {
      p.addEventListener("click", () => {
        stopChapter();
        activeLineIdx = Number(p.dataset.lidx);
        highlightLine();
        audio.speak(p.textContent);
      });
    });
  }

  function highlightLine() {
    const box = $("ch-lines-container");
    box.querySelectorAll("p").forEach((p, i) => p.classList.toggle("is-current", i === activeLineIdx));
    const cur = box.querySelector("p.is-current");
    if (cur) box.scrollTo({ top: Math.max(0, cur.offsetTop - 12), behavior: "smooth" });
  }

  let chapterPlaying = false;
  function setPlayButton(playing) {
    chapterPlaying = playing;
    const btn = $("btn-play-chapter");
    btn.querySelector("span").textContent = playing ? "Playing…" : "Play chapter";
  }

  function playChapter() {
    if (chapterPlaying) {
      stopChapter();
      return;
    }
    const ch = D.timelineChapters[activeChapterIdx];
    const token = ++playToken;
    audio.startSoundscape(2200, ch.binauralHz);
    syncSoundscapeButton();
    activeLineIdx = 0;
    setPlayButton(true);
    if (!audio.canSpeak()) toast("此裝置無語音合成，將以字幕方式播放");

    const step = () => {
      if (token !== playToken) return;
      if (activeLineIdx >= ch.lines.length) {
        stopChapter();
        toast("本章節播放完畢");
        return;
      }
      highlightLine();
      const text = personalize(ch.lines[activeLineIdx]);
      let advanced = false;
      const next = () => {
        if (advanced || token !== playToken) return;
        advanced = true;
        setTimeout(() => {
          if (token !== playToken) return;
          activeLineIdx++;
          step();
        }, 1200);
      };
      if (audio.canSpeak()) {
        audio.speak(text, { onEnd: next });
        setTimeout(next, Math.max(7000, text.length * 360));
      } else {
        setTimeout(next, Math.max(2500, text.length * 170));
      }
    };
    step();
  }

  function stopChapter() {
    playToken++;
    audio.stopSpeaking();
    audio.stopSoundscape();
    setPlayButton(false);
    syncSoundscapeButton();
  }

  function renderPsycheCard() {
    const list = D.psycheMatrix;
    const i = psycheIdx % list.length;
    const item = list[i];
    $("psyche-code-text").textContent = item.code.split("（")[0].replace(/\s*\/\/\s*/, " · ");
    $("psyche-index-text").textContent = `${i + 1} / ${list.length}`;
    $("psyche-title-text").textContent = item.title;
    $("psyche-outer-text").textContent = item.outer;
    $("psyche-inner-text").textContent = item.inner;
    $("psyche-old-text").textContent = item.oldScript;
    $("psyche-new-text").textContent = item.newScript;
  }

  function renderScenarioCard() {
    const list = D.scenarios;
    const sc = list[scenarioIdx % list.length];
    $("sc-code-label").textContent = sc.code.replace(/^SCENARIO\s+(\d+)\s*\/\/\s*/, "$1 · ");
    $("sc-prompt-text").textContent = sc.prompt;
    $("sc-analysis-box").hidden = true;
    const box = $("sc-choices-box");
    box.innerHTML = sc.choices.map((c, i) => `<button class="choice" data-choice="${i}">${escapeHtml(c.label)}</button>`).join("");
    box.querySelectorAll(".choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = sc.choices[Number(btn.dataset.choice)];
        box.querySelectorAll(".choice").forEach((b) => b.classList.remove("is-best", "is-weak"));
        btn.classList.add(chosen.optimal ? "is-best" : "is-weak");
        const a = $("sc-analysis-box");
        a.textContent = chosen.analysis;
        a.hidden = false;
        audio.playTactileClick(chosen.optimal ? 980 : 340);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 04 · Signature plate & log
  // --------------------------------------------------------------------------
  const signature = (function () {
    const canvas = $("signature-pad-canvas");
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let hasInk = false;
    let w = 0;
    let h = 0;

    function drawBase() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.font = `600 ${Math.min(20, w / 15)}px -apple-system, Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PORSCHE 911  ·  2029.04.18", w / 2, h / 2);
      hasInk = false;
    }
    function resize() {
      const r = canvas.parentElement.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBase();
    }
    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function start(e) {
      drawing = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    function move(e) {
      if (!drawing) return;
      if (e.cancelable) e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = "#c5a059";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInk = true;
    }
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", () => (drawing = false));
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", () => (drawing = false));
    window.addEventListener("resize", () => activeScreen === "s4" && resize());

    return { resize, clear: drawBase, get hasInk() { return hasInk; } };
  })();

  function renderSigCounter() {
    if (state.sigDate !== todayKey()) {
      state.sigCount = 0;
      state.sigDate = todayKey();
    }
    $("sig-counter-label").textContent = `${pad2(state.sigCount)} / 09`;
  }

  function renderCustodianLogs() {
    $("custodian-log-list").innerHTML = state.logs
      .map(
        (item) => `
        <div class="log-item ${item.tag === "HIGH-LEVERAGE" ? "lev" : ""}">
          <div class="log-meta">${escapeHtml(item.day)} · ${escapeHtml(LOG_TAG_LABELS[item.tag] || item.tag)}</div>
          <div class="log-text">${escapeHtml(item.text)}</div>
        </div>`
      )
      .join("");
  }

  // --------------------------------------------------------------------------
  // Soundscape / standby / strobe
  // --------------------------------------------------------------------------
  function syncSoundscapeButton() {
    const btn = $("btn-toggle-soundscape");
    const on = audio.soundscapeActive;
    btn.querySelector("span").textContent = on ? "Stop audio" : "Start audio";
    btn.classList.toggle("btn-red", !on);
    btn.classList.toggle("btn-light", on);
  }

  function openStandby() {
    openModal("modal-standby");
    if (!audio.soundscapeActive) {
      audio.startSoundscape(1800, 6);
      standbyOwnsAudio = true;
    }
  }
  function closeStandby() {
    closeModal("modal-standby");
    if (standbyOwnsAudio) audio.stopSoundscape();
    standbyOwnsAudio = false;
    syncSoundscapeButton();
  }

  function openStrobe() {
    openModal("modal-strobe");
    let sec = 60;
    let tick = 0;
    clearInterval(strobeTimer);
    $("strobe-countdown").textContent = "60s";
    strobeTimer = setInterval(() => {
      tick++;
      const list = D.affirmations;
      $("strobe-main-line").textContent = list[tick % list.length];
      $("strobe-meta-tag").textContent =
        tick % 2 === 0 ? `2029.04.18 · ${getModel().name.toUpperCase()}` : `DAY ${pad3(getDayNumber())} OF 911 · STUTTGART`;
      if (tick % 2 === 0) {
        sec = Math.max(0, sec - 1);
        $("strobe-countdown").textContent = `${sec}s`;
        audio.playTactileClick(280);
      }
      if (sec <= 0) closeStrobe();
    }, 500);
  }
  function closeStrobe() {
    clearInterval(strobeTimer);
    closeModal("modal-strobe");
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------
  function bindEvents() {
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => {
        audio.playTactileClick(740);
        showScreen(t.dataset.target);
      })
    );

    // Ignition
    $("btn-left-ignition").addEventListener("click", triggerIgnition);
    $("widget-chrono-tap").addEventListener("click", triggerIgnition);

    // Widgets
    $("btn-cycle-widget-tod").addEventListener("click", () => {
      todIdx = (todIdx + 1) % TOD_VIEWS.length;
      applyTod();
      $("widget-daily-affirm").textContent = `「${nextAffirmation()}」`;
      audio.playTactileClick(860);
    });
    $("widget-daily-affirm").addEventListener("click", () => {
      const t = nextAffirmation();
      $("widget-daily-affirm").textContent = `「${t}」`;
      audio.speak(t);
    });
    $("card-standby-launch").addEventListener("click", openStandby);
    $("btn-open-standby").addEventListener("click", openStandby);
    $("btn-close-standby").addEventListener("click", closeStandby);
    $("btn-export-wallpaper").addEventListener("click", () => {
      audio.playTactileClick(940);
      exportLockScreenWallpaper();
    });

    // Fund
    const deposit = () => {
      const input = $("input-fund-delta");
      const val = Number(input.value);
      if (!(val > 0)) {
        toast("請輸入大於 0 的金額");
        return;
      }
      state.allocatedFund += val;
      saveState();
      input.value = "";
      input.blur();
      audio.playTactileClick(1020);
      syncAllTelemetry();
      toast(`已入帳 NT$ ${fmtMoney(val)}`);
    };
    $("btn-deposit-fund").addEventListener("click", deposit);
    $("input-fund-delta").addEventListener("keydown", (e) => e.key === "Enter" && deposit());

    // Covenant
    const flip = $("covenant-flip-card");
    $("btn-flip-to-back").addEventListener("click", () => {
      $("textarea-covenant").value = state.covenantText;
      flip.classList.add("is-flipped");
      audio.playTactileClick(780);
    });
    $("btn-flip-to-front").addEventListener("click", () => flip.classList.remove("is-flipped"));
    $("btn-save-covenant").addEventListener("click", () => {
      const v = $("textarea-covenant").value.trim();
      if (!v) {
        toast("對價承諾不能空白");
        return;
      }
      state.covenantText = v;
      saveState();
      syncAllTelemetry();
      flip.classList.remove("is-flipped");
      audio.playTactileClick(980);
      toast("契約已封存");
    });
    $("btn-speak-covenant").addEventListener("click", () => audio.speak(state.covenantText));

    // Timeline preview
    const sim = $("slider-day-sim");
    sim.addEventListener("input", () => {
      simDayOverride = Number(sim.value);
      selectedStageIndex = null;
      paintRange(sim);
      syncAllTelemetry();
    });
    $("btn-reset-day").addEventListener("click", () => {
      simDayOverride = null;
      selectedStageIndex = null;
      sim.value = realDayNumber();
      paintRange(sim);
      audio.playTactileClick(800);
      syncAllTelemetry();
    });

    // Cockpit
    document.querySelectorAll(".pov-mode-btn").forEach((b) =>
      b.addEventListener("click", () => {
        audio.playTactileClick(780);
        applyPov(b.dataset.pov);
      })
    );
    $("btn-hud-downshift").addEventListener("click", () => {
      const p = POV_PRESETS[povMode];
      const blipRpm = p.gear === "P" ? 4200 : Math.min(8400, p.rpm + 1700);
      const gear = p.gear === "P" ? "P" : `M${Math.max(2, Number(p.gear.slice(1)) - 1)}`;
      setHud(gear, p.speed, blipRpm);
      audio.playRevMatchBlip(blipRpm);
      clearTimeout(hudResetTimer);
      hudResetTimer = setTimeout(() => setHud(p.gear, p.speed, p.rpm), 1100);
    });
    $("btn-speak-pcm-affirm").addEventListener("click", () => {
      const line = nextAffirmation();
      $("pcm-affirm-text").textContent = `「${line}」`;
      audio.speak(line);
    });
    $("btn-toggle-soundscape").addEventListener("click", () => {
      if (audio.soundscapeActive) {
        stopChapter();
      } else {
        audio.startSoundscape(Math.max(1200, POV_PRESETS[povMode].rpm), 6);
        syncSoundscapeButton();
      }
    });
    [
      ["rng-vol-boxer", "lbl-vol-boxer", "boxer"],
      ["rng-vol-rain", "lbl-vol-rain", "rain"],
      ["rng-vol-bin", "lbl-vol-bin", "binaural"]
    ].forEach(([id, lbl, key]) => {
      const el = $(id);
      paintRange(el);
      el.addEventListener("input", () => {
        const v = Number(el.value);
        $(lbl).textContent = `${Math.round(v * 100)}%`;
        paintRange(el);
        audio.updateLevels({ [key]: v });
      });
    });

    // 2029
    $("btn-play-chapter").addEventListener("click", playChapter);
    $("btn-stop-chapter").addEventListener("click", stopChapter);
    $("btn-next-psyche").addEventListener("click", () => {
      psycheIdx++;
      audio.playTactileClick(760);
      renderPsycheCard();
    });
    $("btn-next-scenario").addEventListener("click", () => {
      scenarioIdx++;
      audio.playTactileClick(760);
      renderScenarioCard();
    });

    // Log: voice loop
    $("log-affirm-display").addEventListener("click", () => {
      const t = nextAffirmation();
      $("log-affirm-display").textContent = `「${t}」`;
      audio.speak(t);
    });
    const recBtn = $("btn-rec-voice");
    const loopBtn = $("btn-loop-voice");
    const badge = $("rec-state-badge");
    const audioEl = $("self-voice-audio");
    let nativeRecActive = false;
    let nativeLoopActive = false;
    const hasNativeVoice = () =>
      !!(window.AndroidBridge && typeof window.AndroidBridge.startVoiceRecord === "function");

    if (hasNativeVoice() && window.AndroidBridge.hasVoiceRecord()) {
      loopBtn.disabled = false;
      badge.textContent = "Saved";
    }

    window.__onNativeVoiceState = (status) => {
      if (status === "RECORDING") {
        nativeRecActive = true;
        recBtn.textContent = "Stop";
        badge.textContent = "Recording";
        toast("開始錄音，請朗讀上方肯定句");
      } else if (status === "DENIED") {
        nativeRecActive = false;
        recBtn.textContent = "Record";
        badge.textContent = "Permission needed";
        toast("請允許麥克風權限後再試一次");
      } else if (status === "ERROR") {
        nativeRecActive = false;
        recBtn.textContent = "Record";
        badge.textContent = "Mic error";
        toast("錄音啟動失敗，請再試一次");
      }
    };

    recBtn.addEventListener("click", async () => {
      if (hasNativeVoice()) {
        if (nativeRecActive) {
          const ok = window.AndroidBridge.stopVoiceRecord();
          nativeRecActive = false;
          recBtn.textContent = "Record";
          if (ok) {
            badge.textContent = "Saved";
            loopBtn.disabled = false;
            toast("錄音已儲存，可點擊 Loop 循環播放");
          } else {
            badge.textContent = "Ready";
            toast("錄音時間過短，請再試一次");
          }
          return;
        }
        if (nativeLoopActive) {
          window.AndroidBridge.toggleVoiceLoop();
          nativeLoopActive = false;
          loopBtn.textContent = "Loop";
          audio.stopSoundscape();
          syncSoundscapeButton();
        }
        const status = window.AndroidBridge.startVoiceRecord();
        if (status === "RECORDING") {
          window.__onNativeVoiceState("RECORDING");
        } else if (status === "PERMISSION") {
          badge.textContent = "Requesting mic…";
        } else {
          window.__onNativeVoiceState("ERROR");
        }
        return;
      }

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recBtn.textContent = "Record";
        badge.textContent = "Saved";
        toast("錄音已儲存，可點擊 Loop 循環播放");
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
        badge.textContent = "Mic unavailable";
        toast("此環境不支援錄音（需 HTTPS 或使用手機 App）");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => e.data.size > 0 && audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
          recordedBlobUrl = URL.createObjectURL(new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" }));
          audioEl.src = recordedBlobUrl;
          audioEl.loop = true;
          loopBtn.disabled = false;
          stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorder.start();
        recBtn.textContent = "Stop";
        badge.textContent = "Recording";
      } catch (e) {
        console.warn("Mic error:", e);
        badge.textContent = "Permission needed";
        toast("請允許麥克風權限後再試一次");
      }
    });
    loopBtn.addEventListener("click", () => {
      if (hasNativeVoice()) {
        const st = window.AndroidBridge.toggleVoiceLoop();
        if (st === "LOOPING") {
          nativeLoopActive = true;
          if (!audio.soundscapeActive) audio.startSoundscape(2100, 6);
          loopBtn.textContent = "Pause";
          badge.textContent = "Looping";
        } else {
          nativeLoopActive = false;
          audio.stopSoundscape();
          loopBtn.textContent = "Loop";
          badge.textContent = "Saved";
        }
        syncSoundscapeButton();
        return;
      }
      if (!recordedBlobUrl) return;
      if (audioEl.paused) {
        audioEl.play();
        if (!audio.soundscapeActive) audio.startSoundscape(2100, 6);
        loopBtn.textContent = "Pause";
        badge.textContent = "Looping";
      } else {
        audioEl.pause();
        audio.stopSoundscape();
        loopBtn.textContent = "Loop";
        badge.textContent = "Saved";
      }
      syncSoundscapeButton();
    });
    $("btn-launch-strobe-log").addEventListener("click", openStrobe);
    $("btn-open-strobe").addEventListener("click", openStrobe);
    $("btn-close-strobe").addEventListener("click", closeStrobe);

    // Log: signature
    $("btn-clear-sig").addEventListener("click", () => {
      signature.clear();
      audio.playTactileClick(520);
    });
    $("btn-commit-sig").addEventListener("click", () => {
      renderSigCounter();
      if (state.sigCount >= 9) {
        toast("今日 9 / 9 已完成");
        return;
      }
      if (!signature.hasInk) {
        toast("請先在金屬板上簽名");
        return;
      }
      state.sigCount++;
      saveState();
      renderSigCounter();
      signature.clear();
      audio.playTactileClick(1040);
      if (state.sigCount === 9) toast("今日 369 簽名完成");
    });

    // Log: entries
    const addLog = () => {
      const input = $("input-log-entry");
      const val = input.value.trim();
      if (!val) return;
      state.logs.unshift({ tag: $("log-tag-select").value, day: `DAY ${pad3(getDayNumber())}`, text: val });
      saveState();
      input.value = "";
      audio.playTactileClick(940);
      renderCustodianLogs();
    };
    $("btn-add-log").addEventListener("click", addLog);
    $("input-log-entry").addEventListener("keydown", (e) => e.key === "Enter" && addLog());

    // Spec modal
    const modelSel = $("cfg-model");
    const paintSel = $("cfg-paint");
    modelSel.innerHTML = D.models.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} · ${escapeHtml(m.power)}</option>`).join("");
    paintSel.innerHTML = D.paints.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    modelSel.addEventListener("change", () => {
      const m = D.models.find((x) => x.id === modelSel.value);
      if (m) $("cfg-price").value = m.defaultPrice;
    });
    const openSpec = () => {
      modelSel.value = state.modelId;
      paintSel.value = state.paintId;
      $("cfg-price").value = state.targetPrice;
      $("cfg-city").value = state.city;
      $("cfg-business").value = state.business;
      openModal("modal-spec");
    };
    $("btn-open-spec-modal").addEventListener("click", openSpec);
    $("btn-mobile-spec").addEventListener("click", openSpec);
    $("btn-close-spec").addEventListener("click", () => closeModal("modal-spec"));
    $("btn-save-spec").addEventListener("click", () => {
      state.modelId = modelSel.value;
      state.paintId = paintSel.value;
      state.targetPrice = Math.max(100000, Number($("cfg-price").value) || 7800000);
      state.city = $("cfg-city").value.trim() || "台北信義區";
      state.business = $("cfg-business").value.trim() || "高槓桿事業";
      saveState();
      syncAllTelemetry();
      renderChapters();
      closeModal("modal-spec");
      audio.playRevMatchBlip(6400);
      toast("配置已套用");
    });

    // Reality check modal
    $("btn-huberman-protocol").addEventListener("click", () => {
      openModal("modal-huberman");
      audio.playTactileClick(380);
    });
    $("btn-close-huberman").addEventListener("click", () => closeModal("modal-huberman"));
    $("btn-commit-huberman").addEventListener("click", () => {
      const input = $("input-huberman-act");
      const act = input.value.trim();
      if (!act) {
        toast("先寫下一個 15 分鐘的動作");
        return;
      }
      state.logs.unshift({ tag: "HIGH-LEVERAGE", day: `DAY ${pad3(getDayNumber())}`, text: `[15-MIN] ${act}` });
      saveState();
      input.value = "";
      renderCustodianLogs();
      closeModal("modal-huberman");
      audio.playRevMatchBlip(7200);
      toast("已記錄，現在就開始");
    });

    // Tap outside a sheet to close it
    ["modal-spec", "modal-huberman"].forEach((id) =>
      $(id).addEventListener("click", (e) => e.target.id === id && closeModal(id))
    );

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cockpit.stop();
      } else {
        syncAllTelemetry();
        if (activeScreen === "s2") cockpit.start();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------
  function boot() {
    buildSegments();
    bindEvents();

    const hour = new Date().getHours();
    todIdx = hour >= 5 && hour < 11 ? 0 : hour >= 11 && hour < 17 ? 1 : 2;
    affirmIdx = Math.floor(Date.now() / (6 * 3600 * 1000)) % D.affirmations.length;
    applyTod();
    $("widget-daily-affirm").textContent = `「${D.affirmations[affirmIdx]}」`;

    const sim = $("slider-day-sim");
    sim.value = realDayNumber();
    paintRange(sim);

    applyPov("night");
    syncAllTelemetry();
    renderChapters();
    renderPsycheCard();
    renderScenarioCard();
    renderSigCounter();
    renderCustodianLogs();
    syncSoundscapeButton();

    setInterval(() => updateTicker(false), 100);
    setInterval(syncAllTelemetry, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
