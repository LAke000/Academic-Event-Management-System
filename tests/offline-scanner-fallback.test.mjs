import test from "node:test";
import assert from "node:assert/strict";

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
    this.srcObject = null;
    this.autoplay = false;
    this.playsInline = false;
    this.muted = false;
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

  async play() {}
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
  "scanner-view": new MockElement("div", "scanner-view"),
  "scanner-empty": new MockElement("div", "scanner-empty"),
  "btn-start-scanner": new MockElement("button", "btn-start-scanner"),
  "btn-stop-scanner": new MockElement("button", "btn-stop-scanner"),
  "btn-camera-toggle": new MockElement("button", "btn-camera-toggle"),
  "scanner-event-select": new MockElement("select", "scanner-event-select"),
  "qr-file-input": new MockElement("input", "qr-file-input"),
  "manual-checkin-search": new MockElement("input", "manual-checkin-search"),
  "btn-manual-checkin": new MockElement("button", "btn-manual-checkin"),
  "roster-table-body": new MockElement("tbody", "roster-table-body"),
  "roster-event-select": new MockElement("select", "roster-event-select"),
  "live-checkin-feed": new MockElement("div", "live-checkin-feed"),
  "scanner-override-body": new MockElement("tbody", "scanner-override-body"),
};

globalThis.window = globalThis;
let toastLogs = [];
globalThis.window.showToast = (msg, type) => {
  toastLogs.push({ msg, type });
};

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

// Ensure Html5Qrcode is explicitly undefined to simulate complete offline mode
delete globalThis.Html5Qrcode;

let tracksStopped = false;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop: () => {
                tracksStopped = true;
              },
            },
          ],
        }),
      },
    },
    configurable: true,
    writable: true,
  });
} catch (_e) {
  try {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop: () => {
                tracksStopped = true;
              },
            },
          ],
        }),
      },
      configurable: true,
      writable: true,
    });
  } catch (_e2) {
    globalThis.navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop: () => {
              tracksStopped = true;
            },
          },
        ],
      }),
    };
  }
}

globalThis.BarcodeDetector = class {
  constructor() {}
  async detect() {
    return [];
  }
};

test("AttendanceModule handles Html5Qrcode === undefined without throwing or showing 'not loaded' error", async () => {
  const { default: AttendanceModule } = await import("../js/attendance.js");

  toastLogs = [];
  tracksStopped = false;

  await AttendanceModule.startScanner();

  // Verify no "QR scanner library not loaded" toast was displayed
  const errorToast = toastLogs.find(
    (t) => t.msg && t.msg.includes("QR scanner library not loaded")
  );
  assert.equal(
    errorToast,
    undefined,
    "startScanner should not display 'QR scanner library not loaded'"
  );

  // Verify native video element was mounted inside #reader
  const readerEl = mockElements["reader"];
  const videoChild = readerEl.children.find((c) => c.tagName === "VIDEO");
  assert.ok(videoChild, "Native <video> should be attached to #reader when Html5Qrcode is undefined");
  assert.ok(videoChild.srcObject, "Native video should have media stream attached");

  // Verify stopScanner gracefully stops stream and cleans up
  await AttendanceModule.stopScanner();
  assert.ok(tracksStopped, "Native media stream tracks should be stopped on stopScanner");
  assert.equal(readerEl.children.length, 0, "#reader should be cleared on stopScanner");
});

test("AttendanceModule decodes uploaded QR-Pass-REG-8822.png offline when Html5Qrcode === undefined", async () => {
  const { default: StorageService } = await import("../js/storage.js");
  const { default: AttendanceModule } = await import("../js/attendance.js");

  store["academic_events_db"] = JSON.stringify([
    { id: "EVT-OFFLINE", title: "Offline Event", status: "Open" },
  ]);

  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-8822",
      eventId: "EVT-OFFLINE",
      studentId: "12601928",
      name: "Alice Kumar",
      status: "Registered",
      attendance: { status: "Registered" },
    },
  ]);

  AttendanceModule.init();

  const fileInput = mockElements["qr-file-input"];
  const changeHandlers = fileInput.eventListeners["change"];
  assert.ok(
    changeHandlers && changeHandlers.length > 0,
    "Change handler must be registered on qr-file-input"
  );

  toastLogs = [];

  // Trigger change handler with uploaded QR file
  await changeHandlers[changeHandlers.length - 1]({
    target: {
      files: [{ name: "QR-Pass-REG-8822.png" }],
      value: "QR-Pass-REG-8822.png",
    },
  });

  // Verify no library error toast
  const errorToast = toastLogs.find(
    (t) => t.msg && t.msg.includes("QR scanner library not loaded")
  );
  assert.equal(
    errorToast,
    undefined,
    "Uploading QR pass should never display 'QR scanner library not loaded'"
  );

  // Verify success toast was displayed
  const successToast = toastLogs.find(
    (t) => t.type === "success" && t.msg.includes("checked in")
  );
  assert.ok(
    successToast,
    `Expected success check-in toast, got: ${JSON.stringify(toastLogs)}`
  );

  // Verify database record was marked Present
  const updatedRegs = JSON.parse(store["academic_registrations_db"]);
  const reg = updatedRegs.find((r) => r.regId === "REG-8822");
  assert.equal(reg.status, "Present", "REG-8822 should be marked Present offline");
  assert.ok(reg.checkInTime, "REG-8822 should have checkInTime set");
});
