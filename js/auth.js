// js/auth.js – Authentication Gateway & Identity Engine
// Academic Event Registration System (pure vanilla SPA, ECC compliant)

import StorageService from "./storage.js";

const ROLL_REGEX = /^126\d{5}$/;
const ADMIN_USER = "admin";
const ADMIN_PASS = "AEMS-Admin-2026";
const AUTH_DIALOG_ID = "auth-dialog";

let authDialog = null;
let tabStudent = null;
let tabAdmin = null;
let formStudent = null;
let formAdmin = null;
let studentIdInput = null;
let studentNewFields = null;
let studentNameInput = null;
let studentEmailInput = null;
let studentDeptInput = null;
let adminUsernameInput = null;
let adminPasscodeInput = null;
let bannerError = null;
let bannerInfo = null;
let btnSubmitStudent = null;
let studentHint = null;

let pendingCallback = null;
let pendingRequiredRole = null;

const ensureAuthDialog = () => {
  if (document.getElementById(AUTH_DIALOG_ID)) return;

  const markup = `
  <dialog id="${AUTH_DIALOG_ID}" class="dialog">
    <div class="dialog-panel">
      <header class="dialog-header">
        <h2 id="auth-dialog-title">Campus Portal Sign In</h2>
        <button class="dialog-close" id="btn-close-auth" aria-label="Close authentication dialog">&times;</button>
      </header>

      <div class="auth-tabs" role="tablist">
        <button type="button" class="auth-tab auth-tab-btn active" id="auth-tab-student" role="tab" aria-selected="true">Student Portal</button>
        <button type="button" class="auth-tab auth-tab-btn" id="auth-tab-admin" role="tab" aria-selected="false">Organizer / Admin</button>
      </div>

      <div id="auth-form-error" class="auth-banner auth-banner--error" hidden role="alert"></div>
      <div id="auth-banner-info" class="auth-banner auth-banner--info" hidden role="status"></div>

      <!-- STUDENT AUTH FORM -->
      <form id="auth-student-form" class="auth-form-pane" novalidate>
        <div class="form-field">
          <label class="form-label" for="auth-student-id">Student ID / Roll Number</label>
          <input type="text" id="auth-student-id" name="studentId" placeholder="8-digit ID starting with 126 (e.g. 12601928)" maxlength="8" autocomplete="off" required>
          <span class="form-hint" id="auth-student-hint">Format: 8 digits starting with 126 (e.g. 12601928)</span>
        </div>

        <div id="auth-new-student-fields" class="auth-step-fields" hidden>
          <div class="auth-step-divider">
            <span>New Student Registration</span>
          </div>
          <div class="form-field">
            <label class="form-label" for="auth-student-name">Full Name</label>
            <input type="text" id="auth-student-name" name="name" placeholder="e.g. Alice Kumar" maxlength="80">
          </div>
          <div class="form-field">
            <label class="form-label" for="auth-student-email">University Email</label>
            <input type="email" id="auth-student-email" name="email" placeholder="e.g. alice.kumar@example.edu" maxlength="100">
          </div>
          <div class="form-field">
            <label class="form-label" for="auth-student-dept">Department</label>
            <input type="text" id="auth-student-dept" name="department" placeholder="e.g. CSE, IT, ME" maxlength="60">
          </div>
        </div>

        <div class="auth-quick-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top: var(--space-xs);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-quick-student" style="font-size: var(--font-xs); color: var(--color-primary);">Quick Demo: Alice Kumar (12601928)</button>
        </div>

        <footer class="dialog-footer">
          <button type="button" class="btn btn-ghost" id="btn-cancel-auth-student">Cancel</button>
          <button type="submit" class="btn btn-primary" id="auth-student-submit">Continue</button>
        </footer>
      </form>

      <!-- ADMIN AUTH FORM -->
      <form id="auth-admin-form" class="auth-form-pane" hidden novalidate>
        <div class="form-field">
          <label class="form-label" for="auth-admin-user">Admin Username</label>
          <input type="text" id="auth-admin-user" name="username" placeholder="e.g. admin" autocomplete="username" required>
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-admin-pass">Organizer Passcode</label>
          <input type="password" id="auth-admin-pass" name="passcode" placeholder="Enter administrative passcode" autocomplete="current-password" required>
          <span class="form-hint">Demo Passcode: AEMS-Admin-2026</span>
        </div>

        <div class="auth-quick-actions" style="display:flex; justify-content:flex-start; align-items:center; margin-top: var(--space-xs);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-quick-admin" style="font-size: var(--font-xs); color: var(--color-primary);">Quick Demo: Event Organizer</button>
        </div>

        <footer class="dialog-footer">
          <button type="button" class="btn btn-ghost" id="btn-cancel-auth-admin">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-admin-auth">Sign In as Organizer</button>
        </footer>
      </form>
    </div>
  </dialog>
  `;
  document.body.insertAdjacentHTML("beforeend", markup);
};

