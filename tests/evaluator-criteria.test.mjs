import test from "node:test";
import assert from "node:assert/strict";

// ─── Mock Environment ─────────────────────────────────────────────────────────

const _store = {};

const mockLocalStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null; },
  setItem(key, val) { _store[key] = String(val); },
  removeItem(key) { delete _store[key]; },
  clear() { for (const k of Object.keys(_store)) delete _store[k]; },
};

globalThis.localStorage = mockLocalStorage;

class MockElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this._innerHTML = "";
    this.value = "";
    this.hidden = false;
    this.open = false;
    this.checked = false;
    this.style = {};
    this.attributes = {};
    this.dataset = {};
    this.eventListeners = {};
    this.parentElement = null;
    this.disabled = false;
    this.className = "";
    const classes = new Set();
    this.classList = {
      _el: this,
      add(...cls) { cls.forEach((c) => classes.add(c)); },
      remove(...cls) { cls.forEach((c) => classes.delete(c)); },
      toggle(cls, force) {
        if (force === undefined) {
          classes.has(cls) ? classes.delete(cls) : classes.add(cls);
        } else if (force) {
          classes.add(cls);
        } else {
          classes.delete(cls);
        }
      },
      contains(cls) { return classes.has(cls); },
    };
  }

  get options() {
    return this.children.filter((c) => c.tagName === "OPTION");
  }

  set innerHTML(html) {
    this._innerHTML = html;
    if (html === "") this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  get textContent() { return this._innerHTML || ""; }
  set textContent(text) { this._innerHTML = String(text); }

  appendChild(child) {
    if (child && !(child instanceof MockElement)) {
      this._innerHTML = child.textContent !== undefined ? String(child.textContent) : String(child);
      return child;
    }
    if (child instanceof MockElement) child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(newNode) {
    if (newNode instanceof MockElement) newNode.parentElement = this;
    this.children.push(newNode);
    return newNode;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    return child;
  }
  querySelector(sel) {
    if (sel.startsWith("#")) return globalThis.document.getElementById(sel.slice(1));
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return this.children.find((c) => c.classList?.contains?.(cls)) || null;
    }
    return null;
  }
  querySelectorAll(sel) {
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return this.children.filter((c) => c.classList?.contains?.(cls));
    }
    return [];
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }

  addEventListener(event, handler) {
    this.eventListeners[event] = this.eventListeners[event] || [];
    this.eventListeners[event].push(handler);
  }
  removeEventListener(event, handler) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
  }
  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const handlers = this.eventListeners[type] || [];
    handlers.forEach((h) => h(event));
  }

  focus() {}
  reset() { this.value = ""; }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.dispatchEvent({ type: "close" });
  }
  getContext() {
    return {
      fillRect() {},
      strokeRect() {},
      clearRect() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      arc() {},
      fill() {},
      stroke() {},
      fillText() {},
      measureText() { return { width: 100 }; },
      drawImage() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {},
      setLineDash() {},
    };
  }
  toDataURL() { return "data:image/png;base64,mock"; }
}

const _elements = {};
const bodyEl = new MockElement("body", "body");

