// js/app.js – Application Bootstrapper & SPA Router
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns application boot, the global toast system,
// the role switcher (student/admin), and the tab router that drives module
// lifecycle. Defensive throughout: an unmounted or missing module never
// breaks the application lifecycle. Zero-truncation: no data is dropped.

import StorageService from "./storage.js";
import { formatDate } from "./utils.js";

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_ROLE = "guest";
const DEFAULT_VIEW_GUEST = "discover";
const DEFAULT_VIEW_STUDENT = "discover";
const DEFAULT_VIEW_ADMIN = "dashboard";
const TOAST_DISMISS_MS = 3200;

const PROTECTED_STUDENT_TABS = ["passes", "history"];
const STUDENT_TABS = ["discover", "passes", "history"];
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
  el.className = "toast show " + type + " toast--" + type;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "polite");

  const msg = document.createElement("span");
  msg.className = "toast-message";
  msg.textContent = typeof message === "string" ? message : String(message ?? "");
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
  document.body.classList.remove("role-student", "role-admin", "role-guest");
  document.body.classList.add(`role-${role}`);
};

const toggleAdminTabs = (role) => {
  const isAdmin = role === "admin";
  const isGuest = role === "guest";

  document.querySelectorAll("#sidebar-nav .nav-link[data-tab]").forEach((link) => {
    const tab = link.dataset.tab;
    if (ADMIN_TABS.includes(tab)) {
      link.hidden = !isAdmin;
      link.style.display = isAdmin ? "" : "none";
      if (!isAdmin) {
        link.setAttribute("aria-hidden", "true");
        link.removeAttribute("aria-current");
      } else {
        link.removeAttribute("aria-hidden");
      }
    } else if (STUDENT_TABS.includes(tab)) {
      const isPublic = tab === "discover";
      const showTab = !isAdmin && (isPublic || !isGuest);
      link.hidden = !showTab;
      link.style.display = showTab ? "" : "none";
      if (!showTab) {
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
    adminSection.hidden = !isAdmin;
    adminSection.style.display = isAdmin ? "" : "none";
  }

  const studentSection = Array.from(
    document.querySelectorAll("#sidebar-nav .nav-section")
  ).find((el) => /Student/i.test(el.textContent || ""));
  if (studentSection) {
    studentSection.hidden = isAdmin;
    studentSection.style.display = isAdmin ? "none" : "";
  }
};

const buildStudentSwitcher = () => {
  let switcherEl = document.getElementById("student-switcher");
  if (switcherEl) return switcherEl;

  switcherEl = document.createElement("select");
  switcherEl.id = "student-switcher";
  switcherEl.setAttribute("aria-label", "Switch active student profile");
  switcherEl.style.cssText =
    "margin-left: var(--space-sm); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-xs); background: var(--color-surface); color: var(--color-text-primary);";

  switcherEl.addEventListener("change", (e) => {
    const selected = e.target.value;
    try {
      StorageService.setActiveStudentId(selected);
    } catch (_err) {}
    try {
      updateProfileChip(StorageService.getActiveRole() || DEFAULT_ROLE);
    } catch (_err) {}
    try {
      window.EventsModule?.render?.();
    } catch (_err) {}
    try {
      window.RegistrationModule?.renderPasses?.();
    } catch (_err) {}
    try {
      renderHistory();
    } catch (_err) {}
    try {
      window.showToast(
        `Active student set to ${selected === "ALL" ? "All Demo Students" : selected}.`,
        "info"
      );
    } catch (_err) {}
  });

  return switcherEl;
};

const refreshStudentSwitcher = (role) => {
  let switcher = document.getElementById("student-switcher");
  const profileChip = document.getElementById("profile-chip");
  if (!switcher && profileChip) {
    switcher = buildStudentSwitcher();
    profileChip.appendChild(switcher);
  }
  if (!switcher) return;

  const isStudent = role === "student";
  switcher.hidden = !isStudent;
  switcher.style.display = isStudent ? "" : "none";

  const currentVal = StorageService.getActiveStudentId() || "ALL";
  switcher.innerHTML = '<option value="ALL">All Demo Students</option>';
  try {
    const knownStudents = typeof StorageService.getKnownStudents === "function"
      ? StorageService.getKnownStudents()
      : [];
    const regs = StorageService.getRegistrations();
    const seen = new Set();

    // 1. First add all known students so all profiles are always available
    knownStudents.forEach((s) => {
      if (s.studentId && !seen.has(s.studentId)) {
        seen.add(s.studentId);
        const opt = document.createElement("option");
        opt.value = s.studentId;
        opt.textContent = `${s.name || "Student"} (${s.studentId})`;
        switcher.appendChild(opt);
      }
    });

    // 2. Also add any dynamically registered students from registrations
    regs.forEach((r) => {
      if (r.studentId && !seen.has(r.studentId)) {
        seen.add(r.studentId);
        const opt = document.createElement("option");
        opt.value = r.studentId;
        opt.textContent = `${r.name || "Unknown"} (${r.studentId})`;
        switcher.appendChild(opt);
      }
    });

    const validVal =
      currentVal === "ALL" || seen.has(currentVal)
        ? currentVal
        : seen.size > 0
        ? [...seen][0]
        : "ALL";
    if (validVal !== currentVal) {
      try {
        StorageService.setActiveStudentId(validVal);
      } catch (_err) {}
    }
    switcher.value = validVal;
  } catch (_err) {}
};

const updateProfileChip = (role) => {
  const session = StorageService.getAuthSession();
  const chipName = document.getElementById("chip-name");
  const chipStatus = document.getElementById("chip-status");
  const chipAvatar = document.getElementById("chip-avatar");
  const btnAuthAction = document.getElementById("btn-auth-action");

  if (btnAuthAction) {
    btnAuthAction.textContent = session.authenticated ? "Sign Out" : "Sign In";
    btnAuthAction.className = session.authenticated ? "btn btn-ghost btn-sm" : "btn btn-outline btn-sm";
  }

  if (!session.authenticated || role === "guest") {
    if (chipName) chipName.textContent = "Guest Mode";
    if (chipAvatar) {
      chipAvatar.textContent = "G";
      chipAvatar.className = "chip-avatar chip-avatar--guest";
    }
    if (chipStatus) chipStatus.textContent = "Sign in to register";
    const switcher = document.getElementById("student-switcher");
    if (switcher) switcher.style.display = "none";
    return;
  }

  if (role === "admin") {
    if (chipName) chipName.textContent = "Admin Mode";
    if (chipAvatar) {
      chipAvatar.textContent = "A";
      chipAvatar.className = "chip-avatar";
    }
    if (chipStatus) chipStatus.textContent = "Organizer access enabled";
    const switcher = document.getElementById("student-switcher");
    if (switcher) switcher.style.display = "none";
  } else {
    refreshStudentSwitcher("student");
    const activeId = StorageService.getActiveStudentId();
    const student = StorageService.getKnownStudents().find((s) => s.studentId === activeId);
    const displayName = student ? `${student.name} (${student.studentId})` : `Student (${activeId})`;

    if (chipName) chipName.textContent = displayName;
    if (chipAvatar) {
      chipAvatar.textContent = student ? student.name.charAt(0).toUpperCase() : "S";
      chipAvatar.className = "chip-avatar";
    }
    const regs = StorageService.getRegistrationsByStudent(activeId);
    if (chipStatus) {
      chipStatus.textContent = `Registered for ${regs.length} event(s)`;
    }
  }
};

/**
 * Refresh every module after data changes (seed / clear / delete), so the
 * student switcher, profile chip, dashboard, catalog, roster, passes,
 * attendance, feedback, and reports all stay in sync with storage.
 * @param {string} role
 */
const refreshAllModules = (role) => {
  renderDashboardStats();
  try { window.EventsModule?.populateFilters?.(); } catch (_err) {}
  try { window.EventsModule?.render?.(); } catch (_err) {}
  try { window.RegistrationModule?.renderPasses?.(); } catch (_err) {}
  try { renderHistory(); } catch (_err) {}
  try { window.AttendanceModule?.renderRoster?.(); } catch (_err) {}
  try { window.FeedbackModule?.renderAdminDashboard?.(); } catch (_err) {}
  try { window.ReportsModule?.renderCharts?.(); } catch (_err) {}
  updateProfileChip(role);
};

const applyRole = (role, targetTab = null) => {
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

  // Navigate to the target tab or default landing view for the selected role.
  showTab(targetTab || (isAdmin ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT));
};

const bindRoleToggle = () => {
  const toggle = document.getElementById("role-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", (e) => {
    const session = StorageService.getAuthSession();
    const willBeAdmin = toggle.checked;

    if (willBeAdmin && (!session.authenticated || session.role !== "admin")) {
      e.preventDefault();
      toggle.checked = false;
      if (window.AuthModule) {
        window.AuthModule.requireAuth("admin", () => {
          toggle.checked = true;
          applyRole("admin", "dashboard");
        });
      }
      return;
    }

    if (!willBeAdmin && session.authenticated && session.role === "admin") {
      applyRole(session.studentId ? "student" : "guest");
    }
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

  const session = StorageService.getAuthSession();

  // Route Interception: Admin Tabs
  if (ADMIN_TABS.includes(tabId)) {
    if (!session.authenticated || session.role !== "admin") {
      if (window.AuthModule) {
        window.AuthModule.requireAuth("admin", () => {
          applyRole("admin", tabId);
        });
      }
      return;
    }
  }

  // Route Interception: Protected Student Tabs
  if (PROTECTED_STUDENT_TABS.includes(tabId)) {
    if (!session.authenticated || session.role !== "student") {
      if (window.AuthModule) {
        window.AuthModule.requireAuth("student", () => {
          showTab(tabId);
        });
      }
      return;
    }
  }

  try {
    if (window.location.hash !== `#${tabId}`) {
      history.replaceState(null, "", `#${tabId}`);
    }
  } catch (_e) {}

  document.querySelectorAll("#sidebar-nav .nav-link[data-tab]").forEach((link) => {
    const active = link.dataset.tab === tabId && !link.hidden;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.querySelectorAll(".tab-pane").forEach((pane) => {
    const active = pane.id === tabId;
    pane.classList.toggle("active", active);
    pane.hidden = !active;
  });

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

        const authSession = StorageService.getAuthSession();
        if ((tabId === "passes" || tabId === "history") && !authSession.authenticated) {
          if (typeof window.AuthModule?.requireAuth === "function") {
            window.AuthModule.requireAuth("student", () => showTab(tabId));
            return;
          }
        }
        if (ADMIN_TABS.includes(tabId) && authSession.role !== "admin") {
          if (typeof window.AuthModule?.requireAuth === "function") {
            window.AuthModule.requireAuth("admin", () => applyRole("admin", tabId));
            return;
          }
        }

        showTab(tabId);
      });
    });

  const btnAuth = document.getElementById("btn-auth-action");
  if (btnAuth) {
    btnAuth.addEventListener("click", () => {
      const session = StorageService.getAuthSession();
      if (session.authenticated) {
        if (window.AuthModule) window.AuthModule.logout();
      } else {
        if (window.AuthModule) window.AuthModule.openAuthModal("student");
      }
    });
  }

  const profileChip = document.getElementById("profile-chip");
  if (profileChip) {
    profileChip.addEventListener("click", () => {
      const session = StorageService.getAuthSession();
      if (!session.authenticated && window.AuthModule) {
        window.AuthModule.openAuthModal("student");
      }
    });
  }

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
    if (hash && document.getElementById(hash)) {
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      const authSession = StorageService.getAuthSession();
      if ((hash === "passes" || hash === "history") && !authSession.authenticated) return;
      if (ADMIN_TABS.includes(hash) && role !== "admin") return;
      if (STUDENT_TABS.includes(hash) && role === "admin") return;
      showTab(hash);
    }
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
    const activeRegs = registrations.filter(
      (r) => r.status !== "Cancelled" && r.attendance?.status !== "Cancelled"
    );
    const attended = activeRegs.filter(
      (r) => r.status === "Present" || (r.attendance && r.attendance.status === "Present")
    ).length;
    const feedbackCount = StorageService.getFeedback().length;

    // Turnout / conversion rate: share of registrations that turned up Present.
    const turnoutRate =
      activeRegs.length > 0
        ? Math.round((attended / activeRegs.length) * 100) + "%"
        : "0%";
    // No-show rate: share of registrations that never turned up.
    const noshowRate =
      activeRegs.length > 0
        ? Math.round(((activeRegs.length - attended) / activeRegs.length) * 100) + "%"
        : "0%";
    // Average event rating across all feedback entries (1–5 scale).
    const feedbacks = StorageService.getFeedback();
    const avgRating =
      feedbacks.length > 0
        ? (feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbacks.length).toFixed(1) + " ★"
        : "—";

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set("stat-events", events.length);
    set("stat-registrations", registrations.length);
    set("stat-present", attended);
    set("stat-feedback", feedbackCount);
    set("stat-turnout-rate", turnoutRate);
    set("stat-noshow-rate", noshowRate);
    set("stat-avg-rating", avgRating);

    const dashEmpty = document.getElementById("dashboard-empty");
    if (dashEmpty) dashEmpty.hidden = events.length > 0;
    const dashActions = document.querySelector("#dashboard .dashboard-actions");
    if (dashActions) dashActions.hidden = events.length === 0;
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
      refreshAllModules(role);
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
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      refreshAllModules(role);
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const loadDemoDash = document.getElementById("btn-load-demo-dash");
  if (loadDemoDash) {
    loadDemoDash.addEventListener("click", () => {
      StorageService.seedDemoData(true);
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      refreshAllModules(role);
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
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      refreshAllModules(role);
      if (typeof window.showToast === "function") {
        window.showToast("Demo academic data loaded.", "success");
      }
    });
  }

  const clearData = document.getElementById("btn-clear-data");
  if (clearData) {
    clearData.addEventListener("click", () => {
      StorageService.clearAllData();
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      refreshAllModules(role);
      showTab(role === "admin" ? DEFAULT_VIEW_ADMIN : DEFAULT_VIEW_STUDENT);
      if (typeof window.showToast === "function") {
        window.showToast("All data cleared.", "success");
      }
    });
  }
};

// ─── Public surface (reachable as window.app for inline HTML handlers) ─────

/**
 * Render the student's attendance history into #history-list.
 * Shows ALL student registrations (Present and Registered) with clear
 * status badges and status-specific actions. Zero-truncation: no
 * registration record is dropped.
 */
const renderHistory = () => {
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  if (!list) return;

  const activeStudentId = StorageService.getActiveStudentId();
  const allRegs = StorageService.getRegistrations();
  const regs =
    activeStudentId === "ALL"
      ? allRegs
      : allRegs.filter((r) => r.studentId === activeStudentId);
  const feedbacks = StorageService.getFeedback();

  const hasFeedback = (reg) =>
    feedbacks.some(
      (f) => f.eventId === reg.eventId && f.studentId === reg.studentId
    );

  list.innerHTML = "";

  if (regs.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  regs.forEach((reg) => {
    const event = StorageService.getEventById(reg.eventId);
    // Dual-state consistency: respect both top-level and nested attendance status
    const isCancelled =
      reg.status === "Cancelled" ||
      reg.attendance?.status === "Cancelled" ||
      (event && event.status === "Cancelled");
    const isPresent =
      !isCancelled &&
      (reg.status === "Present" ||
        (reg.attendance && reg.attendance.status === "Present"));
    const isAbsent =
      !isCancelled &&
      (reg.status === "Absent" ||
        (reg.attendance && reg.attendance.status === "Absent"));
    const checkInTimestamp = reg.checkInTime || reg.attendance?.checkInTime;
    const item = document.createElement("div");
    item.className = "history-item card";

    const headerDate = isPresent
      ? formatDate(checkInTimestamp)
      : (event ? formatDate(event.date) : "—");

    let statusBadge = "";
    if (isCancelled) {
      statusBadge = `<span class="status-badge status-badge--absent">Cancelled</span>`;
    } else if (isPresent) {
      statusBadge = `<span class="status-badge status-badge--present">Present</span>`;
    } else if (isAbsent) {
      statusBadge = `<span class="status-badge status-badge--absent">Absent</span>`;
    } else {
      statusBadge = `<span class="status-badge status-badge--registered">Registered (Attendance Pending)</span>`;
    }

    const metaLines = [
      `<span><strong>Roll No:</strong> ${escapeHtml(reg.studentId)}</span>`,
      `<span><strong>Department:</strong> ${escapeHtml(reg.department || "—")}</span>`,
      `<span><strong>Status:</strong> ${statusBadge}</span>`,
    ];

    if (event && !isPresent) {
      metaLines.push(
        `<span><strong>Event Date:</strong> ${formatDate(event.date)}</span>`
      );
      metaLines.push(
        `<span><strong>Venue:</strong> ${escapeHtml(event.venue)}</span>`
      );
    }

    let actionsHtml = "";
    if (isCancelled) {
      actionsHtml =
        `<div class="history-item-actions" style="margin-top: var(--space-sm); display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center;">` +
        `<p class="history-item-note" style="margin:0; font-size: var(--font-xs); color: var(--color-danger, #dc2626); font-weight: 500;">Event Cancelled — Attendance, Feedback, and Certificate are closed.</p>` +
        `</div>`;
    } else if (isPresent) {
      const feedbackSubmitted = hasFeedback(reg);
      actionsHtml =
        `<div class="history-item-actions" style="margin-top: var(--space-sm); display: flex; gap: var(--space-sm); flex-wrap: wrap;">` +
        (feedbackSubmitted
          ? `<span class="status-badge status-badge--present">Feedback Submitted ✓</span>`
          : `<button class="history-item-feedback btn btn-ghost btn-sm" data-regid="${escapeHtml(
              reg.regId
            )}">Submit Feedback</button>`) +
        `<button class="history-item-download btn btn-ghost btn-sm" data-regid="${escapeHtml(
          reg.regId
        )}">Download Certificate</button>` +
        `</div>`;
    } else if (isAbsent) {
      actionsHtml =
        `<div class="history-item-actions" style="margin-top: var(--space-sm); display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center;">` +
        `<p class="history-item-note" style="margin:0; font-size: var(--font-xs); color: var(--color-danger, #dc2626); font-weight: 500;">
          Marked Absent — Feedback and Certificate of Participation are locked.
        </p>` +
        `</div>`;
    } else {
      actionsHtml =
        `<div class="history-item-actions" style="margin-top: var(--space-sm); display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center;">` +
        `<button class="history-item-qr btn btn-ghost btn-sm" data-regid="${escapeHtml(
          reg.regId
        )}">View QR Pass</button>` +
        `<p class="history-item-note" style="margin:0; font-size: var(--font-xs); color: var(--color-text-muted);">
          Check in at the venue to unlock feedback &amp; certificate.
        </p>` +
        `</div>`;
    }

    item.innerHTML =
      `<div class="history-item-header">` +
        `<span class="history-item-title">${escapeHtml(
          event ? event.title : "Unknown Event"
        )}</span>` +
        `<span class="history-item-date">${headerDate}</span>` +
      `</div>` +
      `<div class="history-item-meta">` +
        metaLines.join("") +
      `</div>` +
      actionsHtml;
    list.appendChild(item);
  });

  // Wire certificate downloads (Present only)
  list.querySelectorAll(".history-item-download").forEach((el) => {
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

  // Wire feedback submissions — open the student feedback dialog directly
  list.querySelectorAll(".history-item-feedback").forEach((el) => {
    el.addEventListener("click", () => {
      const regId = el.dataset.regid;
      const reg = regs.find((r) => r.regId === regId);
      if (!reg) {
        window.showToast("Registration not found.", "error");
        return;
      }
      if (typeof window.FeedbackModule?.openFeedbackDialog === "function") {
        window.FeedbackModule.openFeedbackDialog(reg.eventId, reg.studentId);
      } else {
        window.showToast("Feedback module unavailable.", "error");
      }
    });
  });

  // Wire QR pass viewing (Registered only)
  list.querySelectorAll(".history-item-qr").forEach((el) => {
    el.addEventListener("click", () => {
      const regId = el.dataset.regid;
      if (typeof window.RegistrationModule?.showPassQR === "function") {
        window.RegistrationModule.showPassQR(regId);
      } else if (typeof RegistrationModule?.showPassQR === "function") {
        RegistrationModule.showPassQR(regId);
      } else {
        window.showToast("Registration module unavailable.", "error");
      }
    });
  });
};

const app = {
  showTab,
  applyRole,
  renderHistory,
  updateProfileChip,
  refreshAllModules,
  seedDemoData: (force = true) => {
    try {
      StorageService.seedDemoData(force);
      const role = StorageService.getActiveRole() || DEFAULT_ROLE;
      refreshAllModules(role);
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

// Expose renderHistory on PassesModule / RegistrationModule for cross-module access.
if (window.PassesModule) {
  window.PassesModule.renderHistory = renderHistory;
}
if (window.RegistrationModule) {
  window.RegistrationModule.renderHistory = renderHistory;
}

// ─── Bootstrapper ──────────────────────────────────────────────────────────

const boot = () => {
  try {
    // Initialize demo database (non-forcing; preserves existing data).
    StorageService.seedDemoData(false);
  } catch (err) {
    console.error("[app] seedDemoData:", err);
  }

  const role = StorageService.getActiveRole() || DEFAULT_ROLE;

  // Activate tab from window.location.hash if valid so F5 refresh preserves active page
  const hash = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
  const validHashTab = hash && document.getElementById(hash) && document.querySelector(`#sidebar-nav .nav-link[data-tab="${hash}"]`);
  const initialTab = validHashTab && !(ADMIN_TABS.includes(hash) && role !== "admin") ? hash : null;

  applyRole(role, initialTab);
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
