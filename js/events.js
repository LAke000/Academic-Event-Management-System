// js/events.js – Event Catalog & Management
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns event catalog rendering, admin CRUD, search/filter,
// and the registration-modal bridge. Zero-truncation: all event fields are
// preserved end-to-end.

import StorageService from "./storage.js";
import { generateId, formatDate } from "./utils.js";

// ─── Cached DOM references (resolved lazily to survive late injection) ──────
let discoverContainer = null;
let adminTableBody = null;
let searchInput = null;
let deptFilter = null;
let typeFilter = null;
let availFilter = null;
let dateFilterInput = null;

let createDialog = null;
let createForm = null;
let btnCreateEvent = null;
let btnCancelEvent = null;
let formFields = {};

// Track in-progress edit (null when creating a new event)
let editingEventId = null;

const resolveRefs = () => {
  discoverContainer = document.getElementById("discover-list");
  adminTableBody = document.querySelector("#events-table-body");
  searchInput = document.getElementById("event-search-input");
  deptFilter = document.getElementById("dept-filter-select");
  typeFilter = document.getElementById("type-filter-select");
  availFilter = document.getElementById("avail-filter-select");
  dateFilterInput = document.getElementById("date-filter-input");

  createDialog = document.getElementById("event-create-dialog");
  createForm = document.getElementById("event-create-form");
  btnCreateEvent = document.getElementById("btn-create-event");
  btnCancelEvent = document.getElementById("btn-cancel-event");

  formFields = {
    title: document.getElementById("event-title"),
    type: document.getElementById("event-type"),
    department: document.getElementById("event-department"),
    venue: document.getElementById("event-venue"),
    dateTime: document.getElementById("event-datetime"),
    endTime: document.getElementById("event-endtime"),
    description: document.getElementById("event-description"),
    capacity: document.getElementById("event-capacity"),
    speaker: document.getElementById("event-speaker"),
    deadline: document.getElementById("event-deadline"),
  };
};

// Resolve once at module load
resolveRefs();

// ─── Helpers ────────────────────────────────────────────────────────────────

const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

const badgeFor = (registeredCount, capacity, isPastDeadline = false) => {
  if (registeredCount >= capacity) return { label: "Housefull", cls: "bg-danger" };
  if (isPastDeadline) return { label: "Registration Closed", cls: "bg-warning" };
  const pct = capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;
  if (pct >= 80) return { label: "Fast Filling", cls: "bg-warning" };
  return { label: "Seats Available", cls: "bg-success" };
};

const toLocalDatetimeInput = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Search / filter controls (defensive injection) ─────────────────────────

// Injects a search bar and department/type filters at the top of the discover
// section when they are not already present in index.html. Never throws if the
// target container is missing.
const ensureDiscoverControls = () => {
  if (!discoverContainer) return;

  const alreadyHas = (id) => !!document.getElementById(id);
  const needsSearch = !alreadyHas("event-search-input");
  const needsDept = !alreadyHas("dept-filter-select");
  const needsType = !alreadyHas("type-filter-select");
  const needsAvail = !alreadyHas("avail-filter-select");
  const needsDate = !alreadyHas("date-filter-input");
  const needsReset = !alreadyHas("btn-reset-filters");

  if (!needsSearch && !needsDept && !needsType && !needsAvail && !needsDate && !needsReset)
    return;

  const bar = document.createElement("div");
  bar.className = "discover-controls";
  bar.style.cssText =
    "display: flex; gap: var(--space-md); flex-wrap: wrap; align-items: flex-end; margin-bottom: var(--space-lg);";

  if (needsSearch) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = "event-search-input";
    input.placeholder = "Search events by title, speaker, department, venue…";
    input.style.cssText =
      "flex: 1; min-width: 220px; padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); background: var(--color-surface); color: var(--color-text-primary);";
    bar.appendChild(input);
  }

  if (needsDept) {
    const select = document.createElement("select");
    select.id = "dept-filter-select";
    select.innerHTML = '<option value="">All Departments</option>';
    select.style.cssText =
      "padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 180px; background: var(--color-surface); color: var(--color-text-primary);";
    bar.appendChild(select);
  }

  if (needsType) {
    const select = document.createElement("select");
    select.id = "type-filter-select";
    select.innerHTML =
      '<option value="">All Types</option>' +
      '<option value="Workshop">Workshop</option>' +
      '<option value="Seminar">Seminar</option>' +
      '<option value="Conference">Conference</option>' +
      '<option value="Guest Lecture">Guest Lecture</option>' +
      '<option value="Hackathon">Hackathon</option>' +
      '<option value="Symposium">Symposium</option>';
    select.style.cssText =
      "padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 180px; background: var(--color-surface); color: var(--color-text-primary);";
    bar.appendChild(select);
  }

  if (needsAvail) {
    const select = document.createElement("select");
    select.id = "avail-filter-select";
    select.innerHTML =
      '<option value="">Availability</option>' +
      '<option value="available">Seats Available</option>' +
      '<option value="full">Housefull</option>';
    select.style.cssText =
      "padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 170px; background: var(--color-surface); color: var(--color-text-primary);";
    bar.appendChild(select);
  }

  if (needsDate) {
    const input = document.createElement("input");
    input.type = "date";
    input.id = "date-filter-input";
    input.placeholder = "Filter by date";
    input.style.cssText =
      "padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); min-width: 170px; background: var(--color-surface); color: var(--color-text-primary);";
    bar.appendChild(input);
  }

  if (needsReset) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-reset-filters";
    btn.className = "btn btn-ghost btn-sm";
    btn.textContent = "Reset Filters";
    btn.style.cssText = "align-self: flex-end;";
    btn.addEventListener("click", () => resetFilters());
    bar.appendChild(btn);
  }

  const parent = discoverContainer.parentElement;
  if (parent) {
    parent.insertBefore(bar, discoverContainer);
  }

  // Refresh references after injection
  resolveRefs();
};