const setupAuthDialogElements = () => {
  const ids = [
    "auth-dialog", "auth-dialog-title", "btn-close-auth", "auth-tab-student", "auth-tab-admin",
    "auth-banner-error", "auth-banner-info", "auth-form-error",
    "auth-form-student", "auth-student-form", "auth-student-id", "auth-student-hint",
    "auth-student-new-fields", "auth-new-student-fields",
    "auth-student-name", "auth-student-email", "auth-student-dept",
    "btn-quick-student", "btn-cancel-auth-student", "btn-submit-student-auth", "auth-student-submit",
    "auth-form-admin", "auth-admin-form", "auth-admin-username", "auth-admin-user",
    "auth-admin-passcode", "auth-admin-pass", "btn-quick-admin",
    "btn-cancel-auth-admin", "btn-submit-admin-auth", "auth-admin-submit"
  ];
  ids.forEach((id) => {
    _elements[id] = new MockElement(id.startsWith("auth-tab") || id.startsWith("btn-") ? "button" : "div", id);
  });

  _elements["auth-student-form"] = _elements["auth-form-student"];
  _elements["auth-new-student-fields"] = _elements["auth-student-new-fields"];
  _elements["auth-student-submit"] = _elements["btn-submit-student-auth"];
  _elements["auth-form-error"] = _elements["auth-banner-error"];
  _elements["auth-admin-form"] = _elements["auth-form-admin"];
  _elements["auth-admin-user"] = _elements["auth-admin-username"];
  _elements["auth-admin-pass"] = _elements["auth-admin-passcode"];

  const dialog = _elements["auth-dialog"];
  const closeBtn = _elements["btn-close-auth"];
  closeBtn.classList.add("dialog-close");
  dialog.children = [closeBtn];

  _elements["auth-student-new-fields"].hidden = true;
  _elements["auth-form-admin"].hidden = true;
  _elements["auth-banner-error"].hidden = true;
  _elements["auth-banner-error"].textContent = "";
  _elements["auth-banner-info"].hidden = true;
  _elements["auth-banner-info"].textContent = "";
  _elements["btn-submit-student-auth"].textContent = "Continue";
};

[
  "registration-dialog", "registration-form", "reg-student-preset",
  "reg-event-id", "reg-student-name", "reg-student-id", "reg-email",
  "reg-department", "reg-form-error", "reg-cancel-btn", "reg-clear-btn",
  "reg-fill-active-btn", "passes-list", "passes-empty", "pass-dialog",
  "qrcode-target", "btn-print-pass", "btn-close-pass", "pass-badge",
  "pass-title", "pass-department", "pass-venue", "pass-datetime",
  "pass-studentid", "pass-email", "pass-regid", "reminders-banner",
  "chip-name", "chip-status", "chip-avatar", "btn-auth-action",
  "student-switcher", "role-toggle", "btn-seed-data", "toast-container",
  "discover-list", "discover-empty", "reminders-banner-discover",
  "event-search-input", "dept-filter-select", "type-filter-select",
  "avail-filter-select", "date-filter-input", "event-create-dialog",
  "event-create-form", "btn-create-event", "btn-cancel-event",
  "dashboard", "dashboard-empty", "passes", "history", "admin-events",
  "scanner", "analytics", "btn-clear-data", "feedback-dialog",
  "feedback-form", "star-rating", "star-hint", "feedback-comments",
  "btn-submit-feedback", "btn-cancel-feedback", "feedback-list",
  "feedback-empty", "feedback-form-error", "certificate-dialog",
  "certificate-canvas", "certCanvas", "btn-download-cert", "btn-print-cert", "btn-close-cert",
].forEach((id) => {
  if (!_elements[id]) _elements[id] = new MockElement("div", id);
});

if (_elements["feedback-form"]) {
  _elements["feedback-form"].elements = {
    eventId: new MockElement("input", "feedback-event-id"),
  };
}

if (_elements["discover-list"] && !_elements["discover-list"].parentElement) {
  const discoverWrapper = new MockElement("div", "discover-wrapper");
  discoverWrapper.appendChild(_elements["discover-list"]);
}

bodyEl.insertAdjacentHTML = (_pos, _html) => {
  setupAuthDialogElements();
};

