// js/attendance.js – Attendance Scanner, Check‑In Engine & Manual Override
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns all QR scanning, attendance verification, and
// check‑in state mutations. Follows ECC zero‑truncation protocols.

import StorageService from "./storage.js";
import { formatDate } from "./utils.js";

// ─── DOM IDs ──────────────────────────────────────────────────────────────
// Scanner tab (inline page)
const SCANNER_VIEW_ID = "scanner-view";
const SCANNER_EMPTY_ID = "scanner-empty";
const READER_ID = "reader";
const SCAN_TOAST_ID = "scan-toast";
const SCAN_TOAST_MESSAGE_ID = "scan-toast-message";

// Scanner dialog (modal)
const SCANNER_DIALOG_ID = "scanner-dialog";
const BTN_STOP_SCANNER_DIALOG_ID = "btn-stop-scanner-dialog";
const BTN_CLOSE_SCANNER_ID = "btn-close-scanner";
const SCAN_TOAST_DIALOG_ID = "scan-toast-dialog";
const SCAN_TOAST_DIALOG_MESSAGE_ID = "scan-toast-dialog-message";

// Manual check‑in elements (inside scanner dialog)
const MANUAL_SEARCH_INPUT_ID = "manual-checkin-search";
const BTN_MANUAL_CHECKIN_ID = "btn-manual-checkin";
const BTN_MANUAL_ABSENT_ID = "btn-manual-absent";
const SCANNER_EVENT_SELECT_ID = "scanner-event-select";

// Roster tab
const ROSTER_TABLE_BODY_ID = "roster-table-body";
const ROSTER_EMPTY_ID = "roster-empty";
const ROSTER_LIST_ID = "roster-list";

// Roster filter toolbar
const ROSTER_FILTER_TOOLBAR_ID = "roster-filter-toolbar";
const ROSTER_SEARCH_INPUT_ID = "roster-search-input";
const ROSTER_EVENT_FILTER_ID = "roster-event-filter";
const ROSTER_STATUS_FILTER_ID = "roster-status-filter";

// Live check‑in feed (scanner override table)
const OVERRIDE_TABLE_BODY_ID = "scanner-override-body";

// ─── Cached DOM references (resolved lazily to survive late injection) ────
let btnStartScanner = null;
let btnStopScanner = null;
let scannerView = null;
let scannerEmpty = null;
let scanToast = null;
let scanToastMessage = null;

let scannerDialog = null;
let btnStopScannerDialog = null;
let btnCloseScanner = null;
let scanToastDialog = null;
let scanToastDialogMessage = null;

let manualSearchInput = null;
let btnManualCheckin = null;
let btnManualAbsent = null;
let scannerEventSelect = null;
let overrideTableBody = null;

let rosterTableBody = null;
let rosterEmpty = null;
let rosterList = null;

// Roster filter toolbar refs
let rosterFilterToolbar = null;
let rosterSearchInput = null;
let rosterEventFilter = null;
let rosterStatusFilter = null;

// Roster filter state
let rosterFilterState = { query: "", eventId: "", status: "" };

const resolveRefs = () => {
  btnStartScanner = document.getElementById("btn-start-scanner");
  btnStopScanner = document.getElementById("btn-stop-scanner");
  scannerView = document.getElementById(SCANNER_VIEW_ID);
  scannerEmpty = document.getElementById(SCANNER_EMPTY_ID);
  scanToast = document.getElementById(SCAN_TOAST_ID);
  scanToastMessage = document.getElementById(SCAN_TOAST_MESSAGE_ID);

  scannerDialog = document.getElementById(SCANNER_DIALOG_ID);
  btnStopScannerDialog = document.getElementById(BTN_STOP_SCANNER_DIALOG_ID);
  btnCloseScanner = document.getElementById(BTN_CLOSE_SCANNER_ID);
  scanToastDialog = document.getElementById(SCAN_TOAST_DIALOG_ID);
  scanToastDialogMessage = document.getElementById(SCAN_TOAST_DIALOG_MESSAGE_ID);

  manualSearchInput = document.getElementById(MANUAL_SEARCH_INPUT_ID);
  btnManualCheckin = document.getElementById(BTN_MANUAL_CHECKIN_ID);
  btnManualAbsent = document.getElementById(BTN_MANUAL_ABSENT_ID);
  scannerEventSelect = document.getElementById(SCANNER_EVENT_SELECT_ID);
  overrideTableBody = document.getElementById(OVERRIDE_TABLE_BODY_ID);

  rosterTableBody = document.getElementById(ROSTER_TABLE_BODY_ID);
  rosterEmpty = document.getElementById(ROSTER_EMPTY_ID);
  rosterList = document.getElementById(ROSTER_LIST_ID);

  rosterFilterToolbar = document.getElementById(ROSTER_FILTER_TOOLBAR_ID);
  rosterSearchInput = document.getElementById(ROSTER_SEARCH_INPUT_ID);
  rosterEventFilter = document.getElementById(ROSTER_EVENT_FILTER_ID);
  rosterStatusFilter = document.getElementById(ROSTER_STATUS_FILTER_ID);
  scannerEventSelect = document.getElementById(SCANNER_EVENT_SELECT_ID);
};

// Resolve once at module load
resolveRefs();

// ─── Scanner state ────────────────────────────────────────────────────────
let html5QrCode = null;
let fallbackStream = null;
let fallbackTimer = null;
let scannerRunning = false;
let scanCooldown = false; // prevents rapid duplicate scans
let currentFacingMode = "environment"; // "environment" (rear) or "user" (selfie)