const resolveRefs = () => {
  ensureAuthDialog();
  authDialog = document.getElementById(AUTH_DIALOG_ID);
  tabStudent = document.getElementById("auth-tab-student");
  tabAdmin = document.getElementById("auth-tab-admin");
  bannerError = document.getElementById("auth-form-error") || document.getElementById("auth-banner-error");
  bannerInfo = document.getElementById("auth-banner-info");

  formStudent = document.getElementById("auth-student-form") || document.getElementById("auth-form-student");
  studentIdInput = document.getElementById("auth-student-id");
  studentHint = document.getElementById("auth-student-hint");
  studentNewFields = document.getElementById("auth-new-student-fields") || document.getElementById("auth-student-new-fields");
  studentNameInput = document.getElementById("auth-student-name");
  studentEmailInput = document.getElementById("auth-student-email");
  studentDeptInput = document.getElementById("auth-student-dept");
  btnSubmitStudent = document.getElementById("auth-student-submit") || document.getElementById("btn-submit-student-auth");

  formAdmin = document.getElementById("auth-admin-form") || document.getElementById("auth-form-admin");
  adminUsernameInput = document.getElementById("auth-admin-user") || document.getElementById("auth-admin-username");
  adminPasscodeInput = document.getElementById("auth-admin-pass") || document.getElementById("auth-admin-passcode");
};

const showBanner = (message, type = "error") => {
  const errBanner = document.getElementById("auth-form-error") || document.getElementById("auth-banner-error");
  const infoBanner = document.getElementById("auth-banner-info");

  if (infoBanner) {
    infoBanner.textContent = type === "info" ? message : "";
    infoBanner.hidden = true;
    infoBanner.style.display = "none";
  }

  if (errBanner) {
    errBanner.textContent = message;
    errBanner.hidden = false;
    errBanner.style.display = "";
    errBanner.className =
      type === "info"
        ? "auth-banner auth-banner--info"
        : "auth-banner auth-banner--error";
  }
};

const clearBanners = () => {
  const errBanner = document.getElementById("auth-form-error") || document.getElementById("auth-banner-error");
  const infoBanner = document.getElementById("auth-banner-info");
  if (errBanner) {
    errBanner.textContent = "";
    errBanner.hidden = true;
    errBanner.style.display = "none";
  }
  if (infoBanner) {
    infoBanner.textContent = "";
    infoBanner.hidden = true;
    infoBanner.style.display = "none";
  }
};

const switchTab = (targetRole = "student") => {
  clearBanners();
  const isStudent = targetRole === "student";
  const tStudent = document.getElementById("auth-tab-student") || tabStudent;
  const tAdmin = document.getElementById("auth-tab-admin") || tabAdmin;
  const fStudent = document.getElementById("auth-student-form") || document.getElementById("auth-form-student") || formStudent;
  const fAdmin = document.getElementById("auth-admin-form") || document.getElementById("auth-form-admin") || formAdmin;
  const idInput = document.getElementById("auth-student-id") || studentIdInput;
  const passInput = document.getElementById("auth-admin-pass") || document.getElementById("auth-admin-passcode") || adminPasscodeInput;

  if (tStudent) {
    tStudent.classList.toggle("active", isStudent);
    tStudent.setAttribute("aria-selected", isStudent ? "true" : "false");
  }
  if (tAdmin) {
    tAdmin.classList.toggle("active", !isStudent);
    tAdmin.setAttribute("aria-selected", !isStudent ? "true" : "false");
  }
  if (fStudent) fStudent.hidden = !isStudent;
  if (fAdmin) fAdmin.hidden = isStudent;

  if (isStudent && idInput && typeof idInput.focus === "function") {
    setTimeout(() => idInput.focus(), 50);
  } else if (!isStudent && passInput && typeof passInput.focus === "function") {
    setTimeout(() => passInput.focus(), 50);
  }
};

