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

// Robust MockElement supporting event listeners, classes, and hierarchy
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

  set innerHTML(html) {
    this._innerHTML = html;
    if (html === "") this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  get textContent() { return this._innerHTML || ""; }
  set textContent(text) { this._innerHTML = String(text); }

  appendChild(child) {
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

// Ensure auth dialog elements exist in _elements
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

  // Link aliases for backwards compatibility
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

// Initial populate of registration and app elements
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
].forEach((id) => {
  if (!_elements[id]) _elements[id] = new MockElement("div", id);
});

bodyEl.insertAdjacentHTML = (_pos, _html) => {
  setupAuthDialogElements();
};

globalThis.document = {
  readyState: "complete",
  body: bodyEl,
  createElement(tagName) { return new MockElement(tagName); },
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
globalThis.window.showToast = () => {};
globalThis.window.app = {
  applyRole: () => {},
  refreshAllModules: () => {},
  updateProfileChip: () => {},
};

// ─── Import Modules ──────────────────────────────────────────────────────────

const { default: StorageService } = await import("../js/storage.js");
const { default: AuthModule } = await import("../js/auth.js");
const { default: RegistrationModule } = await import("../js/registration.js");

// ─── Scaffolding: Reset localStorage & Auth dialog ──────────────────────────

const resetStore = () => {
  mockLocalStorage.clear();
  StorageService.seedDemoData(true);
};

const rebindAuthDialog = () => {
  // Clear existing dialog elements and re-init AuthModule
  delete _elements["auth-dialog"];
  AuthModule.init();
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Roll Number Validation: /^126\d{5}$/
// ═══════════════════════════════════════════════════════════════════════════

test("ROLL_REGEX: valid 126xxxxx roll numbers pass", () => {
  const ROLL_REGEX = /^126\d{5}$/;
  assert.ok(ROLL_REGEX.test("12601928"), "12601928 should match");
  assert.ok(ROLL_REGEX.test("12600000"), "12600000 should match");
  assert.ok(ROLL_REGEX.test("12699999"), "12699999 should match");
});

test("ROLL_REGEX: invalid roll numbers are rejected", () => {
  const ROLL_REGEX = /^126\d{5}$/;
  assert.ok(!ROLL_REGEX.test("12501928"), "125xxxxx should fail (wrong prefix)");
  assert.ok(!ROLL_REGEX.test("1260192"), "7 digits should fail (too short)");
  assert.ok(!ROLL_REGEX.test("126019289"), "9 digits should fail (too long)");
  assert.ok(!ROLL_REGEX.test(""), "empty should fail");
  assert.ok(!ROLL_REGEX.test("ABCDEFGH"), "alpha should fail");
  assert.ok(!ROLL_REGEX.test("126abcde"), "mixed alpha should fail");
  assert.ok(!ROLL_REGEX.test("126ABCDE"), "uppercase alpha should fail");
});

test("Registration validation: validateRegistration rejects non-126xxxxx IDs and accepts valid ones", () => {
  const expectedMsg = "Student ID / Roll No. must start with 126 and be 8 digits (e.g. 12601928).";

  // Invalid prefix
  const errPrefix = RegistrationModule.validateRegistration("Test", "12501928", "test@univ.edu", "CSE");
  assert.equal(errPrefix, expectedMsg, "Should reject 125 prefix");

  // Short ID
  const errShort = RegistrationModule.validateRegistration("Test", "1260192", "test@univ.edu", "CSE");
  assert.equal(errShort, expectedMsg, "Should reject 7 digits");

  // Non-numeric
  const errAlpha = RegistrationModule.validateRegistration("Test", "126ABCDE", "test@univ.edu", "CSE");
  assert.equal(errAlpha, expectedMsg, "Should reject alphanumeric");

  // Long ID
  const errLong = RegistrationModule.validateRegistration("Test", "126019280", "test@univ.edu", "CSE");
  assert.equal(errLong, expectedMsg, "Should reject 9 digits");

  // Valid 126xxxxx
  const valid = RegistrationModule.validateRegistration("Test", "12601928", "test@univ.edu", "CSE");
  assert.equal(valid, null, "Valid 126xxxxx roll number must return null");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Auth Session Storage API
// ═══════════════════════════════════════════════════════════════════════════

test("getAuthSession: returns guest fallback when no session exists", () => {
  resetStore();
  mockLocalStorage.removeItem("academic_auth_session");
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false);
  assert.equal(session.role, "guest");
  assert.equal(session.studentId, null);
});

test("setAuthSession and saveAuthSession parity: persists authenticated student session with name", () => {
  resetStore();
  StorageService.saveAuthSession({ authenticated: true, role: "student", studentId: "12601928", name: "Alice Kumar" });
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "student");
  assert.equal(session.studentId, "12601928");
  assert.equal(session.name, "Alice Kumar");
});

test("setAuthSession: defensive normalization for undefined fields", () => {
  resetStore();
  StorageService.setAuthSession({});
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false);
  assert.equal(session.role, "guest");
  assert.equal(session.studentId, null);
});

test("setAuthSession: persists admin session with null studentId", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "admin");
  assert.equal(session.studentId, null);
});