// ─── Audio feedback ───────────────────────────────────────────────────────
/**
 * Play a success chime. Attempts to load assets/beep.mp3 first; falls back
 * to a Web Audio API oscillator tone (880 Hz sine, 150 ms) if the file is
 * missing or the browser blocks playback.
 */
const playChime = () => {
  try {
    const audio = new Audio("assets/beep.mp3");
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => playFallbackTone());
    }
  } catch (_err) {
    playFallbackTone();
  }
};

const playFallbackTone = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
    // Clean up AudioContext after tone ends
    setTimeout(() => {
      try { ctx.close(); } catch (_e) { /* noop */ }
    }, 300);
  } catch (_err) {
    // Audio not available — silent fallback
  }
};

// ─── Toast helpers ────────────────────────────────────────────────────────
/**
 * Show a transient toast inside the scanner section/dialog.
 * @param {string} message
 * @param {"success"|"warning"|"error"} type
 */
const showScanToast = (message, type) => {
  [
    { el: scanToast, msgEl: scanToastMessage },
    { el: scanToastDialog, msgEl: scanToastDialogMessage },
  ].forEach(({ el, msgEl }) => {
    if (!el || !msgEl) return;
    msgEl.textContent = message;
    el.className = "scan-toast scan-toast--" + type;
    el.hidden = false;
    const iconSpan = el.querySelector(".toast-icon");
    if (iconSpan) {
      iconSpan.textContent = type === "success" ? "✔" : type === "warning" ? "⚠" : "✖";
    }
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.hidden = true; }, 4000);
  });

  // Also push to the app‑wide toast if available
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
  }
};

// ─── Core verification engine ─────────────────────────────────────────────
/**
 * Attempt to check in a student given a decoded QR payload string.
 * Optionally rejects scans whose QR eventId does not match targetEventId
 * (cross-event rejection).
 * @param {string} rawText - Raw QR code text (expected JSON).
 * @param {string} [targetEventId] - Optional event id the scanned ticket must belong to.
 * @returns {{ ok: boolean, type: string, message: string }}
 */
const processQrPayload = (rawText, targetEventId) => {
  // 1. Safe JSON parse
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (_err) {
    return { ok: false, type: "error", message: "Invalid QR code — could not parse data." };
  }

  // 2. Validate required fields
  const { regId, eventId, studentId, name } = payload;
  if (!regId || !eventId || !studentId) {
    return { ok: false, type: "error", message: "Malformed QR payload — missing required fields." };
  }

  const ev = StorageService.getEventById(eventId);
  if (ev && ev.status === "Cancelled") {
    return { ok: false, type: "error", message: `Cannot check in: Event "${ev.title}" is Cancelled.` };
  }

  // Security hash validation if payload includes registrationHash
  const rawKey = `${eventId}:${studentId}:${regId}`;
  let hash = 0;
  for (let i = 0; i < rawKey.length; i++) {
    hash = (hash << 5) - hash + rawKey.charCodeAt(i);
    hash |= 0;
  }
  const expectedHash = "H" + Math.abs(hash).toString(16).toUpperCase();
  if (payload.registrationHash && payload.registrationHash !== expectedHash) {
    return { ok: false, type: "error", message: "Invalid QR code — security hash mismatch." };
  }

  // Cross-event rejection: ticket belongs to a different event than the target.
  if (targetEventId && eventId !== targetEventId) {
    return {
      ok: false,
      type: "error",
      message: `Ticket is for a different event (${eventId}). Expected ${targetEventId}.`,
    };
  }

  // 3. Look up the registration record
  const allRegs = StorageService.getRegistrations();
  const regIndex = allRegs.findIndex(
    (r) => r.regId === regId && r.eventId === eventId && r.studentId === studentId
  );

  if (regIndex === -1) {
    return {
      ok: false,
      type: "error",
      message: `No matching registration found for ${regId} / Student ${studentId}.`,
    };
  }

  const reg = allRegs[regIndex];

  if (reg.status === "Cancelled" || reg.attendance?.status === "Cancelled") {
    return {
      ok: false,
      type: "error",
      message: `Cannot check in: Registration ${regId} is Cancelled.`,
    };
  }

  // 4. Duplicate check — already marked Present (dual state for consistency)
  if (reg.status === "Present" || reg.attendance?.status === "Present") {
    const rawTs = reg.checkInTime || reg.attendance?.checkInTime;
    const ts = rawTs ? formatDate(rawTs) : "—";
    return {
      ok: false,
      type: "warning",
      message: `Already Marked Present (Checked in at ${ts}). Duplicate scan ignored.`,
    };
  }

  // 5. Mark as Present with timestamp (dual state for cross-module consistency)
  const checkInTime = new Date().toISOString();
  allRegs[regIndex].status = "Present";
  allRegs[regIndex].checkInTime = checkInTime;
  allRegs[regIndex].attendance = { status: "Present", checkInTime };
  StorageService.saveRegistrations(allRegs);

  // Prepend entry to the live check‑in feed
  renderLiveCheckinFeed();

  return {
    ok: true,
    type: "success",
    message: `✔ ${name || reg.name} (${studentId}) checked in for ${eventId}.`,
  };
};

/**
 * Mark attendance for registrations matching a query (Student ID / Reg ID /
 * name, or a pasted full QR JSON payload). Supports both Present and Absent
 * targets. Optionally scopes matching to targetEventId.
 * Zero-truncation: only the targeted records' status/checkInTime change;
 * every other field is preserved.
 * @param {string} query - Student ID, Reg ID, name, or raw QR JSON text.
 * @param {"Present"|"Absent"} targetStatus
 * @param {string} [targetEventId] - Optional event id scope for matching.
 * @returns {{ ok: boolean, type: string, message: string }}
 */