const handleStudentInput = () => {
  const fields = document.getElementById("auth-new-student-fields") || document.getElementById("auth-student-new-fields");
  if (fields) fields.hidden = true;
  clearBanners();
  const submitBtn = document.getElementById("auth-student-submit") || document.getElementById("btn-submit-student-auth");
  if (submitBtn) submitBtn.textContent = "Continue";
};

const loginStudent = (student) => {
  const session = {
    authenticated: true,
    role: "student",
    studentId: student.studentId,
    name: student.name,
  };
  StorageService.setAuthSession(session);
  StorageService.setActiveRole("student");
  StorageService.setActiveStudentId(student.studentId);

  const cb = pendingCallback;
  const reqRole = pendingRequiredRole;
  pendingCallback = null;
  pendingRequiredRole = null;
  closeAuthModal();

  if (typeof window.showToast === "function") {
    window.showToast(`Welcome, ${student.name}!`, "success");
  }

  if (window.app && typeof window.app.applyRole === "function") {
    window.app.applyRole("student");
  }
  if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("student");
  }

  if (typeof cb === "function" && (!reqRole || reqRole === "student" || reqRole === "any")) {
    cb();
  }
};

const handleStudentSubmit = (e) => {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  clearBanners();

  const idInput = document.getElementById("auth-student-id") || studentIdInput;
  const studentId = idInput ? idInput.value.trim() : "";

  if (!ROLL_REGEX.test(studentId)) {
    showBanner("Roll Number must start with 126 and be exactly 8 digits (e.g. 12601928).", "error");
    if (idInput && typeof idInput.focus === "function") idInput.focus();
    return;
  }

  const knownList = StorageService.getKnownStudents();
  const regList = StorageService.getRegistrations();

  let student = knownList.find((s) => s.studentId === studentId);
  if (!student) {
    const regStudent = regList.find((r) => r.studentId === studentId && r.name);
    if (regStudent) {
      student = {
        studentId: regStudent.studentId,
        name: regStudent.name,
        email: regStudent.email || "",
        department: regStudent.department || "General",
      };
    }
  }

  if (student) {
    loginStudent(student);
    return;
  }

  const fields = document.getElementById("auth-new-student-fields") || document.getElementById("auth-student-new-fields");
  const submitBtn = document.getElementById("auth-student-submit") || document.getElementById("btn-submit-student-auth");

  if (fields && fields.hidden) {
    fields.hidden = false;
    if (submitBtn) submitBtn.textContent = "Complete Sign Up & Login";
    showBanner("New Roll Number detected. Please complete your profile to continue.", "info");
    const nameInput = document.getElementById("auth-student-name");
    if (nameInput && typeof nameInput.focus === "function") nameInput.focus();
    return;
  }

  const nameInput = document.getElementById("auth-student-name") || studentNameInput;
  const emailInput = document.getElementById("auth-student-email") || studentEmailInput;
  const deptInput = document.getElementById("auth-student-dept") || studentDeptInput;

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const department = deptInput ? deptInput.value.trim() : "";

  if (!name || name.length < 2) {
    showBanner("Please provide your full student name.", "error");
    if (nameInput && typeof nameInput.focus === "function") nameInput.focus();
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showBanner("Please enter a valid university email address.", "error");
    if (emailInput && typeof emailInput.focus === "function") emailInput.focus();
    return;
  }
  if (!department || department.length < 2) {
    showBanner("Please specify your department (e.g. CSE).", "error");
    if (deptInput && typeof deptInput.focus === "function") deptInput.focus();
    return;
  }

  // Duplicate email check across BOTH knownStudents and registrations
  const emailLower = email.toLowerCase();
  const dupKnown = knownList.some((s) => s.email && s.email.toLowerCase() === emailLower);
  const dupReg = regList.some((r) => r.email && r.email.toLowerCase() === emailLower);
  if (dupKnown || dupReg) {
    showBanner("This email address is already associated with another student.", "error");
    if (emailInput && typeof emailInput.focus === "function") emailInput.focus();
    return;
  }

  student = { studentId, name, email, department };
  StorageService.saveKnownStudent(student);
  loginStudent(student);
};

