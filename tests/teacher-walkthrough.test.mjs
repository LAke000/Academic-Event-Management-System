import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── Mock DOM & localStorage ─────────────────────────────────────────────────

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
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return this.children.find((c) => c.classList?.contains?.(cls)) || null;
    }
    return null;
  }
  querySelectorAll() { return []; }
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
  get firstChild() { return this.children[0] || null; }
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
    "btn-cancel-auth-admin", "btn-submit-admin-auth",
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
  "dashboard", "passes", "history", "admin-events", "scanner", "analytics",
].forEach((id) => {
  if (!_elements[id]) _elements[id] = new MockElement("div", id);
});

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

globalThis.window.app = {
  applyRole: () => {},
  refreshAllModules: () => {},
  updateProfileChip: () => {},
};

// ─── Import Modules ──────────────────────────────────────────────────────────

const { default: StorageService } = await import("../js/storage.js");
const { default: AuthModule } = await import("../js/auth.js");
const { default: RegistrationModule } = await import("../js/registration.js");
const { default: EventsModule } = await import("../js/events.js");
globalThis.window.EventsModule = EventsModule;
globalThis.window.RegistrationModule = RegistrationModule;
globalThis.window.AuthModule = AuthModule;

// Reset helpers
const resetStore = () => {
  mockLocalStorage.clear();
  StorageService.seedDemoData(true);
};

// ═══════════════════════════════════════════════════════════════════════════
// Teacher Evaluation Walkthrough Suites (Stages 1 through 5)
// ═══════════════════════════════════════════════════════════════════════════

test("Stage 1: Fresh Load State (Unauthenticated Guest)", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // 1. Session state must be guest
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false, "Fresh load session must be unauthenticated");
  assert.equal(session.role, "guest", "Fresh load role must be guest");
  assert.equal(session.studentId, null, "Fresh load studentId must be null");

  // 2. Discover cards must render without personal registration bleed
  EventsModule.init();
  EventsModule.renderDiscover();

  const cards = _elements["discover-list"].children;
  assert.ok(cards.length > 0, "Discover event cards must be rendered");
  const anyHasRegisterBtn = cards.some((card) => card.innerHTML.includes("Register Now"));
  assert.ok(anyHasRegisterBtn, "Cards must display 'Register Now' action button");

  cards.forEach((card) => {
    assert.ok(!card.innerHTML.includes("Registered ✓"), "Cards must NOT display 'Registered ✓' badge for guest");
    assert.ok(!card.innerHTML.includes("Drop Seat"), "Cards must NOT display 'Drop Seat' button for guest");
    assert.ok(!card.innerHTML.includes("View My Pass"), "Cards must NOT display 'View My Pass' button for guest");
  });

  // 3. Reminders banner for guest must be empty
  const bannerDiscover = _elements["reminders-banner-discover"];
  assert.ok(bannerDiscover.hidden, "Guest discover reminders banner must be hidden");
});

test("Stage 2: Guest-to-Action Registration Path", async () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();
  EventsModule.init();
  RegistrationModule.init();

  _elements["registration-dialog"].open = false;
  _elements["auth-dialog"].open = false;

  // 1. Unauthenticated click on "Register Now" on EVT-101
  await EventsModule.openRegistrationModal("EVT-101");

  // Registration dialog must NOT open; Auth Modal opens
  assert.equal(_elements["registration-dialog"].open, false, "Registration dialog must not open for guest");
  assert.equal(_elements["auth-dialog"].open, true, "Auth modal must open to gate registration");

  // 2. Enter non-conforming roll number "99999999"
  _elements["auth-student-id"].value = "99999999";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(_elements["auth-form-error"].hidden, false, "Error banner must display");
  assert.ok(
    _elements["auth-form-error"].textContent.includes("Roll Number must start with 126 and be exactly 8 digits"),
    "Banner must show 126 prefix validation rule"
  );

  // 3. Enter unrecognized valid ID "12688888" and click "Continue"
  _elements["auth-student-id"].value = "12688888";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(_elements["auth-new-student-fields"].hidden, false, "Step 2 fields must expand");
  assert.equal(_elements["auth-student-submit"].textContent, "Complete Sign Up & Login");
  assert.ok(
    _elements["auth-form-error"].textContent.includes("New Roll Number detected"),
    "Info banner must prompt for student profile details"
  );

  // 4. Fill student profile
  _elements["auth-student-name"].value = "Test Student";
  _elements["auth-student-email"].value = "test.student@example.edu";
  _elements["auth-student-dept"].value = "CSE";

  // 5. Submit "Complete Sign Up & Login"
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Auth modal closes
  assert.equal(_elements["auth-dialog"].open, false, "Auth modal must close after login");

  // Active session updated
  const newSession = StorageService.getAuthSession();
  assert.equal(newSession.authenticated, true, "Student must be authenticated");
  assert.equal(newSession.studentId, "12688888");
  assert.equal(newSession.name, "Test Student");

  // Registration dialog for EVT-101 opens immediately with fields pre-filled
  assert.equal(_elements["registration-dialog"].open, true, "Registration dialog must open via callback");
  assert.equal(_elements["reg-event-id"].value, "EVT-101", "Event ID must be EVT-101");
  assert.equal(_elements["reg-student-id"].value, "12688888", "Student ID must be pre-filled");
  assert.equal(_elements["reg-student-name"].value, "Test Student", "Name must be pre-filled");
  assert.equal(_elements["reg-email"].value, "test.student@example.edu", "Email must be pre-filled");
  assert.equal(_elements["reg-department"].value, "CSE", "Department must be pre-filled");
});

