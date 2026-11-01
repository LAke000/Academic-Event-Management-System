// js/registration.js – Registration Engine & Digital Pass
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: student registration, duplicate/capacity gating,
// digital pass rendering, and QR ticket generation.

import StorageService from "./storage.js";
import { generateId, formatDate } from "./utils.js";

// ─── DOM IDs ──────────────────────────────────────────────────────────────
// index.html does not ship a registration dialog, so this module injects one.
const DIALOG_ID = "registration-dialog";
const FORM_ID = "registration-form";
const PASS_DIALOG_ID = "pass-dialog";
const QR_TARGET_ID = "qrcode-target";
const PASSES_LIST_ID = "passes-list";
const PASSES_EMPTY_ID = "passes-empty";

// ─── Inject registration dialog markup (absent from index.html) ───────────
const REGISTRATION_MARKUP = `
<dialog id="${DIALOG_ID}" class="dialog">
  <div class="dialog-panel">
    <header class="dialog-header">
      <h2>Register for Event</h2>
      <button class="dialog-close" aria-label="Close dialog">&times;</button>
    </header>
    <form id="${FORM_ID}" novalidate>
      <input type="hidden" name="eventId" id="reg-event-id">
      <div class="form-field">
        <label class="form-label" for="reg-student-name">Student Name</label>
        <input type="text" id="reg-student-name" name="name" required placeholder="e.g. Alice Kumar" maxlength="100">
      </div>
      <div class="form-field">
        <label class="form-label" for="reg-student-id">Student ID / Roll No.</label>
        <input type="text" id="reg-student-id" name="studentId" required placeholder="e.g. 12601928" maxlength="20">
      </div>
      <div class="form-field">
        <label class="form-label" for="reg-email">University Email</label>
        <input type="email" id="reg-email" name="email" required placeholder="e.g. name@university.edu" maxlength="150">
      </div>
      <div class="form-field">
        <label class="form-label" for="reg-department">Department</label>
        <input type="text" id="reg-department" name="department" required placeholder="e.g. CSE" maxlength="80">
      </div>
      <footer class="dialog-footer">
        <button type="button" class="btn btn-ghost" id="reg-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Register</button>
      </footer>
    </form>
  </div>
</dialog>
`;

if (typeof document !== "undefined" && !document.getElementById(DIALOG_ID)) {
  document.body.insertAdjacentHTML("beforeend", REGISTRATION_MARKUP);
}

// ─── Cached DOM references ────────────────────────────────────────────────
const dialogEl = document.getElementById(DIALOG_ID);
const form = document.getElementById(FORM_ID);
const fieldEventId = document.getElementById("reg-event-id");
const fieldName = document.getElementById("reg-student-name");
const fieldStudentId = document.getElementById("reg-student-id");
const fieldEmail = document.getElementById("reg-email");
const fieldDepartment = document.getElementById("reg-department");
const btnCancel = document.getElementById("reg-cancel-btn");

const passDialog = document.getElementById(PASS_DIALOG_ID);
const qrTarget = document.getElementById(QR_TARGET_ID);
const passesList = document.getElementById(PASSES_LIST_ID);
const passesEmpty = document.getElementById(PASSES_EMPTY_ID);

const passBadge = document.getElementById("pass-badge");
const passTitle = document.getElementById("pass-title");
const passDepartment = document.getElementById("pass-department");
const passVenue = document.getElementById("pass-venue");
const passDateTime = document.getElementById("pass-datetime");
const passStudentId = document.getElementById("pass-studentid");
const passEmail = document.getElementById("pass-email");
const passRegId = document.getElementById("pass-regid");
const btnPrintPass = document.getElementById("btn-print-pass");
const btnClosePass = document.getElementById("btn-close-pass");

// ─── Helpers ──────────────────────────────────────────────────────────────

const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

const generateRegId = () => {
  const existing = StorageService.getRegistrations().map((r) => r.regId);
  let regId;
  do {
    regId = generateId("REG-", 6);
  } while (existing.includes(regId));
  return regId;
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_e) {
    return iso;
  }
};

