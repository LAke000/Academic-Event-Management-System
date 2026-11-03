import test from "node:test";
import assert from "node:assert/strict";

// Set up mock DOM environment
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
    this.eventListeners = {};
  }

  get options() {
    return this.children.filter((c) => c.tagName === "OPTION");
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (html.includes('<option value="">All Departments</option>')) {
      const opt = new MockElement("option");
      opt.value = "";
      opt.textContent = "All Departments";
      this.children.push(opt);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    if (child && child.textContent !== undefined && !this._innerHTML) {
      this._innerHTML = child.textContent;
    }
    this.children.push(child);
    return child;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  addEventListener(event, handler) {
    this.eventListeners[event] = this.eventListeners[event] || [];
    this.eventListeners[event].push(handler);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

const mockElements = {
  "dept-filter-select": new MockElement("select", "dept-filter-select"),
  "type-filter-select": new MockElement("select", "type-filter-select"),
  "avail-filter-select": new MockElement("select", "avail-filter-select"),
  "date-filter-input": new MockElement("input", "date-filter-input"),
  "discover-list": new MockElement("div", "discover-list"),
  "events-table-body": new MockElement("tbody", "events-table-body"),
  "event-search-input": new MockElement("input", "event-search-input"),
  "event-create-dialog": new MockElement("dialog", "event-create-dialog"),
  "event-create-form": new MockElement("form", "event-create-form"),
  "btn-create-event": new MockElement("button", "btn-create-event"),
  "btn-cancel-event": new MockElement("button", "btn-cancel-event"),
};

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

globalThis.window = globalThis;
globalThis.document = {
  readyState: "complete",
  getElementById: (id) => mockElements[id] || new MockElement("div", id),
  querySelector: (sel) => {
    if (sel === "#events-table-body") return mockElements["events-table-body"];
    return new MockElement("div");
  },
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: String(text) }),
  addEventListener: () => {},
};

test("render() repopulates filters when events are added after init()", async () => {
  // Ensure database starts empty
  store["academic_events_db"] = JSON.stringify([]);

  // Import events module - triggers init() and initial render()
  const { default: EventsModule } = await import("../js/events.js");

  const deptSelect = mockElements["dept-filter-select"];
  // Initially with empty db, only "All Departments" is present
  assert.equal(deptSelect.options.length, 1);
  assert.equal(deptSelect.options[0].textContent, "All Departments");

  // Now seed events into storage (simulating app.js seeding database after events.js has initialized)
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-1",
      title: "Tech Summit",
      type: "Conference",
      department: "Computer Science",
      venue: "Hall A",
      date: new Date().toISOString(),
      capacity: 100,
      status: "Upcoming",
    },
    {
      id: "ev-2",
      title: "Robotics Expo",
      type: "Workshop",
      department: "Mechanical Engineering",
      venue: "Lab 2",
      date: new Date().toISOString(),
      capacity: 50,
      status: "Upcoming",
    },
  ]);

  // Call render() - simulating tab switch or catalog render
  EventsModule.render();

  // The department dropdown should now contain the departments from the seeded events
  const optionValues = deptSelect.options.map((o) => o.value);
  assert.ok(
    optionValues.includes("Computer Science"),
    `Expected Computer Science in ${JSON.stringify(optionValues)}`
  );
  assert.ok(
    optionValues.includes("Mechanical Engineering"),
    `Expected Mechanical Engineering in ${JSON.stringify(optionValues)}`
  );
});
