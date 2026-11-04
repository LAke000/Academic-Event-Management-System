import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("README.md Section 1 has no Gate Delegate scan-only bullet or SCAN-CSE-2026", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf-8");

  assert.equal(
    readme.includes("Gate Delegate (Scan-Only)"),
    false,
    "README.md must not include 'Gate Delegate (Scan-Only)' mode"
  );
  assert.equal(
    readme.includes("SCAN-CSE-2026"),
    false,
    "README.md must not include 'SCAN-CSE-2026'"
  );
});

test("README.md Section 7 contains exact qrcode CDN URL", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf-8");

  assert.ok(
    readme.includes("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"),
    "README.md Section 7 must reference https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
  );
  assert.equal(
    readme.includes("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"),
    false,
    "README.md must not reference old qrcode@1.5.3 CDN URL"
  );
});

test("README.md Section 3 and Section 8 document exact localStorage keys and schemas", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf-8");

  // Exact keys present
  const requiredKeys = [
    "academic_events_db",
    "academic_registrations_db",
    "academic_feedback_db",
    "academic_reminders_db",
    "academic_students_db",
  ];

  for (const key of requiredKeys) {
    assert.ok(
      readme.includes(key),
      `README.md must document key '${key}'`
    );
  }

  // Section 8 must not use shorthand headings
  assert.equal(
    readme.includes("### 1. `events_db`"),
    false,
    "README.md Section 8 must use exact key `academic_events_db` instead of `events_db`"
  );
  assert.equal(
    readme.includes("### 2. `registrations_db`"),
    false,
    "README.md Section 8 must use exact key `academic_registrations_db` instead of `registrations_db`"
  );
  assert.equal(
    readme.includes("### 3. `feedback_db`"),
    false,
    "README.md Section 8 must use exact key `academic_feedback_db` instead of `feedback_db`"
  );

  // Exact property names
  const requiredProps = [
    "\"date\"",
    "\"endTime\"",
    "\"deadline\"",
    "\"name\"",
    "\"comment\"",
    "\"speakerQuality\"",
    "\"contentRelevance\"",
    "\"venueOrganization\"",
  ];

  for (const prop of requiredProps) {
    assert.ok(
      readme.includes(prop),
      `README.md Section 8 schemas must include property ${prop}`
    );
  }

  // Shorthand properties must not be present in Section 8 schemas
  assert.equal(
    readme.includes("\"dateTime\""),
    false,
    "README.md must use 'date' instead of 'dateTime'"
  );
  assert.equal(
    readme.includes("\"studentName\""),
    false,
    "README.md must use 'name' instead of 'studentName'"
  );
  assert.equal(
    readme.includes("\"comments\""),
    false,
    "README.md must use 'comment' instead of 'comments'"
  );
});