// ─── Registration flow ────────────────────────────────────────────────────

/**
 * Open the registration dialog for a given event, pre-filling the hidden
 * event ID field and clearing the form.
 * @param {string} eventId
 */
const openRegistrationModal = (eventId) => {
  const event = StorageService.getEventById(eventId);
  if (!event) {
    window.showToast("Event not found.", "error");
    return;
  }
  fieldEventId.value = eventId;
  form.reset();

  // Pre-fill form fields from the active student profile when it matches an
  // existing student record (still allowing the user to type different details).
  const activeStudentId = StorageService.getActiveStudentId();
  if (activeStudentId) {
    const regs = StorageService.getRegistrations();
    const existing = regs.find((r) => r.studentId === activeStudentId);
    if (existing) {
      fieldName.value = existing.name || "";
      fieldStudentId.value = existing.studentId || "";
      fieldEmail.value = existing.email || "";
      fieldDepartment.value = existing.department || "";
    } else {
      fieldStudentId.value = activeStudentId;
    }
  }

  if (dialogEl && typeof dialogEl.showModal === "function") {
    dialogEl.showModal();
  }
};

/**
 * Close the registration dialog.
 */
const closeRegistrationModal = () => {
  if (dialogEl && typeof dialogEl.close === "function") {
    dialogEl.close();
  }
};

/**
 * Validate registration form input.
 * @returns {string|null} error message or null when valid
 */
const validateRegistration = (name, studentId, email, department) => {
  if (!name || name.trim() === "") return "Student Name is required.";
  if (!studentId || studentId.trim() === "") return "Student ID / Roll No. is required.";
  if (!email || email.trim() === "") return "University Email is required.";
  if (!email.includes("@")) return "Please enter a valid University Email containing '@'.";
  if (!department || department.trim() === "") return "Department is required.";
  return null;
};

/**
 * Handle registration form submission.
 * @param {Event} event
 */
const handleRegistrationSubmit = (event) => {
  event.preventDefault();

  const name = fieldName.value.trim();
  const studentId = fieldStudentId.value.trim();
  const email = fieldEmail.value.trim();
  const department = fieldDepartment.value.trim();
  const eventId = fieldEventId.value;

  const validationError = validateRegistration(name, studentId, email, department);
  if (validationError) {
    window.showToast(validationError, "error");
    return;
  }

  // Duplicate gate — student already registered for this event.
  const existingRegs = StorageService.getRegistrationsByEvent(eventId);
  if (existingRegs.some((r) => r.studentId === studentId)) {
    window.showToast("You are already registered for this event.", "error");
    return;
  }

  // Capacity gate — current registrations vs. event capacity.
  const ev = StorageService.getEventById(eventId);
  if (!ev) {
    window.showToast("Event not found.", "error");
    return;
  }
  if (existingRegs.length >= (ev.capacity || 0)) {
    window.showToast("Event is at full capacity.", "error");
    return;
  }

  // Deadline gate — registration must close before the event deadline.
  if (ev.deadline && new Date() > new Date(ev.deadline)) {
    window.showToast("Registration deadline has passed for this event.", "error");
    return;
  }

  // Create registration record.
  const regId = generateRegId();
  const now = new Date().toISOString();
  const newReg = {
    regId,
    eventId,
    studentId,
    name,
    email,
    department,
    registeredAt: now,
    status: "Registered",
    checkInTime: null,
    attendance: {
      status: "Registered",
      checkInTime: null,
    },
  };

  const allRegs = StorageService.getRegistrations();
  allRegs.push(newReg);
  const saved = StorageService.saveRegistrations(allRegs);
  if (!saved) {
    window.showToast("Failed to save registration. Storage may be full.", "error");
    return;
  }

  // Keep event registration count in sync so capacity badges stay accurate.
  const allEvents = StorageService.getEvents();
  const evIdx = allEvents.findIndex((ev) => ev.id === eventId);
  if (evIdx >= 0) {
    allEvents[evIdx].registered = (allEvents[evIdx].registered || 0) + 1;
    if (allEvents[evIdx].registered >= allEvents[evIdx].capacity) {
      allEvents[evIdx].status = "Housefull";
    }
    StorageService.saveEvents(allEvents);
  }

  closeRegistrationModal();
  form.reset();
  window.showToast(`Registration successful! Ticket ID: ${regId}`, "success");
  // Set the newly registered student as the active student context so their
  // passes/history views are scoped to them automatically.
  try {
    StorageService.setActiveStudentId(studentId);
  } catch (_err) {
    // non-fatal
  }
  renderPasses();
  try {
    window.EventsModule?.render?.();
    window.app?.renderHistory?.();
    window.app?.renderDashboardStats?.();
    if (typeof window.app?.updateProfileChip === "function") {
      window.app.updateProfileChip(StorageService.getActiveRole() || "student");
    }
  } catch (_err) {
    // non-fatal: dashboard / history / chip update is cosmetic
  }
};

