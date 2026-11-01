// js/events.js – Event Catalog & Management
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns event catalog rendering, admin CRUD, search/filter,
// and the registration-modal bridge. Zero-truncation: all event fields are
// preserved end-to-end.

import StorageService from "./storage.js";
import { generateId } from "./utils.js";

// ─── Cached DOM references (resolved lazily to survive late injection) ──────
let discoverContainer = null;
let adminTableBody = null;
let searchInput = null;
let deptFilter = null;
let typeFilter = null;

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

const badgeFor = (registeredCount, capacity) => {
  if (registeredCount >= capacity) return { label: "Housefull", cls: "bg-danger" };
  const pct = capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;
  if (pct >= 80) return { label: "Fast Filling", cls: "bg-warning" };
  return { label: "Seats Available", cls: "bg-success" };
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

  if (!needsSearch && !needsDept && !needsType) return;

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

  const parent = discoverContainer.parentElement;
  if (parent) {
    parent.insertBefore(bar, discoverContainer);
  }

  // Refresh references after injection
  resolveRefs();
};

// ─── Filter state ───────────────────────────────────────────────────────────

let currentFilters = { query: "", department: "", type: "" };

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

const matchesFilters = (event) => {
  if (currentFilters.department && event.department !== currentFilters.department)
    return false;
  if (currentFilters.type && event.type !== currentFilters.type) return false;
  return true;
};

// ─── Catalog rendering (#discover tab) ─────────────────────────────────────

const renderDiscover = () => {
  if (!discoverContainer) return;

  const events = StorageService.getEvents();
  const filtered = events.filter(
    (ev) => matchesSearch(ev, currentFilters.query) && matchesFilters(ev)
  );

  const reminders = StorageService.getReminders();

  // Render Upcoming Event Reminders banner at the top of Discover Events
  const parent = discoverContainer.parentElement;
  let banner = document.getElementById("reminders-banner-discover");
  if (!banner && parent) {
    banner = document.createElement("div");
    banner.id = "reminders-banner-discover";
    banner.className = "reminders-banner";
    banner.style.cssText =
      "margin-bottom: var(--space-lg); padding: var(--space-md); background: var(--color-surface-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);";
    parent.insertBefore(banner, discoverContainer);
  }

  const upcomingReminders = reminders.filter(
    (rem) => new Date(rem.sentAt) <= new Date()
  );

  if (banner) {
    let bannerHtml = `<h3 style="margin:0 0 var(--space-sm) 0; font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Upcoming Event Reminders</h3>`;
    if (upcomingReminders.length === 0) {
      bannerHtml += `<p style="margin:0; font-size: var(--font-sm); color: var(--color-text-muted);">No upcoming reminders.</p>`;
    } else {
      bannerHtml += `<ul style="margin:0; padding-left: var(--space-md); font-size: var(--font-sm);">`;
      upcomingReminders.forEach((rem) => {
        const event = StorageService.getEventById(rem.eventId);
        bannerHtml += `<li style="margin-bottom: var(--space-xs);">${escapeHtml(rem.message || "")} ${event ? `— ${escapeHtml(event.title)}` : ""}</li>`;
      });
      bannerHtml += `</ul>`;
    }
    banner.innerHTML = bannerHtml;
  }

  discoverContainer.innerHTML = "";

  if (filtered.length === 0) {
    discoverContainer.innerHTML =
      '<div class="empty-state" style="text-align:center; padding: var(--space-xl);">' +
      '<div class="empty-icon">&#128197;</div>' +
      '<h2>No Events Matching</h2>' +
      '<p>Try adjusting your search or filters.</p>' +
      "</div>";
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
    const badge = badgeFor(registeredCount, capacity);

    const card = document.createElement("div");
    card.className = "event-card card mb-3";
    card.style.cssText =
      "border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;";

    card.innerHTML = `
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h5 class="card-title mb-0" style="font-size: var(--font-lg);">${escapeHtml(
            event.title
          )}</h5>
          <span class="badge ${badge.cls}" style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">${escapeHtml(
      badge.label
    )}</span>
        </div>
        <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Department:</strong> ${escapeHtml(
          event.department
        )}</p>
        <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Date/Time:</strong> ${new Date(
          event.date
        ).toLocaleString()}</p>
        <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Venue:</strong> ${escapeHtml(
          event.venue
        )}</p>
        <p class="card-text" style="margin: var(--space-xs) 0;"><strong>Speaker:</strong> ${escapeHtml(
          event.speaker || "—"
        )}</p>
        <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin: var(--space-sm) 0;">
          <div style="width: ${Math.min(fillPercent, 100)}%; height: 100%; background: ${isFull ? "#dc2626" : fillPercent >= 80 ? "#d97706" : "#059669"};"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-sm);">
          <small style="color: var(--color-text-muted);">${registeredCount}/${capacity} seats</small>
          <button class="btn btn-primary btn-register" data-id="${event.id}" ${isClosed ? "disabled" : ""} style="padding: var(--space-xs) var(--space-sm); font-size: var(--font-xs);">
            ${isClosed ? (isPastDeadline ? "Deadline Passed" : "Full") : "Register Now"}
          </button>
        </div>
      </div>
    `;

    const btn = card.querySelector(".btn-register");
    if (btn && !isClosed) {
      btn.addEventListener("click", () => {
        openRegistrationModal(event.id);
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
};

const populateFilters = () => {
  const events = StorageService.getEvents();

  if (deptFilter) {
    const currentValue = deptFilter.value;
    const departments = [
      ...new Set(events.map((ev) => ev.department).filter(Boolean)),
    ];
    const existing = [...deptFilter.options].map((o) => o.value);
    departments.forEach((dept) => {
      if (!existing.includes(dept)) {
        const opt = document.createElement("option");
        opt.value = dept;
        opt.textContent = dept;
        deptFilter.appendChild(opt);
      }
    });
    deptFilter.value = existing.includes(currentValue) ? currentValue : "";
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

  events.forEach((ev) => {
    const registrations = StorageService.getRegistrationsByEvent(ev.id);
    const registeredCount = registrations.length;
    const capacity = ev.capacity || 0;
    const fillPercent =
      capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ev.title)}</td>
      <td>${escapeHtml(ev.type || "—")}</td>
      <td>${escapeHtml(ev.department)}</td>
      <td>${escapeHtml(ev.venue)}</td>
      <td>${new Date(ev.date).toLocaleString()}</td>
      <td>${capacity}</td>
      <td>${registeredCount}</td>
      <td><span class="badge ${ev.status === "Housefull" ? "bg-danger" : "bg-success"}">${escapeHtml(ev.status)}</span></td>
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

  // View roster for this event
  adminTableBody.querySelectorAll(".btn-view-roster").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTab("roster");
      // Roster tab renders all registrations; filtering is handled by roster
      // rendering when an event filter is present (kept simple: navigate only).
    });
  });

  // Send reminder to all registered attendees of this event
  adminTableBody.querySelectorAll(".btn-remind-event").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendReminder(btn.dataset.id);
    });
  });
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

  renderDiscover();
  renderAdminTable();
  populateFilters();
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
  const attendees = regs.filter(
    (r) => r.status === "Registered" || r.status === "Present"
  );

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
  window.showToast(
    `Reminder sent to ${attendees.length} registered attendee(s) for ${escapeHtml(event.title)}.`,
    "success"
  );
};

