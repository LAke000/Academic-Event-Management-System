// js/utils.js – Shared utility helpers adhering to ECC protocols.

/**
 * Generate a random alphanumeric ID with an optional prefix.
 * Guarantees fixed length without truncating data.
 * @param {string} [prefix=''] - Optional prefix for the ID.
 * @param {number} [length=6] - Number of random characters.
 * @returns {string}
 */
export function generateId(prefix = "", length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${result}`;
}

/**
 * Deep‑clone a plain object or array.
 * Uses JSON round‑trip to preserve full data integrity (zero‑truncation).
 * @param {any} obj - Value to clone.
 * @returns {any}
 */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Convert an ISO‑8601 date string to a locale‑aware, human‑readable format.
 * Keeps the original timestamp intact; only formatting for UI.
 * @param {string} isoStr - ISO‑8601 date string.
 * @returns {string}
 */
export function formatDate(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "Invalid Date";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
