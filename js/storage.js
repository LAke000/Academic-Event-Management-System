// js/storage.js – Persistence Layer & Mock Seeder
// Academic Event Registration System (pure vanilla SPA, ECC compliant)
// Single responsibility: owns all localStorage read/write operations,
// defensive JSON parsing, and deterministic demo-data seeding.
// Zero-truncation: every stored record is persisted in full, field-for-field.

const EVENTS_KEY = "academic_events_db";
const REGISTRATIONS_KEY = "academic_registrations_db";
const FEEDBACK_KEY = "academic_feedback_db";
const REMINDERS_KEY = "academic_reminders_db";
const ROLE_KEY = "academic_active_role";
const ACTIVE_STUDENT_KEY = "academic_active_student";
const CLEARED_FLAG_KEY = "academic_db_cleared";

const DEFAULT_ROLE = "student";
const DEFAULT_ACTIVE_STUDENT_ID = "12601928";

class StorageService {
  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Safely read and parse a localStorage key.
   * Returns the fallback value on any parse/quota error (never throws).
   * @param {string} key
   * @param {any} fallback
   * @returns {any}
   * @private
   */
  static _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null || raw === undefined ? fallback : JSON.parse(raw);
    } catch (err) {
      console.error(`[StorageService] Failed to read "${key}":`, err);
      return fallback;
    }
  }

  /**
   * Safely stringify and persist a value to localStorage.
   * Returns true on success, false on quota/serialization failure.
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   * @private
   */
  static _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[StorageService] Failed to write "${key}":`, err);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------

  /**
   * Returns the full array of stored events (never truncates any field).
   * @returns {Array}
   */
  static getEvents() {
    return this._read(EVENTS_KEY, []);
  }

  /**
   * Persists the full events array.
   * @param {Array} events
   * @returns {boolean}
   */
  static saveEvents(events) {
    return this._write(EVENTS_KEY, events);
  }

  /**
   * Returns a single event by ID, or null when not found.
   * @param {string} id
   * @returns {object|null}
   */
  static getEventById(id) {
    return this.getEvents().find((ev) => ev.id === id) || null;
  }

  // ------------------------------------------------------------------
  // Registrations
  // ------------------------------------------------------------------

  /**
   * Returns the full array of stored registrations.
   * @returns {Array}
   */
  static getRegistrations() {
    return this._read(REGISTRATIONS_KEY, []);
  }

  /**
   * Persists the full registrations array.
   * @param {Array} registrations
   * @returns {boolean}
   */
  static saveRegistrations(registrations) {
    return this._write(REGISTRATIONS_KEY, registrations);
  }

  /**
   * Filters registrations for a specific event.
   * @param {string} eventId
   * @returns {Array}
   */
  static getRegistrationsByEvent(eventId) {
    return this.getRegistrations().filter((r) => r.eventId === eventId);
  }

  /**
   * Filters registrations for a specific student.
   * @param {string} studentId
   * @returns {Array}
   */
  static getRegistrationsByStudent(studentId) {
    return this.getRegistrations().filter((r) => r.studentId === studentId);
  }

  /**
   * Returns a single registration matching the ticket/reg ID, or null.
   * @param {string} regId
   * @returns {object|null}
   */
  static getRegistrationByRegId(regId) {
    return this.getRegistrations().find((r) => r.regId === regId) || null;
  }

  /**
   * Updates a registration's check-in status and timestamp in place.
   * @param {string} regId
   * @param {string} status - e.g. "Present" | "Registered"
   * @param {string|null} checkInTime - ISO8601 timestamp or null
   * @returns {object|null} the updated registration, or null if not found
   */
  static updateRegistrationStatus(regId, status, checkInTime) {
    const regs = this.getRegistrations();
    const idx = regs.findIndex((r) => r.regId === regId);
    if (idx === -1) return null;

    regs[idx].status = status;
    regs[idx].checkInTime = checkInTime ?? null;
    regs[idx].attendance = { status, checkInTime: checkInTime ?? null };
    this.saveRegistrations(regs);
    return regs[idx];
  }

  // ------------------------------------------------------------------
  // Feedback
  // ------------------------------------------------------------------

  /**
   * Returns the full array of stored feedback entries.
   * @returns {Array}
   */
  static getFeedback() {
    return this._read(FEEDBACK_KEY, []);
  }

  /**
   * Persists feedback records.
   * - When passed an array, replaces the stored feedback set (used by seeding).
   * - When passed a single record object, appends it to the stored set.
   * @param {Array|object} feedback
   * @returns {boolean}
   */
  static saveFeedback(feedback) {
    if (Array.isArray(feedback)) {
      return this._write(FEEDBACK_KEY, feedback);
    }

    const existing = this.getFeedback();
    existing.push(feedback);
    return this._write(FEEDBACK_KEY, existing);
  }

  /**
   * Filters feedback for a specific event.
   * @param {string} eventId
   * @returns {Array}
   */
  static getFeedbackByEvent(eventId) {
    return this.getFeedback().filter((f) => f.eventId === eventId);
  }

  // ------------------------------------------------------------------
  // Reminders
  // ------------------------------------------------------------------

  /**
   * Returns the full array of stored organizer reminders.
   * @returns {Array}
   */
  static getReminders() {
    return this._read(REMINDERS_KEY, []);
  }

  /**
   * Persists the full reminders array.
   * @param {Array} reminders
   * @returns {boolean}
   */
  static saveReminders(reminders) {
    return this._write(REMINDERS_KEY, reminders);
  }

  /**
   * Append a single reminder record to storage and return the saved record.
   * @param {object} reminder - { reminderId, eventId, message, sentAt, sentToCount }
   * @returns {boolean}
   */
  static saveReminder(reminder) {
    const existing = this.getReminders();
    existing.push(reminder);
    return this._write(REMINDERS_KEY, existing);
  }

  // ------------------------------------------------------------------
  // Role
  // ------------------------------------------------------------------

  /**
   * Returns the active role ("student" | "admin"), defaulting to "student".
   * @returns {string}
   */
  static getActiveRole() {
    return this._read(ROLE_KEY, DEFAULT_ROLE) || DEFAULT_ROLE;
  }

  /**
   * Persists the active role.
   * @param {string} role
   * @returns {boolean}
   */
  static setActiveRole(role) {
    return this._write(ROLE_KEY, role);
  }

  /**
   * Returns the active student ID used to scope student-owned views.
   * Defaults to "12601928" (Alice Kumar) when no student session is active.
   * @returns {string}
   */
  static getActiveStudentId() {
    return this._read(ACTIVE_STUDENT_KEY, DEFAULT_ACTIVE_STUDENT_ID) || DEFAULT_ACTIVE_STUDENT_ID;
  }

  /**
   * Persists the active student ID. Accepts "ALL" (show all students) or a
   * specific studentId (e.g. "12601928").
   * @param {string} studentId
   * @returns {boolean}
   */
  static setActiveStudentId(studentId) {
    return this._write(ACTIVE_STUDENT_KEY, studentId);
  }

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  /**
   * Clears all four data stores to empty arrays without reseeding, so an
   * intentional blank-slate clear survives a non-forced seedDemoData(false)
   * reload. Returns true only when all four writes succeed.
   */
  static clearAllData() {
    const eventsOk = this._write(EVENTS_KEY, []);
    const regsOk = this._write(REGISTRATIONS_KEY, []);
    const feedbackOk = this._write(FEEDBACK_KEY, []);
    const remindersOk = this._write(REMINDERS_KEY, []);
    try {
      localStorage.setItem(CLEARED_FLAG_KEY, "true");
    } catch (_err) {}
    this.setActiveStudentId("ALL");
    return eventsOk && regsOk && feedbackOk && remindersOk;
  }

  /**
   * Clears all namespaced storage keys and re-runs the demo seeder (forced).
   */
  static resetDatabase() {
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(REGISTRATIONS_KEY);
    localStorage.removeItem(FEEDBACK_KEY);
    localStorage.removeItem(REMINDERS_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(ACTIVE_STUDENT_KEY);
    try {
      localStorage.removeItem(CLEARED_FLAG_KEY);
    } catch (_err) {}
    this.seedDemoData(true);
  }

  // ------------------------------------------------------------------
  // Demo Seeder
  // ------------------------------------------------------------------

  /**
   * Seeds deterministic demo academic data.
   * Runs only when no events exist, or when force === true.
   * @param {boolean} [force=false]
   */
  static seedDemoData(force = false) {
    if (localStorage.getItem(CLEARED_FLAG_KEY) === "true" && !force) return;
    const existing = this.getEvents();

    // Auto-backfill legacy seeded demo records if loaded from an earlier session
    if (
      existing.length > 0 &&
      !force &&
      existing.some((ev) => ev.id === "EVT-101" && !ev.endTime)
    ) {
      const demoEventDefaults = {
        "EVT-101": {
          endTime: "2026-11-15T12:00:00",
          description:
            "Hands-on deep learning workshop covering neural network architectures, CNNs, and computer vision pipelines.",
        },
        "EVT-102": {
          endTime: "2026-11-17T17:00:00",
          description:
            "Comprehensive seminar on threat modeling, zero-trust architectures, and proactive campus network defense.",
        },
        "EVT-103": {
          endTime: "2026-11-20T14:00:00",
          description:
            "Interactive continuum mechanics and biomimetic robotics session with live lab hardware demonstrations.",
        },
        "EVT-104": {
          type: "Guest Lecture",
          endTime: "2026-11-22T12:30:00",
          description:
            "Distinguished guest lecture on rapid sprint frameworks and human-centered design for sustainable campus infrastructure.",
        },
      };

      let eventsUpdated = false;
      existing.forEach((ev) => {
        if (demoEventDefaults[ev.id]) {
          const d = demoEventDefaults[ev.id];
          if (!ev.endTime && d.endTime) {
            ev.endTime = d.endTime;
            eventsUpdated = true;
          }
          if (!ev.description && d.description) {
            ev.description = d.description;
            eventsUpdated = true;
          }
          if (d.type && ev.id === "EVT-104" && ev.type !== "Guest Lecture") {
            ev.type = d.type;
            eventsUpdated = true;
          }
        }
      });
      if (eventsUpdated) {
        this.saveEvents(existing);
      }

      // Backfill feedback categorical ratings
      const existingFb = this.getFeedback();
      const fbDefaults = {
        "FB-8801": { speakerQuality: 5, contentRelevance: 5, venueOrganization: 5 },
        "FB-8802": { speakerQuality: 4, contentRelevance: 5, venueOrganization: 4 },
        "FB-8803": { speakerQuality: 5, contentRelevance: 5, venueOrganization: 4 },
      };
      let fbUpdated = false;
      existingFb.forEach((fb) => {
        if (fbDefaults[fb.feedbackId]) {
          const d = fbDefaults[fb.feedbackId];
          if (!fb.speakerQuality) {
            fb.speakerQuality = d.speakerQuality;
            fbUpdated = true;
          }
          if (!fb.contentRelevance) {
            fb.contentRelevance = d.contentRelevance;
            fbUpdated = true;
          }
          if (!fb.venueOrganization) {
            fb.venueOrganization = d.venueOrganization;
            fbUpdated = true;
          }
        }
      });
      if (fbUpdated) {
        this.saveFeedback(existingFb);
      }
    }

    if (existing.length && !force) return; // already seeded; preserve data

    try {
      localStorage.removeItem(CLEARED_FLAG_KEY);
    } catch (_err) {}

    // ── 4 realistic university events (zero field truncation) ──
    const events = [
      {
        id: "EVT-101",
        title: "State-of-the-Art Deep Learning & Computer Vision Workshop",
        type: "Workshop",
        department: "CSE",
        venue: "Audi-3 Block 34",
        date: "2026-11-15T09:00:00",
        endTime: "2026-11-15T12:00:00",
        deadline: "2026-11-14T09:00:00",
        capacity: 60,
        registered: 2,
        status: "Open",
        speaker: "Dr. A. Sharma",
        description: "Hands-on deep learning workshop covering neural network architectures, CNNs, and computer vision pipelines.",
      },
      {
        id: "EVT-102",
        title: "Campus Cyber Defense & Network Security Seminar",
        type: "Seminar",
        department: "IT",
        venue: "Room 401 Block 32",
        date: "2026-11-17T14:00:00",
        endTime: "2026-11-17T17:00:00",
        deadline: "2026-11-16T14:00:00",
        capacity: 40,
        registered: 2,
        status: "Open",
        speaker: "Er. Neha Verma",
        description: "Comprehensive seminar on threat modeling, zero-trust architectures, and proactive campus network defense.",
      },
      {
        id: "EVT-103",
        title: "Hands-on Biomimetic Robotics & Continuum Systems",
        type: "Workshop",
        department: "Mechanical & Robotics",
        venue: "Seminar Hall 2",
        date: "2026-11-20T11:00:00",
        endTime: "2026-11-20T14:00:00",
        deadline: "2026-11-19T11:00:00",
        capacity: 80,
        registered: 2,
        status: "Open",
        speaker: "Prof. R. K. Patel",
        description: "Interactive continuum mechanics and biomimetic robotics session with live lab hardware demonstrations.",
      },
      {
        id: "EVT-104",
        title: "Design Thinking for Campus Sustainability Sprint",
        type: "Guest Lecture",
        department: "Polytechnic / Innovation Cell",
        venue: "Innovation Lab 602",
        date: "2026-11-22T10:00:00",
        endTime: "2026-11-22T12:30:00",
        deadline: "2026-11-21T10:00:00",
        capacity: 30,
        registered: 2,
        status: "Open",
        speaker: "Dr. Meenakshi Sundaram",
        description: "Distinguished guest lecture on rapid sprint frameworks and human-centered design for sustainable campus infrastructure.",
      },
    ];
    this.saveEvents(events);

    // ── 8 sample student registrants (REG-8821 through REG-8828) ──
    // 3 students already marked Present to enable certificate & turnout flows.
    const registrations = [
      {
        regId: "REG-8821",
        eventId: "EVT-101",
        studentId: "12601928",
        name: "Alice Kumar",
        email: "alice.kumar@example.edu",
        department: "CSE",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Present",
        checkInTime: new Date().toISOString(),
        attendance: {
          status: "Present",
          checkInTime: new Date().toISOString(),
        },
      },
      {
        regId: "REG-8822",
        eventId: "EVT-101",
        studentId: "12601929",
        name: "Bob Singh",
        email: "bob.singh@example.edu",
        department: "CSE",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Registered",
        checkInTime: null,
        attendance: {
          status: "Registered",
          checkInTime: null,
        },
      },
      {
        regId: "REG-8823",
        eventId: "EVT-102",
        studentId: "12601930",
        name: "Carol Lee",
        email: "carol.lee@example.edu",
        department: "IT",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Present",
        checkInTime: new Date().toISOString(),
        attendance: {
          status: "Present",
          checkInTime: new Date().toISOString(),
        },
      },
      {
        regId: "REG-8824",
        eventId: "EVT-102",
        studentId: "12601931",
        name: "David Patel",
        email: "david.patel@example.edu",
        department: "IT",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Registered",
        checkInTime: null,
        attendance: {
          status: "Registered",
          checkInTime: null,
        },
      },
      {
        regId: "REG-8825",
        eventId: "EVT-103",
        studentId: "12601932",
        name: "Eva Martínez",
        email: "eva.martinez@example.edu",
        department: "ME",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Registered",
        checkInTime: null,
        attendance: {
          status: "Registered",
          checkInTime: null,
        },
      },
      {
        regId: "REG-8826",
        eventId: "EVT-103",
        studentId: "12601933",
        name: "Frank Zhao",
        email: "frank.zhao@example.edu",
        department: "ME",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Present",
        checkInTime: new Date().toISOString(),
        attendance: {
          status: "Present",
          checkInTime: new Date().toISOString(),
        },
      },
      {
        regId: "REG-8827",
        eventId: "EVT-104",
        studentId: "12601934",
        name: "Grace O'Neil",
        email: "grace.oneil@example.edu",
        department: "Polytechnic",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Registered",
        checkInTime: null,
        attendance: {
          status: "Registered",
          checkInTime: null,
        },
      },
      {
        regId: "REG-8828",
        eventId: "EVT-104",
        studentId: "12601935",
        name: "Hiro Tanaka",
        email: "hiro.tanaka@example.edu",
        department: "Polytechnic",
        timestamp: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        status: "Registered",
        checkInTime: null,
        attendance: {
          status: "Registered",
          checkInTime: null,
        },
      },
    ];
    this.saveRegistrations(registrations);

    // ── Sample feedback (4 & 5 stars, constructive reviews) ──
    const feedback = [
      {
        feedbackId: "FB-8801",
        eventId: "EVT-101",
        studentId: "12601928",
        rating: 5,
        speakerQuality: 5,
        contentRelevance: 5,
        venueOrganization: 5,
        comment: "Excellent workshop, very hands‑on and well paced.",
        timestamp: new Date().toISOString(),
      },
      {
        feedbackId: "FB-8802",
        eventId: "EVT-102",
        studentId: "12601930",
        rating: 4,
        speakerQuality: 4,
        contentRelevance: 5,
        venueOrganization: 4,
        comment: "Great content but a bit rushed toward the end.",
        timestamp: new Date().toISOString(),
      },
      {
        feedbackId: "FB-8803",
        eventId: "EVT-103",
        studentId: "12601933",
        rating: 5,
        speakerQuality: 5,
        contentRelevance: 5,
        venueOrganization: 4,
        comment: "Fascinating robotics demos, loved the continuum systems segment.",
        timestamp: new Date().toISOString(),
      },
    ];
    this.saveFeedback(feedback);

    // ── 2 sample organizer reminders (reminders system) ──
    const reminders = [
      {
        reminderId: "REM-9001",
        eventId: "EVT-101",
        message: "Reminder: Deep Learning & Computer Vision Workshop starts tomorrow at 09:00 in Audi-3 Block 34.",
        sentAt: new Date(Date.now() - 86400000).toISOString(),
        sentToCount: 2,
      },
      {
        reminderId: "REM-9002",
        eventId: "EVT-102",
        message: "Reminder: Campus Cyber Defense Seminar is scheduled for 17 Nov 2026 at 14:00 in Room 401 Block 32.",
        sentAt: new Date(Date.now() - 172800000).toISOString(),
        sentToCount: 2,
      },
    ];
    this.saveReminders(reminders);

    const seededStudentIds = [
      "12601928",
      "12601929",
      "12601930",
      "12601931",
      "12601932",
      "12601933",
      "12601934",
      "12601935",
    ];
    const currentActive = this.getActiveStudentId();
    if (currentActive !== "ALL" && !seededStudentIds.includes(currentActive)) {
      this.setActiveStudentId("12601928");
    }
  }
}

// Default export for ES module imports (used by all feature modules)
// plus a window export so the service is reachable globally.
export default StorageService;

if (typeof window !== "undefined") {
  window.StorageService = StorageService;
}
