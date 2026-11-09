// js/auth.js – Authentication Gateway & Identity Engine
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
let btnSubmitStudent = null;

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

      <!-- STUDENT AUTH FORM -->
      <form id="auth-student-form" class="auth-form-pane" novalidate>
        <div class="form-field">
          <label class="form-label" for="auth-student-id">Student ID / Roll Number</label>
          <input type="text" id="auth-student-id" name="studentId" placeholder="e.g. 12601928" maxlength="8" autocomplete="off" required>
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

        <div class="auth-quick-actions">
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

        <div class="auth-quick-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-quick-admin" style="font-size: var(--font-xs); color: var(--color-primary);">Quick Demo: Event Organizer</button>
        </div>

        <footer class="dialog-footer">
          <button type="button" class="btn btn-ghost" id="btn-cancel-auth-admin">Cancel</button>
          <button type="submit" class="btn btn-primary" id="auth-admin-submit">Sign In as Organizer</button>
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
  formStudent = document.getElementById("auth-student-form");
  formAdmin = document.getElementById("auth-admin-form");
  studentIdInput = document.getElementById("auth-student-id");
  studentNewFields = document.getElementById("auth-new-student-fields");
  studentNameInput = document.getElementById("auth-student-name");
  studentEmailInput = document.getElementById("auth-student-email");
  studentDeptInput = document.getElementById("auth-student-dept");
  adminUsernameInput = document.getElementById("auth-admin-user");
  adminPasscodeInput = document.getElementById("auth-admin-pass");
  bannerError = document.getElementById("auth-form-error");
  btnSubmitStudent = document.getElementById("auth-student-submit");
};

const showBanner = (message, type = "error") => {
  if (!bannerError) return;
  bannerError.textContent = message;
  bannerError.className =
    type === "info"
      ? "auth-banner auth-banner--info"
      : "auth-banner auth-banner--error";
  bannerError.hidden = false;
  bannerError.style.display = "";
};

const clearBanners = () => {
  if (bannerError) {
    bannerError.textContent = "";
    bannerError.hidden = true;
    bannerError.style.display = "none";
  }
};