// ─── Filter state ───────────────────────────────────────────────────────────

let currentFilters = { query: "", department: "", type: "", availability: "", date: "" };

const resetFilters = () => {
  currentFilters = { query: "", department: "", type: "", availability: "", date: "" };
  if (searchInput) searchInput.value = "";
  if (deptFilter) deptFilter.value = "";
  if (typeFilter) typeFilter.value = "";
  if (availFilter) availFilter.value = "";
  if (dateFilterInput) dateFilterInput.value = "";
  renderDiscover();
};

const matchesSearch = (event, query) => {
  if (!query) return true;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const haystack = [
    event.title || "",
    event.speaker || "",
    event.department || "",
    event.venue || "",
    event.type || "",
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const eventHasSeats = (event) => {
  const registrations = StorageService.getRegistrationsByEvent(event.id);
  return registrations.length < (event.capacity || 0);
};

const eventMatchesDate = (event, dateStr) => {
  if (!dateStr) return true;
  if (!event.date) return false;
  const localIso = toLocalDatetimeInput(event.date);
  return localIso ? localIso.slice(0, 10) === dateStr : false;
};

const matchesFilters = (event) => {
  if (currentFilters.department && event.department !== currentFilters.department)
    return false;
  if (currentFilters.type && event.type !== currentFilters.type) return false;
  if (currentFilters.availability === "available" && !eventHasSeats(event))
    return false;
  if (currentFilters.availability === "full" && eventHasSeats(event)) return false;
  if (!eventMatchesDate(event, currentFilters.date)) return false;
  return true;
};

// ─── Catalog rendering (#discover tab) ─────────────────────────────────────

const renderDiscover = () => {
  if (!discoverContainer) return;

  const events = StorageService.getEvents();
  const filtered = events.filter(
    (ev) => matchesSearch(ev, currentFilters.query) && matchesFilters(ev)
  );

  // Empty-state toggle: hide list & banner when no events exist; show list otherwise.
  const discoverEmpty = document.getElementById("discover-empty");
  const discoverList = document.getElementById("discover-list");
  const banner = document.getElementById("reminders-banner-discover");

  const controls = document.querySelector(".discover-controls");

  if (events.length === 0) {
    if (discoverEmpty) discoverEmpty.hidden = false;
    if (discoverList) discoverList.hidden = true;
    if (banner) banner.hidden = true;
    if (controls) controls.hidden = true;
    discoverContainer.innerHTML = "";
    return;
  }
  if (discoverEmpty) discoverEmpty.hidden = true;
  if (discoverList) discoverList.hidden = false;
  if (banner) banner.hidden = false;
  if (controls) controls.hidden = false;

  const reminders = StorageService.getReminders();

  // Render Upcoming Event Reminders banner at the top of Discover Events
  const parent = discoverContainer.parentElement;
  let bannerEl = banner;
  if (!bannerEl && parent) {
    bannerEl = document.createElement("div");
    bannerEl.id = "reminders-banner-discover";
    bannerEl.className = "reminders-banner";
    bannerEl.style.cssText =
      "margin-bottom: var(--space-lg); padding: var(--space-md); background: var(--color-surface-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);";
    parent.insertBefore(bannerEl, discoverContainer);
  }

  const activeStudentId = StorageService.getActiveStudentId();
  const regs = activeStudentId && activeStudentId !== "ALL"
    ? StorageService.getRegistrations().filter((r) => r.studentId === activeStudentId)
    : StorageService.getRegistrations();
  const registeredEventIds = new Set(regs.map((r) => r.eventId));

  const upcomingReminders = reminders.filter(
    (rem) => new Date(rem.sentAt) <= new Date() &&
      (activeStudentId === "ALL" || !activeStudentId || registeredEventIds.has(rem.eventId))
  );

  if (bannerEl) {
    if (upcomingReminders.length === 0) {
      bannerEl.hidden = true;
      bannerEl.innerHTML = "";
    } else {
      bannerEl.hidden = false;
      let bannerHtml = `<h3 style="margin:0 0 var(--space-sm) 0; font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Upcoming Event Reminders</h3>`;
      bannerHtml += `<ul style="margin:0; padding-left: var(--space-md); font-size: var(--font-sm);">`;
      upcomingReminders.forEach((rem) => {
        const event = StorageService.getEventById(rem.eventId);
        bannerHtml += `<li style="margin-bottom: var(--space-xs);">${escapeHtml(rem.message || "")} ${event ? `— ${escapeHtml(event.title)}` : ""}</li>`;
      });
      bannerHtml += `</ul>`;
      bannerEl.innerHTML = bannerHtml;
    }
  }

  discoverContainer.innerHTML = "";

  if (filtered.length === 0) {
    discoverContainer.innerHTML =
      '<div class="empty-state" style="text-align:center; padding: var(--space-xl);">' +
      '<div class="empty-icon">&#128197;</div>' +
      '<h2>No Events Matching</h2>' +
      '<p>Try adjusting your search or filters.</p>' +
      '<button class="btn btn-primary btn-sm" id="btn-reset-filters-empty" style="margin-top: var(--space-md);">Reset Filters</button>' +
      "</div>";
    const emptyResetBtn = document.getElementById("btn-reset-filters-empty");
    if (emptyResetBtn) {
      emptyResetBtn.addEventListener("click", () => resetFilters());
    }
    return;
  }

  filtered.forEach((event) => {
    const registrations = StorageService.getRegistrationsByEvent(event.id);
    const registeredCount = registrations.length;
    const capacity = event.capacity || 0;
    const fillPercent =
      capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;
    const isFull = registeredCount >= capacity;
    const isPastDeadline =
      event.deadline && new Date() > new Date(event.deadline);
    const isClosed = isFull || isPastDeadline;
    const badge = badgeFor(registeredCount, capacity, isPastDeadline);

    // Check if the active student is already registered for this event.
    const activeStudentId = StorageService.getActiveStudentId();
    const activeReg =
      activeStudentId && activeStudentId !== "ALL"
        ? registrations.find((r) => r.studentId === activeStudentId)
        : null;
    const alreadyRegistered = Boolean(activeReg);
    const isPresent =
      activeReg &&
      (activeReg.status === "Present" || activeReg.attendance?.status === "Present");
    const isAbsent =
      activeReg &&
      (activeReg.status === "Absent" || activeReg.attendance?.status === "Absent");

    const card = document.createElement("div");
    card.className = "event-card";
    card.style.cssText =
      "border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;";

    card.innerHTML = `
      <div class="event-card-department">${escapeHtml(event.department)} · ${escapeHtml(event.type || "Academic Event")}</div>
      <div class="event-card-body">
        <div class="event-card-meta">
          <h3 class="event-card-title">${escapeHtml(event.title)}</h3>
          <div class="meta-row">
            <span class="meta-icon">📅</span>
            <span><strong>Date/Time:</strong> ${new Date(event.date).toLocaleString()}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">📍</span>
            <span><strong>Venue:</strong> ${escapeHtml(event.venue)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">🎤</span>
            <span><strong>Speaker:</strong> ${escapeHtml(event.speaker || "—")}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">🕐</span>
            <span><strong>End Time:</strong> ${event.endTime ? new Date(event.endTime).toLocaleString() : "—"}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">⏳</span>
            <span><strong>Deadline:</strong> ${event.deadline ? new Date(event.deadline).toLocaleString() : "Open until start"}</span>
          </div>
          ${event.description ? `<div class="meta-row description-row"><span class="meta-icon">📝</span><span><strong>Description:</strong> ${escapeHtml(event.description)}</span></div>` : ""}
        </div>
        <div class="capacity-bar-wrap">
          <div class="capacity-bar" style="width: ${Math.min(fillPercent, 100)}%; background: ${isFull ? "var(--status-housefull)" : fillPercent >= 80 ? "var(--status-pending)" : "var(--status-open)"};"></div>
        </div>
        <div class="capacity-text">
          <span>${registeredCount}/${capacity} seats</span>
          <span>${escapeHtml(badge.label)}</span>
        </div>
        <div class="event-card-footer" style="display:flex; gap: var(--space-xs); flex-wrap: wrap; align-items: center;">
          ${alreadyRegistered
            ? `<span class="status-badge registered">Registered ✓</span>
               <button class="btn btn-ghost btn-sm btn-view-my-pass" data-id="${event.id}" data-regid="${activeReg.regId}">View My Pass</button>
               ${!isPresent && !isAbsent
                 ? `<button class="btn btn-outline btn-sm btn-card-drop-seat" data-regid="${activeReg.regId}">Drop Seat</button>`
                 : ""}`
            : ""
          }
          <button class="btn ${alreadyRegistered ? "btn-outline btn-sm" : "btn-primary"} btn-register" data-id="${event.id}" ${isClosed ? "disabled" : ""}>
            ${isClosed
              ? isPastDeadline
                ? "Registration Closed"
                : "Event Full"
              : alreadyRegistered
              ? "Register Another Student"
              : "Register Now"}
          </button>
        </div>
      </div>
    `;

    const btnRegister = card.querySelector(".btn-register");
    if (btnRegister && !isClosed) {
      btnRegister.addEventListener("click", () => {
        openRegistrationModal(event.id);
      });
    }

    const btnDropSeat = card.querySelector(".btn-card-drop-seat");
    if (btnDropSeat) {
      btnDropSeat.addEventListener("click", () => {
        const regId = btnDropSeat.dataset.regid;
        if (regId && typeof window.RegistrationModule?.cancelRegistration === "function") {
          window.RegistrationModule.cancelRegistration(regId);
        }
      });
    }

    const btnViewPass = card.querySelector(".btn-view-my-pass");
    if (btnViewPass) {
      btnViewPass.addEventListener("click", () => {
        const regId = btnViewPass.dataset.regid;
        if (regId && typeof window.RegistrationModule?.showPassQR === "function") {
          window.RegistrationModule.showPassQR(regId);
        } else {
          window.showToast("Pass not available.", "error");
        }
      });
    }

    discoverContainer.appendChild(card);
  });
};

// ─── Search & filter binding ────────────────────────────────────────────────

const bindSearchAndFilter = () => {
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentFilters.query = e.target.value;
      renderDiscover();
    });
  }

  if (deptFilter) {
    deptFilter.addEventListener("change", (e) => {
      currentFilters.department = e.target.value;
      renderDiscover();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener("change", (e) => {
      currentFilters.type = e.target.value;
      renderDiscover();
    });
  }

  if (availFilter) {
    availFilter.addEventListener("change", (e) => {
      currentFilters.availability = e.target.value;
      renderDiscover();
    });
  }

  if (dateFilterInput) {
    dateFilterInput.addEventListener("change", (e) => {
      currentFilters.date = e.target.value;
      renderDiscover();
    });
  }
};

const populateFilters = () => {
  const events = StorageService.getEvents();

  if (deptFilter) {
    const currentValue = deptFilter.value;
    deptFilter.innerHTML = '<option value="">All Departments</option>';
    const departments = [
      ...new Set(events.map((ev) => ev.department).filter(Boolean)),
    ];
    departments.forEach((dept) => {
      const opt = document.createElement("option");
      opt.value = dept;
      opt.textContent = dept;
      deptFilter.appendChild(opt);
    });
    deptFilter.value = [...deptFilter.options].map((o) => o.value).includes(currentValue) ? currentValue : "";
  }

  if (typeFilter) {
    const currentValue = typeFilter.value;
    const eventTypes = [...new Set(events.map((ev) => ev.type).filter(Boolean))];
    const defaultTypes = [
      "Workshop",
      "Seminar",
      "Conference",
      "Guest Lecture",
      "Hackathon",
      "Symposium",
    ];
    const allTypes = [...new Set([...defaultTypes, ...eventTypes])];
    const existing = [...typeFilter.options].map((o) => o.value);
    allTypes.forEach((t) => {
      if (!existing.includes(t)) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        typeFilter.appendChild(opt);
      }
    });
    typeFilter.value = existing.includes(currentValue) ? currentValue : "";
  }
};

