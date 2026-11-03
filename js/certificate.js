// js/certificate.js – Certificate of Participation Engine
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: eligibility-gated certificate generation on a
// 1000×700 canvas, plus PNG download and print actions.

import StorageService from "./storage.js";

// ─── DOM IDs ──────────────────────────────────────────────────────────────
const CERT_DIALOG_ID = "certificate-dialog";
const CERT_CANVAS_ID = "certCanvas";
const BTN_CLOSE_CERT_ID = "btn-close-cert";
const BTN_DOWNLOAD_CERT_ID = "btn-download-cert";
const BTN_PRINT_CERT_ID = "btn-print-cert";

// ─── Canvas constants ─────────────────────────────────────────────────────
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const NAVY = "#1e3a8a";
const GOLD = "#d97706";
const OFF_WHITE = "#f8fafc";

// ─── Module state ─────────────────────────────────────────────────────────
let currentRegId = ""; // regId of the certificate currently rendered

// ─── Cached DOM references ────────────────────────────────────────────────
let certDialog = null;
let certCanvas = null;
let btnCloseCert = null;
let btnDownloadCert = null;
let btnPrintCert = null;

const resolveRefs = () => {
  certDialog = document.getElementById(CERT_DIALOG_ID);
  certCanvas = document.getElementById(CERT_CANVAS_ID);
  btnCloseCert = document.getElementById(BTN_CLOSE_CERT_ID);
  btnDownloadCert = document.getElementById(BTN_DOWNLOAD_CERT_ID);
  btnPrintCert = document.getElementById(BTN_PRINT_CERT_ID);
};

resolveRefs();

// ─── Helpers ──────────────────────────────────────────────────────────────

const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (_e) {
    return iso;
  }
};

// ─── Decorative seal (rosette via canvas arcs) ────────────────────────────

/**
 * Draw a vector rosette/seal directly with 2D canvas path arcs.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - center X
 * @param {number} cy - center Y
 * @param {number} outerR - outer radius
 */
const drawSeal = (ctx, cx, cy, outerR) => {
  const innerR = outerR * 0.55;
  const petals = 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#fef3c7";
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < petals; i++) {
    const a1 = (i / petals) * 2 * Math.PI;
    const a2 = ((i + 0.5) / petals) * 2 * Math.PI;
    const a3 = ((i + 1) / petals) * 2 * Math.PI;
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outerR, a1, a2);
    ctx.arc(0, 0, innerR, a2, a3, true);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Inner accent circle
  ctx.beginPath();
  ctx.arc(0, 0, outerR * 0.3, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
};

// ─── Canvas drawing engine (1000 × 700) ───────────────────────────────────

/**
 * Render a formal Certificate of Participation onto the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} reg - registration record
 * @param {object} event - event record
 */
const drawCertificate = (ctx, reg, event) => {
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  // Off-white background (full bleed)
  ctx.fillStyle = OFF_WHITE;
  ctx.fillRect(0, 0, w, h);

  // ── Dual formal borders ──
  // Outer: University Navy, 12px
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 12;
  ctx.strokeRect(40, 40, w - 80, h - 80);
  // Inner: Academic Gold/Amber, 3px
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, w - 120, h - 120);

  // ── Header: tracked sans-serif bold ──
  ctx.fillStyle = NAVY;
  ctx.font = "bold 18px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const header = "UNIVERSITY ACADEMIC EVENT NETWORK";
  const track = 6;
  let x = (w - header.length * (12 + track)) / 2 + 12 / 2;
  ctx.save();
  ctx.translate(x, 80);
  for (let i = 0; i < header.length; i++) {
    ctx.translate(track, 0);
    ctx.fillText(header[i], 0, 0);
  }
  ctx.restore();

  // ── Title: classic serif, large ──
  ctx.font = "bold 44px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText("Certificate of Participation", w / 2, 170);

  // ── Body: presented to ──
  ctx.font = "22px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("This is proudly presented to", w / 2, 245);

  // ── Student name: large bold serif ──
  ctx.font = "bold 34px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText(reg.name || "", w / 2, 285);

  // ── Roll No ──
  ctx.font = "19px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`Roll No: ${reg.studentId || ""}`, w / 2, 320);

  // ── Category ──
  ctx.font = "19px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`Category: ${event ? event.type : ""}`, w / 2, 360);

  // ── Event title ──
  ctx.font = "bold 21px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText(event ? event.title : "Unknown Event", w / 2, 395);

  // ── Department ──
  ctx.font = "15px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  const evDept = event ? event.department || "" : "";
  const stDept = reg.department || "";
  const deptLine =
    evDept && stDept && evDept.toLowerCase() !== stDept.toLowerCase()
      ? `Department: ${evDept} · Attendee Dept: ${stDept}`
      : `Department: ${evDept || stDept || "—"}`;
  ctx.fillText(deptLine, w / 2, 425);

  // ── Metadata line: Date, Venue, Verification ID ──
  ctx.font = "15px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#94a3b8";
  const dateStr = event ? formatDate(event.date) : "—";
  ctx.textAlign = "left";
  ctx.fillText(`Date: ${dateStr}`, 130, 465);
  ctx.textAlign = "center";
  ctx.fillText(`Venue: ${event ? event.venue : "—"}`, w / 2, 465);
  ctx.textAlign = "right";
  const certId =
    "CERT-" +
    (reg.eventId || "EVT") +
    "-" +
    (reg.regId || "").replace(/^REG-/, "");
  ctx.fillText(`Verification ID: ${certId}`, w - 130, 465);

  // ── Divider ──
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, 505);
  ctx.lineTo(w - 130, 505);
  ctx.stroke();

  // ── Organizer & Dean Signatures (drawn above the signature lines at y=555) ──
  ctx.font = "italic bold 18px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.fillText(event && event.speaker ? event.speaker : "Dr. A. Sharma", w / 4, 555);
  ctx.fillText("Office of Academic Affairs", (3 * w) / 4, 555);

  // ── Signature placeholder lines (above labels at y=568) ──
  ctx.font = "14px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#475569";
  ctx.textAlign = "center";
  ctx.fillText("Event Coordinator", w / 4, 595);
  ctx.fillText("Dean of Academics", (3 * w) / 4, 595);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 4 - 100, 568);
  ctx.lineTo(w / 4 + 100, 568);
  ctx.moveTo((3 * w) / 4 - 100, 568);
  ctx.lineTo((3 * w) / 4 + 100, 568);
  ctx.stroke();

  // ── Corner decorative seal (bottom-left) ──
  drawSeal(ctx, 135, h - 135, 45);
};

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Generate a certificate for a registration ID.
 * Gates on attendance.status === 'Present'.
 * @param {string} regId
 */