const markStudentAttendance = (query, targetStatus, targetEventId) => {
  if (targetEventId) {
    const ev = StorageService.getEventById(targetEventId);
    if (ev && ev.status === "Cancelled") {
      return { ok: false, type: "error", message: `Cannot mark attendance: Event "${ev.title}" is Cancelled.` };
    }
  }

  if (!query || query.trim() === "") {
    return {
      ok: false,
      type: "error",
      message: `Please enter a Student ID, Registration ID, name, or QR payload to mark ${targetStatus}.`,
    };
  }

  const raw = query.trim();

  // Support pasting a full QR JSON payload: parse and resolve by regId/eventId/studentId.
  let resolvedRegId = null;
  let resolvedEventId = null;
  let resolvedStudentId = null;

  if (raw.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      return { ok: false, type: "error", message: "Invalid QR code — could not parse data." };
    }
    if (!parsed || !parsed.regId || !parsed.eventId || !parsed.studentId) {
      return { ok: false, type: "error", message: "Invalid QR code — could not parse data." };
    }
    if (parsed.registrationHash) {
      const rawKey = `${parsed.eventId}:${parsed.studentId}:${parsed.regId}`;
      let hash = 0;
      for (let i = 0; i < rawKey.length; i++) {
        hash = (hash << 5) - hash + rawKey.charCodeAt(i);
        hash |= 0;
      }
      const expectedHash = "H" + Math.abs(hash).toString(16).toUpperCase();
      if (parsed.registrationHash !== expectedHash) {
        return { ok: false, type: "error", message: "Invalid QR code — security hash mismatch." };
      }
    }
    resolvedRegId = parsed.regId;
    resolvedEventId = parsed.eventId;
    resolvedStudentId = parsed.studentId;

    // Route Pasted QR JSON Through processQrPayload in markStudentAttendance
    if (targetStatus === "Present") {
      const res = processQrPayload(raw, targetEventId || undefined);
      if (res.ok) {
        renderRoster();
        window.app?.renderDashboardStats?.();
        window.app?.renderHistory?.();
        window.RegistrationModule?.renderPasses?.();
        window.EventsModule?.render?.();
        window.ReportsModule?.renderCharts?.();
        window.app?.updateProfileChip?.(StorageService.getActiveRole() || "admin");
      }
      return res;
    }
  }

  const allRegs = StorageService.getRegistrations();

  // Cross-event rejection for Absent status when JSON contains eventId
  if (targetStatus === "Absent" && resolvedEventId) {
    if (targetEventId && resolvedEventId !== targetEventId) {
      return {
        ok: false,
        type: "error",
        message: `Ticket is for a different event (${resolvedEventId}). Expected ${targetEventId}.`,
      };
    }
  }

  const matches = allRegs.filter((r) => {
    // If a QR payload resolved to specific ids, match exactly those.
    if (resolvedRegId && resolvedEventId && resolvedStudentId) {
      return (
        r.regId === resolvedRegId &&
        r.eventId === resolvedEventId &&
        r.studentId === resolvedStudentId
      );
    }
    const term = raw.toLowerCase();
    const byId =
      r.studentId.toLowerCase() === term ||
      r.regId.toLowerCase() === term ||
      (r.name && r.name.toLowerCase() === term);
    // Honor event scope when a target event is set.
    if (targetEventId && r.eventId !== targetEventId) return false;
    return byId;
  });

  if (matches.length === 0) {
    return {
      ok: false,
      type: "error",
      message: `No registration found matching "${raw}".`,
    };
  }

  // Dual-state consistency helpers
  const isRegPresent = (r) => r.status === "Present" || r.attendance?.status === "Present";
  const isRegAbsent = (r) => r.status === "Absent" || r.attendance?.status === "Absent";
  const isCancelled = (r) =>
    r.status === "Cancelled" ||
    r.attendance?.status === "Cancelled" ||
    StorageService.getEventById(r.eventId)?.status === "Cancelled";

  if (matches.every(isCancelled)) {
    return {
      ok: false,
      type: "error",
      message: "Cannot mark attendance: Event or registration is Cancelled.",
    };
  }

  // When checking in by plain ID/Roll No. and all matching records are already Present, include timestamp
  if (targetStatus === "Present" && matches.every(isRegPresent)) {
    const firstTs = matches[0].checkInTime || matches[0].attendance?.checkInTime;
    return {
      ok: false,
      type: "warning",
      message: `Already Marked Present at ${firstTs ? formatDate(firstTs) : "—"}. Duplicate check-in ignored.`,
    };
  }

  const now = new Date().toISOString();
  let changed = 0;
  let skipped = 0;
  matches.forEach((match) => {
    const idx = allRegs.findIndex((r) => r.regId === match.regId);
    if (idx === -1) return;
    const reg = allRegs[idx];

    // Skip records if cancelled
    if (isCancelled(reg)) {
      skipped++;
      return;
    }

    // Skip records already at the target status.
    if (targetStatus === "Present" && isRegPresent(reg)) {
      skipped++;
      return;
    }
    if (targetStatus === "Absent" && isRegAbsent(reg)) {
      skipped++;
      return;
    }

    reg.status = targetStatus;
    reg.checkInTime = targetStatus === "Present" ? now : null;
    if (targetStatus === "Absent") {
      reg.updatedAt = now;
    }
    reg.attendance = {
      status: targetStatus,
      checkInTime: targetStatus === "Present" ? now : null,
    };
    changed++;
  });

  StorageService.saveRegistrations(allRegs);
  renderLiveCheckinFeed();
  renderRoster();

  // Synchronize Student ⇄ Admin state mutations across all views.
  window.app?.renderDashboardStats?.();
  window.app?.renderHistory?.();
  window.RegistrationModule?.renderPasses?.();
  window.EventsModule?.render?.();
  window.ReportsModule?.renderCharts?.();
  window.app?.updateProfileChip?.(StorageService.getActiveRole() || "admin");

  const statusWord = targetStatus === "Present" ? "checked in" : "marked absent";
  if (changed > 0 && skipped > 0) {
    return {
      ok: true,
      type: "success",
      message: `✔ ${changed} registration(s) ${statusWord}; ${skipped} already at that status.`,
    };
  }
  if (changed > 0) {
    return {
      ok: true,
      type: "success",
      message: `✔ ${changed} registration(s) ${statusWord}.`,
    };
  }
  return {
    ok: false,
    type: "warning",
    message: `All ${skipped} matching registration(s) already ${statusWord}.`,
  };
};

