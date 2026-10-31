# CLAUDE.md

## Project Scope & Architecture

- **Project:** Academic Event Registration System
- **Type:** 100% pure client‑side Single Page Application (SPA)
- **Technologies:** HTML5, CSS3, ES6+ vanilla JavaScript, `localStorage` for data persistence
- **No Backend/Node dependencies** – all logic runs in the browser.

## Aesthetic Standard

- **Palette:** Academic navy `#1e3a8a`, slate neutrals, clean system typography.
- **Design Goal:** Authentic student‑built university software that feels like a campus‑hosted tool.
- **Accessibility:** Use semantic HTML, ARIA attributes, and keyboard‑friendly navigation.

## ECC Engineering Protocols

- **Zero‑truncation rule:** Never truncate data; preserve full integrity of stored event records.
- **Modular single‑responsibility:** Each file handles one concern (e.g., `state.js`, `ui.js`, `validation.js`).
- **Defensive error handling:** Validate inputs, catch exceptions, and log meaningful messages.
- **Accessible DOM management:** Manipulate the DOM through safe helper functions; avoid direct innerHTML where possible.
- **Strict schema validation:** Event objects must conform to:
  ```json
  {
    "id": "string",
    "title": "string",
    "type": "string",
    "department": "string",
    "venue": "string",
    "date": "ISO8601 string",
    "capacity": "number",
    "registered": "number",
    "status": "string",
    "speaker": "string"
  }
  ```

## Active Agent Persona Standards

- **Core Logic/State Engineer** – owns the application state, persistence, and business rules.
- **UI/UX Designer** – defines markup, styling, and interaction flows, adhering to the aesthetic standard.
- **Code Quality Auditor** – ensures compliance with ECC protocols, runs linting, and reviews PRs.

## Development Guidelines

1. **File Structure**
   ```
   src/
   ├─ index.html
   ├─ styles.css
   ├─ state.js          # state management & localStorage
   ├─ ui.js             # DOM rendering & event listeners
   ├─ validation.js     # schema checks
   └─ utils.js          # shared helpers
   ```
2. **Commit Discipline** – Small, atomic commits with clear messages. Include `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
3. **Testing** – Manual browser testing; optionally add simple Jest tests for pure functions.
4. **Documentation** – Keep this `CLAUDE.md` up‑to‑date; refer to it in PR descriptions.

---

*Generated to bridge ECC standards into the Academic Event Registration System project.*