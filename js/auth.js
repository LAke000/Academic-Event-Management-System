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

let pendingCallback = null;

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
        <button type="button" class="auth-tab-btn active" id="auth-tab-student" role="tab" aria-selected="true">Student Portal</button>
        <button type="button" class="auth-tab-btn" id="auth-tab-admin" role="tab" aria-selected="false">Organizer / Admin</button>
      </div>

      <div id="auth-banner-error" class="auth-banner auth-banner--error" hidden role="alert"></div>
      <div id="auth-banner-info" class="auth-banner auth-banner--info" hidden role="status"></div>

      <!-- STUDENT AUTH FORM -->
      <form id="auth-form-student" class="auth-form-pane" novalidate>
        <div class="form-field">
          <label class="form-label" for="auth-student-id">Student ID / Roll Number</label>
          <input type="text" id="auth-student-id" name="studentId" placeholder="8-digit ID starting with 126 (e.g. 12601928)" maxlength="8" autocomplete="off" required>
          <span class="form-hint" id="auth-student-hint">Format: 8 digits starting with 126 (e.g. 12601928)</span>
        </div>

        <div id="auth-student-new-fields" class="auth-step-fields" hidden>
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
          <button type="submit" class="btn btn-primary" id="btn-submit-student-auth">Continue</button>
        </footer>
      </form>

      <!-- ADMIN AUTH FORM -->
      <form id="auth-form-admin" class="auth-form-pane" hidden novalidate>
        <div class="form-field">
          <label class="form-label" for="auth-admin-username">Admin Username</label>
          <input type="text" id="auth-admin-username" name="username" placeholder="e.g. admin" autocomplete="username" required>
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-admin-passcode">Organizer Passcode</label>
          <input type="password" id="auth-admin-passcode" name="passcode" placeholder="Enter administrative passcode" autocomplete="current-password" required>
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
  formStudent = document.getElementById("auth-form-student");
  formAdmin = document.getElementById("auth-form-admin");
  studentIdInput = document.getElementById("auth-student-id");
  studentNewFields = document.getElementById("auth-student-new-fields");
  studentNameInput = document.getElementById("auth-student-name");
  studentEmailInput = document.getElementById("auth-student-email");
  studentDeptInput = document.getElementById("auth-student-dept");
  adminUsernameInput = document.getElementById("auth-admin-username");
  adminPasscodeInput = document.getElementById("auth-admin-passcode");
  bannerError = document.getElementById("auth-banner-error");
  bannerInfo = document.getElementById("auth-banner-info");
  btnSubmitStudent = document.getElementById("btn-submit-student-auth");
};

const showBanner = (message, type = "error") => {
  if (type === "error") {
    if (bannerInfo) bannerInfo.hidden = true;
    if (bannerError) {
      bannerError.textContent = message;
      bannerError.hidden = false;
    }
  } else {
    if (bannerError) bannerError.hidden = true;
    if (bannerInfo) {
      bannerInfo.textContent = message;
      bannerInfo.hidden = false;
    }
  }
};

const clearBanners = () => {
  if (bannerError) {
    bannerError.textContent = "";
    bannerError.hidden = true;
  }
  if (bannerInfo) {
    bannerInfo.textContent = "";
    bannerInfo.hidden = true;
  }
};

const switchTab = (targetRole = "student") => {
  clearBanners();
  const isStudent = targetRole === "student";
  if (tabStudent) {
    tabStudent.classList.toggle("active", isStudent);
    tabStudent.setAttribute("aria-selected", isStudent ? "true" : "false");
  }
  if (tabAdmin) {
    tabAdmin.classList.toggle("active", !isStudent);
    tabAdmin.setAttribute("aria-selected", !isStudent ? "true" : "false");
  }
  if (formStudent) formStudent.hidden = !isStudent;
  if (formAdmin) formAdmin.hidden = isStudent;

  if (isStudent && studentIdInput) {
    setTimeout(() => studentIdInput.focus(), 50);
  } else if (!isStudent && adminPasscodeInput) {
    setTimeout(() => adminPasscodeInput.focus(), 50);
  }
};

const checkStudentInputState = () => {
  const val = studentIdInput ? studentIdInput.value.trim() : "";
  clearBanners();

  // If user edits roll, collapse step 2
  if (!ROLL_REGEX.test(val)) {
    if (studentNewFields) studentNewFields.hidden = true;
    if (btnSubmitStudent) btnSubmitStudent.textContent = "Continue";
    return;
  }

  const knownList = StorageService.getKnownStudents();
  const matched = knownList.find((s) => s.studentId === val);

  if (matched) {
    if (studentNewFields) studentNewFields.hidden = true;
    showBanner(`Recognized student: ${matched.name} (${matched.department})`, "info");
    if (btnSubmitStudent) btnSubmitStudent.textContent = `Sign In as ${matched.name.split(" ")[0]}`;
  } else {
    if (studentNewFields) studentNewFields.hidden = false;
    showBanner("New Roll Number detected. Please complete your profile to continue.", "info");
    if (btnSubmitStudent) btnSubmitStudent.textContent = "Complete Sign Up & Login";
  }
};

