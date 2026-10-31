// js/registration.js – Registration Engine & Digital Pass
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: student registration, duplicate/capacity gating,
// digital pass rendering, and QR ticket generation.

import StorageService from "./storage.js";

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
  renderPasses();
  try {
    if (typeof window.app?.updateProfileChip === "function") {
      window.app.updateProfileChip(StorageService.getActiveRole() || "student");
    }
  } catch (_err) {
    // non-fatal: profile chip update is cosmetic
  }
};

// ─── Digital pass rendering ───────────────────────────────────────────────

const renderPassCard = (reg) => {
  const event = StorageService.getEventById(reg.eventId);
  const card = document.createElement("div");
  card.className = "card pass-card mb-3";
  card.style.cssText =
    "border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;";

  card.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h5 class="card-title mb-0" style="font-size: var(--font-lg);">${escapeHtml(
            event ? event.title : "Unknown Event"
          )}</h5>
          <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Date/Time:</strong> ${event ? formatDateTime(event.date) : "—"}</p>
          <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Venue:</strong> ${escapeHtml(event ? event.venue : "—")}</p>
          <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Student:</strong> ${escapeHtml(reg.name)}</p>
          <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Roll No:</strong> ${escapeHtml(reg.studentId)}</p>
          <span class="badge bg-primary ticket-badge" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">Ticket ID: ${escapeHtml(
            reg.regId
          )}</span>
        </div>
        <button class="btn btn-outline-primary btn-view-qr" data-regid="${escapeHtml(
          reg.regId
        )}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">View QR Ticket</button>
      </div>
    </div>
  `;
  return card;
};

/**
 * Render all registrations as digital pass cards in the My Passes view.
 */
const renderPasses = () => {
  if (!passesList || !passesEmpty) return;

  const regs = StorageService.getRegistrations();

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
    window.showToast("QR library not loaded. Check your internet connection.", "error");
    if (passDialog && typeof passDialog.showModal === "function") passDialog.showModal();
    return;
  }

  const payload = JSON.stringify({
    regId: reg.regId,
    eventId: reg.eventId,
    studentId: reg.studentId,
    name: reg.name,
  });

  if (qrTarget) {
    new QRCode(qrTarget, {
      text: payload,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  if (passDialog && typeof passDialog.showModal === "function") {
    passDialog.showModal();
  }
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
