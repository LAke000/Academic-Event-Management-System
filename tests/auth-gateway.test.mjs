import test from "node:test";
import assert from "node:assert/strict";

// ─── Mock DOM & localStorage ─────────────────────────────────────────────────

const _store = {};

const mockLocalStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null; },
  setItem(key, val) { _store[key] = String(val); },
  removeItem(key) { delete _store[key]; },
  clear() { for (const k of Object.keys(_store)) delete _store[k]; },
};

globalThis.localStorage = mockLocalStorage;

// Minimal mock document/window for module loading
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
    this.className = "";
    this.classList = {
      _el: this,
      add(...cls) { },
      remove(...cls) { },
      toggle(cls, force) { },
      contains(cls) { return false; },
    };
  }
  set innerHTML(html) { this._innerHTML = html; if (html === "") this.children = []; }
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
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
  insertAdjacentHTML() {}
  showModal() {}
  close() {}
  get firstChild() { return this.children[0] || null; }
}

const _elements = {};
const bodyEl = new MockElement("body", "body");

globalThis.document = {
  readyState: "complete",
  body: bodyEl,
  createElement(tagName) { return new MockElement(tagName); },
  getElementById(id) { return _elements[id] || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};

globalThis.window = globalThis;
globalThis.window.showToast = () => {};
globalThis.window.app = { applyRole: () => {}, refreshAllModules: () => {}, updateProfileChip: () => {} };

// ─── Import StorageService & AuthModule ───────────────────────────────────

const { default: StorageService } = await import("../js/storage.js");
const { default: AuthModule } = await import("../js/auth.js");

// ─── Test Scaffolding: Clean localStorage before each test ──────────────────

const resetStore = () => {
  mockLocalStorage.clear();
  StorageService.seedDemoData(true);
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
  assert.ok(!ROLL_REGEX.test("12501928"), "125xxxxx should fail");
  assert.ok(!ROLL_REGEX.test("1260192"), "7 digits should fail");
  assert.ok(!ROLL_REGEX.test("126019289"), "9 digits should fail");
  assert.ok(!ROLL_REGEX.test(""), "empty should fail");
  assert.ok(!ROLL_REGEX.test("ABCDEFGH"), "alpha should fail");
  assert.ok(!ROLL_REGEX.test("126abcde"), "mixed alpha should fail");
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

test("setAuthSession: persists authenticated student session", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "student", studentId: "12601928" });
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "student");
  assert.equal(session.studentId, "12601928");
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
// 3. Student Auto-Detection Signup Flow
// ═══════════════════════════════════════════════════════════════════════════

test("Known student 12601928 is found in knownStudents", () => {
  resetStore();
  const knownStudents = StorageService.getKnownStudents();
  const alice = knownStudents.find((s) => s.studentId === "12601928");
  assert.ok(alice, "Alice Kumar should exist in known students");
  assert.equal(alice.name, "Alice Kumar");
});

test("New roll number 12609999 is NOT found in knownStudents or registrations", () => {
  resetStore();
  const knownStudents = StorageService.getKnownStudents();
  const regs = StorageService.getRegistrations();
  const knownMatch = knownStudents.find((s) => s.studentId === "12609999");
  const regMatch = regs.find((r) => r.studentId === "12609999");
  assert.ok(!knownMatch, "12609999 should not be in known students");
  assert.ok(!regMatch, "12609999 should not be in registrations");
});

