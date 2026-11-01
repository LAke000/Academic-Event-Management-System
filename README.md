# Academic Event Registration System

**Course / Evaluation Context:** University Capstone / Mini-Project Submission — Client-Side Web Development  
**Author / Student:** Mr. Lake  
**Submission Date:** 2026  
**Stack:** HTML5 · CSS3 · Vanilla JavaScript (ES6 Modules) · localStorage  
**Live Demo:** Open `index.html` in any modern browser (no build step, no server required)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement & Scope](#problem-statement--scope)
3. [Architectural Justification (Evaluation Defense)](#architectural-justification-evaluation-defense)
4. [Feature Matrix](#feature-matrix)
5. [Critical Business Rules](#critical-business-rules)
6. [File Architecture (14 Files)](#file-architecture-14-files)
7. [External Libraries (CDN)](#external-libraries-cdn)
8. [Database Schemas (localStorage)](#database-schemas-localstorage)
9. [Step-by-Step Running Guide](#step-by-step-running-guide)
10. [Grading / Demo Walkthrough](#grading--demo-walkthrough)
11. [Constraints Summary](#constraints-summary)

---

## Project Overview

The **Academic Event Registration System** is a pure client-side Single-Page Application (SPA) branded as the **Campus Event Portal**. It provides a paperless platform for university event publishing, student registration, live QR attendance tracking, feedback collection, and certificate generation.

The application operates under a dual-role system:

- **Student / Attendee Mode:** Browse events, register, view digital QR entry passes, view attendance history, submit post-event feedback, and download participation certificates.
- **Admin / Organizer Mode:** Create and manage events, enforce seat limits, view the registrant roster, run live QR camera scanning at venue doors, review feedback, and export data to CSV.
- **Gate Delegate (Scan-Only):** A locked sub-view where event volunteers enter a scan code (e.g., `SCAN-CSE-2026`) to activate the camera scanner without accessing admin data.

All data is persisted entirely in the browser using the `localStorage` API. There is no backend server, no SQL database, and no Node.js or Python runtime.

---

## Problem Statement & Scope

University campuses still run many academic events — workshops, seminars, guest lectures, hackathons, and symposiums — on paper. The status quo creates several real-world friction points:

- **Long registration queues:** Students sign up on paper sheets or email the faculty coordinator, causing manual data entry errors and duplicate entries.
- **Manual sign-in sheets:** Attendance is marked by hand at the venue door, which is slow, often illegible, and difficult to reconcile after the event.
- **Delayed certificates:** Participation certificates are prepared days or weeks after the event and often never reach the student.
- **No analytics:** Organizers have no live view of seat capacity, turnout, registration counts, or student feedback.

**Scope:** The Campus Event Portal handles the full event lifecycle — publishing, student registration, live QR attendance, feedback collection, and certificate generation — entirely in the browser using `localStorage`. It is designed for offline-first operation, requires no installation, and runs from a single `index.html` file.

---

## Architectural Justification (Evaluation Defense)

Because the project requires a pure client-side stack with zero backend, the application simulates a relational database engine using the browser's `localStorage` API.

### How `localStorage` functions as the database engine

| Database Concept | `localStorage` Equivalent in this App |
|---|---|
| Database / Schema | Four named collections stored under keys: `academic_events_db`, `academic_registrations_db`, `academic_feedback_db`, `academic_reminders_db` |
| Table / Collection | Each key holds a JSON array of objects with a fixed schema |
| Row / Record | One object inside a collection (e.g., one event, one registration, one feedback entry) |
| Primary Key | `id` for events, `regId` for registrations, composite `eventId + studentId` for feedback |
| CREATE | `setItem(key, JSON.stringify(array))` after appending a new object |
| READ | `getItem(key)` then `JSON.parse()` to rehydrate the array |
| UPDATE | Read array, mutate target object in memory, `setItem` the full array |
| DELETE | Read array, `filter` out the target object, `setItem` the full array |
| Persistence | Data survives page reloads and browser restarts because it lives in the browser's origin storage |

### Data flow

1. On first load, `js/storage.js` checks whether each collection exists in `localStorage`. If not, it initializes an empty array (or seeds demo data when the evaluator clicks **Load Demo Academic Data**).
2. Every mutation (create event, register student, check-in, submit feedback, export) reads the current array from `localStorage`, mutates it in memory, and writes the full JSON array back with `JSON.stringify`.
3. Reads use `JSON.parse` to rehydrate the collections on demand.

### Why this satisfies the constraints

- **Zero backend:** No network requests are made to any server. All state is confined to the browser sandbox.
- **No SQL:** There is no relational engine; queries are simple JavaScript array methods (`filter`, `find`, `some`, `map`, `reduce`).
- **Offline-first:** The app works entirely offline once loaded.
- **GDPR-friendly for a campus demo:** Data never leaves the student's machine; clearing `localStorage` deletes everything instantly.

### Trade-offs (honest disclosure for evaluators)

- `localStorage` is scoped per origin (per browser + domain), so data does not sync across devices or browsers.
- There is no multi-user concurrency control; this is a single-user demo appropriate for a classroom submission.
- Storage capacity is limited (typically ~5–10 MB), which is ample for event/registration/feedback records but not for bulk file storage.

---

## Feature Matrix

| Capability | Student / Attendee Mode | Admin / Organizer Mode |
|---|---|---|
| Browse published events | &#10004; | &#10004; |
| Register for an event (deduplication enforced) | &#10004; | |
| View digital QR entry pass | &#10004; | |
| Check capacity / "Housefull" status | &#10004; | &#10004; |
| Create, edit, delete events | | &#10004; |
| View registrant roster | | &#10004; |
| Live QR camera scanning & check-in | | &#10004; |
| Manual check-in override | | &#10004; |
| Submit post-event feedback (gated to Present) | &#10004; | |
| Download participation certificate (gated to Present) | &#10004; | |
| Export registrations / attendance / feedback to CSV | | &#10004; |
| View Chart.js attendance analytics | | &#10004; |
| Seed demo academic data | | &#10004; |

---

## Critical Business Rules

1. **Deduplication Check:** Before saving a registration, `registration.js` checks `registrations_db` for an existing match of `studentId` AND `eventId`. A student cannot register twice for the same event.
2. **Capacity Enforcement:** Registration is disabled when `total_registered === event.capacity`. The UI displays **"Housefull"** and blocks further registration.
3. **Gated Post-Event Access:** The Feedback form and Certificate download are only accessible if `attendance.status === "Present"`. Absent students cannot claim certificates.
4. **Empty States:** User-friendly "Call to Action" screens appear when `localStorage` is empty (e.g., "No Events Created Yet → [Create Event]").
5. **Camera Scanner Access:** The Live QR Scanner tab is available in Admin Mode for organizer check-in at venue doors. There is no separate scan-only gate delegate sub-view.

---

## File Architecture (15 Files)

```
academic-event-system/
├── index.html                  # Main SPA container & HTML <dialog> templates
├── README.md                   # This file — setup guide and architectural defense notes
├── css/
│   ├── main.css                # CSS variables (design tokens), resets, grid layouts
│   ├── components.css          # Cards, modals, tables, badges, toast alerts
│   └── print.css               # @media print rules for passes and certificates
├── js/
│   ├── app.js                  # SPA routing, tab navigation, role-switching
│   ├── storage.js              # localStorage wrapper & Demo Data Seeder
│   ├── events.js               # Event CRUD & dynamic capacity checking
│   ├── registration.js         # Deduplication logic & QR pass generation
│   ├── attendance.js           # html5-qrcode scanner & manual override list
│   ├── feedback.js             # Gated review form & star rating logic
│   ├── certificate.js          # HTML5 <canvas> rendering & PNG download
│   ├── reports.js              # Native CSV Blob export & Chart.js integration
│   └── utils.js                # Shared ID generator, deep clone, and ISO date formatter
└── assets/
    └── beep.mp3                # Audio chime on successful QR scan
```

### File Responsibilities

| File | Responsibility |
|---|---|
| `index.html` | Semantic SPA shell: top bar, role toggle, sidebar navigation, 9 `tab-pane` sections, 4 `<dialog>` modals (Create Event, Digital Boarding Pass, Feedback, Certificate), toast container, and all 8 module script imports. |
| `css/main.css` | CSS custom properties (design tokens: navy `#1e3a8a`, slate grays), reset rules, layout grid, responsive sidebar and main viewport. |
| `css/components.css` | Reusable components: cards, data tables, badges (Open / Housefull / Registered / Present), toast alerts, star-rating, form fields, buttons, empty states. |
| `css/print.css` | `@media print` stylesheet for QR passes and certificates — hides nav/buttons, optimizes for paper output. |
| `js/storage.js` | `localStorage` wrapper: `get`, `set`, `remove` for `academic_events_db`, `academic_registrations_db`, `academic_feedback_db`, `academic_reminders_db`. Demo Data Seeder populates synthetic campus events and registrations. |
| `js/utils.js` | Shared helpers: `generateId()` for unique IDs, `deepClone()` for record integrity, `formatDate()` for ISO date formatting. |
| `js/events.js` | Event CRUD operations, dynamic capacity counting, "Housefull" badge rendering, event card/table row generation. |
| `js/registration.js` | Student registration flow, deduplication logic (`studentId` + `eventId`), QR pass generation via `qrcode.min.js`, pass modal rendering. |
| `js/attendance.js` | `html5-qrcode.min.js` webcam integration, live QR scanning, manual check-in override, attendance status toggling, check-in toast feed. |
| `js/feedback.js` | Gated feedback form (only if `attendance.status === "Present"`), 5-star interactive rating, comment textarea, submission to `academic_feedback_db`. |
| `js/certificate.js` | HTML5 `<canvas>` certificate rendering (student name, event title, date), PNG download, print certificate action. |
| `js/reports.js` | Native CSV Blob export (no server), Chart.js integration for attendance/turnout analytics, export buttons for registrations/attendance/feedback. |
| `js/app.js` | SPA router: tab switching, role-switching (Student ⇄ Admin), sidebar active state, empty-state toggling, global toast dispatcher, module initialization. |
| `assets/beep.mp3` | Audio chime played on successful QR scan check-in. |

---

## External Libraries (CDN)

Only three external libraries are loaded via CDN, all vanilla-compatible:

| Library | Purpose | CDN |
|---|---|---|
| `qrcode.min.js` | Generates the student's unique digital QR entry pass | `https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js` |
| `html5-qrcode.min.js` | Accesses the device webcam to scan student QR codes live at the venue door | `https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8` |
| `Chart.js` | Renders attendance and turnout analytics in the Reports section | `https://cdn.jsdelivr.net/npm/chart.js` |

---

## Database Schemas (localStorage)

### 1. `events_db`

```json
[{
  "id": "EVT-101",
  "title": "State-of-the-Art Deep Learning",
  "type": "Workshop",
  "department": "CSE",
  "venue": "Audi-3",
  "dateTime": "2026-11-15T10:00",
  "capacity": 60,
  "speaker": "Dr. A. Sharma",
  "status": "Active"
}]
```

### 2. `registrations_db`

```json
[{
  "regId": "REG-9901",
  "eventId": "EVT-101",
  "studentName": "Sachin Kumar",
  "studentId": "12601928",
  "email": "sachin@test.com",
  "registeredAt": "2026-11-01T14:20:00Z",
  "attendance": {
    "status": "Present",
    "checkInTime": "2026-11-15T09:52:10Z"
  }
}]
```

### 3. `feedback_db`

```json
[{
  "eventId": "EVT-101",
  "studentId": "12601928",
  "rating": 5,
  "comments": "Great hands-on session."
}]
```

All date/time values use ISO 8601 strings. The values shown above are synthetic/sample data per the project specification, not production data.

---

## Step-by-Step Running Guide

### Option A: Direct browser execution (no tooling)

1. Download or clone the `academic-event-system/` folder.
2. **Important:** Because the app uses ES6 modules (`<script type="module">`), it must be served over HTTP/HTTPS — it will not work when opened via `file://`. Use Option B (Live Server) or any local static server.
3. The app runs entirely offline once served; no install, no `npm`, no build step.

### Option B: VS Code Live Server (recommended)

1. Open the `academic-event-system/` folder in Visual Studio Code.
2. Install the **Live Server** extension (Ritwick Dey) if not already installed.
3. Right-click `index.html` → **Open with Live Server**.
4. The app opens at `http://127.0.0.1:5500/index.html` with live reload.

**Browser note:** The Live QR Scanner requires camera permissions. When prompted, grant camera access so organizers can scan QR passes at the venue door. If the camera is blocked, the manual registration and roster flows still work.

---

## Grading / Demo Walkthrough

Instructions for professors and evaluators:

1. **Open the portal.** Launch `index.html` in the browser. You start in **Student Mode** with an empty `localStorage`.
2. **Load demo academic data.** Switch to **Admin / Organizer Mode** using the toggle in the top bar, then click **"Load Demo Academic Data"** on the Dashboard. This seeds:
   - `events_db` with sample events (e.g., Deep Learning Workshop in Audi-3, Department of CSE)
   - `registrations_db` with sample student registrations
   - `feedback_db` with sample reviews
3. **Explore as a student.** Switch back to **Student Mode**. Browse events on **Discover Events**, register for an event, and open **My Passes** to see the generated QR entry pass. Click **Print Pass** to test the print stylesheet.
4. **Test capacity and deduplication.** Register the same student for the same event twice — the second attempt is blocked by deduplication logic. Fill an event to capacity — the UI displays **"Housefull"** and disables further registration.
5. **Test the gate delegate scanner.** In Admin Mode, open **Live QR Scanner**, click **Start Camera**, and scan a student's QR pass from another device (or a printed pass). A check-in toast appears and the roster updates to `Present`. Use the manual check-in search as a fallback.
6. **Test gated post-event access.** Once a student is checked in as **Present**, they can open **History & Certificates**, submit feedback via the 5-star rating form, and download a PNG certificate generated on an HTML5 `<canvas>`.
7. **Export reports.** In Admin Mode, open **Reports & CSV Export** and export Registrations, Attendance, or Feedback as CSV files using native Browser Blobs (no server round-trip). View the Chart.js attendance chart.
8. **Reset state.** Click **Clear All Data** on the Dashboard to wipe `localStorage` and return to a clean slate for the next demo.

---

## Constraints Summary (Honored)

- **Zero backend:** No server, no SQL database, no Node.js/Python.
- **Vanilla stack only:** Pure HTML5, CSS3, ES6+ JavaScript. No React, Vue, Tailwind, or Bootstrap.
- **Data persistence:** Browser `localStorage` only, using the schemas defined above.
- **File architecture:** Strictly the 15-file structure above. No unnecessary files.
- **External libraries:** Only the three approved CDNs (qrcode.min.js, html5-qrcode.min.js, Chart.js).
