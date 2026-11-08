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
    this.parentElement = null;
    this.disabled = false;
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

  get textContent() {
    return this._innerHTML || "";
  }

  set textContent(text) {
    this._innerHTML = String(text);
  }

  appendChild(child) {
    if (child && child.textContent !== undefined && !this._innerHTML) {
      this._innerHTML = child.textContent;
    }
    if (child instanceof MockElement) {
      child.parentElement = this;
    }
    this.children.push(child);
    return child;
  }

  insertBefore(newNode, refNode) {
    if (newNode instanceof MockElement) {
      newNode.parentElement = this;
    }
    this.children.push(newNode);
    return newNode;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
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

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const handlers = this.eventListeners[type] || [];
    handlers.forEach((h) => h(event));
  }

  querySelector(sel) {
    return null;
  }

  querySelectorAll(sel) {
    return [];
  }

  reset() {
    this.value = "";
  }

  showModal() {}
  close() {
    this.dispatchEvent({ type: "close" });
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
  "registration-dialog": new MockElement("dialog", "registration-dialog"),
  "registration-form": new MockElement("form", "registration-form"),
  "reg-student-preset": new MockElement("select", "reg-student-preset"),
  "reg-event-id": new MockElement("input", "reg-event-id"),
  "reg-student-name": new MockElement("input", "reg-student-name"),
  "reg-student-id": new MockElement("input", "reg-student-id"),
  "reg-email": new MockElement("input", "reg-email"),
  "reg-department": new MockElement("input", "reg-department"),
  "reg-form-error": new MockElement("div", "reg-form-error"),
  "reg-cancel-btn": new MockElement("button", "reg-cancel-btn"),
  "reg-clear-btn": new MockElement("button", "reg-clear-btn"),
  "reg-fill-active-btn": new MockElement("button", "reg-fill-active-btn"),
  "passes-list": new MockElement("div", "passes-list"),
  "passes-empty": new MockElement("div", "passes-empty"),
  "pass-dialog": new MockElement("dialog", "pass-dialog"),
  "qrcode-target": new MockElement("div", "qrcode-target"),
  // Events tab & discover elements
  "discover-list": new MockElement("div", "discover-list"),
  "discover-empty": new MockElement("div", "discover-empty"),
  "events-table-body": new MockElement("tbody", "events-table-body"),
  "events-list": new MockElement("div", "events-list"),
  "events-empty": new MockElement("div", "events-empty"),
  // Dashboard stats
  "stat-events": new MockElement("span", "stat-events"),
  "stat-registrations": new MockElement("span", "stat-registrations"),
  "stat-present": new MockElement("span", "stat-present"),
  "stat-feedback": new MockElement("span", "stat-feedback"),
  "stat-turnout-rate": new MockElement("span", "stat-turnout-rate"),
  "stat-noshow-rate": new MockElement("span", "stat-noshow-rate"),
  "stat-avg-rating": new MockElement("span", "stat-avg-rating"),
};

globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
  getElementById: (id) => mockElements[id] || new MockElement("div", id),
  querySelector: (sel) => {
    if (sel === "#registration-dialog") return mockElements["registration-dialog"];
    if (sel === "#events-table-body") return mockElements["events-table-body"];
    return new MockElement("div");
  },
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

const { default: StorageService } = await import("../js/storage.js");
const { default: RegistrationModule } = await import("../js/registration.js");

