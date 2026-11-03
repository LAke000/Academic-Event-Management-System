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
  close() {}
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
  "reg-event-id": new MockElement("input", "reg-event-id"),
  "reg-student-name": new MockElement("input", "reg-student-name"),
  "reg-student-id": new MockElement("input", "reg-student-id"),
  "reg-email": new MockElement("input", "reg-email"),
  "reg-department": new MockElement("input", "reg-department"),
  "reg-form-error": new MockElement("div", "reg-form-error"),
  "reg-cancel-btn": new MockElement("button", "reg-cancel-btn"),
  "reg-clear-btn": new MockElement("button", "reg-clear-btn"),
  "reg-submit-btn": new MockElement("button", "reg-submit-btn"),
  "passes-list": new MockElement("div", "passes-list"),
  "passes-empty": new MockElement("div", "passes-empty"),
  "pass-dialog": new MockElement("dialog", "pass-dialog"),
  "qrcode-target": new MockElement("div", "qrcode-target"),
};

// Setup pass list parent
const passesParent = new MockElement("div", "passes-parent");
passesParent.appendChild(mockElements["passes-list"]);

globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
  getElementById: (id) => mockElements[id] || new MockElement("div", id),
  querySelector: (sel) => {
    if (sel === "#registration-dialog") return mockElements["registration-dialog"];
    return new MockElement("div");
  },
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

const { default: RegistrationModule } = await import("../js/registration.js");

test("openRegistrationModal() autofills known student details when registrations are empty", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-101",
      title: "AI Workshop",
      date: new Date().toISOString(),
      capacity: 50,
      status: "Upcoming",
    },
  ]);
  // Registrations are empty
  store["academic_registrations_db"] = JSON.stringify([]);

  // Active student in switcher is Carol Lee (known student with 0 registrations)
  store["academic_active_student"] = JSON.stringify("12601930");
  store["academic_students_db"] = JSON.stringify([
    {
      studentId: "12601930",
      name: "Carol Lee",
      email: "carol.lee@example.edu",
      department: "IT",
    },
  ]);

  RegistrationModule.openRegistrationModal("ev-101");

  const nameVal = mockElements["reg-student-name"].value;
  const idVal = mockElements["reg-student-id"].value;
  const emailVal = mockElements["reg-email"].value;
  const deptVal = mockElements["reg-department"].value;

  assert.equal(idVal, "12601930", "Student ID should be prefilled");
  assert.equal(nameVal, "Carol Lee", "Student Name should be prefilled from known students");
  assert.equal(emailVal, "carol.lee@example.edu", "Student Email should be prefilled from known students");
  assert.equal(deptVal, "IT", "Student Department should be prefilled from known students");
});

test("renderPassCard() displays 'Feedback Submitted' badge when feedback exists for a Present student", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-101",
      title: "AI Workshop",
      date: new Date().toISOString(),
      capacity: 50,
      status: "Upcoming",
    },
  ]);

  store["academic_active_student"] = JSON.stringify("12601930");
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-001",
      eventId: "ev-101",
      studentId: "12601930",
      name: "Carol Lee",
      email: "carol.lee@example.edu",
      department: "IT",
      status: "Present",
      attendance: { status: "Present" },
    },
  ]);

  // Feedback has already been submitted for this event & student
  store["academic_feedback_db"] = JSON.stringify([
    {
      id: "fb-1",
      eventId: "ev-101",
      studentId: "12601930",
      rating: 5,
      comment: "Great session!",
    },
  ]);

  // Render passes
  RegistrationModule.renderPasses();

  // Inspect the generated card in passes-list
  const passCard = mockElements["passes-list"].children[0];
  assert.ok(passCard, "Pass card should be rendered");
  const cardHtml = passCard.innerHTML;

  assert.ok(
    cardHtml.includes("Feedback Submitted ✓"),
    `Expected pass card to include 'Feedback Submitted ✓', got: ${cardHtml}`
  );
  assert.ok(
    !cardHtml.includes("btn-submit-feedback"),
    `Expected pass card to not include 'btn-submit-feedback' button when feedback already submitted`
  );
});

test("handleRegistrationSubmit blocks registration for cancelled events", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-cancelled",
      title: "Cancelled Tech Talk",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 50,
      status: "Cancelled",
    },
  ]);
  store["academic_registrations_db"] = JSON.stringify([]);

  mockElements["reg-event-id"].value = "ev-cancelled";
  mockElements["reg-student-name"].value = "Dave Test";
  mockElements["reg-student-id"].value = "12345678";
  mockElements["reg-email"].value = "dave@example.edu";
  mockElements["reg-department"].value = "CS";

  let prevented = false;
  RegistrationModule.handleRegistrationSubmit({
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(
    mockElements["reg-form-error"].textContent,
    "Cannot register: This event has been cancelled."
  );
  const regs = JSON.parse(store["academic_registrations_db"] || "[]");
  assert.equal(regs.length, 0, "No registration should be created for a cancelled event");
});
