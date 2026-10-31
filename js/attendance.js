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

// Roster tab
const ROSTER_TABLE_BODY_ID = "roster-table-body";
const ROSTER_EMPTY_ID = "roster-empty";
const ROSTER_LIST_ID = "roster-list";

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
let overrideTableBody = null;

let rosterTableBody = null;
let rosterEmpty = null;
let rosterList = null;

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
  overrideTableBody = document.getElementById(OVERRIDE_TABLE_BODY_ID);

  rosterTableBody = document.getElementById(ROSTER_TABLE_BODY_ID);
  rosterEmpty = document.getElementById(ROSTER_EMPTY_ID);
  rosterList = document.getElementById(ROSTER_LIST_ID);
};

// Resolve once at module load
resolveRefs();

// ─── Scanner state ────────────────────────────────────────────────────────
let html5QrCode = null;
let scannerRunning = false;
let scanCooldown = false; // prevents rapid duplicate scans

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
 * Returns an object describing the outcome so callers can react.
 * @param {string} rawText - Raw QR code text (expected JSON).
 * @returns {{ ok: boolean, type: string, message: string }}
 */
const processQrPayload = (rawText) => {
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

  // 4. Duplicate check — already marked Present
  if (reg.status === "Present" && reg.checkInTime) {
    return {
      ok: false,
      type: "warning",
      message: `Already checked in at ${formatDate(reg.checkInTime)}. Duplicate scan ignored.`,
    };
  }

  // 5. Mark as Present with timestamp
  const checkInTime = new Date().toISOString();
  allRegs[regIndex].status = "Present";
  allRegs[regIndex].checkInTime = checkInTime;
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
 * Process a manual check‑in search query (Student ID or Reg ID).
 * Checks in ALL matching "Registered" records for the given identifier.
 * @param {string} query
 * @returns {{ ok: boolean, type: string, message: string }}
 */
const manualCheckIn = (query) => {
  if (!query || query.trim() === "") {
    return { ok: false, type: "error", message: "Please enter a Student ID or Registration ID." };
  }
  const term = query.trim();
  const allRegs = StorageService.getRegistrations();
  // Match by studentId or regId (case‑insensitive)
  const matches = allRegs.filter(
    (r) => r.studentId.toLowerCase() === term.toLowerCase() ||
           r.regId.toLowerCase() === term.toLowerCase()
  );

  if (matches.length === 0) {
    return { ok: false, type: "error", message: `No registration found for "${term}".` };
  }

  // Check for already‑present duplicates
  const alreadyPresent = matches.filter((r) => r.status === "Present");
  const pending = matches.filter((r) => r.status !== "Present");

  if (pending.length === 0) {
    const ts = alreadyPresent[0].checkInTime ? formatDate(alreadyPresent[0].checkInTime) : "—";
    return {
      ok: false,
      type: "warning",
      message: `${alreadyPresent[0].name} is already checked in (${ts}). Duplicate override rejected.`,
    };
  }

  // Mark all pending registrations
  const now = new Date().toISOString();
  let checkedCount = 0;
  pending.forEach((match) => {
    const idx = allRegs.findIndex((r) => r.regId === match.regId);
    if (idx >= 0) {
      allRegs[idx].status = "Present";
      allRegs[idx].checkInTime = now;
      checkedCount++;
    }
  });
  StorageService.saveRegistrations(allRegs);
  renderLiveCheckinFeed();

  const names = pending.map((r) => r.name).join(", ");
  return {
    ok: true,
    type: "success",
    message: `✔ ${names} manually checked in (${checkedCount} registration${checkedCount > 1 ? "s" : ""}).`,
  };
};

// ─── QR Scanner lifecycle ─────────────────────────────────────────────────
/**
 * Start the Html5Qrcode camera scanner on `<div id="reader">`.
 */
const startScanner = async () => {
  if (scannerRunning) return;

  // Guard: library must be loaded via CDN
  if (typeof Html5Qrcode === "undefined") {
    showScanToast("QR scanner library not loaded. Check your internet connection.", "error");
    return;
  }

  const readerEl = document.getElementById(READER_ID);
  if (!readerEl) {
    showScanToast("Scanner viewport not found in the DOM.", "error");
    return;
  }

  try {
    html5QrCode = new Html5Qrcode(READER_ID);

    await html5QrCode.start(
      { facingMode: "environment" }, // prefer rear camera
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      onScanFailure
    );

    scannerRunning = true;
    updateScannerUI(true);
  } catch (err) {
    console.error("[AttendanceModule] Camera start error:", err);
    let msg = "Could not access camera.";
    if (err && typeof err === "string" && err.includes("NotAllowedError")) {
      msg = "Camera permission denied. Please allow camera access in your browser settings.";
    } else if (err && typeof err === "string" && err.includes("NotFoundError")) {
      msg = "No camera found on this device.";
    } else if (err && err.message) {
      msg = err.message;
    }
    showScanToast(msg, "error");
  }
};

/**
 * Stop the running scanner gracefully.
 */
const stopScanner = async () => {
  if (!scannerRunning || !html5QrCode) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch (err) {
    console.warn("[AttendanceModule] Scanner stop warning:", err);
  }
  scannerRunning = false;
  html5QrCode = null;
  updateScannerUI(false);
};

/**
 * Toggle scanner buttons & viewport visibility.
 * @param {boolean} running
 */
const updateScannerUI = (running) => {
  if (btnStartScanner) btnStartScanner.disabled = running;
  if (btnStopScanner) btnStopScanner.disabled = !running;
  if (scannerView) scannerView.hidden = !running;
  if (scannerEmpty) scannerEmpty.hidden = running;
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

  const result = processQrPayload(decodedText);
  showScanToast(result.message, result.type);

  if (result.ok) {
    playChime();
    renderLiveCheckinFeed();
    renderRoster();
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
  // Sort by checkInTime descending; show only "Present" entries
  const checkedIn = regs
    .filter((r) => r.status === "Present" && r.checkInTime)
    .sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

  overrideTableBody.innerHTML = "";
  checkedIn.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(reg.name)}</td>` +
      `<td>${escapeHtml(reg.studentId)}</td>` +
      `<td>${event ? escapeHtml(event.title) : reg.eventId}</td>` +
      `<td><span class="badge badge--success">Present</span></td>` +
      `<td>${formatDate(reg.checkInTime)}</td>`;
    overrideTableBody.appendChild(tr);
  });
};

// ─── Roster tab rendering ─────────────────────────────────────────────────
/**
 * Populate the Registrant Roster admin table with full registration data.
 */
const renderRoster = () => {
  if (!rosterTableBody) return;
  const regs = StorageService.getRegistrations();

  if (regs.length === 0) {
    if (rosterEmpty) rosterEmpty.hidden = false;
    if (rosterList) rosterList.hidden = true;
    return;
  }
  if (rosterEmpty) rosterEmpty.hidden = true;
  if (rosterList) rosterList.hidden = false;

  rosterTableBody.innerHTML = "";
  regs.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    const statusBadge = reg.status === "Present"
      ? "<span class='badge badge--success'>Present</span>"
      : "<span class='badge badge--pending'>Registered</span>";
    const checkInDisplay = reg.checkInTime ? formatDate(reg.checkInTime) : "—";

    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(reg.regId)}</td>` +
      `<td>${escapeHtml(reg.name)}</td>` +
      `<td>${escapeHtml(reg.studentId)}</td>` +
      `<td>${event ? escapeHtml(event.title) : reg.eventId}</td>` +
      `<td>${escapeHtml(reg.email)}</td>` +
      `<td>${statusBadge}</td>` +
      `<td>${checkInDisplay}</td>` +
      `<td>${reg.status !== "Present"
        ? `<button class="btn btn-sm btn-primary btn-checkin" data-regid="${reg.regId}">Check In</button>`
        : "—"
      }</td>`;
    rosterTableBody.appendChild(tr);
  });

  // Bind inline check‑in buttons
  rosterTableBody.querySelectorAll(".btn-checkin").forEach((btn) => {
    btn.addEventListener("click", () => {
      const regId = btn.dataset.regid;
      const result = manualCheckIn(regId);
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        renderRoster();
        renderLiveCheckinFeed();
      }
    });
  });
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
const bindEvents = () => {
  // Inline scanner controls (scanner tab)
  if (btnStartScanner) {
    btnStartScanner.addEventListener("click", startScanner);
  }
  if (btnStopScanner) {
    btnStopScanner.addEventListener("click", stopScanner);
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

  // Manual check‑in
  if (btnManualCheckin) {
    btnManualCheckin.addEventListener("click", () => {
      const query = manualSearchInput ? manualSearchInput.value : "";
      const result = manualCheckIn(query);
      showScanToast(result.message, result.type);
      if (result.ok) {
        playChime();
        if (manualSearchInput) manualSearchInput.value = "";
        renderLiveCheckinFeed();
        renderRoster();
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

  // Re‑render roster when its tab is activated
  document.querySelectorAll('.nav-link[data-tab="roster"]').forEach((link) => {
    link.addEventListener("click", () => {
      resolveRefs();
      renderRoster();
    });
  });
  // Re‑render feed when scanner tab is activated
  document.querySelectorAll('.nav-link[data-tab="scanner"]').forEach((link) => {
    link.addEventListener("click", () => {
      resolveRefs();
      renderLiveCheckinFeed();
    });
  });

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
  bindEvents();
  updateScannerUI(false); // ensure scanner starts in idle state
};

const AttendanceModule = {
  init,
  startScanner,
  stopScanner,
  manualCheckIn,
  renderRoster,
  renderLiveCheckinFeed,
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
