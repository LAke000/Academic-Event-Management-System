// js/auth.js – Authentication & Session Gateway
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns the sign-in/sign-up dialog, session
// management, role-gated access, and the 126xxxxx roll validation.
// Zero-truncation: all student records are persisted in full.

import StorageService from "./storage.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const ROLL_REGEX = /^126\d{5}$/;
const ADMIN_USER = "admin";
const ADMIN_PASS = "AEMS-Admin-2026";
const AUTH_DIALOG_ID = "auth-dialog";

// ─── Pending callback (deferred action after successful auth) ──────────────

let pendingCallback = null;

// ─── Dialog Markup Injection ─────────────────────────────────────────────────

const ensureAuthDialog = () => {
  if (document.getElementById(AUTH_DIALOG_ID)) return;

  const markup = `
<dialog id="${AUTH_DIALOG_ID}" class="dialog">
  <div class="dialog-panel">
    <header class="dialog-header">
      <h2>Sign In to AEMS</h2>
      <button class="dialog-close" aria-label="Close dialog">&times;</button>
    </header>
    <div class="auth-tabs" role="tablist">
      <button type="button" class="auth-tab active" id="auth-tab-student" role="tab" aria-selected="true" aria-controls="auth-student-form">Student Login</button>
      <button type="button" class="auth-tab" id="auth-tab-admin" role="tab" aria-selected="false" aria-controls="auth-admin-form">Admin / Organizer Login</button>
    </div>
    <div id="auth-form-error" role="alert" hidden style="padding: 10px 12px; margin: 0 var(--space-xl); border-radius: 6px; background: #fee2e2; color: #b91c1c; font-size: 0.875rem; font-weight: 500;"></div>
    <form id="auth-student-form" novalidate autocomplete="off" style="padding: var(--space-lg) var(--space-xl);">
      <div class="form-field">
        <label class="form-label" for="auth-student-id">Roll Number</label>
        <input type="text" id="auth-student-id" maxlength="8" placeholder="e.g. 12601928" required autocomplete="off">
      </div>
      <div id="auth-new-student-fields" hidden>
        <div class="form-field">
          <label class="form-label" for="auth-student-name">Full Name</label>
          <input type="text" id="auth-student-name" placeholder="e.g. Alice Kumar" maxlength="100" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-student-email">University Email</label>
          <input type="email" id="auth-student-email" placeholder="e.g. alice.kumar@example.edu" maxlength="150" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="auth-student-dept">Department</label>
          <input type="text" id="auth-student-dept" placeholder="e.g. CSE" maxlength="80" autocomplete="off">
        </div>
      </div>
      <footer class="dialog-footer" style="padding: var(--space-md) 0 0 0; border-top: none; background: transparent;">
        <button type="submit" class="btn btn-primary" id="auth-student-submit">Continue</button>
      </footer>
      <div class="auth-quick-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-quick-student">Quick Demo: Alice Kumar (12601928)</button>
      </div>
    </form>
    <form id="auth-admin-form" novalidate autocomplete="off" hidden style="padding: var(--space-lg) var(--space-xl);">
      <div class="form-field">
        <label class="form-label" for="auth-admin-user">Username</label>
        <input type="text" id="auth-admin-user" placeholder="admin" autocomplete="off">
      </div>
      <div class="form-field">
        <label class="form-label" for="auth-admin-pass">Passcode</label>
        <input type="password" id="auth-admin-pass" placeholder="AEMS-Admin-2026" autocomplete="off">
      </div>
      <footer class="dialog-footer" style="padding: var(--space-md) 0 0 0; border-top: none; background: transparent;">
        <button type="submit" class="btn btn-primary">Sign In as Organizer</button>
      </footer>
      <div class="auth-quick-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-quick-admin">Quick Demo: Event Organizer</button>
      </div>
    </form>
  </div>
</dialog>`;

  document.body.insertAdjacentHTML("beforeend", markup);
  bindAuthDialogEvents();
};

// ─── Error helpers ──────────────────────────────────────────────────────────