// ─── Digital pass rendering ───────────────────────────────────────────────

const renderPassCard = (reg) => {
  const event = StorageService.getEventById(reg.eventId);
  const card = document.createElement("div");
  card.className = "pass-card";
  card.style.cssText =
    "border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;";

  // Normalize badge class to lowercase so .status-badge.present / .status-badge.registered
  // in css/components.css match regardless of stored casing.
  const statusVal = reg.attendance?.status || reg.status || "Registered";
  const badgeCls = statusVal.toLowerCase();

  card.innerHTML = `
    <div class="pass-card-header">
      ${escapeHtml(event ? event.title : "Unknown Event")}
    </div>
    <div class="pass-card-body">
      <div class="pass-card-meta">
        <span><strong>Student:</strong> ${escapeHtml(reg.name)}</span>
        <span><strong>Roll No:</strong> ${escapeHtml(reg.studentId)}</span>
        <span><strong>Ticket ID:</strong> ${escapeHtml(reg.regId)}</span>
        <span><strong>Date/Time:</strong> ${event ? formatDateTime(event.date) : "—"}</span>
        <span><strong>Venue:</strong> ${escapeHtml(event ? event.venue : "—")}</span>
        <span><strong>Status:</strong> <span class="status-badge ${badgeCls}">${escapeHtml(statusVal)}</span></span>
      </div>
    </div>
    <div class="pass-card-actions">
      <button class="btn btn-primary btn-view-qr" data-regid="${escapeHtml(
        reg.regId
      )}">View QR Ticket</button>
      <button class="btn btn-outline btn-sm btn-add-reminder" data-id="${reg.eventId}">Add Reminder (.ics)</button>
    </div>
  `;
  return card;
};

/**
 * Render all registrations as digital pass cards in the My Passes view.
 */
