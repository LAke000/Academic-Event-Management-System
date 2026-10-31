// js/app.js – Application Bootstrapper & SPA Router
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns application boot, the global toast system,
// the role switcher (student/admin), and the tab router that drives module
// lifecycle. Defensive throughout: an unmounted or missing module never
// breaks the application lifecycle. Zero-truncation: no data is dropped.

import StorageService from "./storage.js";
import { formatDate } from "./utils.js";

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_ROLE = "student";
const DEFAULT_VIEW_STUDENT = "discover";
const DEFAULT_VIEW_ADMIN = "dashboard";
const TOAST_DISMISS_MS = 3200;

// Tabs that live in the "Admin / Organizer" sidebar section.
const ADMIN_TABS = [
  "dashboard",
  "events",
  "roster",
  "scanner",
  "feedback",
  "reports",
];

// Tab id -> [module global name, method name] lifecycle mapping.
// NOTE: feedback.js exports renderAdminDashboard (no "render"); reports.js
// exports renderCharts (an alias for renderAnalytics). We invoke the methods
// that actually exist on each module, guarded defensively.
const TAB_LIFECYCLE = {
  discover: ["EventsModule", "render"],
  dashboard: ["app", "renderDashboardStats"],
  history: ["app", "renderHistory"],
  events: ["EventsModule", "renderAdminTable"],
  passes: ["PassesModule", "renderPasses"],
  scanner: ["AttendanceModule", "init"],
  roster: ["AttendanceModule", "renderRoster"],
  feedback: ["FeedbackModule", "renderAdminDashboard"],
  certificate: ["CertificateModule", "init"],
  reports: ["ReportsModule", "renderCharts"],
};

// ─── DOM helpers ───────────────────────────────────────────────────────────

/**
 * Escape a string for safe DOM insertion (textContent path; no innerHTML).
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

/**
 * Resolve a module global by name, returning null when unavailable.
 * @param {string} name
 * @returns {object|null}
 */
const resolveModule = (name) => {
  try {
    return typeof window !== "undefined" && window[name]
      ? window[name]
      : null;
  } catch (err) {
    console.error(`[app] Failed to resolve module "${name}":`, err);
    return null;
  }
};

/**
 * Defensively invoke a module method. Wrapped in try/catch so an unmounted
 * or throwing module cannot break the application lifecycle.
 * @param {string} moduleName
 * @param {string} method
 * @returns {boolean} true when the method existed and was invoked
 */
const callModule = (moduleName, method) => {
  const mod = resolveModule(moduleName);
  if (!mod || typeof mod[method] !== "function") {
    console.warn(
      `[app] Module "${moduleName}" or method "${method}" is not available.`
    );
    return false;
  }
  try {
    mod[method]();
    return true;
  } catch (err) {
    console.error(`[app] Error calling ${moduleName}.${method}():`, err);
    if (typeof window.showToast === "function") {
      window.showToast(`Error loading ${moduleName}.`, "error");
    }
    return false;
  }
};

// ─── Global toast system ───────────────────────────────────────────────────

/**
 * Locate (or create) the toast container appended to document.body.
 * index.html ships a legacy #toast pill; we use #toast-container so multiple
 * self-dismissing alerts can stack. Falls back to creating the container.
 * @returns {HTMLElement}
 */
const getToastContainer = () => {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
  }
  return container;
};

/**
 * Append an animated, self-dismissing toast alert.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @returns {HTMLElement|null}
 */
window.showToast = (message, type = "info") => {
  const validTypes = ["info", "success", "warning", "error"];
  if (!validTypes.includes(type)) type = "info";

  const container = getToastContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "polite");

  const msg = document.createElement("span");
  msg.className = "toast-message";
  msg.textContent = escapeHtml(message);
  el.appendChild(msg);

  // Animate in with inline styles (no CSS dependency).
  el.style.opacity = "0";
  el.style.transform = "translateY(10px)";
  el.style.transition = "opacity 300ms ease, transform 300ms ease";
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  // Self-dismiss after TOAST_DISMISS_MS.
  const timer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    el.addEventListener(
      "transitionend",
      () => {
        el.remove();
      },
      { once: true }
    );
    clearTimeout(timer);
  }, TOAST_DISMISS_MS);

  return el;
};

// ─── Role switcher ─────────────────────────────────────────────────────────

const setBodyRole = (role) => {
  const isAdmin = role === "admin";
  document.body.classList.remove("role-student", "role-admin");
  document.body.classList.add(isAdmin ? "role-admin" : "role-student");
};