const showAuthError = (msg) => {
  const el = document.getElementById("auth-form-error");
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  }
};

const clearAuthError = () => {
  const el = document.getElementById("auth-form-error");
  if (el) {
    el.textContent = "";
    el.hidden = true;
  }
};

// ─── Tab switching ──────────────────────────────────────────────────────────

const switchAuthTab = (tab) => {
  clearAuthError();
  const studentTab = document.getElementById("auth-tab-student");
  const adminTab = document.getElementById("auth-tab-admin");
  const studentForm = document.getElementById("auth-student-form");
  const adminForm = document.getElementById("auth-admin-form");

  if (tab === "admin") {
    if (studentTab) { studentTab.classList.remove("active"); studentTab.setAttribute("aria-selected", "false"); }
    if (adminTab) { adminTab.classList.add("active"); adminTab.setAttribute("aria-selected", "true"); }
    if (studentForm) studentForm.hidden = true;
    if (adminForm) adminForm.hidden = false;
  } else {
    if (adminTab) { adminTab.classList.remove("active"); adminTab.setAttribute("aria-selected", "false"); }
    if (studentTab) { studentTab.classList.add("active"); studentTab.setAttribute("aria-selected", "true"); }
    if (adminForm) adminForm.hidden = true;
    if (studentForm) studentForm.hidden = false;
  }
};

// ─── Student auto-detection login logic ───────────────────────────────────

const handleStudentSubmit = (e) => {
  e.preventDefault();
  clearAuthError();

  const studentIdInput = document.getElementById("auth-student-id");
  const studentId = (studentIdInput?.value || "").trim();

  // Step 1: Validate 126xxxxx format
  if (!ROLL_REGEX.test(studentId)) {
    showAuthError("Roll Number must start with 126 and be exactly 8 digits (e.g. 12601928).");
    return;
  }

  const newFieldsContainer = document.getElementById("auth-new-student-fields");
  const isNewFieldsVisible = newFieldsContainer && !newFieldsContainer.hidden;

  // Step 2: Check if student exists in known students or registrations
  const knownStudents = StorageService.getKnownStudents();
  const registrations = StorageService.getRegistrations();
  const knownMatch = knownStudents.find((s) => s.studentId === studentId);
  const regMatch = registrations.find((r) => r.studentId === studentId);
  const studentExists = Boolean(knownMatch || regMatch);

  // Step 3: If found — log in immediately
  if (studentExists) {
    const name = knownMatch?.name || regMatch?.name || studentId;
    StorageService.setAuthSession({ authenticated: true, role: "student", studentId, name });
    StorageService.setActiveRole("student");
    StorageService.setActiveStudentId(studentId);
    closeAuthModal();
    refreshApp();
    if (typeof window.showToast === "function") {
      window.showToast(`Welcome back, ${name}!`, "success");
    }
    if (typeof pendingCallback === "function") {
      try { pendingCallback(); } catch (_err) {}
      pendingCallback = null;
    }
    return;
  }

  // Step 4: New student — show profile fields if hidden
  if (!isNewFieldsVisible) {
    if (newFieldsContainer) newFieldsContainer.hidden = false;
    const nameField = document.getElementById("auth-student-name");
    if (nameField) nameField.focus();
    const submitBtn = document.getElementById("auth-student-submit");
    if (submitBtn) submitBtn.textContent = "Complete Sign Up & Login";
    showAuthError("New Roll Number detected. Please complete your profile to continue.");
    return;
  }

  // Step 5: New student — validate and save
  const nameVal = (document.getElementById("auth-student-name")?.value || "").trim();
  const emailVal = (document.getElementById("auth-student-email")?.value || "").trim();
  const deptVal = (document.getElementById("auth-student-dept")?.value || "").trim();

  if (!nameVal) { showAuthError("Full Name is required."); return; }
  if (!emailVal || !emailVal.includes("@")) { showAuthError("A valid University Email is required."); return; }
  if (!deptVal) { showAuthError("Department is required."); return; }

  // Check duplicate email across known students and registrations
  const emailLower = emailVal.toLowerCase();
  const emailDup = knownStudents.some((s) => (s.email || "").toLowerCase() === emailLower) ||
    registrations.some((r) => (r.email || "").toLowerCase() === emailLower);
  if (emailDup) {
    showAuthError("This email address is already associated with another student.");
    return;
  }

  // Save new student
  StorageService.saveKnownStudent({ studentId, name: nameVal, email: emailVal, department: deptVal });

  // Authenticate
  StorageService.setAuthSession({ authenticated: true, role: "student", studentId, name: nameVal });
  StorageService.setActiveRole("student");
  StorageService.setActiveStudentId(studentId);
  closeAuthModal();
  refreshApp();
  if (typeof window.showToast === "function") {
    window.showToast(`Welcome, ${nameVal}! Your profile has been created.`, "success");
  }
  if (typeof pendingCallback === "function") {
    try { pendingCallback(); } catch (_err) {}
    pendingCallback = null;
  }
};