/**
 * Process a manual check‑in search query (Student ID or Reg ID).
 * Checks in ALL matching "Registered" records for the given identifier.
 * @param {string} query
 * @returns {{ ok: boolean, type: string, message: string }}
 */
const manualCheckIn = (query, targetEventId) => {
  return markStudentAttendance(query, "Present", targetEventId);
};

// ─── QR Scanner lifecycle ─────────────────────────────────────────────────
/**
 * Start the QR camera scanner inside `<div id="reader">`.
 * Unhides `#scanner-view` BEFORE initializing the camera so `#reader` has
 * non-zero 480x360 layout dimensions. Falls back to native getUserMedia +
 * BarcodeDetector when `Html5Qrcode` is unavailable offline.
 */
const startScanner = async (facingMode) => {
  if (scannerRunning) return;

  resolveRefs();
  const readerEl = document.getElementById(READER_ID);
  if (!readerEl) {
    showScanToast("Scanner viewport not found in the DOM.", "error");
    return;
  }

  if (typeof facingMode === "string" && (facingMode === "environment" || facingMode === "user")) {
    currentFacingMode = facingMode;
  }

  // Unhide viewport first and clear any placeholder text so the video frame
  // mounts with full 480x360 dimensions at the top of #reader.
  readerEl.innerHTML = "";
  updateScannerUI(true);

  try {
    // Tier 1: Html5Qrcode library (local vendor or CDN)
    if (typeof Html5Qrcode !== "undefined") {
      html5QrCode = new Html5Qrcode(READER_ID);
      await html5QrCode.start(
        { facingMode: currentFacingMode },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onScanSuccess,
        onScanFailure
      );
      scannerRunning = true;
      updateScannerUI(true);
      return;
    }

    // Tier 2: Native browser getUserMedia + BarcodeDetector offline fallback
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error("Camera API is not supported in this browser.");
    }

    fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false,
    });

    const videoEl = document.createElement("video");
    videoEl.setAttribute("autoplay", "");
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("muted", "");
    videoEl.muted = true;
    videoEl.style.cssText = "width:100%; height:100%; object-fit:cover; display:block;";
    videoEl.srcObject = fallbackStream;
    readerEl.appendChild(videoEl);
    await videoEl.play();

    scannerRunning = true;
    updateScannerUI(true);

    if ("BarcodeDetector" in window) {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      fallbackTimer = setInterval(async () => {
        if (!scannerRunning || videoEl.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            onScanSuccess(barcodes[0].rawValue, barcodes[0]);
          }
        } catch (_detectErr) {
          // Ignore transient frame decode errors
        }
      }, 350);
    }
  } catch (err) {
    console.error("[AttendanceModule] Camera start error:", err);
    await stopScanner();
    let msg = "Could not access camera.";
    const errText = typeof err === "string" ? err : err?.name || err?.message || "";
    if (/NotAllowedError|Permission/i.test(errText)) {
      msg = "Camera permission denied. Please allow camera access in your browser settings.";
    } else if (/NotFoundError|DevicesNotFound/i.test(errText)) {
      msg = "No camera found on this device.";
    } else if (err?.message) {
      msg = err.message;
    }
    showScanToast(msg, "error");
  }
};

/**
 * Stop the running scanner (Html5Qrcode or native getUserMedia fallback) gracefully.
 */