test("Stage 3: Protected Route Gating", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // Authenticate student first
  StorageService.setAuthSession({
    authenticated: true,
    role: "student",
    studentId: "12688888",
    name: "Test Student",
  });
  assert.equal(AuthModule.isAuthenticated(), true);

  // 1. Sign out via AuthModule.logout()
  AuthModule.logout();
  assert.equal(AuthModule.isAuthenticated(), false, "Must be logged out");
  assert.equal(StorageService.getActiveRole(), "student", "Role resets to student/guest");

  // 2. Click "My Passes" -> requireAuth intercepts
  let passesCallbackFired = false;
  const intercepted = AuthModule.requireAuth("student", () => {
    passesCallbackFired = true;
  });

  assert.equal(intercepted, false, "Guest access to protected passes must be intercepted");
  assert.equal(_elements["auth-dialog"].open, true, "Auth modal must open");
  assert.equal(_elements["auth-tab-student"].classList.contains("active"), true, "Student tab must be active");

  // 3. Click "Quick Demo: Alice Kumar (12601928)"
  _elements["btn-quick-student"].dispatchEvent({ type: "click" });

  assert.equal(_elements["auth-dialog"].open, false, "Auth modal must close");
  assert.equal(StorageService.getAuthSession().studentId, "12601928", "Must be logged in as Alice Kumar");
  assert.equal(passesCallbackFired, true, "Callback driving navigation to passes must have fired");
});

test("Stage 4: Organizer Security & Role Toggle", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  const toggle = _elements["role-toggle"];
  toggle.checked = true; // Attempting to turn ON admin mode

  // 1. Emulate role toggle change listener
  let adminAccessGranted = false;
  const session = StorageService.getAuthSession();
  if (toggle.checked && (!session.authenticated || session.role !== "admin")) {
    toggle.checked = false; // Springs back
    AuthModule.requireAuth("admin", () => {
      toggle.checked = true;
      adminAccessGranted = true;
    });
  }

  assert.equal(toggle.checked, false, "Role toggle must spring back to unchecked");
  assert.equal(_elements["auth-dialog"].open, true, "Auth modal must open");
  assert.equal(_elements["auth-tab-admin"].classList.contains("active"), true, "Admin tab must be active");

  // 2. Enter invalid credentials
  _elements["auth-admin-username"].value = "admin";
  _elements["auth-admin-passcode"].value = "wrongpass";
  _elements["auth-admin-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(_elements["auth-form-error"].hidden, false, "Error banner must display");
  assert.ok(
    _elements["auth-form-error"].textContent.includes("Invalid organizer credentials"),
    "Banner must display invalid organizer credentials error"
  );
  assert.equal(_elements["auth-admin-passcode"].value, "", "Passcode input must be cleared");

  // 3. Click "Quick Demo: Event Organizer"
  _elements["btn-quick-admin"].dispatchEvent({ type: "click" });

  assert.equal(_elements["auth-dialog"].open, false, "Auth modal must close");
  assert.equal(StorageService.getAuthSession().role, "admin", "Must be signed in as admin");
  assert.equal(adminAccessGranted, true, "Admin action callback must execute");
  assert.equal(toggle.checked, true, "Toggle must now be checked");
});

test("Stage 5: Direct URL Address Bar Manipulation", () => {
  resetStore();
  setupAuthDialogElements();
  AuthModule.init();

  // Reset to Guest mode
  StorageService.clearAuthSession();
  assert.equal(AuthModule.isAuthenticated(), false);

  // App route interception logic for #dashboard
  const hash = "dashboard";
  const ADMIN_TABS = ["dashboard", "admin-events", "scanner", "analytics"];
  let adminRouted = false;

  const session = StorageService.getAuthSession();
  if (ADMIN_TABS.includes(hash) && session.role !== "admin") {
    AuthModule.requireAuth("admin", () => {
      adminRouted = true;
    });
  }

  assert.equal(_elements["auth-dialog"].open, true, "Direct URL navigation to #dashboard must be intercepted");
  assert.equal(_elements["auth-tab-admin"].classList.contains("active"), true, "Must present admin login tab");
  assert.equal(adminRouted, false, "Admin dashboard must not load without authentication");
});