const generateCertificate = (regId) => {
  const reg = StorageService.getRegistrationByRegId(regId);
  if (!reg) {
    window.showToast("Registration record not found.", "error");
    return;
  }

  // Eligibility gate: only Present attendance earns a certificate.
  const attendance = reg.attendance || {};
  const isPresent =
    attendance.status === "Present" || reg.status === "Present";
  if (!isPresent) {
    window.showToast(
      "Certificate available only after event attendance verification.",
      "error"
    );
    return;
  }

  const event = StorageService.getEventById(reg.eventId);
  if (!event) {
    window.showToast("Event not found.", "error");
    return;
  }

  const canvas = certCanvas || document.getElementById(CERT_CANVAS_ID);
  if (!canvas) {
    window.showToast("Certificate canvas not found.", "error");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    window.showToast("Unable to access canvas context.", "error");
    return;
  }

  // Ensure canvas is the correct size
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  drawCertificate(ctx, reg, event);
  currentRegId = regId;

  // Open the certificate dialog
  const dialog = certDialog || document.getElementById(CERT_DIALOG_ID);
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
};

/**
 * Download the currently rendered certificate as a PNG file.
 */
const downloadCertificate = () => {
  const canvas = certCanvas || document.getElementById(CERT_CANVAS_ID);
  if (!canvas) {
    window.showToast("Certificate canvas not found.", "error");
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `Certificate-${currentRegId || "certificate"}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Print the currently rendered certificate in a clean print dialog.
 */
const printCertificate = () => {
  const canvas = certCanvas || document.getElementById(CERT_CANVAS_ID);
  if (!canvas) {
    window.showToast("Certificate canvas not found.", "error");
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const printWin = window.open("", "_blank");
  if (!printWin) {
    window.print();
    return;
  }
  printWin.document.write(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificate</title>` +
    `<style>` +
    `html,body{margin:0;padding:0;width:100%;height:100%;background:#fff;}` +
    `body{display:flex;flex-direction:column;align-items:center;justify-content:center;}` +
    `img{width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;max-width:100%;max-height:100vh;}` +
    `@media print{body{background:#fff;margin:0;}img{width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;}}` +
    `</style>` +
    `</head><body><img src="${dataUrl}" alt="Certificate of Participation">` +
    `<script>window.onload = function() { setTimeout(function() { window.focus(); window.print(); }, 150); };<\/script>` +
    `</body></html>`
  );
  printWin.document.close();
};

// ─── Event binding ────────────────────────────────────────────────────────

let eventsBound = false;

const bindEvents = () => {
  if (eventsBound) return;
  eventsBound = true;

  if (btnDownloadCert) {
    btnDownloadCert.addEventListener("click", downloadCertificate);
  }
  if (btnPrintCert) {
    btnPrintCert.addEventListener("click", printCertificate);
  }
  if (btnCloseCert) {
    btnCloseCert.addEventListener("click", () => {
      if (certDialog && typeof certDialog.close === "function") {
        certDialog.close();
      }
    });
  }
  if (certDialog) {
    const closeBtn = certDialog.querySelector(".dialog-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (typeof certDialog.close === "function") certDialog.close();
      });
    }
    certDialog.addEventListener("click", (e) => {
      if (e.target === certDialog && typeof certDialog.close === "function") {
        certDialog.close();
      }
    });
  }
};

// ─── Module export ────────────────────────────────────────────────────────

const init = () => {
  resolveRefs();
  bindEvents();
};

const CertificateModule = {
  init,
  generateCertificate,
  downloadCertificate,
};

// Expose globally for inline HTML handlers and cross-module access
window.CertificateModule = CertificateModule;

export default CertificateModule;

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
} else {
  init();
}