const renderPasses = () => {
  if (!passesList || !passesEmpty) return;

  const activeStudentId = StorageService.getActiveStudentId();
  const allRegs = StorageService.getRegistrations();
  const regs =
    activeStudentId === "ALL"
      ? allRegs
      : allRegs.filter((r) => r.studentId === activeStudentId);
  const reminders = StorageService.getReminders();

  // Render Upcoming Event Reminders banner at the top of My Passes
  const bannerWrap = passesList.parentElement;
  let banner = document.getElementById("reminders-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "reminders-banner";
    banner.className = "reminders-banner";
    banner.style.cssText =
      "margin-bottom: var(--space-lg); padding: var(--space-md); background: var(--color-surface-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);";
    bannerWrap.insertBefore(banner, passesList);
  }

  const upcomingReminders = reminders.filter((rem) => {
    if (new Date(rem.sentAt) > new Date()) return false;
    if (activeStudentId === "ALL") return true;
    // Student-scoped: only show reminders for events this student registered for.
    return regs.some((r) => r.eventId === rem.eventId);
  });
  const registeredUpcoming = regs.filter(
    (r) => r.status === "Registered"
  );

  let bannerHtml = `<h3 style="margin:0 0 var(--space-sm) 0; font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Upcoming Event Reminders</h3>`;
  if (upcomingReminders.length === 0 && registeredUpcoming.length === 0) {
    bannerHtml += `<p style="margin:0; font-size: var(--font-sm); color: var(--color-text-muted);">No upcoming reminders.</p>`;
  } else {
    bannerHtml += `<ul style="margin:0; padding-left: var(--space-md); font-size: var(--font-sm);">`;
    upcomingReminders.forEach((rem) => {
      const event = StorageService.getEventById(rem.eventId);
      bannerHtml += `<li style="margin-bottom: var(--space-xs);">${escapeHtml(rem.message || "")} ${event ? `— ${escapeHtml(event.title)}` : ""}</li>`;
    });
    registeredUpcoming.forEach((reg) => {
      const event = StorageService.getEventById(reg.eventId);
      bannerHtml += `<li style="margin-bottom: var(--space-xs);">Registered for ${event ? escapeHtml(event.title) : reg.eventId} (status: Registered).</li>`;
    });
    bannerHtml += `</ul>`;
  }
  banner.innerHTML = bannerHtml;

  passesList.innerHTML = "";

  if (regs.length === 0) {
    passesEmpty.hidden = false;
    passesList.hidden = true;
    return;
  }

  passesEmpty.hidden = true;
  passesList.hidden = false;

  regs.forEach((reg) => {
    passesList.appendChild(renderPassCard(reg));
  });

  passesList.querySelectorAll(".btn-view-qr").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPassQR(btn.dataset.regid);
    });
  });

  passesList.querySelectorAll(".btn-add-reminder").forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = StorageService.getEventById(btn.dataset.id);
      if (event) downloadIcsReminder(event);
    });
  });
};

/**
 * Generate and download a standard iCalendar (.ics) reminder file for an event.
 * The .ics file contains the event title, date/time, venue, and an alarm reminder.
 * @param {object} event
 */
const downloadIcsReminder = (event) => {
  const start = new Date(event.date);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2-hour duration
  const formatIcs = (d) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const uid = `reminder-${event.id}@academicevent.local`;
  const dtstamp = formatIcs(new Date());
  const dtstart = formatIcs(start);
  const dtend = formatIcs(end);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Academic Event Management System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeHtml(event.title)}`,
    `DESCRIPTION:${escapeHtml(event.title + " — " + (event.department || ""))}`,
    `LOCATION:${escapeHtml(event.venue || "—")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Reminder-${event.id}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  window.showToast(
    `Calendar reminder downloaded for "${escapeHtml(event.title)}".`,
    "success"
  );
};

/**
 * Open the Digital Entry Pass dialog and render the QR ticket for a registration.
 * @param {string} regId
 */
const showPassQR = (regId) => {
  const reg = StorageService.getRegistrationByRegId(regId);
  if (!reg) {
    window.showToast("Pass not found.", "error");
    return;
  }

  const event = StorageService.getEventById(reg.eventId);

  // Populate pass detail fields.
  if (passBadge) passBadge.textContent = reg.attendance ? reg.attendance.status : reg.status || "Registered";
  if (passTitle) passTitle.textContent = event ? event.title : "Unknown Event";
  if (passDepartment) passDepartment.textContent = escapeHtml(reg.department);
  if (passVenue) passVenue.textContent = event ? escapeHtml(event.venue) : "—";
  if (passDateTime) passDateTime.textContent = event ? formatDateTime(event.date) : "—";
  if (passStudentId) passStudentId.textContent = escapeHtml(reg.studentId);
  if (passEmail) passEmail.textContent = escapeHtml(reg.email);
  if (passRegId) passRegId.textContent = `Ticket ID: ${escapeHtml(reg.regId)}`;

  // Clear existing children from the QR container, then render a fresh QR code.
  if (qrTarget) {
    while (qrTarget.firstChild) {
      qrTarget.removeChild(qrTarget.firstChild);
    }
  }

  const QRCode = window.QRCode;
  if (!QRCode || typeof QRCode !== "function") {
    renderQrFallback(qrTarget, buildQrPayload(reg));
    if (passDialog && typeof passDialog.showModal === "function") passDialog.showModal();
    return;
  }

  const payload = buildQrPayload(reg);

  if (qrTarget) {
    while (qrTarget.firstChild) {
      qrTarget.removeChild(qrTarget.firstChild);
    }
    const correctLevel = QRCode.CorrectLevel ? QRCode.CorrectLevel.M : 1;
    try {
      new QRCode(qrTarget, {
        text: payload,
        width: 180,
        height: 180,
        correctLevel,
      });
    } catch (_err) {
      // Fallback: deterministic QR matrix canvas renderer if CDN is offline.
      renderQrFallback(qrTarget, payload);
    }
  }

  if (passDialog && typeof passDialog.showModal === "function") {
    passDialog.showModal();
  }
};

