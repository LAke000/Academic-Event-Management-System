import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
    if (html === "") this.children = [];
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

const mockElements = {
  "reader": new MockElement("div", "reader"),
  "scanner-event-select": new MockElement("select", "scanner-event-select"),
  "qr-file-input": new MockElement("input", "qr-file-input"),
  "manual-checkin-input": new MockElement("input", "manual-checkin-input"),
  "btn-manual-checkin": new MockElement("button", "btn-manual-checkin"),
  "roster-table-body": new MockElement("tbody", "roster-table-body"),
  "roster-event-select": new MockElement("select", "roster-event-select"),
  "live-checkin-feed": new MockElement("div", "live-checkin-feed"),
  "scanner-override-body": new MockElement("tbody", "scanner-override-body"),
};

globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
  getElementById: (id) => mockElements[id] || null,
  querySelector: () => new MockElement("div"),
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

// Mock Html5Qrcode throwing to simulate offline scan failure
globalThis.Html5Qrcode = class {
  constructor(elementId) {
    this.elementId = elementId;
  }
  async scanFile() {
    throw new Error("Offline scan failure / CDN unavailable");
  }
  clear() {}
};

test("attendance.js static assertions: duplicate check phrasing, updatedAt on absent, scanner feed includes absent, filename fallback", () => {
  const src = fs.readFileSync(path.resolve("js/attendance.js"), "utf-8");

  // Duplicate check phrasing and fallback
  assert.ok(
    src.includes("Already Marked Present (Checked in at"),
    "processQrPayload must include 'Already Marked Present (Checked in at ...)'"
  );
  assert.ok(
    src.includes("reg.checkInTime || reg.attendance?.checkInTime"),
    "processQrPayload must fall back to reg.attendance?.checkInTime"
  );

  // markStudentAttendance sets updatedAt on Absent
  assert.ok(
    src.includes("reg.updatedAt = now") || src.includes("updatedAt = now"),
    "markStudentAttendance must record updatedAt on Absent overrides"
  );

  // renderLiveCheckinFeed filters Present and Absent
  assert.ok(
    src.includes('st === "Present" || st === "Absent"'),
    "renderLiveCheckinFeed must filter for both Present and Absent"
  );
  assert.ok(
    src.includes("badge--absent"),
    "renderLiveCheckinFeed must render badge--absent for Absent status"
  );

  // #qr-file-input catch block filename fallback
  assert.ok(
    src.includes("file.name.match(/REG-[A-Z0-9]+/i)"),
    "qr-file-input catch block must extract REG-xxxx from file.name"
  );
  assert.ok(
    src.includes("fallbackReg"),
    "qr-file-input catch block must use fallbackReg for offline fallback"
  );
});

test("attendance.js behavioral: processQrPayload duplicate check uses attendance.checkInTime and rubric phrasing", async () => {
  const { default: StorageService } = await import("../js/storage.js");
  const { default: AttendanceModule } = await import("../js/attendance.js");

  store["academic_events_db"] = JSON.stringify([
    { id: "EVT-TEST", title: "Test Event", status: "Open" },
  ]);

  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-DUP-1",
      eventId: "EVT-TEST",
      studentId: "12601928",
      name: "Alice Kumar",
      status: "Present",
      attendance: { status: "Present", checkInTime: "2026-11-15T09:30:00.000Z" },
    },
  ]);

  const rawKey = "EVT-TEST:12601928:REG-DUP-1";
  let hash = 0;
  for (let i = 0; i < rawKey.length; i++) {
    hash = (hash << 5) - hash + rawKey.charCodeAt(i);
    hash |= 0;
  }
  const payload = JSON.stringify({
    regId: "REG-DUP-1",
    eventId: "EVT-TEST",
    studentId: "12601928",
    name: "Alice Kumar",
    registrationHash: "H" + Math.abs(hash).toString(16).toUpperCase(),
  });

  const res = AttendanceModule.processQrPayload(payload, "EVT-TEST");
  assert.equal(res.ok, false);
  assert.equal(res.type, "warning");
  assert.ok(
    res.message.includes("Already Marked Present (Checked in at"),
    `Expected duplicate check message to include 'Already Marked Present (Checked in at', got: ${res.message}`
  );
  assert.ok(
    res.message.includes("Duplicate scan ignored."),
    `Expected duplicate scan ignored, got: ${res.message}`
  );
});

test("attendance.js behavioral: markStudentAttendance records updatedAt on Absent and renderLiveCheckinFeed shows Absent badge", async () => {
  const { default: StorageService } = await import("../js/storage.js");
  const { default: AttendanceModule } = await import("../js/attendance.js");

  store["academic_events_db"] = JSON.stringify([
    { id: "EVT-TEST-2", title: "Test Event 2", status: "Open" },
  ]);

  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-FEED-1",
      eventId: "EVT-TEST-2",
      studentId: "12601929",
      name: "Bob Singh",
      status: "Registered",
      attendance: { status: "Registered" },
    },
  ]);

  // Mark as Absent
  const res = AttendanceModule.markStudentAttendance("REG-FEED-1", "Absent", "EVT-TEST-2");
  assert.equal(res.ok, true);

  const updatedRegs = JSON.parse(store["academic_registrations_db"]);
  const reg = updatedRegs.find((r) => r.regId === "REG-FEED-1");
  assert.equal(reg.status, "Absent");
  assert.ok(reg.updatedAt, "reg.updatedAt should be set when marked Absent");

  // Verify renderLiveCheckinFeed renders Absent row and badge--absent
  AttendanceModule.renderLiveCheckinFeed();
  const feedTbody = mockElements["scanner-override-body"];
  assert.ok(feedTbody.children.length > 0, "Feed should contain the absent record");
  const rowHtml = feedTbody.children[0].innerHTML;
  assert.ok(rowHtml.includes("badge--absent"), `Row should include badge--absent, got: ${rowHtml}`);
  assert.ok(rowHtml.includes("Absent"), `Row should show Absent text, got: ${rowHtml}`);
});

test("attendance.js behavioral: qr-file-input catch block falls back to filename REG-xxxx", async () => {
  const { default: StorageService } = await import("../js/storage.js");
  const { default: AttendanceModule } = await import("../js/attendance.js");

  store["academic_events_db"] = JSON.stringify([
    { id: "EVT-FALLBACK", title: "Fallback Event", status: "Open" },
  ]);

  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-8899",
      eventId: "EVT-FALLBACK",
      studentId: "12601930",
      name: "Carol Lee",
      status: "Registered",
      attendance: { status: "Registered" },
    },
  ]);

  AttendanceModule.init();

  const fileInput = mockElements["qr-file-input"];
  const changeHandlers = fileInput.eventListeners["change"];
  assert.ok(changeHandlers && changeHandlers.length > 0, "Change handler must be registered on qr-file-input");

  let scanToastMsg = "";
  let scanToastType = "";
  const originalToast = globalThis.window.showToast;
  globalThis.window.showToast = (msg, type) => {
    scanToastMsg = msg;
    scanToastType = type;
  };

  // Simulate file upload that triggers Html5Qrcode error but has valid filename
  await changeHandlers[changeHandlers.length - 1]({
    target: {
      files: [{ name: "QR-Pass-REG-8899.png" }],
      value: "QR-Pass-REG-8899.png",
    },
  });

  const updatedRegs = JSON.parse(store["academic_registrations_db"]);
  const reg = updatedRegs.find((r) => r.regId === "REG-8899");
  assert.equal(reg.status, "Present", "Offline fallback should successfully mark registration Present");
  assert.ok(reg.checkInTime, "checkInTime should be set");

  globalThis.window.showToast = originalToast;
});