const stopScanner = async () => {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  if (fallbackStream) {
    try {
      fallbackStream.getTracks().forEach((track) => track.stop());
    } catch (_err) {}
    fallbackStream = null;
  }
  if (html5QrCode) {
    try {
      if (scannerRunning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
    } catch (err) {
      console.warn("[AttendanceModule] Scanner stop warning:", err);
    }
    html5QrCode = null;
  }
  const readerEl = document.getElementById(READER_ID);
  if (readerEl) {
    readerEl.innerHTML = "";
  }
  scannerRunning = false;
  updateScannerUI(false);
};

/**
 * Toggle scanner buttons & viewport visibility.
 * @param {boolean} running
 */
const updateScannerUI = (running) => {
  resolveRefs();
  if (btnStartScanner) btnStartScanner.disabled = running;
  if (btnStopScanner) btnStopScanner.disabled = !running;
  const toggleBtn = document.getElementById("btn-camera-toggle");
  if (toggleBtn) toggleBtn.disabled = !running;
  if (scannerView) {
    scannerView.hidden = !running;
    scannerView.style.display = running ? "block" : "none";
  }
  if (scannerEmpty) {
    scannerEmpty.hidden = running;
    scannerEmpty.style.display = running ? "none" : "";
  }
};

// ─── QR decode callbacks ──────────────────────────────────────────────────
/**
 * Fired each time a QR code is successfully decoded.
 * @param {string} decodedText
 * @param {object} _decodedResult
 */
const onScanSuccess = (decodedText, _decodedResult) => {
  // Cooldown prevents rapid repeat processing of the same code
  if (scanCooldown) return;
  scanCooldown = true;
  setTimeout(() => { scanCooldown = false; }, 2000);

  const targetEventId = scannerEventSelect ? scannerEventSelect.value : "";
  const result = processQrPayload(decodedText, targetEventId || undefined);
  showScanToast(result.message, result.type);

  if (result.ok) {
    playChime();
    renderLiveCheckinFeed();
    renderRoster();
    // Synchronize Student ⇄ Admin state mutations across all views.
    window.app?.renderDashboardStats?.();
    window.app?.renderHistory?.();
    window.RegistrationModule?.renderPasses?.();
    window.EventsModule?.render?.();
    window.ReportsModule?.renderCharts?.();
  }
};

/**
 * Fired on each frame where no QR code was detected (expected, no action needed).
 * @param {string} _errorMessage
 */
const onScanFailure = (_errorMessage) => {
  // Intentionally silent — continuous scanning produces this on most frames
};

// ─── Live check‑in feed (scanner override table) ──────────────────────────
/**
 * Render the most recent check‑ins into the scanner dialog's override table.
 * Prepends the latest entries so the most recent is on top.
 */
const renderLiveCheckinFeed = () => {
  if (!overrideTableBody) return;
  const regs = StorageService.getRegistrations();
  const verified = regs
    .filter((r) => {
      const ev = StorageService.getEventById(r.eventId);
      if (
        r.status === "Cancelled" ||
        r.attendance?.status === "Cancelled" ||
        ev?.status === "Cancelled"
      ) {
        return false;
      }
      const st = r.attendance?.status || r.status;
      return st === "Present" || st === "Absent";
    })
    .sort((a, b) => {
      const tsA = a.checkInTime || a.attendance?.checkInTime || a.updatedAt || a.registeredAt || 0;
      const tsB = b.checkInTime || b.attendance?.checkInTime || b.updatedAt || b.registeredAt || 0;
      return new Date(tsB) - new Date(tsA);
    });

  overrideTableBody.innerHTML = "";
  verified.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    const isPresent = reg.status === "Present" || reg.attendance?.status === "Present";
    const ts = reg.checkInTime || reg.attendance?.checkInTime || reg.updatedAt;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(reg.name)}</td>` +
      `<td>${escapeHtml(reg.studentId)}</td>` +
      `<td>${event ? escapeHtml(event.title) : escapeHtml(reg.eventId)}</td>` +
      `<td><span class="badge ${isPresent ? "badge--success" : "badge--absent"}">${isPresent ? "Present" : "Absent"}</span></td>` +
      `<td>${ts ? formatDate(ts) : "—"}</td>`;
    overrideTableBody.appendChild(tr);
  });
};

// ─── Roster filter toolbar ────────────────────────────────────────────────

/**
 * Inject the .filter-toolbar above #roster-list when it is not already
 * present in the DOM. Contains: search input, event filter dropdown,
 * status filter dropdown. Safe to call repeatedly (idempotent).
 */
const ensureFilterToolbar = () => {
  if (!rosterList) return;
  if (rosterFilterToolbar) return;

  const toolbar = document.createElement("div");
  toolbar.id = ROSTER_FILTER_TOOLBAR_ID;
  toolbar.className = "filter-toolbar";
  toolbar.setAttribute("aria-label", "Filter registrant roster");

  // 1. Search input
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "Search";
  searchLabel.style.cssText = "font-size: var(--font-xs); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap;";
  const searchInput = document.createElement("input");
  searchInput.id = ROSTER_SEARCH_INPUT_ID;
  searchInput.type = "text";
  searchInput.placeholder = "Student Name, Roll No., Registration ID";
  searchInput.className = "filter-input";
  searchInput.style.cssText =
    "padding: var(--space-xs) var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 220px;";

  // 2. Event filter dropdown
  const eventLabel = document.createElement("label");
  eventLabel.textContent = "Event";
  eventLabel.style.cssText = "font-size: var(--font-xs); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap;";
  const eventSelect = document.createElement("select");
  eventSelect.id = ROSTER_EVENT_FILTER_ID;
  eventSelect.className = "filter-select";
  eventSelect.style.cssText =
    "padding: var(--space-xs) var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 170px;";
  const allEventsOpt = document.createElement("option");
  allEventsOpt.value = "";
  allEventsOpt.textContent = "All Events";
  eventSelect.appendChild(allEventsOpt);

  // 3. Status filter dropdown
  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Status";
  statusLabel.style.cssText = "font-size: var(--font-xs); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap;";
  const statusSelect = document.createElement("select");
  statusSelect.id = ROSTER_STATUS_FILTER_ID;
  statusSelect.className = "filter-select";
  statusSelect.style.cssText =
    "padding: var(--space-xs) var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 150px;";
  const allStatusOpt = document.createElement("option");
  allStatusOpt.value = "";
  allStatusOpt.textContent = "All Statuses";
  statusSelect.appendChild(allStatusOpt);
  const presentOpt = document.createElement("option");
  presentOpt.value = "Present";
  presentOpt.textContent = "Present";
  statusSelect.appendChild(presentOpt);
  const registeredOpt = document.createElement("option");
  registeredOpt.value = "Registered";
  registeredOpt.textContent = "Registered";
  statusSelect.appendChild(registeredOpt);
  const absentOpt = document.createElement("option");
  absentOpt.value = "Absent";
  absentOpt.textContent = "Absent";
  statusSelect.appendChild(absentOpt);
  const cancelledOpt = document.createElement("option");
  cancelledOpt.value = "Cancelled";
  cancelledOpt.textContent = "Cancelled";
  statusSelect.appendChild(cancelledOpt);

  toolbar.appendChild(searchLabel);
  toolbar.appendChild(searchInput);
  toolbar.appendChild(document.createTextNode(" "));
  toolbar.appendChild(eventLabel);
  toolbar.appendChild(eventSelect);
  toolbar.appendChild(document.createTextNode(" "));
  toolbar.appendChild(statusLabel);
  toolbar.appendChild(statusSelect);

  const parent = rosterList.parentElement;
  if (parent) {
    parent.insertBefore(toolbar, rosterList);
  }

  // Refresh refs after injection
  resolveRefs();

  // Wire filter events
  searchInput.addEventListener("input", (e) => {
    rosterFilterState.query = e.target.value;
    renderRoster();
  });
  eventSelect.addEventListener("change", (e) => {
    rosterFilterState.eventId = e.target.value;
    renderRoster();
  });
  statusSelect.addEventListener("change", (e) => {
    rosterFilterState.status = e.target.value;
    renderRoster();
  });
};

/**
 * Apply current filter state to the full registration list.
 * Filters by: search (name / studentId / regId), eventId, status.
 * @returns {Array} filtered registrations
 */
const applyRosterFilters = (regs) => {
  const { query, eventId, status } = rosterFilterState;
  const term = query.toLowerCase().trim();
  return regs.filter((reg) => {
    if (eventId && reg.eventId !== eventId) return false;
    // Dual-state consistency: check both top-level and nested attendance status
    if (status) {
      const ev = StorageService.getEventById(reg.eventId);
      const isCancelled =
        reg.status === "Cancelled" ||
        reg.attendance?.status === "Cancelled" ||
        ev?.status === "Cancelled";
      const isPresent = !isCancelled && (reg.status === "Present" || reg.attendance?.status === "Present");
      const isAbsent = !isCancelled && (reg.status === "Absent" || reg.attendance?.status === "Absent");
      let effectiveStatus;
      if (isCancelled) effectiveStatus = "Cancelled";
      else if (isPresent) effectiveStatus = "Present";
      else if (isAbsent) effectiveStatus = "Absent";
      else effectiveStatus = "Registered";
      if (effectiveStatus !== status) return false;
    }
    if (term) {
      const haystack = [
        reg.name || "",
        reg.studentId || "",
        reg.regId || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
};

/**
 * Populate the event filter dropdown with options for all known events.
 */
const populateEventFilter = () => {
  if (!rosterEventFilter) return;
  const desiredValue = rosterFilterState.eventId || rosterEventFilter.value || "";
  const events = StorageService.getEvents();
  rosterEventFilter.innerHTML = '<option value="">All Events</option>';
  events.forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.title} (${ev.id})`;
    rosterEventFilter.appendChild(opt);
  });
  const validIds = events.map((ev) => ev.id);
  if (desiredValue && validIds.includes(desiredValue)) {
    rosterEventFilter.value = desiredValue;
  } else {
    rosterFilterState.eventId = "";
    rosterEventFilter.value = "";
  }
};