// ─── QR payload builder & deterministic fallback renderer ───────────────────

/**
 * Build the deterministic QR payload string for a registration record.
 * @param {object} reg
 * @returns {string}
 */
const buildQrPayload = (reg) => {
  return JSON.stringify({
    regId: reg.regId,
    eventId: reg.eventId,
    studentId: reg.studentId,
    name: reg.name,
  });
};

/**
 * Deterministic QR matrix fallback canvas renderer.
 * Encodes `payload` into a fixed 25×25 QR-like matrix.
 * Renders as black/white squares onto `el`.
 * @param {HTMLElement} el - target container
 * @param {string} payload - QR text payload
 */
const renderQrFallback = (el, payload) => {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
  el.style.width = "180px";
  el.style.height = "180px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.backgroundColor = "#ffffff";

  const size = 25;
  const matrix = [];
  for (let row = 0; row < size; row++) {
    matrix[row] = [];
    for (let col = 0; col < size; col++) {
      const idx = (row * size + col) % payload.length;
      const code = payload.charCodeAt(idx);
      matrix[row][col] = (code + row * 31 + col * 17) % 2 === 0;
    }
  }

  const cell = 180 / size;
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    el.textContent = "QR code unavailable.";
    return;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
  }
  el.appendChild(canvas);
};

// ─── Event binding ────────────────────────────────────────────────────────

let initialized = false;

const bindEvents = () => {
  if (form) {
    form.addEventListener("submit", handleRegistrationSubmit);
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", closeRegistrationModal);
  }
  if (dialogEl) {
    const closeBtn = dialogEl.querySelector(".dialog-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeRegistrationModal);
    }
    // Backdrop click closes the dialog.
    dialogEl.addEventListener("click", (e) => {
      if (e.target === dialogEl) closeRegistrationModal();
    });
  }

  // Pass dialog controls.
  if (btnClosePass) {
    btnClosePass.addEventListener("click", () => {
      if (passDialog && typeof passDialog.close === "function") passDialog.close();
    });
  }
  if (passDialog) {
    const closeBtn = passDialog.querySelector(".dialog-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (passDialog && typeof passDialog.close === "function") passDialog.close();
      });
    }
  }

  // Print pass.
  if (btnPrintPass) {
    btnPrintPass.addEventListener("click", () => {
      window.print();
    });
  }
};

// ─── Public API ───────────────────────────────────────────────────────────

const init = () => {
  if (initialized) return;
  initialized = true;
  bindEvents();
  // Re-render passes when the My Passes tab is entered.
  document.querySelectorAll('.nav-link[data-tab="passes"]').forEach((link) => {
    link.addEventListener("click", () => {
      renderPasses();
    });
  });
};

const RegistrationModule = {
  init,
  openRegistrationModal,
  closeRegistrationModal,
  handleRegistrationSubmit,
  renderPasses,
  showPassQR,
};

// Expose globally for inline HTML handlers and cross-module access.
window.RegistrationModule = RegistrationModule;
window.PassesModule = RegistrationModule;

export default RegistrationModule;

// Auto-init when DOM is ready (guarded against double init by app.js).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