// ─── Admin event table (#events tab) ───────────────────────────────────────

const renderAdminTable = () => {
  if (!adminTableBody) return;

  const events = StorageService.getEvents();
  adminTableBody.innerHTML = "";

  // Toggle empty-state vs. list visibility
  const eventsEmpty = document.getElementById("events-empty");
  const eventsList = document.getElementById("events-list");
  if (events.length === 0) {
    if (eventsEmpty) eventsEmpty.hidden = false;
    if (eventsList) eventsList.hidden = true;
    const logEl = document.getElementById("reminder-log");
    if (logEl) logEl.hidden = true;
    return;
  }
  if (eventsEmpty) eventsEmpty.hidden = true;
  if (eventsList) eventsList.hidden = false;

  events.forEach((ev) => {
    const registrations = StorageService.getRegistrationsByEvent(ev.id);
    const registeredCount = registrations.length;
    const capacity = ev.capacity || 0;
    const fillPercent =
      capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;

    // Compute live status from registration count, capacity, and deadline
    const isFull = registeredCount >= capacity;
    const isPastDeadline = ev.deadline && new Date() > new Date(ev.deadline);
    const liveStatus = isFull ? "Housefull" : isPastDeadline ? "Closed" : "Open";
    const badgeCls = isFull ? "bg-danger" : isPastDeadline ? "bg-warning" : "bg-success";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ev.title)}</td>
      <td>${escapeHtml(ev.type || "—")}</td>
      <td>${escapeHtml(ev.department)}</td>
      <td>${escapeHtml(ev.venue)}</td>
      <td>${new Date(ev.date).toLocaleString()}</td>
      <td>${capacity}</td>
      <td>${registeredCount}</td>
      <td><span class="badge ${badgeCls}">${escapeHtml(liveStatus)}</span></td>
      <td>
        <button class="btn btn-sm btn-outline btn-edit-event" data-id="${ev.id}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">Edit</button>
        <button class="btn btn-sm btn-ghost btn-view-roster" data-id="${ev.id}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">Roster</button>
        <button class="btn btn-sm btn-ghost btn-remind-event" data-id="${ev.id}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">Remind</button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${ev.id}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">Delete</button>
      </td>
    `;

    adminTableBody.appendChild(tr);
  });

  adminTableBody.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteEvent(btn.dataset.id);
    });
  });

  // Edit event
  adminTableBody.querySelectorAll(".btn-edit-event").forEach((btn) => {
    btn.addEventListener("click", () => {
      openEditEventDialog(btn.dataset.id);
    });
  });

  // View roster for this event — open Roster tab pre-filtered to this event
  adminTableBody.querySelectorAll(".btn-view-roster").forEach((btn) => {
    btn.addEventListener("click", () => {
      const eventId = btn.dataset.id;
      if (typeof window.AttendanceModule?.filterRosterByEvent === "function") {
        window.AttendanceModule.filterRosterByEvent(eventId);
      } else {
        window.app?.showTab?.("roster");
      }
    });
  });

  // Send reminder to all registered attendees of this event
  adminTableBody.querySelectorAll(".btn-remind-event").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendReminder(btn.dataset.id);
    });
  });

  // Render the organizer reminder log beneath the events table
  renderAdminReminderLog();
};

// ─── Event deletion ────────────────────────────────────────────────────────

const deleteEvent = (eventId) => {
  if (!confirm(`Delete event ${eventId}? This cannot be undone.`)) return;

  const events = StorageService.getEvents().filter((ev) => ev.id !== eventId);
  StorageService.saveEvents(events);

  // Cascade-remove registrations for this event
  const remainingRegs = StorageService.getRegistrations().filter(
    (r) => r.eventId !== eventId
  );
  StorageService.saveRegistrations(remainingRegs);

  // Cascade-remove feedback for this event (zero orphaned records)
  const remainingFeedback = StorageService.getFeedback().filter(
    (f) => f.eventId !== eventId
  );
  StorageService.saveFeedback(remainingFeedback);

  // Cascade-remove reminders for this event (zero orphaned records)
  const remainingReminders = StorageService.getReminders().filter(
    (rem) => rem.eventId !== eventId
  );
  StorageService.saveReminders(remainingReminders);

  renderDiscover();
  renderAdminTable();
  populateFilters();
  window.app?.refreshAllModules?.(StorageService.getActiveRole() || "admin");
  window.showToast(`Event ${eventId} deleted.`, "success");
};

/**
 * Dispatch a reminder for all students registered for an event.
 * Saves the reminder record via StorageService.saveReminder() and shows a
 * confirmation toast. Zero-truncation: the reminder record is stored in full.
 * @param {string} eventId
 */
const sendReminder = (eventId) => {
  const event = StorageService.getEventById(eventId);
  if (!event) {
    window.showToast("Event not found.", "error");
    return;
  }

  const regs = StorageService.getRegistrationsByEvent(eventId);
  const attendees = regs.filter((r) => {
    const st = r.attendance?.status || r.status;
    return st === "Registered" || st === "Present";
  });

  if (attendees.length === 0) {
    window.showToast(
      `No registered attendees for "${event.title}".`,
      "warning"
    );
    return;
  }

  const eventDate = event.date ? new Date(event.date).toLocaleString() : "—";
  const reminder = {
    reminderId: generateId("REM-", 6),
    eventId: event.id,
    message: `Reminder: "${event.title}" is coming up on ${eventDate} at ${event.venue || "the venue"}. Don't miss it!`,
    sentAt: new Date().toISOString(),
    sentToCount: attendees.length,
  };

  const saved = StorageService.saveReminder(reminder);
  if (!saved) {
    window.showToast("Failed to save reminder. Storage may be full.", "error");
    return;
  }

  renderAdminTable();
  renderDiscover();
  try { window.RegistrationModule?.renderPasses?.(); } catch (_err) {}
  window.showToast(
    `Reminder sent to ${attendees.length} registered attendee(s) for ${event.title}.`,
    "success"
  );
};