const handleStudentSubmit = (e) => {
  e.preventDefault();
  clearBanners();

  const studentId = studentIdInput ? studentIdInput.value.trim() : "";

  if (!ROLL_REGEX.test(studentId)) {
    showBanner("Roll Number must start with 126 and be exactly 8 digits (e.g. 12601928).", "error");
    if (studentIdInput) studentIdInput.focus();
    return;
  }

  const knownList = StorageService.getKnownStudents();
  let student = knownList.find((s) => s.studentId === studentId);

  // If new student, reveal and validate step 2 fields
  if (!student) {
    if (studentNewFields && studentNewFields.hidden) {
      studentNewFields.hidden = false;
      showBanner("New Roll Number detected. Please complete your profile to continue.", "info");
      if (btnSubmitStudent) btnSubmitStudent.textContent = "Complete Sign Up & Login";
      if (studentNameInput) studentNameInput.focus();
      return;
    }

    const name = studentNameInput ? studentNameInput.value.trim() : "";
    const email = studentEmailInput ? studentEmailInput.value.trim() : "";
    const department = studentDeptInput ? studentDeptInput.value.trim() : "";

    if (!name || name.length < 2) {
      showBanner("Please provide your full student name.", "error");
      if (studentNameInput) studentNameInput.focus();
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showBanner("Please enter a valid university email address.", "error");
      if (studentEmailInput) studentEmailInput.focus();
      return;
    }
    if (!department || department.length < 2) {
      showBanner("Please specify your department (e.g. CSE).", "error");
      if (studentDeptInput) studentDeptInput.focus();
      return;
    }

    // Duplicate email check
    const emailDup = knownList.some((s) => s.email.toLowerCase() === email.toLowerCase());
    if (emailDup) {
      showBanner("This email address is already associated with another student.", "error");
      if (studentEmailInput) studentEmailInput.focus();
      return;
    }

    student = { studentId, name, email, department };
    StorageService.saveKnownStudent(student);
  }

  // Set session and authenticate
  const session = {
    authenticated: true,
    role: "student",
    studentId: student.studentId,
    name: student.name,
  };
  StorageService.setAuthSession(session);
  StorageService.setActiveRole("student");
  StorageService.setActiveStudentId(student.studentId);

  closeAuthModal();
  if (typeof window.showToast === "function") {
    window.showToast(`Welcome, ${student.name}!`, "success");
  }

  if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("student");
  }

  if (typeof pendingCallback === "function") {
    const cb = pendingCallback;
    pendingCallback = null;
    cb();
  }
};

const handleAdminSubmit = (e) => {
  e.preventDefault();
  clearBanners();

  const user = adminUsernameInput ? adminUsernameInput.value.trim() : "";
  const pass = adminPasscodeInput ? adminPasscodeInput.value.trim() : "";

  if (user.toLowerCase() !== ADMIN_USER.toLowerCase() || pass !== ADMIN_PASS) {
    showBanner("Invalid organizer credentials. Use admin / AEMS-Admin-2026.", "error");
    if (adminPasscodeInput) {
      adminPasscodeInput.value = "";
      adminPasscodeInput.focus();
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

  closeAuthModal();
  if (typeof window.showToast === "function") {
    window.showToast("Organizer access verified.", "success");
  }

  if (window.app && typeof window.app.applyRole === "function") {
    window.app.applyRole("admin");
  } else if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("admin");
  }

  if (typeof pendingCallback === "function") {
    const cb = pendingCallback;
    pendingCallback = null;
    cb();
  }
};

const openAuthModal = (defaultTab = "student", onSuccess = null) => {
  resolveRefs();
  if (!authDialog) return;

  pendingCallback = onSuccess;

  if (formStudent) formStudent.reset();
  if (formAdmin) formAdmin.reset();
  if (studentNewFields) studentNewFields.hidden = true;
  if (btnSubmitStudent) btnSubmitStudent.textContent = "Continue";
  clearBanners();

  switchTab(defaultTab);
  if (typeof authDialog.showModal === "function") {
    authDialog.showModal();
  }
};

const closeAuthModal = () => {
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
  openAuthModal(requiredRole === "admin" ? "admin" : "student", onSuccess);
  return false;
};

const logout = () => {
  StorageService.clearAuthSession();
  StorageService.setActiveRole("guest");
  StorageService.setActiveStudentId("ALL");

  if (typeof window.showToast === "function") {
    window.showToast("Signed out. Switched to Guest Mode.", "info");
  }

  if (window.app && typeof window.app.refreshAllModules === "function") {
    window.app.refreshAllModules("guest");
  }
  if (window.app && typeof window.app.showTab === "function") {
    window.app.showTab("discover");
  }
};

const bindEvents = () => {
  resolveRefs();

  if (tabStudent) tabStudent.addEventListener("click", () => switchTab("student"));
  if (tabAdmin) tabAdmin.addEventListener("click", () => switchTab("admin"));

  if (studentIdInput) {
    studentIdInput.addEventListener("input", checkStudentInputState);
  }

  if (formStudent) formStudent.addEventListener("submit", handleStudentSubmit);
  if (formAdmin) formAdmin.addEventListener("submit", handleAdminSubmit);

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
      if (studentIdInput) {
        studentIdInput.value = "12601928";
        checkStudentInputState();
      }
    });
  }

  const btnQuickAdmin = document.getElementById("btn-quick-admin");
  if (btnQuickAdmin) {
    btnQuickAdmin.addEventListener("click", () => {
      if (adminUsernameInput) adminUsernameInput.value = "admin";
      if (adminPasscodeInput) adminPasscodeInput.value = "AEMS-Admin-2026";
    });
  }

  if (authDialog) {
    authDialog.addEventListener("click", (e) => {
      if (e.target === authDialog) closeAuthModal();
    });
    authDialog.addEventListener("close", () => {
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", AuthModule.init);
} else {
  AuthModule.init();
}

export default AuthModule;
