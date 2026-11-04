import test from "node:test";
import assert from "node:assert/strict";

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
    this.classList = {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {},
    };
    this.eventListeners = {};
    this.parentElement = null;
    this.disabled = false;
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

  get textContent() {
    return this._innerHTML || "";
  }

  set textContent(text) {
    this._innerHTML = String(text);
  }

  appendChild(child) {
    if (child && child.textContent !== undefined && !this._innerHTML) {
      this._innerHTML = child.textContent;
    }
    if (child instanceof MockElement) {
      child.parentElement = this;
    }
    this.children.push(child);
    return child;
  }

  insertBefore(newNode, refNode) {
    if (newNode instanceof MockElement) {
      newNode.parentElement = this;
    }
    this.children.push(newNode);
    return newNode;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
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

  querySelector(sel) {
    return null;
  }

  querySelectorAll(sel) {
    return [];
  }
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

const mockElements = {
  "dept-filter-select": new MockElement("select", "dept-filter-select"),
  "type-filter-select": new MockElement("select", "type-filter-select"),
  "avail-filter-select": new MockElement("select", "avail-filter-select"),
  "date-filter-input": new MockElement("input", "date-filter-input"),
  "discover-list": new MockElement("div", "discover-list"),
  "discover-empty": new MockElement("div", "discover-empty"),
  "events-table-body": new MockElement("tbody", "events-table-body"),
  "events-list": new MockElement("div", "events-list"),
  "events-empty": new MockElement("div", "events-empty"),
  "stat-events": new MockElement("span", "stat-events"),
  "stat-registrations": new MockElement("span", "stat-registrations"),
  "stat-present": new MockElement("span", "stat-present"),
  "stat-feedback": new MockElement("span", "stat-feedback"),
  "stat-turnout-rate": new MockElement("span", "stat-turnout-rate"),
  "stat-noshow-rate": new MockElement("span", "stat-noshow-rate"),
  "stat-avg-rating": new MockElement("span", "stat-avg-rating"),
  "reports": new MockElement("section", "reports"),
  "reports-empty": new MockElement("div", "reports-empty"),
  "reports-kpi-grid": new MockElement("div", "reports-kpi-grid"),
  "attendanceChart": new MockElement("canvas", "attendanceChart"),
};

mockElements["reports"].appendChild(mockElements["reports-kpi-grid"]);
const chartCard = new MockElement("div");
chartCard.className = "chart-card";
chartCard.appendChild(mockElements["attendanceChart"]);
mockElements["reports"].appendChild(chartCard);

globalThis.window = globalThis;
globalThis.window.location = { hash: "" };
globalThis.window.showToast = () => {};
globalThis.window.addEventListener = () => {};
globalThis.document = {
  readyState: "complete",
  body: new MockElement("body"),
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

const { default: EventsModule } = await import("../js/events.js");
const { default: app } = await import("../js/app.js");
const { default: ReportsModule } = await import("../js/reports.js");

test("EventsModule.eventHasSeats and renderDiscover count seats without cancelled registrations", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-seats-1",
      title: "Robotics Workshop",
      department: "ME",
      type: "Workshop",
      venue: "Lab 1",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 1,
      registered: 1,
      status: "Housefull",
    },
  ]);
  // 1 cancelled registration
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-C1",
      eventId: "ev-seats-1",
      studentId: "12601928",
      name: "Alice Kumar",
      email: "alice@example.edu",
      department: "ME",
      status: "Cancelled",
      attendance: { status: "Cancelled" },
    },
  ]);

  const hasSeats = EventsModule.eventHasSeats({
    id: "ev-seats-1",
    capacity: 1,
    status: "Housefull",
  });
  assert.equal(hasSeats, true, "eventHasSeats should return true when only cancelled registrations exist");

  EventsModule.renderDiscover();
  const card = mockElements["discover-list"].children[0];
  assert.ok(card, "An event card should be rendered");
  assert.ok(
    card.innerHTML.includes("1 / 1 seats (0 registered)"),
    `Expected card to show 1 / 1 seats (0 registered), got: ${card.innerHTML}`
  );
  assert.ok(
    card.innerHTML.includes("Register Now"),
    `Expected card to show Register Now button enabled, got: ${card.innerHTML}`
  );
});