test("clearAuthSession: resets to guest state and sets role to student", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  StorageService.clearAuthSession();
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false);
  assert.equal(session.role, "guest");
  assert.equal(session.studentId, null);
  assert.equal(StorageService.getActiveRole(), "student");
});

test("resetDatabase: removes auth session key", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  StorageService.resetDatabase();
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Guest Mode Default & Route Gating
// ═══════════════════════════════════════════════════════════════════════════

test("Guest Mode: unauthenticated session defaults to Guest role and blocks protected tabs", () => {
  resetStore();
  StorageService.clearAuthSession();

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false, "Initial boot must be unauthenticated");
  assert.equal(session.role, "guest", "Initial boot must have guest role");
  assert.equal(session.studentId, null, "Initial boot must have null studentId");
  assert.equal(AuthModule.isAuthenticated(), false);
  assert.equal(AuthModule.getCurrentRole(), "guest");
});

test("Guest Mode: requireAuth intercepts unauthenticated requests and opens auth modal", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let actionCalled = false;
  AuthModule.requireAuth("student", () => { actionCalled = true; });

  assert.equal(actionCalled, false, "Protected callback must not run before authentication");
  assert.equal(_elements["auth-dialog"].open, true, "Auth modal must be opened for unauthenticated request");
});

test("Guest Mode: router and role toggle static contract guards in js/app.js", () => {
  const appSrc = fs.readFileSync(path.resolve("js/app.js"), "utf-8");

  // passes and history tab protection
  assert.ok(
    appSrc.includes('PROTECTED_STUDENT_TABS.includes(tabId)') ||
      appSrc.includes('(tabId === "passes" || tabId === "history") && !authSession.authenticated'),
    "js/app.js must gate #passes and #history against unauthenticated users in showTab"
  );

  // admin tabs protection
  assert.ok(
    appSrc.includes('ADMIN_TABS.includes(tabId)') &&
      (appSrc.includes('session.role !== "admin"') || appSrc.includes('authSession.role !== "admin"')),
    "js/app.js must gate ADMIN_TABS against non-admin in showTab"
  );

  // role toggle protection
  assert.ok(
    appSrc.includes('session.role !== "admin"') && appSrc.includes("toggle.checked = false"),
    "js/app.js must revert role-toggle when non-admin attempts to switch"
  );

  // profile chip guest mode display
  assert.ok(
    appSrc.includes('"Guest Mode"') && appSrc.includes('"Sign in to register"'),
    "js/app.js updateProfileChip must display Guest Mode when unauthenticated"
  );

  // top-bar auth button action
  assert.ok(
    appSrc.includes('btn-auth-action'),
    "js/app.js must wire #btn-auth-action"
  );
});

