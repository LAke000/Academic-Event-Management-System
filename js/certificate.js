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

// ─── Decorative seal (rosette with ribbon tails via canvas paths) ──────────

/**
 * Draw an executive diploma rosette seal with serrated gold foil,
 * concentric inner rings, and twin crimson/navy ribbon tails.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - center X
 * @param {number} cy - center Y
 * @param {number} outerR - outer radius
 */
const drawSeal = (ctx, cx, cy, outerR) => {
  const innerR = outerR * 0.72;
  const teeth = 24;
  ctx.save();
  ctx.translate(cx, cy);

  // Twin crimson/navy ribbon tails
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.moveTo(-18, outerR * 0.6);
  ctx.lineTo(-34, outerR * 1.45);
  ctx.lineTo(-16, outerR * 1.28);
  ctx.lineTo(-4, outerR * 1.48);
  ctx.lineTo(-2, outerR * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(18, outerR * 0.6);
  ctx.lineTo(34, outerR * 1.45);
  ctx.lineTo(16, outerR * 1.28);
  ctx.lineTo(4, outerR * 1.48);
  ctx.lineTo(2, outerR * 0.7);
  ctx.closePath();
  ctx.fill();

  // Serrated gold foil rosette
  ctx.fillStyle = "#fef3c7";
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a1 = (i / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const x1 = Math.cos(a1) * outerR;
    const y1 = Math.sin(a1) * outerR;
    const x2 = Math.cos(a2) * innerR;
    const y2 = Math.sin(a2) * innerR;
    if (i === 0) ctx.moveTo(x1, y1);
    else ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner concentric seal rings
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(0, 0, innerR * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = NAVY;
  ctx.font = "bold 9px 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OFFICIAL", 0, -6);
  ctx.fillText("SEAL", 0, 6);
  ctx.restore();
};

// ─── Canvas drawing engine (1000 × 700) — Executive Diploma ───────────────

/**
 * Render a formal executive-style Certificate of Participation onto the canvas.
 * Features: warm parchment background, navy/gold framing with filigree corners,
 * academic shield crest, institution header, and center rosette seal.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} reg - registration record
 * @param {object} event - event record
 */
const drawCertificate = (ctx, reg, event) => {
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  // Warm parchment background
  ctx.fillStyle = "#fdfbf7";
  ctx.fillRect(0, 0, w, h);

  // Outer Navy Frame & Inner Gold Filigree Frame
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 10;
  ctx.strokeRect(32, 32, w - 64, h - 64);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(48, 48, w - 96, h - 96);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, w - 112, h - 112);

  // Ornamental gold corner brackets
  const corners = [
    [64, 64, 1, 1],
    [w - 64, 64, -1, 1],
    [64, h - 64, 1, -1],
    [w - 64, h - 64, -1, -1],
  ];
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * 28);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * 28, cy);
    ctx.stroke();
  });

  // Top Academic Shield Crest
  ctx.save();
  ctx.translate(w / 2, 92);
  ctx.fillStyle = NAVY;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(20, -14);
  ctx.lineTo(20, 4);
  ctx.quadraticCurveTo(20, 20, 0, 26);
  ctx.quadraticCurveTo(-20, 20, -20, 4);
  ctx.lineTo(-20, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AEMS", 0, 1);
  ctx.restore();

  // Institution Header (cleanly spaced, no character overlap)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = NAVY;
  ctx.font = "bold 16px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("UNIVERSITY ACADEMIC EVENT NETWORK", w / 2, 138);

  ctx.fillStyle = GOLD;
  ctx.font = "bold 11px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("OFFICIAL ACADEMIC CREDENTIAL", w / 2, 158);

  // Main Diploma Title
  ctx.fillStyle = NAVY;
  ctx.font = "bold 42px 'Georgia', 'Times New Roman', serif";
  ctx.fillText("Certificate of Participation", w / 2, 205);

  // Decorative gold rule under title
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 140, 232);
  ctx.lineTo(w / 2 + 140, 232);
  ctx.stroke();

  // Presentation Line
  ctx.font = "italic 20px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("This is proudly presented to", w / 2, 266);

  // Recipient Name + Gold Underline
  ctx.font = "bold 36px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText(reg.name || "Student Attendee", w / 2, 310);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 180, 330);
  ctx.lineTo(w / 2 + 180, 330);
  ctx.stroke();

  // Roll No & Recognition Text
  ctx.font = "bold 15px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Roll No: ${reg.studentId || "—"}`, w / 2, 352);

  ctx.font = "italic 18px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(
    `for active participation and successful completion of the ${event && event.type ? event.type : "Academic Event"}`,
    w / 2,
    384
  );

  // Event Title
  ctx.font = "bold 23px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText(event ? event.title : "Academic Event", w / 2, 418);

  // Department Line
  const evDept = event ? event.department || "" : "";
  const stDept = reg.department || "";
  const deptLine =
    evDept && stDept && evDept.toLowerCase() !== stDept.toLowerCase()
      ? `Organized by Department of ${evDept}  ·  Attendee Dept: ${stDept}`
      : `Organized by Department of ${evDept || stDept || "Academics"}`;
  ctx.font = "14px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(deptLine, w / 2, 448);

  // Metadata Band (Date, Venue, Verification ID)
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(110, 472);
  ctx.lineTo(w - 110, 472);
  ctx.moveTo(110, 506);
  ctx.lineTo(w - 110, 506);
  ctx.stroke();

  const dateStr = event ? formatDate(event.date) : "—";
  const certId =
    "CERT-" +
    (reg.eventId || "EVT") +
    "-" +
    (reg.regId || "").replace(/^REG-/, "");

  ctx.font = "bold 13px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = "#334155";
  ctx.textAlign = "left";
  ctx.fillText(`Date: ${dateStr}`, 120, 489);
  ctx.textAlign = "center";
  ctx.fillText(`Venue: ${event ? event.venue : "—"}`, w / 2, 489);
  ctx.textAlign = "right";
  ctx.fillText(`Verification ID: ${certId}`, w - 120, 489);

  // Signatures & Center Seal
  ctx.textAlign = "center";
  ctx.font = "italic bold 18px 'Georgia', 'Times New Roman', serif";
  ctx.fillStyle = NAVY;
  ctx.fillText(event && event.speaker ? event.speaker : "Dr. A. Sharma", 240, 568);
  ctx.fillText("Office of Academic Affairs", w - 240, 568);

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(130, 584);
  ctx.lineTo(350, 584);
  ctx.moveTo(w - 350, 584);
  ctx.lineTo(w - 130, 584);
  ctx.stroke();

  ctx.font = "bold 13px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Event Coordinator", 240, 604);
  ctx.fillText("Dean of Academics", w - 240, 604);

  drawSeal(ctx, w / 2, 568, 38);
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

  const attendance = reg.attendance || {};
  if (
    reg.status === "Cancelled" ||
    attendance.status === "Cancelled"
  ) {
    window.showToast(
      "Cannot generate certificate for a cancelled registration.",
      "error"
    );
    return;
  }

  // Eligibility gate: only Present attendance earns a certificate.
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

  if (event.status === "Cancelled") {
    window.showToast(
      "Cannot generate certificate for a cancelled event.",
      "error"
    );
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