const handleAdminSubmit = (e) => {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  clearBanners();

  const userInput = document.getElementById("auth-admin-user") || document.getElementById("auth-admin-username") || adminUsernameInput;
  const passInput = document.getElementById("auth-admin-pass") || document.getElementById("auth-admin-passcode") || adminPasscodeInput;

  const user = userInput ? userInput.value.trim() : "";
  const pass = passInput ? passInput.value.trim() : "";

  if (user.toLowerCase() !== ADMIN_USER.toLowerCase() || pass !== ADMIN_PASS) {
    showBanner("Invalid organizer credentials. Use admin / AEMS-Admin-2026.", "error");
    if (passInput) {
      passInput.value = "";
      if (typeof passInput.focus === "function") passInput.focus();
    }
    return;
  }

  const session = {
    authenticated: true,
    role: "admin",
    studentId: null,
    name: "Organizer / Administrator",
  };
  StorageService.setAuthSession(session);
  StorageService.setActiveRole("admin");

  const cb = pendingCallback;
  const reqRole = pendingRequiredRole;
  pendingCallback = null;
  pendingRequiredRole = null;
  closeAuthModal();

  if (typeof window.showToast === "function") {
    window.showToast("Organizer access verified.", "success");
  }

  if (window.app && typeof window.app.applyRole === "function") {
    window.app.applyRole("admin");
  }
  if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("admin");
  }

  if (typeof cb === "function" && (!reqRole || reqRole === "admin" || reqRole === "any")) {
    cb();
  }
};

const openAuthModal = (defaultTab = "student", onSuccess = null, requiredRole = null) => {
  resolveRefs();
  bindEvents();
  if (!authDialog) return;

  pendingCallback = onSuccess;
  pendingRequiredRole = requiredRole || defaultTab;

  const fStudent = document.getElementById("auth-student-form") || document.getElementById("auth-form-student");
  const fAdmin = document.getElementById("auth-admin-form") || document.getElementById("auth-form-admin");
  const fields = document.getElementById("auth-new-student-fields") || document.getElementById("auth-student-new-fields");
  const submitBtn = document.getElementById("auth-student-submit") || document.getElementById("btn-submit-student-auth");

  if (fStudent && typeof fStudent.reset === "function") fStudent.reset();
  if (fAdmin && typeof fAdmin.reset === "function") fAdmin.reset();
  if (fields) fields.hidden = true;
  if (submitBtn) submitBtn.textContent = "Continue";
  clearBanners();

  switchTab(defaultTab);
  if (typeof authDialog.showModal === "function") {
    authDialog.showModal();
  }
};

const closeAuthModal = () => {
  pendingCallback = null;
  pendingRequiredRole = null;
  if (authDialog && typeof authDialog.close === "function") {
    authDialog.close();
  }
  clearBanners();
};

const requireAuth = (requiredRole, onSuccess) => {
  const session = StorageService.getAuthSession();
  if (session.authenticated && (requiredRole === "any" || session.role === requiredRole)) {
    if (typeof onSuccess === "function") onSuccess();
    return true;
  }
  openAuthModal(requiredRole === "admin" ? "admin" : "student", onSuccess, requiredRole);
  return false;
};