// ─── Organizer reminder log ───────────────────────────────────────────────────

/**
 * Render the organizer reminder log beneath the events table.
 * Shows all saved reminders for organizer review. Defensive: creates the log
 * container if index.html hasn't declared one, and never throws if the parent
 * is missing.
 */
const renderAdminReminderLog = () => {
  let logEl = document.getElementById("reminder-log");
  if (!logEl) {
    const adminCard = document.querySelector("#events .admin-card, #events section");
    const parent = adminCard ? adminCard.parentElement : document.getElementById("events");
    if (!parent) return;
    logEl = document.createElement("div");
    logEl.id = "reminder-log";
    logEl.className = "reminder-log";
    logEl.style.cssText =
      "margin-top: var(--space-lg); padding: var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface);";
    const heading = document.createElement("h3");
    heading.textContent = "Reminder Log";
    heading.style.cssText = "margin: 0 0 var(--space-sm) 0; font-size: var(--font-md); color: var(--color-text-primary);";
    logEl.appendChild(heading);
    parent.appendChild(logEl);
  }

  const reminders = StorageService.getReminders();
  const entries = reminders.slice().reverse(); // newest first

  logEl.hidden = false;
  logEl.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Reminder Log";
  heading.style.cssText = "margin: 0 0 var(--space-sm) 0; font-size: var(--font-md); color: var(--color-text-primary);";
  logEl.appendChild(heading);

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No reminders sent yet.";
    empty.style.cssText = "margin: 0; font-size: var(--font-sm); color: var(--color-text-muted);";
    logEl.appendChild(empty);
    return;
  }

  const ul = document.createElement("ul");
  ul.style.cssText = "margin: 0; padding-left: var(--space-md); font-size: var(--font-sm);";
  entries.forEach((rem) => {
    const event = rem.eventId ? StorageService.getEventById(rem.eventId) : null;
    const li = document.createElement("li");
    li.style.cssText = "margin-bottom: var(--space-xs); border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-xs);";
    li.innerHTML = `
      <div style="font-size: var(--font-xs); color: var(--color-text-muted);">${escapeHtml(rem.sentAt ? formatDate(rem.sentAt) : "—")}</div>
      <div style="margin-top: var(--space-xs);">${escapeHtml(rem.message || "")}</div>
      ${event ? `<div style="font-size: var(--font-xs); color: var(--color-text-secondary); margin-top: var(--space-xs);">Event: ${escapeHtml(event.title)}</div>` : ""}
      <div style="font-size: var(--font-xs); color: var(--color-text-secondary); margin-top: var(--space-xs);">Sent to ${rem.sentToCount ?? 0} attendee(s).</div>
    `;
    ul.appendChild(li);
  });
  logEl.appendChild(ul);
};