const toggleAdminTabs = (show) => {
  document
    .querySelectorAll("#sidebar-nav .nav-link[data-tab]")
    .forEach((link) => {
      if (ADMIN_TABS.includes(link.dataset.tab)) {
        link.hidden = !show;
        link.style.display = show ? "" : "none";
        if (!show) {
          link.setAttribute("aria-hidden", "true");
          link.removeAttribute("aria-current");
        } else {
          link.removeAttribute("aria-hidden");
        }
      }
    });

  const adminSection = Array.from(
    document.querySelectorAll("#sidebar-nav .nav-section")
  ).find((el) => /Admin/i.test(el.textContent || ""));
  if (adminSection) {
    adminSection.hidden = !show;
  }
};

const updateProfileChip = (role) => {
  const chipName = document.getElementById("chip-name");
  const chipStatus = document.getElementById("chip-status");
  const chipAvatar = document.getElementById("chip-avatar");
  if (chipName) {
    chipName.textContent = role === "admin" ? "Admin Mode" : "Student Mode";
  }
  if (chipAvatar) {
    chipAvatar.textContent = role === "admin" ? "A" : "S";
  }
  if (chipStatus) {
    chipStatus.textContent = role === "admin"
      ? "Organizer access enabled"
      : "Not registered for any event";
  }
};

const applyRole = (role) => {
  const isAdmin = role === "admin";

  const toggle = document.getElementById("role-toggle");
  if (toggle) {
    toggle.checked = isAdmin;
    toggle.setAttribute("aria-checked", isAdmin);
  }

  setBodyRole(role);
  toggleAdminTabs(isAdmin);
  updateProfileChip(role);

  const seedTop = document.getElementById("btn-seed-data");
  if (seedTop) {
    seedTop.hidden = !isAdmin;
    seedTop.style.display = isAdmin ? "" : "none";
  }

  try {
    StorageService.setActiveRole(role);
  } catch (err) {
    console.error("[app] Failed to persist active role:", err);
  }

  // Navigate to the default landing view for the selected role.
  showTab(isAdmin ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
};

const bindRoleToggle = () => {
  const toggle = document.getElementById("role-toggle");
  if (!toggle) return;
  toggle.addEventListener("change", () => {
    const newRole = toggle.checked ? "admin" : "student";
    applyRole(newRole);
  });
};

// ─── SPA tab router ────────────────────────────────────────────────────────

/**
 * Switch the active tab view, update nav link states, and trigger the
 * owning module's lifecycle method for the newly opened tab.
 * @param {string} tabId
 */
function showTab(tabId) {
  if (!tabId) return;

  // Deactivate all nav links.
  document
    .querySelectorAll("#sidebar-nav .nav-link[data-tab]")
    .forEach((link) => {
      const active = link.dataset.tab === tabId && !link.hidden;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

  // Deactivate all tab panes.
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    const active = pane.id === tabId;
    pane.classList.toggle("active", active);
    pane.hidden = !active;
  });

  const targetLink = document.querySelector(
    `#sidebar-nav .nav-link[data-tab="${tabId}"]`
  );

  // Guard: if the target tab is hidden (admin tab in Student mode), fall
  // back to the default landing view instead of showing a blank pane.
  if (!targetLink || targetLink.hidden) {
    const role = StorageService.getActiveRole() || DEFAULT_ROLE;
    showTab(role === "admin" ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
    return;
  }

  const mapping = TAB_LIFECYCLE[tabId];
  if (mapping) {
    const [moduleName, method] = mapping;
    callModule(moduleName, method);
  }
}

const bindRouter = () => {
  document
    .querySelectorAll("#sidebar-nav .nav-link[data-tab]")
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const tabId = link.dataset.tab;
        if (!tabId) return;

        const role = StorageService.getActiveRole() || DEFAULT_ROLE;
        if (ADMIN_TABS.includes(tabId) && role !== "admin") {
          if (typeof window.showToast === "function") {
            window.showToast("Admin area requires Admin Mode.", "warning");
          }
          return;
        }

        showTab(tabId);
      });
    });
};

// ─── Dashboard stats (rendered locally; no dedicated module) ───────────────

/**
 * Render the admin dashboard stat cards straight from storage.
 */