const logout = () => {
  pendingCallback = null;
  pendingRequiredRole = null;
  StorageService.clearAuthSession();
  StorageService.setActiveRole("student");
  StorageService.setActiveStudentId("ALL");

  if (window.app && typeof window.app.applyRole === "function") {
    window.app.applyRole("student", "discover");
  }
  if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("student");
  }

  if (typeof window.showToast === "function") {
    window.showToast("Signed out. Switched to Guest Mode.", "info");
  }
};

const bindEvents = () => {
  resolveRefs();
  if (!authDialog || authDialog._eventsBound) return;
  authDialog._eventsBound = true;

  if (tabStudent) tabStudent.addEventListener("click", () => switchTab("student"));
  if (tabAdmin) tabAdmin.addEventListener("click", () => switchTab("admin"));

  const idInput = document.getElementById("auth-student-id");
  if (idInput) {
    idInput.addEventListener("input", handleStudentInput);
  }

  const fStudent = document.getElementById("auth-student-form") || document.getElementById("auth-form-student");
  if (fStudent) fStudent.addEventListener("submit", handleStudentSubmit);

  const fAdmin = document.getElementById("auth-admin-form") || document.getElementById("auth-form-admin");
  if (fAdmin) fAdmin.addEventListener("submit", handleAdminSubmit);

  const btnClose = document.getElementById("btn-close-auth");
  if (btnClose) btnClose.addEventListener("click", closeAuthModal);
  const btnCancelS = document.getElementById("btn-cancel-auth-student");
  if (btnCancelS) btnCancelS.addEventListener("click", closeAuthModal);
  const btnCancelA = document.getElementById("btn-cancel-auth-admin");
  if (btnCancelA) btnCancelA.addEventListener("click", closeAuthModal);

  // Quick Demo Buttons
  const btnQuickStudent = document.getElementById("btn-quick-student");
  if (btnQuickStudent) {
    btnQuickStudent.addEventListener("click", () => {
      const studentInput = document.getElementById("auth-student-id");
      if (studentInput) studentInput.value = "12601928";
      const fields = document.getElementById("auth-new-student-fields") || document.getElementById("auth-student-new-fields");
      if (fields) fields.hidden = true;
      clearBanners();

      const formSt = document.getElementById("auth-student-form") || document.getElementById("auth-form-student");
      if (formSt) {
        if (typeof formSt.requestSubmit === "function") {
          formSt.requestSubmit();
        } else {
          formSt.dispatchEvent({ type: "submit", preventDefault() {} });
        }
      }
    });
  }

  const btnQuickAdmin = document.getElementById("btn-quick-admin");
  if (btnQuickAdmin) {
    btnQuickAdmin.addEventListener("click", () => {
      const u1 = document.getElementById("auth-admin-user");
      const u2 = document.getElementById("auth-admin-username");
      if (u1) u1.value = "admin";
      if (u2) u2.value = "admin";

      const p1 = document.getElementById("auth-admin-pass");
      const p2 = document.getElementById("auth-admin-passcode");
      if (p1) p1.value = ADMIN_PASS;
      if (p2) p2.value = ADMIN_PASS;

      clearBanners();

      const formAd = document.getElementById("auth-admin-form") || document.getElementById("auth-form-admin");
      if (formAd) {
        if (typeof formAd.requestSubmit === "function") {
          formAd.requestSubmit();
        } else {
          formAd.dispatchEvent({ type: "submit", preventDefault() {} });
        }
      }
    });
  }

  if (authDialog) {
    authDialog.addEventListener("click", (e) => {
      if (e.target === authDialog) closeAuthModal();
    });
    authDialog.addEventListener("close", () => {
      pendingCallback = null;
      pendingRequiredRole = null;
      clearBanners();
    });
  }
};

const AuthModule = {
  init: () => {
    resolveRefs();
    bindEvents();
  },
  openAuthModal,
  closeAuthModal,
  requireAuth,
  logout,
  isAuthenticated: () => StorageService.getAuthSession().authenticated,
  getCurrentRole: () => StorageService.getAuthSession().role,
};

window.AuthModule = AuthModule;

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", AuthModule.init);
  } else {
    AuthModule.init();
  }
}

export default AuthModule;