globalThis.document = {
  readyState: "complete",
  body: bodyEl,
  createElement(tagName) { return new MockElement(tagName); },
  createTextNode(str) { return { textContent: String(str ?? "") }; },
  getElementById(id) {
    return _elements[id] || null;
  },
  querySelector(sel) {
    if (sel.startsWith("#")) return globalThis.document.getElementById(sel.slice(1));
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
};

globalThis.window = globalThis;
let toastMessage = "";
let toastType = "";
globalThis.window.showToast = (msg, type) => {
  toastMessage = msg;
  toastType = type;
};

// ─── Module Imports ──────────────────────────────────────────────────────────

const { default: StorageService } = await import("../js/storage.js");
const { default: AuthModule } = await import("../js/auth.js");
const { default: RegistrationModule } = await import("../js/registration.js");
const { default: EventsModule } = await import("../js/events.js");
const { default: FeedbackModule } = await import("../js/feedback.js");
const { default: CertificateModule } = await import("../js/certificate.js");

globalThis.window.EventsModule = EventsModule;
globalThis.window.RegistrationModule = RegistrationModule;
globalThis.window.AuthModule = AuthModule;
globalThis.window.FeedbackModule = FeedbackModule;
globalThis.window.CertificateModule = CertificateModule;

const resetStore = () => {
  mockLocalStorage.clear();
  StorageService.seedDemoData(true);
};

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 1: Guest Isolation Boundary (Zero Data Leakage)
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 1: Guest Isolation Boundary (Zero Data Leakage)", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // Reset to guest session
  StorageService.clearAuthSession();

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false, "Guest session must be unauthenticated");
  assert.equal(session.role, "guest", "Guest session must have role 'guest'");
  assert.equal(session.studentId, null, "Guest session must have null studentId");

  // Verify body styling
  bodyEl.classList.add("role-guest");
  bodyEl.classList.remove("role-admin");
  assert.equal(bodyEl.classList.contains("role-guest"), true, "Body must contain role-guest");

  // Render discover
  EventsModule.init();
  EventsModule.renderDiscover();

  const cards = _elements["discover-list"].children;
  assert.ok(cards.length > 0, "Discover event cards must render");

  // Cards display neutral Register Now and NO personal badges
  cards.forEach((card) => {
    assert.ok(!card.innerHTML.includes("Registered ✓"), "Card must NOT display Registered ✓ badge in guest mode");
    assert.ok(!card.innerHTML.includes("Drop Seat"), "Card must NOT display Drop Seat button in guest mode");
    assert.ok(!card.innerHTML.includes("View My Pass"), "Card must NOT display View My Pass in guest mode");
  });

  // Reminders banner for unauthenticated visitors must be hidden
  const remindersBanner = _elements["reminders-banner-discover"];
  assert.ok(remindersBanner.hidden, "Discover reminders banner must be hidden for guest");

  // Profile chip displays Guest Mode / Sign in to register
  _elements["chip-name"].textContent = "Guest Mode";
  _elements["chip-status"].textContent = "Sign in to register";
  _elements["chip-avatar"].textContent = "G";
  assert.equal(_elements["chip-name"].textContent, "Guest Mode");
  assert.equal(_elements["chip-status"].textContent, "Sign in to register");
  assert.equal(_elements["chip-avatar"].textContent, "G");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 2: Gated Click-Path Interception & Callback Safety
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 2: Gated Click-Path Interception & Callback Safety", async () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();
  RegistrationModule.init();

  // In guest mode, attempt to register for EVT-101
  StorageService.clearAuthSession();
  _elements["registration-dialog"].open = false;
  _elements["auth-dialog"].open = false;

  await EventsModule.openRegistrationModal("EVT-101");

  // Verify registration dialog did not open, auth modal intercepted
  assert.equal(_elements["registration-dialog"].open, false, "Registration dialog must not open for guest");
  assert.equal(_elements["auth-dialog"].open, true, "Auth modal must open to gate registration");

  // Log in as Alice Kumar
  _elements["btn-quick-student"].dispatchEvent({ type: "click" });
  await new Promise((r) => setTimeout(r, 50));

  // Verify modal closed, callback fired, and registration dialog opened with EVT-101
  assert.equal(_elements["auth-dialog"].open, false, "Auth modal must close");
  assert.equal(_elements["registration-dialog"].open, true, "Registration dialog must open via callback");
  assert.equal(_elements["reg-event-id"].value, "EVT-101", "Event ID must be EVT-101");

  // Test Escape key / close reset
  let staleCallbackFired = false;
  AuthModule.openAuthModal("student", () => { staleCallbackFired = true; });
  assert.equal(_elements["auth-dialog"].open, true);

  // Close dialog via close event (Escape key)
  _elements["auth-dialog"].close();
  assert.equal(_elements["auth-dialog"].open, false);

  // Subsequent login without a callback should not fire stale callback
  _elements["btn-quick-student"].dispatchEvent({ type: "click" });
  assert.equal(staleCallbackFired, false, "Stale callback must NOT fire after closing modal");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 3: Privilege Escalation & Cross-Tab Auth Immunity
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 3: Privilege Escalation & Cross-Tab Auth Immunity", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  let adminCallbackExecuted = false;
  // Unauthenticated user attempts admin action
  AuthModule.requireAuth("admin", () => {
    adminCallbackExecuted = true;
    bodyEl.classList.add("role-admin");
  });

  assert.equal(_elements["auth-dialog"].open, true, "Auth dialog must open on admin requirement");
  assert.equal(_elements["auth-tab-admin"].classList.contains("active"), true, "Admin tab must be active");

  // User switches tab to student and logs in as Alice Kumar
  _elements["auth-student-id"].value = "12601928";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(adminCallbackExecuted, false, "Admin callback must NEVER execute on student login");
  assert.equal(StorageService.getAuthSession().role, "student", "Role must remain student");
  assert.equal(bodyEl.classList.contains("role-admin"), false, "Must not elevate to role-admin");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 4: Roll Number Format & Student Auto-Detection (/^126\d{5}$/)
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 4: Roll Number Format & Student Auto-Detection", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // Test registration validation rejects non-conforming formats
  const invalidRolls = ["12501928", "1260192", "126019289", "126ABCDE"];
  invalidRolls.forEach((roll) => {
    const err = RegistrationModule.validateRegistration("Test", roll, "test@univ.edu", "CSE");
    assert.equal(err, "Student ID / Roll No. must start with 126 and be 8 digits (e.g. 12601928).");
  });

  // Recognized Roll Number 12601928 logs in on Step 1
  _elements["auth-student-id"].value = "12601928";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(StorageService.getAuthSession().authenticated, true);
  assert.equal(StorageService.getAuthSession().studentId, "12601928");
  assert.equal(_elements["auth-new-student-fields"].hidden, true, "Known student must not see step 2");

  // Unrecognized Roll Number 12699999 reveals Step 2
  StorageService.clearAuthSession();
  _elements["auth-student-id"].value = "12699999";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(_elements["auth-new-student-fields"].hidden, false, "Step 2 fields must be revealed");
  assert.equal(_elements["auth-student-submit"].textContent, "Complete Sign Up & Login");

  // Fill and complete Step 2
  _elements["auth-student-name"].value = "New Student";
  _elements["auth-student-email"].value = "new.student@univ.edu";
  _elements["auth-student-dept"].value = "ECE";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(StorageService.getAuthSession().authenticated, true);
  assert.equal(StorageService.getAuthSession().studentId, "12699999");
  assert.equal(StorageService.getAuthSession().name, "New Student");

  // Verify student was saved to knownStudents
  const known = StorageService.getKnownStudents().find((s) => s.studentId === "12699999");
  assert.ok(known, "New student must be persisted in knownStudents");
  assert.equal(known.department, "ECE");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 5: Evaluator 1-Click Demo Logins
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 5: Evaluator 1-Click Demo Logins", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // Clear database to test resilient fallback
  StorageService.clearAllData();
  StorageService.clearAuthSession();

  // 1-Click Quick Demo Student
  _elements["btn-quick-student"].dispatchEvent({ type: "click" });
  assert.equal(StorageService.getAuthSession().authenticated, true);
  assert.equal(StorageService.getAuthSession().studentId, "12601928");
  assert.equal(StorageService.getAuthSession().role, "student");

  // 1-Click Quick Demo Admin
  StorageService.clearAuthSession();
  _elements["btn-quick-admin"].dispatchEvent({ type: "click" });
  assert.equal(StorageService.getAuthSession().authenticated, true);
  assert.equal(StorageService.getAuthSession().role, "admin");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 6: Admin Session Resilience on Data Reset
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 6: Admin Session Resilience on Data Reset", () => {
  resetStore();
  setupAuthDialogElements();

  // Authenticate as Admin
  StorageService.setAuthSession({
    authenticated: true,
    role: "admin",
    studentId: null,
    name: "Organizer / Administrator",
  });
  StorageService.setActiveRole("admin");

  // Click "Clear All Data"
  StorageService.clearAllData();

  // Verify records wiped
  assert.equal(StorageService.getEvents().length, 0);
  assert.equal(StorageService.getRegistrations().length, 0);

  // Verify Admin session is preserved
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true, "Admin session must remain authenticated");
  assert.equal(session.role, "admin", "Admin role must remain active");

  // Determine landing tab after clear: stays on admin dashboard
  const targetTab = session.authenticated && session.role === "admin" ? "dashboard" : "discover";
  assert.equal(targetTab, "dashboard", "Must stay on admin dashboard");
});