/**
 * Populate the scanner manual check-in "Target Event" dropdown with all known events.
 * Defensive: no-op when the select element is not in the DOM.
 */
const populateScannerEventSelect = () => {
  if (!scannerEventSelect) return;
  const desiredValue = scannerEventSelect.value || "";
  const events = StorageService.getEvents();
  scannerEventSelect.innerHTML = '<option value="">All Events</option>';
  events.forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.title} (${ev.id})`;
    scannerEventSelect.appendChild(opt);
  });
  const validIds = events.map((ev) => ev.id);
  if (desiredValue && validIds.includes(desiredValue)) {
    scannerEventSelect.value = desiredValue;
  } else {
    scannerEventSelect.value = "";
  }
};

/**
 * Populate the Registrant Roster admin table with full registration data,
 * honoring the current filter state (search / event / status).
 */
const renderRoster = () => {
  ensureFilterToolbar();
  populateEventFilter();
  populateScannerEventSelect();

  if (!rosterTableBody) return;
  const allRegs = StorageService.getRegistrations();
  const regs = applyRosterFilters(allRegs);

  const rosterListEl = rosterList;
  const rosterEmptyEl = rosterEmpty;
  const rosterFilterToolbarEl = rosterFilterToolbar;

  // Distinguish empty database from empty filter match
  if (allRegs.length === 0) {
    // No registrations exist at all: show generic empty state, hide list + toolbar
    if (rosterEmptyEl) rosterEmptyEl.hidden = false;
    if (rosterListEl) rosterListEl.hidden = true;
    if (rosterFilterToolbarEl) rosterFilterToolbarEl.hidden = true;
    rosterTableBody.innerHTML = "";
    return;
  }

  // Registrations exist: show list + toolbar, hide generic empty state
  if (rosterEmptyEl) rosterEmptyEl.hidden = true;
  if (rosterListEl) rosterListEl.hidden = false;
  if (rosterFilterToolbarEl) rosterFilterToolbarEl.hidden = false;

  if (regs.length === 0) {
    // Registrations exist but none match current search/filter criteria
    rosterTableBody.innerHTML = "";
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="9" style="text-align:center; padding: var(--space-lg); color: var(--color-text-muted);">No registrations match the current search or filter criteria.</td>';
    rosterTableBody.appendChild(tr);
    return;
  }

  rosterTableBody.innerHTML = "";
  regs.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    // Dual-state consistency: check both top-level and nested attendance status
    const isCancelled =
      reg.status === "Cancelled" ||
      reg.attendance?.status === "Cancelled" ||
      event?.status === "Cancelled";
    const isPresent = !isCancelled && (reg.status === "Present" || reg.attendance?.status === "Present");
    const isAbsent = !isCancelled && (reg.status === "Absent" || reg.attendance?.status === "Absent");
    const registeredAt = reg.registeredAt || reg.timestamp || "—";
    const registeredAtDisplay =
      registeredAt !== "—" ? formatDate(registeredAt) : "—";
    const ts = reg.checkInTime || reg.attendance?.checkInTime;
    const checkInDisplay = ts ? formatDate(ts) : "—";

    const statusBadge = isCancelled
      ? `<span class="badge badge--absent">Cancelled</span>`
      : `<span class="badge ${isPresent ? "badge--success" : isAbsent ? "badge--absent" : "badge--warning"}">${isPresent ? "Present" : isAbsent ? "Absent" : "Registered"}</span>`;

    const actionsHtml = isCancelled
      ? `<span style="color: var(--status-housefull); font-size: var(--font-xs); font-weight: 600;">Cancelled (Void)</span>`
      : `<div style="display:flex; gap: var(--space-xs); flex-wrap: wrap;">
           <button class="btn btn-sm ${isPresent ? "btn-ghost" : "btn-primary"} btn-mark-present" data-regid="${reg.regId}" ${isPresent ? "disabled" : ""}>${isPresent ? "Present ✓" : "Mark Present"}</button>
           <button class="btn btn-sm ${isAbsent ? "btn-ghost" : "btn-danger"} btn-mark-absent" data-regid="${reg.regId}" ${isAbsent ? "disabled" : ""}>${isAbsent ? "Absent ✗" : "Mark Absent"}</button>
         </div>`;

    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(reg.regId)}</td>` +
      `<td>${escapeHtml(reg.name)}</td>` +
      `<td>${escapeHtml(reg.studentId)}</td>` +
      `<td>${event ? escapeHtml(event.title) : reg.eventId}</td>` +
      `<td>${escapeHtml(reg.email)}</td>` +
      `<td>${registeredAtDisplay}</td>` +
      `<td>${statusBadge}</td>` +
      `<td>${checkInDisplay}</td>` +
      `<td>${actionsHtml}</td>`;
    rosterTableBody.appendChild(tr);
  });

  // Bind inline Mark Present / Mark Absent buttons
  rosterTableBody.querySelectorAll(".btn-mark-present").forEach((btn) => {
    btn.addEventListener("click", () => {
      const regId = btn.dataset.regid;
      const result = markStudentAttendance(regId, "Present");
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        renderRoster();
        renderLiveCheckinFeed();
        // Synchronize Student ⇄ Admin state mutations across all views.
        window.app?.renderDashboardStats?.();
        window.app?.renderHistory?.();
        window.RegistrationModule?.renderPasses?.();
        window.EventsModule?.render?.();
        window.ReportsModule?.renderCharts?.();
      }
    });
  });

  rosterTableBody.querySelectorAll(".btn-mark-absent").forEach((btn) => {
    btn.addEventListener("click", () => {
      const regId = btn.dataset.regid;
      const result = markStudentAttendance(regId, "Absent");
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        renderRoster();
        renderLiveCheckinFeed();
        // Synchronize Student ⇄ Admin state mutations across all views.
        window.app?.renderDashboardStats?.();
        window.app?.renderHistory?.();
        window.RegistrationModule?.renderPasses?.();
        window.EventsModule?.render?.();
        window.ReportsModule?.renderCharts?.();
      }
    });
  });
};

