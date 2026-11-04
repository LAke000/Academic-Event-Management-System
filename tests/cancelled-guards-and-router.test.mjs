import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── Test 1: Static and router assertions for js/app.js ──────────────────────
test("app.js router guards: showTab uses replaceState and hashchange blocks student tabs in admin mode", () => {
  const appSrc = fs.readFileSync(path.resolve("js/app.js"), "utf-8");

  // showTab should use history.replaceState to avoid hashchange loop
  assert.ok(
    appSrc.includes("history.replaceState"),
    "showTab in js/app.js must use history.replaceState"
  );
  assert.equal(
    appSrc.includes("window.location.hash = tabId"),
    false,
    "showTab in js/app.js must not assign window.location.hash = tabId"
  );

  // hashchange listener must guard both roles
  assert.ok(
    appSrc.includes('STUDENT_TABS.includes(hash) && role === "admin"'),
    "hashchange listener in js/app.js must guard against STUDENT_TABS in admin mode"
  );
});

// ─── Test 2: EventsModule reminders and cancellation guards ──────────────────
test("events.js: sendReminder blocks cancelled events, cancelEvent sets registered to 0, admin table disables Remind", async () => {
  const eventsSrc = fs.readFileSync(path.resolve("js/events.js"), "utf-8");

  // Check static patterns
  assert.ok(
    eventsSrc.includes('event.status === "Cancelled"'),
    "events.js must check event.status === 'Cancelled' in sendReminder"
  );
  assert.ok(
    eventsSrc.includes("registered: 0"),
    "events.js cancelEvent must reset registered count to 0"
  );
  assert.ok(
    eventsSrc.includes('ev.status === "Cancelled" ? "disabled" : ""') &&
    eventsSrc.includes("btn-remind-event"),
    "renderAdminTable must disable btn-remind-event when ev.status === 'Cancelled'"
  );
});

// ─── Test 3: Discover cards show Registration Void for cancelled registrations
test("events.js: renderDiscover looks up activeReg in allEventRegs and filters out cancelled event reminders", () => {
  const eventsSrc = fs.readFileSync(path.resolve("js/events.js"), "utf-8");

  assert.ok(
    eventsSrc.includes("allEventRegs"),
    "renderDiscover must define allEventRegs from StorageService.getRegistrationsByEvent"
  );
  assert.ok(
    eventsSrc.includes('StorageService.getEventById(rem.eventId)?.status !== "Cancelled"'),
    "renderDiscover must filter out reminders for cancelled events"
  );
});

// ─── Test 4: registration.js cancelRegistration and renderPasses guards ──────
test("registration.js: cancelRegistration preserves Cancelled event status and recomputes registered, renderPasses hides cancelled event reminders", () => {
  const regSrc = fs.readFileSync(path.resolve("js/registration.js"), "utf-8");

  assert.ok(
    regSrc.includes('allEvents[evIdx].status !== "Cancelled"'),
    "cancelRegistration in registration.js must only reopen non-cancelled events"
  );
  assert.ok(
    regSrc.includes("remainingActive"),
    "cancelRegistration in registration.js must calculate remainingActive count"
  );
  assert.ok(
    regSrc.includes('ev?.status === "Cancelled"'),
    "renderPasses must filter out upcomingReminders for cancelled events"
  );
});

// ─── Test 5: feedback.js & certificate.js reject cancelled events and registrations
test("feedback.js & certificate.js reject cancelled events and registrations", () => {
  const feedbackSrc = fs.readFileSync(path.resolve("js/feedback.js"), "utf-8");
  const certSrc = fs.readFileSync(path.resolve("js/certificate.js"), "utf-8");

  assert.ok(
    feedbackSrc.includes("Feedback is closed for cancelled events"),
    "feedback.js must guard against cancelled events in openFeedbackDialog"
  );
  assert.ok(
    certSrc.includes('event.status === "Cancelled"') || certSrc.includes('event?.status === "Cancelled"'),
    "certificate.js must check for cancelled event in generateCertificate"
  );
  assert.ok(
    certSrc.includes('reg.status === "Cancelled"') || certSrc.includes('attendance.status === "Cancelled"'),
    "certificate.js must check for cancelled registration/attendance in generateCertificate"
  );
});