// ─── Event creation modal ─────────────────────────────────────────────────

const initCreateEventModal = () => {
  if (!createForm || !createDialog) return;

  const emptyCreateBtn = document.getElementById("btn-create-event-empty");
  if (emptyCreateBtn) {
    emptyCreateBtn.addEventListener("click", () => {
      resetCreateDialog();
      if (typeof createDialog.showModal === "function") createDialog.showModal();
    });
  }

  if (!btnCreateEvent) return;

  // Open dialog
  btnCreateEvent.addEventListener("click", () => {
    resetCreateDialog();
    if (typeof createDialog.showModal === "function") {
      createDialog.showModal();
    }
  });

  // Cancel button
  if (btnCancelEvent) {
    btnCancelEvent.addEventListener("click", () => {
      resetCreateDialog();
      if (typeof createDialog.close === "function") createDialog.close();
    });
  }

  // Dialog × close
  if (createDialog) {
    const closeBtn = createDialog.querySelector(".dialog-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        resetCreateDialog();
        if (typeof createDialog.close === "function") createDialog.close();
      });
    }
    // Backdrop click
    createDialog.addEventListener("click", (e) => {
      if (e.target === createDialog && typeof createDialog.close === "function") {
        resetCreateDialog();
        createDialog.close();
      }
    });

    // Native Escape key close always resets editingEventId
    createDialog.addEventListener("close", resetCreateDialog);
  }

  // Form submission
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = formFields.title ? formFields.title.value.trim() : "";
    const department = formFields.department
      ? formFields.department.value.trim()
      : "";
    const venue = formFields.venue ? formFields.venue.value.trim() : "";
    const dateTime = formFields.dateTime ? formFields.dateTime.value : "";
    const endTime = formFields.endTime ? formFields.endTime.value : "";
    const description = formFields.description
      ? formFields.description.value.trim()
      : "";
    const capacity = formFields.capacity
      ? parseInt(formFields.capacity.value, 10)
      : NaN;
    const speaker = formFields.speaker ? formFields.speaker.value.trim() : "";
    const type = formFields.type ? formFields.type.value : "";
    const deadline = formFields.deadline ? formFields.deadline.value : "";

    // Validation
    if (!title || !department || !venue || !speaker) {
      window.showToast(
        "Validation Error: Title, Department, Venue, and Speaker are required.",
        "error"
      );
      return;
    }

    if (!dateTime || Number.isNaN(new Date(dateTime).getTime())) {
      window.showToast(
        "Validation Error: Please enter a valid Event Date & Time.",
        "error"
      );
      return;
    }

    if (Number.isNaN(capacity) || capacity < 1) {
      window.showToast(
        "Validation Error: Seat capacity must be at least 1.",
        "error"
      );
      return;
    }

    // Past date check: new events cannot be scheduled in the past
    if (!editingEventId && new Date(dateTime) < new Date()) {
      window.showToast(
        "Validation Error: Event date cannot be in the past.",
        "error"
      );
      return;
    }

    // End time check: end time must be after start time
    if (endTime && new Date(endTime) <= new Date(dateTime)) {
      window.showToast(
        "Validation Error: End Date & Time must be after the Start Date & Time.",
        "error"
      );
      return;
    }

    // Deadline check: registration deadline must be on or before the event start date
    if (!deadline || new Date(deadline) > new Date(dateTime)) {
      window.showToast(
        "Validation Error: Registration deadline must be on or before the event start date.",
        "error"
      );
      return;
    }

    const events = StorageService.getEvents();
    const existingIds = events.map((ev) => ev.id);
    let eventId;
    do {
      eventId = generateId("EVT-", 4);
    } while (existingIds.includes(eventId));

    // Compute the actual registration count so status reflects reality
    const currentRegCount = editingEventId
      ? StorageService.getRegistrationsByEvent(editingEventId).length
      : 0;

    // Validation: when editing, capacity cannot drop below current registrations.
    if (editingEventId && capacity < currentRegCount) {
      window.showToast(
        "Capacity cannot be less than current registrations (" + currentRegCount + ").",
        "error"
      );
      return;
    }

    const isFull = currentRegCount >= capacity;

    // Build the updated event payload (zero-truncation: preserve all fields)
    const updatedEvent = {
      id: editingEventId || eventId,
      title,
      type,
      department,
      venue,
      date: new Date(dateTime).toISOString(),
      endTime: endTime ? new Date(endTime).toISOString() : "",
      deadline: deadline ? new Date(deadline).toISOString() : "",
      capacity,
      registered: currentRegCount,
      status: isFull ? "Housefull" : "Open",
      speaker,
      description,
    };

    let saved;
    if (editingEventId) {
      // Update existing event in place, preserving its id and registered count
      const idx = events.findIndex((ev) => ev.id === editingEventId);
      if (idx === -1) {
        window.showToast("Event to update not found.", "error");
        return;
      }
      events[idx] = updatedEvent;
      saved = StorageService.saveEvents(events);
    } else {
      events.push(updatedEvent);
      saved = StorageService.saveEvents(events);
    }

    if (!saved) {
      window.showToast(
        "Failed to save event. Storage may be full.",
        "error"
      );
      return;
    }

    const wasEditing = Boolean(editingEventId);
    createForm.reset();
    resetCreateDialog();
    if (typeof createDialog.close === "function") createDialog.close();

    window.showToast(
      wasEditing ? "Event updated successfully." : "Event created successfully.",
      "success"
    );
    renderDiscover();
    renderAdminTable();
    populateFilters();
    if (typeof window.app?.refreshAllModules === "function") {
      window.app.refreshAllModules(StorageService.getActiveRole() || "admin");
    } else {
      renderDiscover();
      renderAdminTable();
      window.app?.renderDashboardStats?.();
    }
  });
};

