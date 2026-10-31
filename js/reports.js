// js/reports.js – Turnout Analytics & CSV Export Engine
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: Chart.js analytics (turnout bar chart + department
// doughnut chart) and CSV export for registrations, attendance, and feedback.

import StorageService from "./storage.js";
import { formatDate } from "./utils.js";

// ─── DOM IDs ──────────────────────────────────────────────────────────────
const ATTENDANCE_CHART_ID = "attendanceChart";
const DEPT_CHART_ID = "deptChart";
const BTN_EXPORT_REGISTRATIONS_ID = "btn-export-registrations";
const BTN_EXPORT_ATTENDANCE_ID = "btn-export-attendance";
const BTN_EXPORT_FEEDBACK_ID = "btn-export-feedback";

// ─── Chart instance management (destroy before re-render) ─────────────────
let turnoutChart = null; // bar chart: registered vs present per event
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
 * Ensure the department doughnut chart canvas exists in the reports tab.
 * index.html only ships #attendanceChart, so #deptChart is injected here.
 */
const ensureDeptChartCanvas = () => {
  if (document.getElementById(DEPT_CHART_ID)) return;
  const attendanceCanvas = document.getElementById(ATTENDANCE_CHART_ID);
  if (!attendanceCanvas) return;
  const card = document.createElement("div");
  card.className = "chart-card";
  card.style.cssText = "margin-top: var(--space-lg);";
  const canvas = document.createElement("canvas");
  canvas.id = DEPT_CHART_ID;
  canvas.width = 400;
  canvas.height = 400;
  card.appendChild(canvas);
  attendanceCanvas.parentElement.insertAdjacentElement("afterend", card);
};

// ─── Chart rendering ──────────────────────────────────────────────────────

/**
 * Destroy any existing chart instance bound to a canvas id, then return null.
 * @param {string} chartId
 */
const destroyChartInstance = (chartId) => {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) {
    existing.destroy();
  }
};

/**
 * Render the turnout analytics: bar chart (registered vs present per event)
 * and doughnut chart (registrations by department).
 */
const renderAnalytics = () => {
  ensureDeptChartCanvas();

  const events = StorageService.getEvents();
  const registrations = StorageService.getRegistrations();

  // ── Bar chart data: Total Registered vs Marked Present per event ──
  const eventLabels = events.map((ev) => escapeHtml(ev.title || ev.id));
  const registeredData = events.map((ev) => ev.registered || 0);
  const presentData = events.map((ev) =>
    registrations.filter(
      (r) => r.eventId === ev.id && r.status === "Present"
    ).length
  );

  // ── Doughnut chart data: registrations grouped by department ──
  const deptCounts = {};
  registrations.forEach((r) => {
    const dept = r.department || "Unknown";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const deptLabels = Object.keys(deptCounts);
  const deptData = Object.values(deptCounts);

  // ── Destroy prior instances to prevent canvas reuse / memory leaks ──
  destroyChartInstance(ATTENDANCE_CHART_ID);
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

  const deptCtx = document.getElementById(DEPT_CHART_ID).getContext("2d");
  deptChart = new Chart(deptCtx, {
    type: "doughnut",
    data: {
      labels: deptLabels,
      datasets: [
        {
          label: "Registrations by Department",
          data: deptData,
          backgroundColor: [
            "#1e3a8a",
            "#d97706",
            "#059669",
            "#7c3aed",
            "#dc2626",
            "#0891b2",
            "#be185d",
          ],
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
            label: (ctx) => `${ctx.label}: ${ctx.parsed} registration${ctx.parsed !== 1 ? "s" : ""}`,
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
  const headers = [
    "Registration ID",
    "Event ID",
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
    r.studentId,
    r.name,
    r.email,
    r.department,
    r.registeredAt || "",
    r.status || "",
    r.checkInTime || "",
  ]);
  downloadCSV(
    headers,
    rows,
    `Registrations${eventId ? "-" + eventId : ""}.csv`
  );
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
  const headers = [
    "Registration ID",
    "Student Name",
    "Roll Number",
    "Email",
    "Department",
    "Status",
    "Check-In Time",
  ];
  const rows = regs.map((r) => [
    r.regId,
    r.name,
    r.studentId,
    r.email,
    r.department,
    r.status || "",
    r.checkInTime || "",
  ]);
  downloadCSV(
    headers,
    rows,
    `Attendance${eventId ? "-" + eventId : ""}.csv`
  );
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
  const headers = [
    "Feedback ID",
    "Student ID",
    "Event ID",
    "Rating",
    "Comments",
    "Created At",
  ];
  const rows = feedbacks.map((f) => [
    f.feedbackId,
    f.studentId,
    f.eventId,
    f.rating,
    f.comments,
    f.createdAt || "",
  ]);
  downloadCSV(headers, rows, `Feedback${eventId ? "-" + eventId : ""}.csv`);
};

// ─── Event binding ────────────────────────────────────────────────────────

let initialized = false;

const bindEvents = () => {
  if (btnExportRegistrations) {
    btnExportRegistrations.addEventListener("click", () =>
      exportRegistrationsCSV()
    );
  }
  if (btnExportAttendance) {
    btnExportAttendance.addEventListener("click", () => exportAttendanceCSV());
  }
  if (btnExportFeedback) {
    btnExportFeedback.addEventListener("click", () => exportFeedbackCSV());
  }

  // Re-render analytics when the Reports tab is entered
  document.querySelectorAll('.nav-link[data-tab="reports"]').forEach((link) => {
    link.addEventListener("click", () => {
      resolveRefs();
      renderAnalytics();
    });
  });
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