test("Guest Mode: events.js gates event registration for unauthenticated users", () => {
  const eventsSrc = fs.readFileSync(path.resolve("js/events.js"), "utf-8");
  assert.ok(
    eventsSrc.includes("StorageService.getAuthSession()") &&
      (eventsSrc.includes(".authenticated") || eventsSrc.includes("session.authenticated")),
    "js/events.js openRegistrationModal must verify authenticated authSession"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Student Auto-Detection End-to-End Flow
// ═══════════════════════════════════════════════════════════════════════════

test("Student Auto-Detection: existing student (12601928) logs in immediately on step 1 with pendingCallback", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let callbackExecuted = false;
  AuthModule.openAuthModal("student", () => {
    callbackExecuted = true;
  });

  _elements["auth-student-id"].value = "12601928";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true, "Existing student must be authenticated");
  assert.equal(session.role, "student", "Role must be student");
  assert.equal(session.studentId, "12601928", "Student ID must match Alice Kumar");
  assert.equal(callbackExecuted, true, "pendingCallback must be executed on step 1 login");
  assert.equal(_elements["auth-new-student-fields"].hidden, true, "New student fields must remain hidden");
  assert.equal(_elements["auth-dialog"].open, false, "Dialog must be closed");
});

test("Student Auto-Detection: unrecognized valid ID (12699999) step 1 reveals profile fields without authenticating", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let callbackExecuted = false;
  AuthModule.openAuthModal("student", () => {
    callbackExecuted = true;
  });

  _elements["auth-student-id"].value = "12699999";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(StorageService.getAuthSession().authenticated, false, "Step 1 must not authenticate new student");
  assert.equal(callbackExecuted, false, "pendingCallback must not run until signup is complete");
  assert.equal(_elements["auth-new-student-fields"].hidden, false, "#auth-new-student-fields must be revealed");
  assert.equal(_elements["auth-student-submit"].textContent, "Complete Sign Up & Login", "Submit button text must update");
  const banner = _elements["auth-banner-info"].hidden ? _elements["auth-form-error"] : _elements["auth-banner-info"];
  assert.equal(banner.hidden, false, "Info prompt must be shown");
  assert.ok(banner.textContent.includes("New Roll Number detected"));
});

test("Student Auto-Detection: unrecognized valid ID (12699999) step 2 saves profile and authenticates", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let callbackExecuted = false;
  AuthModule.openAuthModal("student", () => {
    callbackExecuted = true;
  });

  // Step 1: Reveal profile fields
  _elements["auth-student-id"].value = "12699999";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(_elements["auth-new-student-fields"].hidden, false);

  // Step 2: Fill fields and submit
  _elements["auth-student-name"].value = "Carol Danvers";
  _elements["auth-student-email"].value = "carol.danvers@example.edu";
  _elements["auth-student-dept"].value = "Aero";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true, "New student must be authenticated after step 2");
  assert.equal(session.role, "student");
  assert.equal(session.studentId, "12699999");
  assert.equal(callbackExecuted, true, "pendingCallback must run upon completing registration");

  // Verify saved in knownStudents
  const known = StorageService.getKnownStudents().find((s) => s.studentId === "12699999");
  assert.ok(known, "Carol Danvers should be stored in knownStudents");
  assert.equal(known.name, "Carol Danvers");
  assert.equal(known.email, "carol.danvers@example.edu");
  assert.equal(known.department, "Aero");
});

test("Student Auto-Detection: duplicate email rejection during step 2", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  _elements["auth-student-id"].value = "12688888";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(_elements["auth-new-student-fields"].hidden, false);

  // Provide Alice's email
  _elements["auth-student-name"].value = "Imposter Student";
  _elements["auth-student-email"].value = "alice.kumar@example.edu";
  _elements["auth-student-dept"].value = "CSE";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(StorageService.getAuthSession().authenticated, false, "Must not authenticate with duplicate email");
  assert.equal(_elements["auth-form-error"].textContent, "This email address is already associated with another student.");
});