const switchTab = (targetRole = "student") => {
  clearBanners();
  const isStudent = targetRole !== "admin";
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

const handleRollInputEdit = () => {
  clearBanners();
  if (studentNewFields && !studentNewFields.hidden) {
    studentNewFields.hidden = true;
  }
  if (btnSubmitStudent) {
    btnSubmitStudent.textContent = "Continue";
  }
};

const findKnownStudent = (studentId) => {
  const knownList = StorageService.getKnownStudents();
  const fromKnown = knownList.find((s) => s.studentId === studentId);
  if (fromKnown) return fromKnown;
  const fromRegs = StorageService.getRegistrations().find((r) => r.studentId === studentId);
  if (fromRegs) {
    return {
      studentId: fromRegs.studentId,
      name: fromRegs.name || "Student",
      email: fromRegs.email || "",
      department: fromRegs.department || "General",
    };
  }
  return null;
};

const loginStudent = (student) => {
  StorageService.setAuthSession({
    authenticated: true,
    role: "student",
    studentId: student.studentId,
    name: student.name,
  });
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

  // If a pending callback exists, let the callback drive navigation
  if (typeof cb === "function" && (!reqRole || reqRole === "student" || reqRole === "any")) {
    if (window.app && typeof window.app.refreshAllModules === "function") {
      window.app.refreshAllModules("student");
    }
    cb();
  } else {
    if (window.app && typeof window.app.applyRole === "function") {
      window.app.applyRole("student", "discover");
    }
  }
};

const handleStudentSubmit = (e) => {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  clearBanners();

  const studentId = studentIdInput ? studentIdInput.value.trim() : "";

  if (!ROLL_REGEX.test(studentId)) {
    showBanner("Roll Number must start with 126 and be exactly 8 digits (e.g. 12601928).", "error");
    if (studentIdInput) studentIdInput.focus();
    return;
  }

  let student = findKnownStudent(studentId);

  // Step 1 Match: Known Student Instant Sign In
  if (student) {
    loginStudent(student);
    return;
  }

  // Step 1 Unrecognized: Reveal Step 2 Registration Fields
  if (studentNewFields && studentNewFields.hidden) {
    studentNewFields.hidden = false;
    if (btnSubmitStudent) btnSubmitStudent.textContent = "Complete Sign Up & Login";
    showBanner("New Roll Number detected. Please complete your profile to continue.", "info");
    if (studentNameInput) studentNameInput.focus();
    return;
  }

  // Step 2 Submission: Validate New Student Profile
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

  // Duplicate email check across knownStudents and registrations
  const emailLower = email.toLowerCase();
  const dupKnown = StorageService.getKnownStudents().some(
    (s) => s.studentId !== studentId && (s.email || "").toLowerCase() === emailLower
  );
  const dupReg = StorageService.getRegistrations().some(
    (r) => r.studentId !== studentId && (r.email || "").toLowerCase() === emailLower
  );
  if (dupKnown || dupReg) {
    showBanner("This email address is already associated with another student.", "error");
    if (studentEmailInput) studentEmailInput.focus();
    return;
  }

  student = { studentId, name, email, department };
  StorageService.saveKnownStudent(student);
  loginStudent(student);
};

const completeAdminLogin = () => {
  StorageService.setAuthSession({
    authenticated: true,
    role: "admin",
    studentId: null,
    name: "Organizer / Administrator",
  });
  StorageService.setActiveRole("admin");

  const cb = pendingCallback;
  const reqRole = pendingRequiredRole;
  pendingCallback = null;
  pendingRequiredRole = null;
  closeAuthModal();

  if (typeof window.showToast === "function") {
    window.showToast("Signed in as Event Organizer.", "success");
  }

  if (typeof cb === "function" && (!reqRole || reqRole === "admin" || reqRole === "any")) {
    if (window.app && typeof window.app.refreshAllModules === "function") {
      window.app.refreshAllModules("admin");
    }
    cb();
  } else {
    if (window.app && typeof window.app.applyRole === "function") {
      window.app.applyRole("admin", "dashboard");
    }
  }
};

const handleAdminSubmit = (e) => {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  clearBanners();

  const user = adminUsernameInput ? adminUsernameInput.value.trim() : "";
  const pass = adminPasscodeInput ? adminPasscodeInput.value : "";

  if (user.toLowerCase() !== ADMIN_USER || pass !== ADMIN_PASS) {
    showBanner("Invalid organizer credentials. Use admin / AEMS-Admin-2026.", "error");
    if (adminPasscodeInput) {
      adminPasscodeInput.value = "";
      adminPasscodeInput.focus();
    }
    return;
  }

  completeAdminLogin();
};

const openAuthModal = (defaultTab = "student", onSuccess = null, requiredRole = null) => {
  resolveRefs();
  if (!authDialog) return;

  pendingCallback = onSuccess;
  pendingRequiredRole = requiredRole || defaultTab;

  if (formStudent) formStudent.reset();
  if (formAdmin) formAdmin.reset();
  if (studentNewFields) studentNewFields.hidden = true;
  if (btnSubmitStudent) btnSubmitStudent.textContent = "Continue";
  clearBanners();

  switchTab(defaultTab);
  if (!authDialog.open && typeof authDialog.showModal === "function") {
    authDialog.showModal();
  }
};

const closeAuthModal = () => {
  pendingCallback = null;
  pendingRequiredRole = null;
  if (authDialog && authDialog.open && typeof authDialog.close === "function") {
    authDialog.close();
  }
  clearBanners();
};

const requireAuth = (requiredRole = "student", onSuccess = null) => {
  const session = StorageService.getAuthSession();

  // Admin access gate
  if (requiredRole === "admin") {
    if (session.authenticated && session.role === "admin") {
      if (typeof onSuccess === "function") onSuccess();
      return true;
    }
    openAuthModal("admin", onSuccess, "admin");
    return false;
  }

  // Student access gate: admins also possess permission to view student passes
  if (session.authenticated && (session.role === "student" || session.role === "admin")) {
    if (typeof onSuccess === "function") onSuccess();
    return true;
  }

  openAuthModal("student", onSuccess, "student");
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
    window.showToast("Signed out. Browsing in Guest Mode.", "info");
  }
};

let bound = false;
const bindEvents = () => {
  resolveRefs();
  if (bound || !authDialog) return;
  bound = true;

  if (tabStudent) tabStudent.addEventListener("click", () => switchTab("student"));
  if (tabAdmin) tabAdmin.addEventListener("click", () => switchTab("admin"));
  if (studentIdInput) studentIdInput.addEventListener("input", handleRollInputEdit);

  if (formStudent) formStudent.addEventListener("submit", handleStudentSubmit);
  if (formAdmin) formAdmin.addEventListener("submit", handleAdminSubmit);

  document.getElementById("btn-close-auth")?.addEventListener("click", closeAuthModal);
  document.getElementById("btn-cancel-auth-student")?.addEventListener("click", closeAuthModal);
  document.getElementById("btn-cancel-auth-admin")?.addEventListener("click", closeAuthModal);

  // Quick Demo Buttons
  document.getElementById("btn-quick-student")?.addEventListener("click", () => {
    if (studentIdInput) studentIdInput.value = "12601928";
    const alice = findKnownStudent("12601928");
    if (alice) loginStudent(alice);
  });

  document.getElementById("btn-quick-admin")?.addEventListener("click", () => {
    if (adminUsernameInput) adminUsernameInput.value = ADMIN_USER;
    if (adminPasscodeInput) adminPasscodeInput.value = ADMIN_PASS;
    completeAdminLogin();
  });

  authDialog.addEventListener("click", (e) => {
    if (e.target === authDialog) closeAuthModal();
  });
  authDialog.addEventListener("close", () => {
    pendingCallback = null;
    pendingRequiredRole = null;
    clearBanners();
  });
};

const init = () => {
  bound = false;
  resolveRefs();
  bindEvents();
};

const AuthModule = {
  init,
  openAuthModal,
  closeAuthModal,
  requireAuth,
  logout,
  isAuthenticated: () => Boolean(StorageService.getAuthSession().authenticated),
  getCurrentRole: () => {
    const s = StorageService.getAuthSession();
    return s.authenticated ? s.role : "guest";
  },
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