// ─── Event creation modal ─────────────────────────────────────────────────

const initCreateEventModal = () => {
  if (!createForm || !createDialog) return;

  const emptyCreateBtn = document.getElementById("btn-create-event-empty");
  if (emptyCreateBtn) {
    emptyCreateBtn.addEventListener("click", () => {
      createForm.reset();
      if (typeof createDialog.showModal === "function") createDialog.showModal();
    });
  }

  if (!btnCreateEvent) return;

  // Open dialog
  btnCreateEvent.addEventListener("click", () => {
    createForm.reset();
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
    const capacity = formFields.capacity
      ? parseInt(formFields.capacity.value, 10)
      : NaN;
    const speaker = formFields.speaker ? formFields.speaker.value.trim() : "";
    const type = formFields.type ? formFields.type.value : "";

    // Validation
    if (
      !title ||
      !department ||
      !venue ||
      !dateTime ||
      isNaN(capacity) ||
      capacity <= 0 ||
      !speaker
    ) {
      window.showToast("Please fill all fields correctly.", "error");
      return;
    }

    const events = StorageService.getEvents();
    const existingIds = events.map((ev) => ev.id);
    let eventId;
    do {
      eventId = generateId("EVT-", 4);
    } while (existingIds.includes(eventId));

    const deadline = formFields.deadline ? formFields.deadline.value : "";

    // Build the updated event payload (zero-truncation: preserve all fields)
    const updatedEvent = {
      id: editingEventId || eventId,
      title,
      type,
      department,
      venue,
      date: new Date(dateTime).toISOString(),
      deadline: deadline ? new Date(deadline).toISOString() : "",
      capacity,
      // Preserve existing registered count when editing; 0 when creating new
      registered: editingEventId
        ? (events.find((ev) => ev.id === editingEventId)?.registered || 0)
        : 0,
      status: "Open",
      speaker,
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

    createForm.reset();
    resetCreateDialog();
    if (typeof createDialog.close === "function") createDialog.close();

    window.showToast(
      editingEventId ? "Event updated successfully" : "Event created successfully",
      "success"
    );
    renderDiscover();
    renderAdminTable();
    populateFilters();
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
    // datetime-local expects "YYYY-MM-DDTHH:MM" (no seconds)
    const d = new Date(event.date);
    formFields.dateTime.value = d.toISOString().slice(0, 16);
  }
  if (formFields.capacity) formFields.capacity.value = event.capacity;
  if (formFields.speaker) formFields.speaker.value = event.speaker;
  if (formFields.deadline) {
    formFields.deadline.value = event.deadline ? new Date(event.deadline).toISOString().slice(0, 16) : "";
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
  renderAdminTable,
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