test("Student Auto-Detection: editing roll number resets new-student fields to hidden", () => {
  resetStore();
  rebindAuthDialog();
  AuthModule.openAuthModal("student");

  // Step 1: trigger new-student fields
  _elements["auth-student-id"].value = "12677777";
  _elements["auth-student-form"].dispatchEvent({ type: "submit", preventDefault() {} });
  assert.equal(_elements["auth-new-student-fields"].hidden, false);
  assert.equal(_elements["auth-student-submit"].textContent, "Complete Sign Up & Login");

  // User edits roll input
  _elements["auth-student-id"].value = "1267777";
  _elements["auth-student-id"].dispatchEvent({ type: "input" });

  assert.equal(_elements["auth-new-student-fields"].hidden, true, "New student fields must hide on roll edit");
  assert.equal(_elements["auth-student-submit"].textContent, "Continue", "Submit text must reset to Continue");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Admin Gate & Credential Verification
// ═══════════════════════════════════════════════════════════════════════════

test("Admin Gate: rejects wrong passcodes with descriptive error", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();
  AuthModule.openAuthModal("admin");

  _elements["auth-admin-user"].value = "admin";
  _elements["auth-admin-pass"].value = "WrongPassword2026";
  _elements["auth-admin-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(StorageService.getAuthSession().authenticated, false, "Invalid passcode must not authenticate");
  assert.equal(_elements["auth-form-error"].textContent, "Invalid organizer credentials. Use admin / AEMS-Admin-2026.");
});

test("Admin Gate: rejects wrong username with descriptive error", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();
  AuthModule.openAuthModal("admin");

  _elements["auth-admin-user"].value = "organizer";
  _elements["auth-admin-pass"].value = "AEMS-Admin-2026";
  _elements["auth-admin-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  assert.equal(StorageService.getAuthSession().authenticated, false, "Invalid username must not authenticate");
  assert.equal(_elements["auth-form-error"].textContent, "Invalid organizer credentials. Use admin / AEMS-Admin-2026.");
});

test("Admin Gate: authenticates admin / AEMS-Admin-2026 and unlocks organizer features", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let adminActionExecuted = false;
  let appliedRole = null;
  globalThis.window.app.applyRole = (role) => { appliedRole = role; };

  AuthModule.openAuthModal("admin", () => {
    adminActionExecuted = true;
  });

  _elements["auth-admin-user"].value = "admin";
  _elements["auth-admin-pass"].value = "AEMS-Admin-2026";
  _elements["auth-admin-form"].dispatchEvent({ type: "submit", preventDefault() {} });

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true, "Admin credentials must authenticate");
  assert.equal(session.role, "admin", "Session role must be admin");
  assert.equal(session.studentId, null, "Admin session has null studentId");
  assert.equal(StorageService.getActiveRole(), "admin", "StorageService active role must be admin");
  assert.equal(appliedRole, "admin", "window.app.applyRole must be called with 'admin'");
  assert.equal(adminActionExecuted, true, "pendingCallback must run upon admin login");
  assert.equal(_elements["auth-dialog"].open, false, "Auth dialog must be closed");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Logout Reset & Session Cleanup
// ═══════════════════════════════════════════════════════════════════════════

test("Logout Reset: AuthModule.logout clears session and resets to guest state", () => {
  resetStore();
  let appliedRole = null;
  globalThis.window.app.applyRole = (role) => { appliedRole = role; };

  // Set active admin session
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  StorageService.setActiveRole("admin");
  assert.equal(AuthModule.isAuthenticated(), true);

  // Perform logout
  AuthModule.logout();

  // Verify session is cleared
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, false, "Session authenticated must be false");
  assert.equal(session.role, "guest", "Session role must be guest");
  assert.equal(session.studentId, null, "Session studentId must be null");
  assert.equal(AuthModule.isAuthenticated(), false);
  assert.equal(AuthModule.getCurrentRole(), "guest");

  // Verify role reset to student view
  assert.equal(StorageService.getActiveRole(), "student", "Active role must be reset to student");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Quick Demo Buttons
// ═══════════════════════════════════════════════════════════════════════════

test("Quick Demo Student: Alice Kumar button fills and logs in", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let callbackExecuted = false;
  AuthModule.openAuthModal("student", () => { callbackExecuted = true; });

  _elements["btn-quick-student"].dispatchEvent({ type: "click" });
  assert.equal(_elements["auth-student-id"].value, "12601928");

  // Submit form to complete sign in
  _elements["auth-form-student"].dispatchEvent({ type: "submit", preventDefault() {} });

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "student");
  assert.equal(session.studentId, "12601928");
  assert.equal(callbackExecuted, true);
  assert.equal(_elements["auth-dialog"].open, false);
});

test("Quick Demo Admin: Event Organizer button fills and logs in", () => {
  resetStore();
  StorageService.clearAuthSession();
  rebindAuthDialog();

  let callbackExecuted = false;
  let appliedRole = null;
  globalThis.window.app.applyRole = (role) => { appliedRole = role; };

  AuthModule.openAuthModal("admin", () => { callbackExecuted = true; });

  _elements["btn-quick-admin"].dispatchEvent({ type: "click" });
  assert.equal(_elements["auth-admin-username"].value, "admin");
  assert.equal(_elements["auth-admin-passcode"].value, "AEMS-Admin-2026");

  // Submit form to complete sign in
  _elements["auth-form-admin"].dispatchEvent({ type: "submit", preventDefault() {} });

  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "admin");
  assert.equal(appliedRole, "admin");
  assert.equal(callbackExecuted, true);
  assert.equal(_elements["auth-dialog"].open, false);
});
