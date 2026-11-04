import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

class MockCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = "";
    this.calls = [];
  }
  fillRect(x, y, w, h) {
    this.calls.push({ method: "fillRect", x, y, w, h, fillStyle: this.fillStyle });
  }
  drawImage(source, x, y, w, h) {
    this.calls.push({ method: "drawImage", source, x, y, w, h });
  }
}

class MockElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this._innerHTML = "";
    this.value = "";
    this.hidden = false;
    this.style = {};
    this.attributes = {};
    this.dataset = {};
    this.eventListeners = {};
    this.parentElement = null;
    this.files = [];
    this.width = 0;
    this.height = 0;
    this._ctx = null;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    if (html === "") {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  getContext(type) {
    if (type === "2d") {
      if (!this._ctx) this._ctx = new MockCanvasContext(this);
      return this._ctx;
    }
    return null;
  }

  toDataURL(type) {
    return `data:${type};base64,mockCanvasData_${this.width}x${this.height}`;
  }

  appendChild(child) {
    if (child instanceof MockElement) {
      child.parentElement = this;
    }
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    return child;
  }

  addEventListener(event, handler) {
    this.eventListeners[event] = this.eventListeners[event] || [];
    this.eventListeners[event].push(handler);
  }

  click() {
    const handlers = this.eventListeners["click"] || [];
    handlers.forEach((h) => h({ preventDefault: () => {} }));
  }

  querySelector(sel) {
    if (sel === "canvas") {
      return this.children.find((c) => c.tagName === "CANVAS") || null;
    }
    if (sel === "img") {
      return this.children.find((c) => c.tagName === "IMG") || null;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  insertAdjacentHTML() {}
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

let html5QrcodeTargetId = null;
globalThis.Html5Qrcode = class {
  constructor(containerId) {
    html5QrcodeTargetId = containerId;
    this.containerId = containerId;
  }
  async scanFile(file, showImage) {
    return JSON.stringify({
      regId: "REG-001",
      eventId: "ev-1",
      studentId: "12601928",
      name: "Alice Kumar",
      registrationHash: "H1234",
    });
  }
  clear() {}
};

const mockElements = {
  "reader": new MockElement("div", "reader"),
  "scanner-event-select": new MockElement("select", "scanner-event-select"),
  "qr-file-input": new MockElement("input", "qr-file-input"),
  "manual-checkin-input": new MockElement("input", "manual-checkin-input"),
  "btn-manual-checkin": new MockElement("button", "btn-manual-checkin"),
  "roster-table-body": new MockElement("tbody", "roster-table-body"),
  "roster-event-select": new MockElement("select", "roster-event-select"),
  "live-checkin-feed": new MockElement("div", "live-checkin-feed"),
  "pass-dialog": new MockElement("dialog", "pass-dialog"),
  "qrcode-target": new MockElement("div", "qrcode-target"),
  "btn-download-qr": new MockElement("button", "btn-download-qr"),
};

mockElements["pass-dialog"].dataset.regid = "REG-999";

const dummyCanvas = new MockElement("canvas");
dummyCanvas.width = 180;
dummyCanvas.height = 180;
mockElements["qrcode-target"].appendChild(dummyCanvas);

let createdCanvases = [];
let downloadedHref = null;
globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
  getElementById: (id) => {
    if (mockElements[id]) return mockElements[id];
    const findInTree = (node) => {
      if (!node) return null;
      if (node.id === id) return node;
      for (const child of node.children || []) {
        const found = findInTree(child);
        if (found) return found;
      }
      return null;
    };
    return findInTree(globalThis.document?.body);
  },
  querySelector: () => new MockElement("div"),
  querySelectorAll: () => [],
  createElement: (tag) => {
    const el = new MockElement(tag);
    if (tag.toLowerCase() === "canvas") {
      createdCanvases.push(el);
    }
    if (tag.toLowerCase() === "a") {
      // Intercept click to read href
      const originalClick = el.click.bind(el);
      el.click = () => {
        downloadedHref = el.href;
        originalClick();
      };
    }
    return el;
  },
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

const { default: RegistrationModule } = await import("../js/registration.js");
const { default: AttendanceModule } = await import("../js/attendance.js");
AttendanceModule.init();

test("download QR pass creates a padded 220x220 canvas with quiet zone", () => {
  createdCanvases = [];
  downloadedHref = null;

  mockElements["btn-download-qr"].click();

  // Find export canvas
  const exportCanvas = createdCanvases.find((c) => c.width === 220 && c.height === 220);
  assert.ok(exportCanvas, "Expected an export canvas with dimensions 220x220 to be created for quiet-zone margin");

  const ctx = exportCanvas._ctx;
  assert.ok(ctx, "Export canvas 2D context should be used");
  const fillRectCall = ctx.calls.find((c) => c.method === "fillRect");
  assert.ok(fillRectCall, "Export canvas should be filled with white background");
  assert.equal(fillRectCall.fillStyle, "#ffffff");
  assert.equal(fillRectCall.w, 220);
  assert.equal(fillRectCall.h, 220);

  const drawImageCall = ctx.calls.find((c) => c.method === "drawImage");
  assert.ok(drawImageCall, "Export canvas should draw the source QR image with padding");
  assert.equal(drawImageCall.x, 20);
  assert.equal(drawImageCall.y, 20);
  assert.equal(drawImageCall.w, 180);
  assert.equal(drawImageCall.h, 180);

  assert.ok(downloadedHref && downloadedHref.includes("220x220"), "Download link should use the padded canvas data URL");
});

test("qr-file-input uses dedicated hidden qr-file-reader element instead of clearing reader", async () => {
  html5QrcodeTargetId = null;
  const fileInput = mockElements["qr-file-input"];
  const changeHandlers = fileInput.eventListeners["change"];
  assert.ok(changeHandlers && changeHandlers.length > 0, "Change handler must be registered on qr-file-input");

  await changeHandlers[0]({
    target: {
      files: [{ name: "pass.png" }],
      value: "pass.png",
    },
  });

  assert.equal(
    html5QrcodeTargetId,
    "qr-file-reader",
    `Expected Html5Qrcode to be initialized with 'qr-file-reader', but was '${html5QrcodeTargetId}'`
  );

  const fileReaderEl = document.getElementById("qr-file-reader");
  assert.ok(fileReaderEl, "Dedicated #qr-file-reader element should exist in DOM");
  assert.equal(fileReaderEl.hidden, true, "#qr-file-reader element should be hidden");
});

test("css/print.css hides dialog::backdrop and sizes #pass-dialog #qrcode-target canvas/img", () => {
  const css = fs.readFileSync(path.resolve("css/print.css"), "utf-8");

  assert.ok(
    css.includes("dialog::backdrop"),
    "css/print.css must include a rule for dialog::backdrop"
  );
  assert.ok(
    css.includes("width: 128px !important") && css.includes("height: 128px !important"),
    "css/print.css must scale #pass-dialog #qrcode-target canvas/img to 128px"
  );
  assert.ok(
    css.includes("object-fit: contain !important"),
    "css/print.css must set object-fit: contain !important on #pass-dialog #qrcode-target canvas/img"
  );
});