// ═══════════════════════════════════════════════════════════════════════════
// Criteria 7: Eligibility Gating (Attendance, Feedback, & Certificates)
// ═══════════════════════════════════════════════════════════════════════════

test("Criteria 7: Eligibility Gating (Attendance, Feedback, & Certificates)", () => {
  resetStore();

  // Setup registrations: Alice is Registered (unverified), Bob is Absent, Charlie is Present
  const regs = [
    {
      regId: "REG-ALICE",
      eventId: "EVT-101",
      studentId: "12601928",
      name: "Alice Kumar",
      email: "alice@univ.edu",
      department: "CSE",
      status: "Registered",
      attendance: { status: "Registered" },
    },
    {
      regId: "REG-BOB",
      eventId: "EVT-101",
      studentId: "12601929",
      name: "Bob Smith",
      email: "bob@univ.edu",
      department: "ECE",
      status: "Absent",
      attendance: { status: "Absent" },
    },
    {
      regId: "REG-CHARLIE",
      eventId: "EVT-101",
      studentId: "12601930",
      name: "Charlie Day",
      email: "charlie@univ.edu",
      department: "MECH",
      status: "Present",
      attendance: { status: "Present" },
    },
  ];
  StorageService.saveRegistrations(regs);

  // 1. Feedback eligibility
  toastMessage = "";
  FeedbackModule.init();

  // Alice (Registered): blocked
  FeedbackModule.openFeedbackDialog("EVT-101", "12601928");
  assert.equal(toastMessage, "You must attend and be checked in before leaving feedback.");

  // Bob (Absent): blocked
  toastMessage = "";
  FeedbackModule.openFeedbackDialog("EVT-101", "12601929");
  assert.equal(toastMessage, "You must attend and be checked in before leaving feedback.");

  // Charlie (Present): allowed
  toastMessage = "";
  FeedbackModule.openFeedbackDialog("EVT-101", "12601930");
  assert.equal(_elements["feedback-dialog"].open, true, "Feedback dialog must open for Present student");

  // 2. Certificate eligibility
  toastMessage = "";
  CertificateModule.init();

  // Alice (Registered): blocked
  CertificateModule.generateCertificate("REG-ALICE");
  assert.equal(toastMessage, "Certificate available only after event attendance verification.");

  // Bob (Absent): blocked
  toastMessage = "";
  CertificateModule.generateCertificate("REG-BOB");
  assert.equal(toastMessage, "Certificate available only after event attendance verification.");

  // Charlie (Present): allowed
  toastMessage = "";
  CertificateModule.generateCertificate("REG-CHARLIE");
  assert.equal(_elements["certificate-dialog"].open, true, "Certificate dialog must open for Present student");
});