test("EventsModule.renderAdminTable displays active registeredCount ignoring cancelled registrations", () => {
  store["academic_events_db"] = JSON.stringify([
    {
      id: "ev-seats-2",
      title: "AI Conference",
      department: "CSE",
      type: "Conference",
      venue: "Auditorium",
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: 50,
      registered: 1,
      status: "Open",
    },
  ]);
  // 1 cancelled registration
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-C2",
      eventId: "ev-seats-2",
      studentId: "12601929",
      name: "Bob Singh",
      email: "bob@example.edu",
      department: "CSE",
      status: "Cancelled",
      attendance: { status: "Cancelled" },
    },
  ]);

  EventsModule.renderAdminTable();
  const row = mockElements["events-table-body"].children[0];
  assert.ok(row, "Admin table row should be rendered");
  // Check that row HTML has <td>0</td> for registered count
  assert.ok(
    row.innerHTML.includes("<td>0</td>"),
    `Expected row to contain <td>0</td> registered count, got: ${row.innerHTML}`
  );
});

test("app.renderDashboardStats calculates turnoutRate and noshowRate excluding cancelled registrations", () => {
  store["academic_events_db"] = JSON.stringify([
    { id: "ev-1", title: "Event 1", capacity: 10, status: "Open" },
  ]);
  // 1 Present registration and 1 Cancelled registration
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-1",
      eventId: "ev-1",
      studentId: "12601928",
      name: "Alice Kumar",
      status: "Present",
      attendance: { status: "Present" },
    },
    {
      regId: "REG-2",
      eventId: "ev-1",
      studentId: "12601929",
      name: "Bob Singh",
      status: "Cancelled",
      attendance: { status: "Cancelled" },
    },
  ]);
  store["academic_feedback_db"] = JSON.stringify([]);

  app.renderDashboardStats();

  // With 1 Present and 1 Cancelled, active registrations = 1, attended = 1
  // Turnout rate should be 100%, and No-show rate should be 0% (NOT 50% / 50%)
  assert.equal(mockElements["stat-turnout-rate"].textContent, "100%");
  assert.equal(mockElements["stat-noshow-rate"].textContent, "0%");
});

test("ReportsModule.renderAnalytics calculates turnoutRate and noshowRate excluding cancelled registrations", () => {
  store["academic_events_db"] = JSON.stringify([
    { id: "ev-1", title: "Event 1", capacity: 10, status: "Open" },
  ]);
  // 1 Present registration and 1 Cancelled registration
  store["academic_registrations_db"] = JSON.stringify([
    {
      regId: "REG-1",
      eventId: "ev-1",
      studentId: "12601928",
      name: "Alice Kumar",
      department: "CSE",
      status: "Present",
      attendance: { status: "Present" },
    },
    {
      regId: "REG-2",
      eventId: "ev-1",
      studentId: "12601929",
      name: "Bob Singh",
      department: "CSE",
      status: "Cancelled",
      attendance: { status: "Cancelled" },
    },
  ]);
  store["academic_feedback_db"] = JSON.stringify([]);

  ReportsModule.renderAnalytics();

  const kpiHtml = mockElements["reports-kpi-grid"].innerHTML;
  assert.ok(
    kpiHtml.includes('<div class="stat-value">100%</div>\n        <div class="stat-label">Turnout Rate</div>') ||
    kpiHtml.includes("100%</div>\n        <div class=\"stat-label\">Turnout Rate</div>"),
    `Expected Turnout Rate to be 100%, got: ${kpiHtml}`
  );
  assert.ok(
    kpiHtml.includes('<div class="stat-value">0%</div>\n        <div class="stat-label">No-Show Rate</div>') ||
    kpiHtml.includes("0%</div>\n        <div class=\"stat-label\">No-Show Rate</div>"),
    `Expected No-Show Rate to be 0%, got: ${kpiHtml}`
  );
});