/**
 * Pre-filter the roster to a specific event. Used when clicking "Roster"
 * from the Manage Events admin table so the roster opens scoped to that event.
 * @param {string} eventId
 */
const filterRosterByEvent = (eventId) => {
  if (!eventId) return;
  rosterFilterState.eventId = eventId;
  rosterFilterState.query = "";
  rosterFilterState.status = "";
  ensureFilterToolbar();
  populateEventFilter();
  if (rosterSearchInput) rosterSearchInput.value = "";
  if (rosterStatusFilter) rosterStatusFilter.value = "";
  if (rosterEventFilter) rosterEventFilter.value = eventId;
  if (typeof window.app?.showTab === "function") {
    window.app.showTab("roster");
  }
  renderRoster();
};

// ─── Utility: HTML escaping ───────────────────────────────────────────────
/**
 * Escape a string for safe insertion into innerHTML.
 * Prevents XSS via user‑supplied names/IDs.
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

// ─── Event binding ────────────────────────────────────────────────────────
let eventsBound = false;

const bindEvents = () => {
  if (eventsBound) return;
  eventsBound = true;

  // Inline scanner controls (scanner tab)
  if (btnStartScanner) {
    btnStartScanner.addEventListener("click", () => startScanner());
  }
  if (btnStopScanner) {
    btnStopScanner.addEventListener("click", stopScanner);
  }

  // Camera toggle (switch front/rear camera)
  if (document.getElementById("btn-camera-toggle")) {
    document.getElementById("btn-camera-toggle").addEventListener("click", async () => {
      const newMode = currentFacingMode === "environment" ? "user" : "environment";
      if (scannerRunning) {
        await stopScanner();
      }
      await startScanner(newMode);
    });
  }

  // Upload and decode QR pass from image file (3-tier online/offline waterfall)
  const qrFileInput = document.getElementById("qr-file-input");
  if (qrFileInput) {
    qrFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const targetEventId = scannerEventSelect ? scannerEventSelect.value : "";

      const handleDecodedText = (decodedText) => {
        const result = processQrPayload(decodedText, targetEventId || undefined);
        showScanToast(result.message, result.type);
        if (result.ok) {
          playChime();
          renderLiveCheckinFeed();
          renderRoster();
          window.app?.refreshAllModules?.(StorageService.getActiveRole() || "admin");
        }
      };

      try {
        if (scannerRunning) {
          await stopScanner();
        }

        // Tier 1: Html5Qrcode file scanner
        if (typeof Html5Qrcode !== "undefined") {
          let fileReaderEl = document.getElementById("qr-file-reader");
          if (!fileReaderEl) {
            fileReaderEl = document.createElement("div");
            fileReaderEl.id = "qr-file-reader";
            fileReaderEl.hidden = true;
            document.body.appendChild(fileReaderEl);
          }
          const scannerInstance = new Html5Qrcode("qr-file-reader");
          const decodedText = await scannerInstance.scanFile(file, false);
          try {
            scannerInstance.clear();
          } catch (_e) {}
          handleDecodedText(decodedText);
          return;
        }

        throw new Error("Html5Qrcode unavailable");
      } catch (_tier1Err) {
        // Tier 2: Native BarcodeDetector API on ImageBitmap
        try {
          if ("BarcodeDetector" in window && typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(file);
            const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
            const barcodes = await detector.detect(bitmap);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              handleDecodedText(barcodes[0].rawValue);
              return;
            }
          }
        } catch (_tier2Err) {}

        // Tier 3: Deterministic QR-Pass-<REG-ID>.png filename resolution
        const match = file.name && file.name.match(/REG-[A-Z0-9]+/i);
        const fallbackReg = match
          ? StorageService.getRegistrationByRegId(match[0].toUpperCase())
          : null;
        if (fallbackReg) {
          const rawKey = `${fallbackReg.eventId}:${fallbackReg.studentId}:${fallbackReg.regId}`;
          let hash = 0;
          for (let i = 0; i < rawKey.length; i++) {
            hash = (hash << 5) - hash + rawKey.charCodeAt(i);
            hash |= 0;
          }
          const syntheticPayload = JSON.stringify({
            regId: fallbackReg.regId,
            eventId: fallbackReg.eventId,
            studentId: fallbackReg.studentId,
            name: fallbackReg.name,
            registrationHash: "H" + Math.abs(hash).toString(16).toUpperCase(),
          });
          handleDecodedText(syntheticPayload);
        } else {
          showScanToast("Could not decode QR code from image.", "error");
        }
      } finally {
        e.target.value = "";
      }
    });
  }

  // Scanner dialog controls
  if (btnStopScannerDialog) {
    btnStopScannerDialog.addEventListener("click", stopScanner);
  }
  if (btnCloseScanner) {
    btnCloseScanner.addEventListener("click", async () => {
      await stopScanner();
      if (scannerDialog && typeof scannerDialog.close === "function") {
        scannerDialog.close();
      }
    });
  }
  // Dialog close button (× in header)
  if (scannerDialog) {
    const closeBtn = scannerDialog.querySelector(".dialog-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", async () => {
        await stopScanner();
        scannerDialog.close();
      });
    }
  }

  // Manual check‑in (Present)
  if (btnManualCheckin) {
    btnManualCheckin.addEventListener("click", () => {
      const query = manualSearchInput ? manualSearchInput.value : "";
      const targetEventId = scannerEventSelect ? scannerEventSelect.value : "";
      const result = markStudentAttendance(query, "Present", targetEventId);
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        if (manualSearchInput) manualSearchInput.value = "";
        renderLiveCheckinFeed();
        renderRoster();
        // Synchronize Student ⇄ Admin state mutations across all views.
        window.app?.renderDashboardStats?.();
        window.app?.renderHistory?.();
        window.RegistrationModule?.renderPasses?.();
        window.EventsModule?.render?.();
        window.ReportsModule?.renderCharts?.();
      }
    });
  }
  // Manual mark Absent
  if (btnManualAbsent) {
    btnManualAbsent.addEventListener("click", () => {
      const query = manualSearchInput ? manualSearchInput.value : "";
      const targetEventId = scannerEventSelect ? scannerEventSelect.value : "";
      const result = markStudentAttendance(query, "Absent", targetEventId);
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        if (manualSearchInput) manualSearchInput.value = "";
        renderLiveCheckinFeed();
        renderRoster();
        // Synchronize Student ⇄ Admin state mutations across all views.
        window.app?.renderDashboardStats?.();
        window.app?.renderHistory?.();
        window.RegistrationModule?.renderPasses?.();
        window.EventsModule?.render?.();
        window.ReportsModule?.renderCharts?.();
      }
    });
  }
  // Allow Enter key to trigger manual check‑in
  if (manualSearchInput) {
    manualSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (btnManualCheckin) btnManualCheckin.click();
      }
    });
  }

  // Stop the camera scanner whenever the user navigates away from the
  // scanner tab, preventing camera lockups / persistent stream state.
  document.querySelectorAll("#sidebar-nav .nav-link[data-tab]").forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetTab = e.currentTarget.dataset.tab;
      if (scannerRunning && targetTab !== "scanner") {
        stopScanner();
      }
    });
  });
};

// ─── Public API ───────────────────────────────────────────────────────────
const init = () => {
  resolveRefs();
  populateScannerEventSelect();
  bindEvents();
  if (!scannerRunning) {
    updateScannerUI(false);
  }
  renderLiveCheckinFeed();
};

const AttendanceModule = {
  init,
  startScanner,
  stopScanner,
  manualCheckIn,
  markStudentAttendance,
  processQrPayload,
  renderRoster,
  renderLiveCheckinFeed,
  filterRosterByEvent,
};

// Expose to global scope for inline HTML handlers and cross‑module access
window.AttendanceModule = AttendanceModule;

export default AttendanceModule;

// Auto‑init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
} else {
  init();
}