// ─── Admin login logic ──────────────────────────────────────────────────────

const handleAdminSubmit = (e) => {
  e.preventDefault();
  clearAuthError();

  const username = (document.getElementById("auth-admin-user")?.value || "").trim().toLowerCase();
  const passcode = document.getElementById("auth-admin-pass")?.value || "";

  if (username !== ADMIN_USER || passcode !== ADMIN_PASS) {
    showAuthError("Invalid organizer credentials. Use admin / AEMS-Admin-2026.");
    return;
  }

  StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null, name: "Event Organizer" });
  StorageService.setActiveRole("admin");
  closeAuthModal();
  if (typeof window.app?.applyRole === "function") {
    window.app.applyRole("admin");
  }
  if (typeof window.showToast === "function") {
    window.showToast("Signed in as Event Organizer.", "success");
  }
  if (typeof pendingCallback === "function") {
    try { pendingCallback(); } catch (_err) {}
    pendingCallback = null;
  }
};

// ─── Roll Number input listener (reset new-student fields on edit) ────────

const bindRollInputReset = () => {
  const input = document.getElementById("auth-student-id");
  if (!input) return;
  input.addEventListener("input", () => {
    const newFields = document.getElementById("auth-new-student-fields");
    if (newFields && !newFields.hidden) {
      newFields.hidden = true;
      const submitBtn = document.getElementById("auth-student-submit");
      if (submitBtn) submitBtn.textContent = "Continue";
      clearAuthError();
    }
  });
};

// ─── Quick demo buttons ──────────────────────────────────────────────────

const bindQuickDemoButtons = () => {
  const quickStudent = document.getElementById("btn-quick-student");
  if (quickStudent) {
    quickStudent.addEventListener("click", () => {
      clearAuthError();
      const studentId = "12601928";
      StorageService.setAuthSession({ authenticated: true, role: "student", studentId, name: "Alice Kumar" });
      StorageService.setActiveRole("student");
      StorageService.setActiveStudentId(studentId);
      closeAuthModal();
      refreshApp();
      if (typeof window.showToast === "function") {
        window.showToast("Welcome back, Alice Kumar!", "success");
      }
      if (typeof pendingCallback === "function") {
        try { pendingCallback(); } catch (_err) {}
        pendingCallback = null;
      }
    });
  }

  const quickAdmin = document.getElementById("btn-quick-admin");
  if (quickAdmin) {
    quickAdmin.addEventListener("click", () => {
      clearAuthError();
      StorageService.setAuthSession({ authenticated: true, role: "admin", studentId: null, name: "Event Organizer" });
      StorageService.setActiveRole("admin");
      closeAuthModal();
      if (typeof window.app?.applyRole === "function") {
        window.app.applyRole("admin");
      }
      if (typeof window.showToast === "function") {
        window.showToast("Signed in as Event Organizer.", "success");
      }
      if (typeof pendingCallback === "function") {
        try { pendingCallback(); } catch (_err) {}
        pendingCallback = null;
      }
    });
  }
};

// ─── Refresh app state after login ──────────────────────────────────────────