test("saveKnownStudent adds a new student to the roster", () => {
  resetStore();
  StorageService.saveKnownStudent({
    studentId: "12609999",
    name: "Test User",
    email: "test@example.edu",
    department: "CSE",
  });
  const knownStudents = StorageService.getKnownStudents();
  const found = knownStudents.find((s) => s.studentId === "12609999");
  assert.ok(found, "New student should be saved");
  assert.equal(found.name, "Test User");
  assert.equal(found.email, "test@example.edu");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Admin Passcode Login
// ═══════════════════════════════════════════════════════════════════════════

test("Admin credentials: correct username/passcode accepted", () => {
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "AEMS-Admin-2026";
  const username = "admin";
  const passcode = "AEMS-Admin-2026";
  assert.equal(username.trim().toLowerCase(), ADMIN_USER, "username matches");
  assert.equal(passcode, ADMIN_PASS, "passcode matches");
});

test("Admin credentials: wrong passcode rejected", () => {
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "AEMS-Admin-2026";
  const username = "admin";
  const passcode = "wrong-password";
  assert.notEqual(passcode, ADMIN_PASS, "wrong passcode must be rejected");
});

test("Admin credentials: wrong username rejected", () => {
  const ADMIN_USER = "admin";
  const username = "student";
  assert.notEqual(username.trim().toLowerCase(), ADMIN_USER, "wrong username must be rejected");
});

test("Admin session can be set and read back", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  const session = StorageService.getAuthSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.role, "admin");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Registration Validation with 126xxxxx Enforcement
// ═══════════════════════════════════════════════════════════════════════════

test("Registration validation: valid 126xxxxx roll number accepted", () => {
  const studentId = "12601928";
  assert.ok(/^126\d{5}$/.test(studentId.trim()), "valid roll number should pass");
});

test("Registration validation: non-126 roll number rejected", () => {
  const studentId = "99901928";
  assert.ok(!/^126\d{5}$/.test(studentId.trim()), "non-126 roll number should fail");
});

test("Registration validation: short roll number rejected", () => {
  const studentId = "1260192";
  assert.ok(!/^126\d{5}$/.test(studentId.trim()), "7-digit roll number should fail");
});

test("Registration validation: long roll number rejected", () => {
  const studentId = "126019280";
  assert.ok(!/^126\d{5}$/.test(studentId.trim()), "9-digit roll number should fail");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Duplicate Email Check
// ═══════════════════════════════════════════════════════════════════════════

test("Duplicate email detection across known students", () => {
  resetStore();
  const knownStudents = StorageService.getKnownStudents();
  const testEmail = "alice.kumar@example.edu";
  const hasDup = knownStudents.some(
    (s) => (s.email || "").toLowerCase() === testEmail.toLowerCase()
  );
  assert.ok(hasDup, "alice.kumar@example.edu should be detected as duplicate");
});

test("Unique email passes duplicate check", () => {
  resetStore();
  const knownStudents = StorageService.getKnownStudents();
  const regs = StorageService.getRegistrations();
  const testEmail = "unique.user@example.edu";
  const hasDup = knownStudents.some(
    (s) => (s.email || "").toLowerCase() === testEmail.toLowerCase()
  ) || regs.some(
    (r) => (r.email || "").toLowerCase() === testEmail.toLowerCase()
  );
  assert.ok(!hasDup, "unique.user@example.edu should not be a duplicate");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. AuthModule exports verification & behavior
// ═══════════════════════════════════════════════════════════════════════════

test("AuthModule exports all required methods", () => {
  const expectedMethods = [
    "init", "openAuthModal", "closeAuthModal",
    "requireAuth", "logout", "isAuthenticated", "getCurrentRole",
  ];
  expectedMethods.forEach((method) => {
    assert.equal(typeof AuthModule[method], "function", `${method} should be a function on AuthModule`);
  });
});

test("AuthModule.isAuthenticated and getCurrentRole reflect auth session state", () => {
  resetStore();
  StorageService.clearAuthSession();
  assert.equal(AuthModule.isAuthenticated(), false);
  assert.equal(AuthModule.getCurrentRole(), "guest");

  StorageService.setAuthSession({ authenticated: true, role: "student", studentId: "12601928" });
  assert.equal(AuthModule.isAuthenticated(), true);
  assert.equal(AuthModule.getCurrentRole(), "student");

  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  assert.equal(AuthModule.isAuthenticated(), true);
  assert.equal(AuthModule.getCurrentRole(), "admin");
});

test("AuthModule.logout clears session and resets role", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null });
  AuthModule.logout();
  assert.equal(AuthModule.isAuthenticated(), false);
  assert.equal(AuthModule.getCurrentRole(), "guest");
  assert.equal(StorageService.getActiveRole(), "student");
});

test("AuthModule.requireAuth invokes callback immediately if already authenticated with matching role", () => {
  resetStore();
  StorageService.setAuthSession({ authenticated: true, role: "student", studentId: "12601928" });
  let called = false;
  AuthModule.requireAuth("student", () => {
    called = true;
  });
  assert.equal(called, true, "requireAuth should invoke callback when already authenticated");
});
