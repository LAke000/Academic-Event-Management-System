// js/reports.js – Turnout Analytics & CSV Export Engine
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: Chart.js analytics (turnout bar chart + department
// doughnut chart) and CSV export for registrations, attendance, and feedback.

import StorageService from "./storage.js";
import { formatDate } from "./utils.js";

// ─── DOM IDs ──────────────────────────────────────────────────────────────
const ATTENDANCE_CHART_ID = "attendanceChart";
const CATEGORY_CHART_ID = "categoryChart";
const DEPT_CHART_ID = "deptChart";
const BTN_EXPORT_REGISTRATIONS_ID = "btn-export-registrations";
const BTN_EXPORT_ATTENDANCE_ID = "btn-export-attendance";
const BTN_EXPORT_FEEDBACK_ID = "btn-export-feedback";
const REPORTS_EMPTY_ID = "reports-empty";
const CHART_CARD_SELECTOR = ".chart-card";

// ─── Chart instance management (destroy before re-render) ─────────────────
let turnoutChart = null; // bar chart: registered vs present per event
let categoryChart = null; // doughnut chart: registrations by event category / type
let deptChart = null; // doughnut chart: registrations by department

// ─── Cached DOM references (resolved lazily to survive late injection) ────
let btnExportRegistrations = null;
let btnExportAttendance = null;
let btnExportFeedback = null;

const resolveRefs = () => {
  btnExportRegistrations = document.getElementById(BTN_EXPORT_REGISTRATIONS_ID);
  btnExportAttendance = document.getElementById(BTN_EXPORT_ATTENDANCE_ID);
  btnExportFeedback = document.getElementById(BTN_EXPORT_FEEDBACK_ID);
};

resolveRefs();

// ─── Helpers ──────────────────────────────────────────────────────────────

const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

/**
 * Escape a CSV field per RFC 4180 (quote if it contains comma, quote, or line break).
 * @param {any} value
 * @returns {string}
 */
const csvField = (value) => {
  const s = String(value == null ? "" : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

/**
 * Build a CSV string from headers and rows, then trigger a file download
 * via a Blob + anchor element.
 * @param {Array<string>} headers
 * @param {Array<Array<any>>} rows
 * @param {string} filename
 */
const downloadCSV = (headers, rows, filename) => {
  const lines = [];
  lines.push(headers.map(csvField).join(","));
  rows.forEach((row) => {
    lines.push(row.map(csvField).join(","));
  });
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

/**
 * Ensure both the category popularity and department doughnut chart canvases
 * exist in the reports tab. index.html only ships #attendanceChart.
 */
const ensureChartCanvases = () => {
  const attendanceCanvas = document.getElementById(ATTENDANCE_CHART_ID);
  if (!attendanceCanvas) return;

  if (!document.getElementById(CATEGORY_CHART_ID)) {
    const card = document.createElement("div");
    card.className = "chart-card";
    card.style.cssText = "margin-top: var(--space-lg);";
    const canvas = document.createElement("canvas");
    canvas.id = CATEGORY_CHART_ID;
    canvas.width = 400;
    canvas.height = 400;
    card.appendChild(canvas);
    attendanceCanvas.parentElement.insertAdjacentElement("afterend", card);
  }

  if (!document.getElementById(DEPT_CHART_ID)) {
    const prevCard =
      document.getElementById(CATEGORY_CHART_ID)?.parentElement ||
      attendanceCanvas.parentElement;
    const card = document.createElement("div");
    card.className = "chart-card";
    card.style.cssText = "margin-top: var(--space-lg);";
    const canvas = document.createElement("canvas");
    canvas.id = DEPT_CHART_ID;
    canvas.width = 400;
    canvas.height = 400;
    card.appendChild(canvas);
    prevCard.insertAdjacentElement("afterend", card);
  }
};

// ─── Chart rendering ──────────────────────────────────────────────────────

/**
 * Destroy any existing chart instance bound to a canvas id, then return null.
 * @param {string} chartId
 */
const destroyChartInstance = (chartId) => {
  if (typeof Chart === "undefined") return; // library not loaded; nothing to destroy
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) {
    existing.destroy();
  }
};

/**
 * Render the turnout analytics: bar chart (registered vs present per event),
 * category popularity doughnut chart, and department doughnut chart.
 */
const renderAnalytics = () => {
  ensureChartCanvases();

  // Early visibility check: if the #reports tab pane is currently hidden,
  // skip Chart.js creation to avoid rendering on a 0x0 canvas.
  // The router will invoke ReportsModule.renderCharts() when unhiding #reports.
  const reportsSection = document.getElementById("reports");
  if (reportsSection && reportsSection.hidden) {
    return;
  }

  const events = StorageService.getEvents();
  const registrations = StorageService.getRegistrations();
  const allFeedback = StorageService.getFeedback();

  // ── Empty-state toggle: charts only make sense once events exist ──
  const hasEvents = events.length > 0;
  const reportsEmpty = document.getElementById(REPORTS_EMPTY_ID);
  if (reportsEmpty) reportsEmpty.hidden = hasEvents;
  document.querySelectorAll(CHART_CARD_SELECTOR).forEach((card) => {
    card.hidden = !hasEvents;
  });

  // ── Inject / refresh event filter dropdown for CSV exports ──
  // Placed at the start of .report-actions so the admin can scope exports
  // to a single event or leave it on "All Events" for a full dump.
  const reportActions = document.querySelector(".report-actions");
  if (reportActions) reportActions.hidden = !hasEvents;

  let reportEventFilter = document.getElementById("reports-event-filter");
  if (reportActions && !reportEventFilter) {
    reportEventFilter = document.createElement("select");
    reportEventFilter.id = "reports-event-filter";
    reportEventFilter.className = "filter-select";
    reportEventFilter.style.cssText =
      "padding: var(--space-xs) var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); margin-left: var(--space-md); min-width: 200px;";
    reportEventFilter.addEventListener("change", () => {
      renderAnalytics();
    });
    reportActions.insertBefore(reportEventFilter, reportActions.firstChild);
  }
  if (reportEventFilter) {
    // Preserve the current selection across re-renders
    const prevSelected = reportEventFilter.value;
    reportEventFilter.innerHTML = '<option value="">All Events</option>';
    events.forEach((ev) => {
      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = ev.title || ev.id;
      reportEventFilter.appendChild(opt);
    });
    // Restore previous selection if it still exists
    if (prevSelected && events.some((e) => e.id === prevSelected)) {
      reportEventFilter.value = prevSelected;
    }
  }

  // ── Inject / populate live KPI summary bar (#reports-kpi-grid) ──
  let kpiGrid = document.getElementById("reports-kpi-grid");
  if (!kpiGrid) {
    kpiGrid = document.createElement("div");
    kpiGrid.id = "reports-kpi-grid";
    kpiGrid.className = "stats-grid";
    kpiGrid.style.cssText = "margin-bottom: var(--space-lg);";
    const firstChartCard = document.querySelector("#reports .chart-card");
    if (firstChartCard) {
      firstChartCard.parentNode.insertBefore(kpiGrid, firstChartCard);
    } else {
      document.getElementById("reports")?.appendChild(kpiGrid);
    }
  }
  if (kpiGrid) {
    kpiGrid.hidden = !hasEvents;
  }

  // No events: destroy any stale chart instances and bail out so empty
  // canvases are never left mounted behind the empty-state message.
  if (!hasEvents) {
    destroyChartInstance(ATTENDANCE_CHART_ID);
    destroyChartInstance(CATEGORY_CHART_ID);
    destroyChartInstance(DEPT_CHART_ID);
    return;
  }

  // Scope datasets to selected event if filtered
  const selectedEventId = reportEventFilter ? reportEventFilter.value : "";
  const scopedEvents = selectedEventId
    ? events.filter((ev) => ev.id === selectedEventId)
    : events;
  const scopedRegistrations = selectedEventId
    ? registrations.filter((r) => r.eventId === selectedEventId)
    : registrations;
  const scopedFeedbacks = selectedEventId
    ? allFeedback.filter((f) => f.eventId === selectedEventId)
    : allFeedback;

  // Render KPI grid cards (scoped to filter if selected)
  const totalEvents = scopedEvents.length;
  const totalRegs = scopedRegistrations.length;
  const activeScopedRegs = scopedRegistrations.filter(
    (r) => r.status !== "Cancelled" && r.attendance?.status !== "Cancelled"
  );
  const checkedIn = activeScopedRegs.filter(
    (r) => r.status === "Present" || r.attendance?.status === "Present"
  ).length;
  const turnoutRate =
    activeScopedRegs.length > 0 ? Math.round((checkedIn / activeScopedRegs.length) * 100) + "%" : "0%";
  const noshowRate =
    activeScopedRegs.length > 0
      ? Math.round(((activeScopedRegs.length - checkedIn) / activeScopedRegs.length) * 100) + "%"
      : "0%";
  const avgRating =
    scopedFeedbacks.length > 0
      ? (
          scopedFeedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) /
          scopedFeedbacks.length
        ).toFixed(1) + " ★"
      : "—";

  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalEvents}</div>
        <div class="stat-label">Total Events</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalRegs}</div>
        <div class="stat-label">Total Registrations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${checkedIn}</div>
        <div class="stat-label">Checked-In Attendees</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${turnoutRate}</div>
        <div class="stat-label">Turnout Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${noshowRate}</div>
        <div class="stat-label">No-Show Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${avgRating}</div>
        <div class="stat-label">Average Rating</div>
      </div>
    `;
  }

  // ── Bar chart data: Total Registered vs Marked Present per event ──
  // All series are derived from live registration records rather than the
  // stored `ev.registered` counter, so the chart always reflects the current
  // registration and check-in state (ECC zero-truncation / data integrity).
  const registeredForEvent = (ev) =>
    registrations.filter((r) => r.eventId === ev.id).length;
  const presentForEvent = (ev) =>
    registrations.filter(
      (r) =>
        r.eventId === ev.id &&
        (r.status === "Present" || r.attendance?.status === "Present")
    ).length;
  const absentForEvent = (ev) =>
    registrations.filter(
      (r) =>
        r.eventId === ev.id &&
        (r.status === "Absent" || r.attendance?.status === "Absent")
    ).length;

  const eventLabels = scopedEvents.map((ev) => ev.title || ev.id);
  const registeredData = scopedEvents.map(registeredForEvent);
  const presentData = scopedEvents.map(presentForEvent);
  const absentData = scopedEvents.map(absentForEvent);

  // ── Doughnut chart data: registrations grouped by event category (type) ──
  const categoryCounts = {};
  scopedRegistrations.forEach((r) => {
    const ev = StorageService.getEventById(r.eventId);
    const cat = ev?.type || "General";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  const hasCategoryData = Object.keys(categoryCounts).length > 0;
  const categoryLabels = hasCategoryData
    ? Object.keys(categoryCounts)
    : ["No Registrations"];
  const categoryData = hasCategoryData
    ? Object.values(categoryCounts)
    : [1];
  const categoryColors = hasCategoryData
    ? [
        "#1e3a8a",
        "#059669",
        "#d97706",
        "#7c3aed",
        "#dc2626",
        "#0891b2",
        "#be185d",
      ]
    : ["#cbd5e1"];

  // ── Doughnut chart data: registrations grouped by department ──
  const deptCounts = {};
  scopedRegistrations.forEach((r) => {
    const dept = r.department || "Unknown";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const hasDeptData = Object.keys(deptCounts).length > 0;
  const deptLabels = hasDeptData
    ? Object.keys(deptCounts)
    : ["No Registrations"];
  const deptData = hasDeptData ? Object.values(deptCounts) : [1];
  const deptColors = hasDeptData
    ? [
        "#1e3a8a",
        "#d97706",
        "#059669",
        "#7c3aed",
        "#dc2626",
        "#0891b2",
        "#be185d",
      ]
    : ["#cbd5e1"];

  // ── Destroy prior instances to prevent canvas reuse / memory leaks ──
  destroyChartInstance(ATTENDANCE_CHART_ID);
  destroyChartInstance(CATEGORY_CHART_ID);
  destroyChartInstance(DEPT_CHART_ID);

  // Guard: Chart.js must be loaded via CDN
  if (typeof Chart === "undefined") {
    console.error("[ReportsModule] Chart.js library not loaded.");
    return;
  }

  const turnoutCtx = document.getElementById(ATTENDANCE_CHART_ID).getContext("2d");
  turnoutChart = new Chart(turnoutCtx, {
    type: "bar",
    data: {
      labels: eventLabels,
      datasets: [
        {
          label: "Total Registered",
          data: registeredData,
          backgroundColor: "#1e3a8a",
          borderColor: "#1e3a8a",
          borderWidth: 1,
        },
        {
          label: "Marked Present",
          data: presentData,
          backgroundColor: "#d97706",
          borderColor: "#d97706",
          borderWidth: 1,
        },
        {
          label: "Marked Absent",
          data: absentData,
          backgroundColor: "#dc2626",
          borderColor: "#dc2626",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Event Turnout: Registered vs Present",
          font: { size: 18, weight: "bold" },
        },
        legend: { position: "top" },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Students" },
          ticks: { stepSize: 1 },
        },
        x: {
          title: { display: true, text: "Event" },
          ticks: { maxRotation: 45, minRotation: 0 },
        },
      },
    },
  });

  const categoryCanvas = document.getElementById(CATEGORY_CHART_ID);
  if (categoryCanvas) {
    const categoryCtx = categoryCanvas.getContext("2d");
    categoryChart = new Chart(categoryCtx, {
      type: "doughnut",
      data: {
        labels: categoryLabels,
        datasets: [
          {
            label: "Event Category Popularity",
            data: categoryData,
            backgroundColor: categoryColors,
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Event Category Popularity",
            font: { size: 18, weight: "bold" },
          },
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.label === "No Registrations"
                  ? "No Registrations (0)"
                  : `${ctx.label}: ${ctx.parsed} registration${
                      ctx.parsed !== 1 ? "s" : ""
                    }`,
            },
          },
        },
      },
    });
  }

  const deptCtx = document.getElementById(DEPT_CHART_ID).getContext("2d");
  deptChart = new Chart(deptCtx, {
    type: "doughnut",
    data: {
      labels: deptLabels,
      datasets: [
        {
          label: "Registrations by Department",
          data: deptData,
          backgroundColor: deptColors,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Registrations by Department",
          font: { size: 18, weight: "bold" },
        },
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.label === "No Registrations"
                ? "No Registrations (0)"
                : `${ctx.label}: ${ctx.parsed} registration${
                    ctx.parsed !== 1 ? "s" : ""
                  }`,
          },
        },
      },
    },
  });
};

// Alias expected by app.js module loader ("renderCharts")
const renderCharts = renderAnalytics;

// ─── CSV Export Engine ────────────────────────────────────────────────────

/**
 * Export registrations to CSV. When eventId is given, filters to that event;
 * otherwise exports all registrations.
 * @param {string} [eventId]
 */
const exportRegistrationsCSV = (eventId) => {
  const regs = eventId
    ? StorageService.getRegistrationsByEvent(eventId)
    : StorageService.getRegistrations();

  if (regs.length === 0) {
    window.showToast?.("No records available to export.", "warning");
    return;
  }

  const headers = [
    "Registration ID",
    "Event ID",
    "Event Title",
    "Student ID",
    "Student Name",
    "Email",
    "Department",
    "Registered At",
    "Status",
    "Check-In Time",
  ];
  const rows = regs.map((r) => [
    r.regId,
    r.eventId,
    StorageService.getEventById(r.eventId)?.title || r.eventId,
    r.studentId,
    r.name,
    r.email,
    r.department,
    r.registeredAt || "",
    r.status || r.attendance?.status || "Registered",
    r.checkInTime || r.attendance?.checkInTime || "",
  ]);
  downloadCSV(
    headers,
    rows,
    `Registrations${eventId ? "-" + eventId : ""}.csv`
  );
  window.showToast?.("CSV exported successfully.", "success");
};

/**
 * Export attendance to CSV. When eventId is given, filters to that event;
 * otherwise exports all registrations.
 * Headers: Registration ID,Student Name,Roll Number,Email,Department,Status,Check-In Time
 * @param {string} [eventId]
 */
const exportAttendanceCSV = (eventId) => {
  const regs = eventId
    ? StorageService.getRegistrationsByEvent(eventId)
    : StorageService.getRegistrations();

  if (regs.length === 0) {
    window.showToast?.("No records available to export.", "warning");
    return;
  }

  const headers = [
    "Registration ID",
    "Event ID",
    "Event Title",
    "Student Name",
    "Roll Number",
    "Email",
    "Department",
    "Status",
    "Check-In Time",
  ];
  const rows = regs.map((r) => [
    r.regId,
    r.eventId,
    StorageService.getEventById(r.eventId)?.title || r.eventId,
    r.name,
    r.studentId,
    r.email,
    r.department,
    r.status || r.attendance?.status || "Registered",
    r.checkInTime || r.attendance?.checkInTime || "",
  ]);
  downloadCSV(
    headers,
    rows,
    `Attendance${eventId ? "-" + eventId : ""}.csv`
  );
  window.showToast?.("CSV exported successfully.", "success");
};

/**
 * Export feedback to CSV. When eventId is given, filters to that event;
 * otherwise exports all feedback.
 * @param {string} [eventId]
 */
const exportFeedbackCSV = (eventId) => {
  const feedbacks = eventId
    ? StorageService.getFeedbackByEvent(eventId)
    : StorageService.getFeedback();

  if (feedbacks.length === 0) {
    window.showToast?.("No records available to export.", "warning");
    return;
  }

  // Look up student names from registrations for enriched CSV
  const allRegs = StorageService.getRegistrations();

  const headers = [
    "Feedback ID",
    "Student ID",
    "Student Name",
    "Event ID",
    "Event Title",
    "Rating",
    "Speaker Quality",
    "Content Relevance",
    "Venue/Organization",
    "Comments",
    "Created At",
  ];
  const rows = feedbacks.map((f) => {
    const reg = allRegs.find(
      (r) => r.studentId === f.studentId && r.eventId === f.eventId
    );
    return [
      f.feedbackId,
      f.studentId,
      reg ? reg.name : f.studentId,
      f.eventId,
      StorageService.getEventById(f.eventId)?.title || f.eventId,
      f.rating,
      f.speakerQuality != null ? f.speakerQuality : "",
      f.contentRelevance != null ? f.contentRelevance : "",
      f.venueOrganization != null ? f.venueOrganization : "",
      f.comment || f.comments || "",
      f.timestamp || "",
    ];
  });
  downloadCSV(headers, rows, `Feedback${eventId ? "-" + eventId : ""}.csv`);
  window.showToast?.("CSV exported successfully.", "success");
};

// ─── Event binding ────────────────────────────────────────────────────────

let initialized = false;

const bindEvents = () => {
  const getSelectedEventId = () => {
    const el = document.getElementById("reports-event-filter");
    return el?.value || undefined;
  };

  if (btnExportRegistrations) {
    btnExportRegistrations.addEventListener("click", () =>
      exportRegistrationsCSV(getSelectedEventId())
    );
  }
  if (btnExportAttendance) {
    btnExportAttendance.addEventListener(
      "click",
      () => exportAttendanceCSV(getSelectedEventId())
    );
  }
  if (btnExportFeedback) {
    btnExportFeedback.addEventListener(
      "click",
      () => exportFeedbackCSV(getSelectedEventId())
    );
  }
};

// ─── Module export ────────────────────────────────────────────────────────

const init = () => {
  if (initialized) return;
  initialized = true;
  resolveRefs();
  bindEvents();
  renderAnalytics();
};

const ReportsModule = {
  init,
  renderAnalytics,
  renderCharts,
  exportRegistrationsCSV,
  exportAttendanceCSV,
  exportFeedbackCSV,
};

// Expose globally for inline HTML handlers and cross-module access
window.ReportsModule = ReportsModule;

export default ReportsModule;

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
} else {
  init();
}