test("RegistrationModule email regex validates full domain format", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-reg-email",
      title: "Email Test Event",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 10,
      status: "Open",
    },
  ]);
  store["academic_registrations_db"] = JSON.stringify([]);

  mockElements["reg-event-id"].value = "ev-reg-email";
  mockElements["reg-student-name"].value = "Alice";
  mockElements["reg-student-id"].value = "12601928";
  mockElements["reg-department"].value = "CSE";

  // Invalid email without dot domain e.g. "alice@university"
  mockElements["reg-email"].value = "alice@university";
  RegistrationModule.handleRegistrationSubmit({ preventDefault: () => {} });
  assert.equal(
    mockElements["reg-form-error"].textContent,
    "Please enter a valid University Email (e.g. name@university.edu)."
  );

  // Invalid email with spaces
  mockElements["reg-email"].value = "alice @university.edu";
  RegistrationModule.handleRegistrationSubmit({ preventDefault: () => {} });
  assert.equal(
    mockElements["reg-form-error"].textContent,
    "Please enter a valid University Email (e.g. name@university.edu)."
  );

  // Valid email passes validation
  mockElements["reg-email"].value = "alice.kumar@university.edu";
  RegistrationModule.handleRegistrationSubmit({ preventDefault: () => {} });
  assert.equal(
    mockElements["reg-form-error"].textContent,
    "",
    "Valid email should pass registration without validation error"
  );
});

test("Capacity check ignores cancelled registrations during handleRegistrationSubmit", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-cap-test",
      title: "Cap Test Event",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 1,
      registered: 1,
      status: "Housefull",
    },
  ]);
  // 1 cancelled registration exists
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-OLD-1",
      eventId: "ev-cap-test",
      studentId: "12699999",
      name: "Old Student",
      email: "old@university.edu",
      department: "CSE",
      status: "Cancelled",
      attendance: { status: "Cancelled" },
    },
  ]);

  mockElements["reg-event-id"].value = "ev-cap-test";
  mockElements["reg-student-name"].value = "New Student";
  mockElements["reg-student-id"].value = "12611111";
  mockElements["reg-email"].value = "new@university.edu";
  mockElements["reg-department"].value = "CSE";

  RegistrationModule.handleRegistrationSubmit({ preventDefault: () => {} });

  assert.equal(mockElements["reg-form-error"].textContent, "", "Should not block registration when only cancelled registrations exist");
  const allEvents = JSON.parse(store["academic_events_db"]);
  assert.equal(allEvents[0].registered, 1, "registered count should be activeRegs.length + 1");
});

test("Quick-Fill known student preset populates and switches student fields", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-preset-test",
      title: "Preset Test Event",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 10,
      status: "Open",
    },
  ]);
  store["academic_students_db"] = JSON.stringify([
    { studentId: "12601928", name: "Alice Kumar", email: "alice.kumar@example.edu", department: "CSE" },
    { studentId: "12601929", name: "Bob Singh", email: "bob.singh@example.edu", department: "CSE" },
  ]);
  store["academic_registrations_db"] = JSON.stringify([]);
  store["academic_active_student"] = JSON.stringify("12601928");

  // Open modal should populate preset dropdown and prefill active student
  RegistrationModule.openRegistrationModal("ev-preset-test");
  assert.equal(mockElements["reg-student-name"].value, "Alice Kumar");
  assert.equal(mockElements["reg-student-preset"].value, "12601928");

  // Select Bob from preset dropdown
  mockElements["reg-student-preset"].value = "12601929";
  mockElements["reg-student-preset"].dispatchEvent({ type: "change", target: { value: "12601929" } });
  assert.equal(mockElements["reg-student-name"].value, "Bob Singh");
  assert.equal(mockElements["reg-student-id"].value, "12601929");
  assert.equal(mockElements["reg-email"].value, "bob.singh@example.edu");
  assert.equal(mockElements["reg-department"].value, "CSE");

  // Select "" (custom / new student)
  mockElements["reg-student-preset"].value = "";
  mockElements["reg-student-preset"].dispatchEvent({ type: "change", target: { value: "" } });
  assert.equal(mockElements["reg-student-name"].value, "");
  assert.equal(mockElements["reg-student-id"].value, "");
  assert.equal(mockElements["reg-email"].value, "");
  assert.equal(mockElements["reg-department"].value, "");
});

test("dialogEl close event clears reg-form-error (Escape key cleanup)", () => {
  mockElements["reg-form-error"].textContent = "Some error";
  mockElements["reg-form-error"].hidden = false;

  mockElements["registration-dialog"].close();

  assert.equal(mockElements["reg-form-error"].textContent, "");
  assert.equal(mockElements["reg-form-error"].hidden, true);
});