// ─── Event edit / update ──────────────────────────────────────────────────

/**
 * Open the create-event dialog pre-filled with an existing event for editing.
 * @param {string} eventId
 */
const openEditEventDialog = (eventId) => {
  const event = StorageService.getEventById(eventId);
  if (!event) {
    window.showToast("Event not found.", "error");
    return;
  }

  editingEventId = eventId;

  // Pre-fill form fields
  if (formFields.title) formFields.title.value = event.title;
  if (formFields.type) formFields.type.value = event.type || "";
  if (formFields.department) formFields.department.value = event.department;
  if (formFields.venue) formFields.venue.value = event.venue;
  if (formFields.dateTime) {
    // datetime-local expects "YYYY-MM-DDTHH:MM" (no seconds), in local time.
    formFields.dateTime.value = toLocalDatetimeInput(event.date);
  }
  if (formFields.endTime) {
    formFields.endTime.value = toLocalDatetimeInput(event.endTime);
  }
  if (formFields.description) {
    formFields.description.value = event.description || "";
  }
  if (formFields.capacity) formFields.capacity.value = event.capacity;
  if (formFields.speaker) formFields.speaker.value = event.speaker;
  if (formFields.deadline) {
    formFields.deadline.value = toLocalDatetimeInput(event.deadline);
  }

  // Update dialog title and submit button text
  const dialogTitle = createDialog.querySelector(".dialog-header h2");
  if (dialogTitle) dialogTitle.textContent = "Update Event";
  const submitBtn = createForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Update Event";

  if (typeof createDialog.showModal === "function") {
    createDialog.showModal();
  }
};

