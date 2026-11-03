import test from "node:test";
import assert from "node:assert/strict";

// Set up mock DOM environment
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
    this.files = [];
  }

  set innerHTML(html) {
    this._innerHTML = html;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  addEventListener(event, handler) {
    this.eventListeners[event] = this.eventListeners[event] || [];
    this.eventListeners[event].push(handler);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

let scanFileShowImageArg = null;
globalThis.Html5Qrcode = class {
  constructor(containerId) {
    this.containerId = containerId;
  }
  async scanFile(file, showImage) {
    scanFileShowImageArg = showImage;
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
};

globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
  getElementById: (id) => mockElements[id] || new MockElement("div", id),
  querySelector: () => new MockElement("div"),
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

const { default: AttendanceModule } = await import("../js/attendance.js");
AttendanceModule.init();

test("manualCheckIn blocks attendance check-in for cancelled events", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-cancelled",
      title: "Cancelled Tech Talk",
      date: new Date().toISOString(),
      capacity: 50,
      status: "Cancelled",
    },
  ]);

  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-999",
      eventId: "ev-cancelled",
      studentId: "12601928",
      name: "Alice Kumar",
      status: "Registered",
    },
  ]);

  const result = AttendanceModule.manualCheckIn("12601928", "ev-cancelled");

  assert.equal(result.ok, false, "manualCheckIn should fail for cancelled event");
  assert.ok(
    result.message.includes("Cancelled"),
    `Expected message to mention Cancelled, got: "${result.message}"`
  );

  const regs = JSON.parse(store["academic_registrations_db"]);
  assert.equal(regs[0].status, "Registered", "Registration status should not change to Present");
});

test("qr-file-input passes showImage = false to Html5Qrcode.scanFile", async () => {
  const fileInput = mockElements["qr-file-input"];
  const changeHandlers = fileInput.eventListeners["change"];
  assert.ok(changeHandlers && changeHandlers.length > 0, "Change handler should be attached to qr-file-input");

  scanFileShowImageArg = null;
  const mockFile = { name: "test-pass.png" };
  await changeHandlers[0]({
    target: {
      files: [mockFile],
      value: "test-pass.png",
    },
  });

  assert.equal(
    scanFileShowImageArg,
    false,
    `Expected scanFile showImage to be false, got: ${scanFileShowImageArg}`
  );
});