const refreshApp = () => {
  try {
    const role = StorageService.getActiveRole() || "student";
    if (typeof window.app?.refreshAllModules === "function") {
      window.app.refreshAllModules(role);
    }
    if (typeof window.app?.updateProfileChip === "function") {
      window.app.updateProfileChip(role);
    }
  } catch (_err) {}
};

// ─── Dialog event binding ──────────────────────────────────────────────────

const bindAuthDialogEvents = () => {
  const dialog = document.getElementById(AUTH_DIALOG_ID);
  if (!dialog) return;

  // Close button
  const closeBtn = dialog.querySelector(".dialog-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeAuthModal());
  }

  // Backdrop click
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeAuthModal();
  });

  // Native close event
  dialog.addEventListener("close", () => {
    clearAuthError();
  });

  // Tab switching
  const studentTab = document.getElementById("auth-tab-student");
  const adminTab = document.getElementById("auth-tab-admin");
  if (studentTab) studentTab.addEventListener("click", () => switchAuthTab("student"));
  if (adminTab) adminTab.addEventListener("click", () => switchAuthTab("admin"));

  // Student form submit
  const studentForm = document.getElementById("auth-student-form");
  if (studentForm) studentForm.addEventListener("submit", handleStudentSubmit);

  // Admin form submit
  const adminForm = document.getElementById("auth-admin-form");
  if (adminForm) adminForm.addEventListener("submit", handleAdminSubmit);

  // Roll input reset
  bindRollInputReset();

  // Quick demo buttons
  bindQuickDemoButtons();
};

// ─── Public API ─────────────────────────────────────────────────────────────

const openAuthModal = (defaultTab = "student", onSuccess = null) => {
  ensureAuthDialog();
  clearAuthError();
  pendingCallback = onSuccess || null;

  // Reset forms
  const studentForm = document.getElementById("auth-student-form");
  const adminForm = document.getElementById("auth-admin-form");
  if (studentForm) studentForm.reset();
  if (adminForm) adminForm.reset();

  // Hide new student fields and reset button text
  const newFields = document.getElementById("auth-new-student-fields");
  if (newFields) newFields.hidden = true;
  const submitBtn = document.getElementById("auth-student-submit");
  if (submitBtn) submitBtn.textContent = "Continue";

  switchAuthTab(defaultTab);

  const dialog = document.getElementById(AUTH_DIALOG_ID);
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
};

const closeAuthModal = () => {
  clearAuthError();
  const dialog = document.getElementById(AUTH_DIALOG_ID);
  if (dialog && typeof dialog.close === "function") {
    try { dialog.close(); } catch (_err) {}
  }
};

const requireAuth = (requiredRole = "student", onSuccess = null) => {
  const session = StorageService.getAuthSession();
  if (session.authenticated) {
    if (requiredRole === "admin" && session.role !== "admin") {
      openAuthModal("admin", onSuccess);
      return;
    }
    // Already authenticated with the required role
    if (typeof onSuccess === "function") {
      try { onSuccess(); } catch (_err) {}
    }
    return;
  }
  // Not authenticated — open the auth modal
  const defaultTab = requiredRole === "admin" ? "admin" : "student";
  openAuthModal(defaultTab, onSuccess);
};

const logout = () => {
  StorageService.clearAuthSession();
  StorageService.setActiveRole("student");
  refreshApp();
  if (typeof window.app?.applyRole === "function") {
    window.app.applyRole("student");
  }
  if (typeof window.showToast === "function") {
    window.showToast("Signed out successfully.", "info");
  }
};

const isAuthenticated = () => {
  return StorageService.getAuthSession().authenticated === true;
};

const getCurrentRole = () => {
  return StorageService.getAuthSession().role || "guest";
};

const init = () => {
  ensureAuthDialog();
};

const AuthModule = {
  init,
  openAuthModal,
  closeAuthModal,
  requireAuth,
  logout,
  isAuthenticated,
  getCurrentRole,
};

export default AuthModule;

if (typeof window !== "undefined") {
  window.AuthModule = AuthModule;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