/**
 * Reset the create/edit dialog to "create new event" mode.
 */
const resetCreateDialog = () => {
  editingEventId = null;
  if (createForm) createForm.reset();

  const dialogTitle = createDialog.querySelector(".dialog-header h2");
  if (dialogTitle) dialogTitle.textContent = "Create Event";
  const submitBtn = createForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Create Event";
};

// ─── Registration modal bridge ────────────────────────────────────────────

// Lazily imports registration.js so a missing/broken sibling module cannot
// crash the events catalog at load time.
const openRegistrationModal = async (eventId) => {
  const event = StorageService.getEventById(eventId);
  if (!event) {
    window.showToast("Event not found.", "error");
    return;
  }

  try {
    const { default: RegistrationModule } = await import("./registration.js");
    if (typeof RegistrationModule.openRegistrationModal === "function") {
      RegistrationModule.openRegistrationModal(eventId);
    } else {
      window.showToast("Registration module unavailable.", "error");
    }
  } catch (err) {
    console.error("[EventsModule] Failed to open registration modal:", err);
    window.showToast("Registration module unavailable.", "error");
  }
};

// ─── Public API ───────────────────────────────────────────────────────────

const render = () => {
  renderDiscover();
  renderAdminTable();
};

const init = () => {
  resolveRefs();
  ensureDiscoverControls();
  resolveRefs(); // refresh after possible injection
  bindSearchAndFilter();
  populateFilters();
  initCreateEventModal();
};

const EventsModule = {
  init,
  render,
  renderDiscover,
  renderAdminTable,
  populateFilters,
  resetFilters,
  openRegistrationModal,
  deleteEvent,
};

export default EventsModule;

// Export to global scope for inline HTML handlers and cross-module access
if (typeof window !== "undefined") {
  window.EventsModule = EventsModule;
}

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
    render();
  });
} else {
  init();
  render();
}