const renderDashboardStats = () => {
  try {
    const events = StorageService.getEvents();
    const registrations = StorageService.getRegistrations();
    const attended = registrations.filter((r) => r.status === "Present").length;
    const feedbackCount = StorageService.getFeedback().length;

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set("stat-events", events.length);
    set("stat-registrations", registrations.length);
    set("stat-present", attended);
    set("stat-feedback", feedbackCount);
  } catch (err) {
    console.error("[app] Failed to render dashboard stats:", err);
  }
};

// ─── Data action buttons ───────────────────────────────────────────────────

const bindDataButtons = () => {
  const seedTop = document.getElementById("btn-seed-data");
  if (seedTop) {
    seedTop.addEventListener("click", () => {
      StorageService.seedDemoData(true);
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      showTab(role === "admin" ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const loadDemo = document.getElementById("btn-load-demo");
  if (loadDemo) {
    loadDemo.addEventListener("click", () => {
      StorageService.seedDemoData(true);
      renderDashboardStats();
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const loadDemoDash = document.getElementById("btn-load-demo-dash");
  if (loadDemoDash) {
    loadDemoDash.addEventListener("click", () => {
      StorageService.seedDemoData(true);
      renderDashboardStats();
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const createEventDash = document.getElementById("btn-create-event-dash");
  if (createEventDash) {
    createEventDash.addEventListener("click", () => {
      showTab("events");
    });
  }

  const loadDemoReports = document.getElementById("btn-load-demo-reports");
  if (loadDemoReports) {
    loadDemoReports.addEventListener("click", () => {
      StorageService.seedDemoData(true);
      renderDashboardStats();
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const clearData = document.getElementById("btn-clear-data");
  if (clearData) {
    clearData.addEventListener("click", () => {
      StorageService.resetDatabase();
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      showTab(role === "admin" ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
      if (typeof window.showToast === "function") {
        window.showToast("All data cleared and reseeded.", "success");
      }
    });
  }
};

// ─── Public surface (reachable as window.app for inline HTML handlers) ─────

/**
 * Render the student's attendance history into #history-list.
 * Only registrations marked "Present" appear, with certificate eligibility.
 */
const renderHistory = () => {
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  if (!list) return;

  const regs = StorageService.getRegistrations();
  const present = regs.filter((r) => r.status === "Present");

  list.innerHTML = "";

  if (present.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  present.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    const item = document.createElement("div");
    item.className = "history-item card";
    item.innerHTML =
      `<div class="history-item-header">` +
        `<span class="history-item-title">${escapeHtml(event ? event.title : "Unknown Event")}</span>` +
        `<span class="history-item-date">${formatDate(reg.checkInTime)}</span>` +
      `</div>` +
      `<div class="history-item-meta">` +
        `<span><strong>Roll No:</strong> ${escapeHtml(reg.studentId)}</span>` +
        `<span><strong>Department:</strong> ${escapeHtml(reg.department || "—")}</span>` +
        `<span><strong>Status:</strong> ${escapeHtml(reg.status)}</span>` +
      `</div>` +
      `<div class="history-item-certificate" data-regid="${escapeHtml(reg.regId)}">Download Certificate</div>`;
    list.appendChild(item);
  });

  // Wire certificate downloads
  list.querySelectorAll(".history-item-certificate").forEach((el) => {
    el.addEventListener("click", () => {
      const regId = el.dataset.regid;
      if (typeof window.CertificateModule?.generateCertificate === "function") {
        window.CertificateModule.generateCertificate(regId);
      } else if (typeof CertificateModule?.generateCertificate === "function") {
        CertificateModule.generateCertificate(regId);
      } else {
        window.showToast("Certificate module unavailable.", "error");
      }
    });
  });
};

const app = {
  showTab,
  seedDemoData: (force = false) => {
    try {
      StorageService.seedDemoData(force);
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      showTab(role === "admin" ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    } catch (err) {
      console.error("[app] app.seedDemoData error:", err);
      if (typeof window.showToast === "function") {
        window.showToast("Failed to load demo data.", "error");
      }
    }
  },
  renderDashboardStats,
};

window.app = app;

// ─── Bootstrapper ──────────────────────────────────────────────────────────

const boot = () => {
  try {
    // Initialize demo database (non-forcing; preserves existing data).
    StorageService.seedDemoData(false);
  } catch (err) {
    console.error("[app] seedDemoData:", err);
  }

  const role = StorageService.getActiveRole() || DEFAULT_ROLE;
  applyRole(role);
  bindRoleToggle();
  bindRouter();
  bindDataButtons();

  // Render dashboard stats once when the dashboard view is active.
  if (StorageService.getActiveRole() === "admin") {
    renderDashboardStats();
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

export default app;
