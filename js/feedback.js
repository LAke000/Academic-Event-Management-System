// js/feedback.js – Student Feedback Flow & Admin Feedback Dashboard
// Single‑responsibility: owns feedback submission, star‑rating widget,
// and the admin review dashboard. Follows ECC zero‑truncation protocols.

import StorageService from "./storage.js";
import { formatDate, generateId } from "./utils.js";

const FeedbackModule = (() => {
  // ─── DOM references ───────────────────────────────────────────────────────────
  // Feedback dialog (student submission)
  const feedbackDialog = document.getElementById("feedback-dialog");
  const feedbackForm = document.getElementById("feedback-form");
  const starRatingContainer = document.getElementById("star-rating");
  const starHint = document.getElementById("star-hint");
  const feedbackComments = document.getElementById("feedback-comments");
  const btnSubmitFeedback = document.getElementById("btn-submit-feedback");
  const btnCancelFeedback = document.getElementById("btn-cancel-feedback");

  // Admin feedback section
  const feedbackListContainer = document.getElementById("feedback-list");
  const feedbackEmpty = document.getElementById("feedback-empty");

  // ─── Internal state ───────────────────────────────────────────────────────────
  let selectedRating = 0;
  let activeEventIdForFeedback = null;
  let activeStudentIdForFeedback = null;

  // ─── Utility: HTML escaping ───────────────────────────────────────────────────
  /**
   * Escape a string for safe insertion into innerHTML.
   * @param {string} str
   * @returns {string}
   */
  const escapeHtml = (str) => {
    if (typeof str !== "string") return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  };

  // ─── Star‑rating widget ───────────────────────────────────────────────────────
  // The HTML contains radio inputs star5→star1 (value 5→1) with adjacent labels.
  // We layer interactive hover highlighting and click confirmation on top.

  /**
   * Highlight stars from 1 up to `rating`.
   * Stars are rendered right‑to‑left in the DOM (star5 first), so we iterate
   * all labels and toggle a class based on their value.
   * @param {number} rating - 1–5, or 0 to clear.
   */
  const highlightStars = (rating) => {
    if (!starRatingContainer) return;
    const labels = starRatingContainer.querySelectorAll(".star-label");
    labels.forEach((label) => {
      // Each label's `for` attribute points to the radio; extract the value
      const radio = document.getElementById(label.getAttribute("for"));
      if (!radio) return;
      const val = parseInt(radio.value, 10);
      if (val <= rating) {
        label.classList.add("star-active");
      } else {
        label.classList.remove("star-active");
      }
    });
  };

  /**
   * Bind hover preview and click‑to‑select on the star labels.
   */
  const initStarWidget = () => {
    if (!starRatingContainer) return;
    const labels = starRatingContainer.querySelectorAll(".star-label");

    labels.forEach((label) => {
      const radio = document.getElementById(label.getAttribute("for"));
      if (!radio) return;
      const val = parseInt(radio.value, 10);

      // Hover preview
      label.addEventListener("mouseenter", () => highlightStars(val));
      label.addEventListener("mouseleave", () => highlightStars(selectedRating));

      // Click to confirm
      label.addEventListener("click", () => {
        selectedRating = val;
        radio.checked = true;
        highlightStars(selectedRating);
        updateStarHint(selectedRating);
        updateSubmitButton();
      });
    });
  };

  /**
   * Update the hint text below the stars.
   * @param {number} rating
   */
  const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  const updateStarHint = (rating) => {
    if (!starHint) return;
    if (rating === 0) {
      starHint.textContent = "Select a rating to continue.";
    } else {
      starHint.textContent = `${rating} / 5 — ${RATING_LABELS[rating]}`;
    }
  };

  /**
   * Enable the submit button only when a rating is selected.
   */
  const updateSubmitButton = () => {
    if (!btnSubmitFeedback) return;
    btnSubmitFeedback.disabled = selectedRating === 0;
  };

  // ─── Dialog lifecycle ─────────────────────────────────────────────────────────
  /**
   * Open the feedback dialog for a specific event + student.
   * Called from History / Passes cards when student clicks "Leave Feedback".
   * @param {string} eventId
   * @param {string} studentId
   */
  const openFeedbackDialog = (eventId, studentId) => {
    if (!feedbackDialog) return;

    // Guard: check eligibility — must be Present
    const regs = StorageService.getRegistrations();
    const reg = regs.find(
      (r) => r.eventId === eventId && r.studentId === studentId && r.status === "Present"
    );
    if (!reg) {
      if (typeof window.showToast === "function") {
        window.showToast("You must attend and be checked in before leaving feedback.", "error");
      }
      return;
    }

    // Guard: prevent duplicate feedback
    const existing = StorageService.getFeedback().find(
      (f) => f.eventId === eventId && f.studentId === studentId
    );
    if (existing) {
      if (typeof window.showToast === "function") {
        window.showToast(
          `You already submitted feedback for this event (${formatDate(existing.timestamp)}).`,
          "warning"
        );
      }
      return;
    }

    activeEventIdForFeedback = eventId;
    activeStudentIdForFeedback = studentId;

    // Reset form state
    resetFeedbackForm();

    // Set hidden eventId
    const hiddenInput = feedbackForm ? feedbackForm.elements["eventId"] : null;
    if (hiddenInput) hiddenInput.value = eventId;

    feedbackDialog.showModal();
  };

  /**
   * Reset the dialog form to a clean state.
   */
  const resetFeedbackForm = () => {
    selectedRating = 0;
    highlightStars(0);
    updateStarHint(0);
    if (feedbackForm) feedbackForm.reset();
    if (feedbackComments) feedbackComments.value = "";
    updateSubmitButton();
  };

  /**
   * Close the feedback dialog gracefully.
   */
  const closeFeedbackDialog = () => {
    if (feedbackDialog && typeof feedbackDialog.close === "function") {
      feedbackDialog.close();
    }
    activeEventIdForFeedback = null;
    activeStudentIdForFeedback = null;
  };

  // ─── Submission handler ───────────────────────────────────────────────────────
  /**
   * Validate and persist the student's feedback submission.
   * @param {Event} e
   */
  const handleFeedbackSubmit = (e) => {
    e.preventDefault();

    if (selectedRating === 0) {
      if (typeof window.showToast === "function") {
        window.showToast("Please select a star rating.", "error");
      }
      return;
    }

    if (!activeEventIdForFeedback || !activeStudentIdForFeedback) {
      if (typeof window.showToast === "function") {
        window.showToast("Feedback context lost. Please try again.", "error");
      }
      return;
    }

    const comment = feedbackComments ? feedbackComments.value.trim() : "";

    // Validate comment — require at least a few characters of constructive input
    if (comment.length > 0 && comment.length < 5) {
      if (typeof window.showToast === "function") {
        window.showToast("Please write at least 5 characters, or leave the comments field empty.", "error");
      }
      return;
    }

    // Duplicate guard (race condition safe — re‑check at write time)
    const allFeedback = StorageService.getFeedback();
    const duplicate = allFeedback.find(
      (f) => f.eventId === activeEventIdForFeedback && f.studentId === activeStudentIdForFeedback
    );
    if (duplicate) {
      if (typeof window.showToast === "function") {
        window.showToast("Feedback already submitted for this event.", "warning");
      }
      closeFeedbackDialog();
      return;
    }

    // Build feedback record
    const feedbackRecord = {
      feedbackId: generateId("FB-", 6),
      eventId: activeEventIdForFeedback,
      studentId: activeStudentIdForFeedback,
      rating: selectedRating,
      comment: comment,
      timestamp: new Date().toISOString(),
    };

    allFeedback.push(feedbackRecord);
    StorageService.saveFeedback(allFeedback);

    closeFeedbackDialog();

    if (typeof window.showToast === "function") {
      window.showToast("Thank you! Your feedback has been submitted.", "success");
    }

    // Refresh admin dashboard if visible
    renderAdminDashboard();
  };

  // ─── Admin feedback dashboard ─────────────────────────────────────────────────
  /**
   * Render the full admin feedback review panel:
   * - Event dropdown selector
   * - Summary scorecards (average, count, distribution)
   * - Individual review cards
   */
  const renderAdminDashboard = () => {
    if (!feedbackListContainer) return;

    const allFeedback = StorageService.getFeedback();
    const allEvents = StorageService.getEvents();

    // Empty state
    if (allFeedback.length === 0) {
      if (feedbackEmpty) feedbackEmpty.hidden = false;
      feedbackListContainer.innerHTML = "";
      return;
    }
    if (feedbackEmpty) feedbackEmpty.hidden = true;

    // Collect events that have feedback
    const eventIdsWithFeedback = [...new Set(allFeedback.map((f) => f.eventId))];

    // Determine which event is currently selected (persist across re‑renders)
    const existingSelector = feedbackListContainer.querySelector("#feedback-event-selector");
    let selectedEventId = existingSelector ? existingSelector.value : "";
    // Default to first event if nothing selected or selection no longer valid
    if (!selectedEventId || !eventIdsWithFeedback.includes(selectedEventId)) {
      selectedEventId = eventIdsWithFeedback[0] || "";
    }

    // Build container HTML
    feedbackListContainer.innerHTML = "";

    // ── Event selector dropdown ──
    const selectorWrap = document.createElement("div");
    selectorWrap.className = "feedback-selector-wrap";

    const selectorLabel = document.createElement("label");
    selectorLabel.className = "form-label";
    selectorLabel.setAttribute("for", "feedback-event-selector");
    selectorLabel.textContent = "Select Event";

    const selector = document.createElement("select");
    selector.id = "feedback-event-selector";
    selector.className = "form-select";
    selector.setAttribute("aria-label", "Filter feedback by event");

    eventIdsWithFeedback.forEach((eid) => {
      const event = allEvents.find((ev) => ev.id === eid);
      const opt = document.createElement("option");
      opt.value = eid;
      opt.textContent = event ? `${event.title} (${eid})` : eid;
      if (eid === selectedEventId) opt.selected = true;
      selector.appendChild(opt);
    });

    selectorWrap.appendChild(selectorLabel);
    selectorWrap.appendChild(selector);
    feedbackListContainer.appendChild(selectorWrap);

    // Listen for selector changes
    selector.addEventListener("change", () => renderAdminDashboard());

    // ── Compute stats for selected event ──
    const eventFeedback = allFeedback.filter((f) => f.eventId === selectedEventId);
    const totalReviews = eventFeedback.length;
    const avgRating =
      totalReviews > 0
        ? (eventFeedback.reduce((sum, f) => sum + f.rating, 0) / totalReviews).toFixed(1)
        : "—";

    // Rating distribution (1–5)
    const distribution = [0, 0, 0, 0, 0]; // index 0 = 1‑star, index 4 = 5‑star
    eventFeedback.forEach((f) => {
      if (f.rating >= 1 && f.rating <= 5) {
        distribution[f.rating - 1]++;
      }
    });

    // ── Summary scorecards ──
    const summarySection = document.createElement("div");
    summarySection.className = "feedback-summary";

    summarySection.innerHTML =
      `<div class="stats-grid stats-grid--inline">` +
        `<div class="stat-card">` +
          `<span class="stat-value">${avgRating}</span>` +
          `<span class="stat-label">Average Rating</span>` +
        `</div>` +
        `<div class="stat-card">` +
          `<span class="stat-value">${totalReviews}</span>` +
          `<span class="stat-label">Total Reviews</span>` +
        `</div>` +
      `</div>` +
      `<div class="rating-distribution">` +
        `<h3>Rating Breakdown</h3>` +
        buildDistributionBars(distribution, totalReviews) +
      `</div>`;

    feedbackListContainer.appendChild(summarySection);

    // ── Individual review cards ──
    const reviewsHeading = document.createElement("h3");
    reviewsHeading.className = "feedback-reviews-heading";
    reviewsHeading.textContent = "Student Reviews";
    feedbackListContainer.appendChild(reviewsHeading);

    if (eventFeedback.length === 0) {
      const noReviews = document.createElement("p");
      noReviews.className = "feedback-no-reviews";
      noReviews.textContent = "No reviews submitted for this event yet.";
      feedbackListContainer.appendChild(noReviews);
      return;
    }

    // Sort newest first
    const sorted = [...eventFeedback].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    sorted.forEach((fb) => {
      feedbackListContainer.appendChild(buildReviewCard(fb));
    });
  };

  /**
   * Build the horizontal bar chart for rating distribution.
   * @param {number[]} distribution - Array[5] where index 0 = 1‑star count.
   * @param {number} total
   * @returns {string} HTML string
   */
  const buildDistributionBars = (distribution, total) => {
    let html = '<div class="distribution-bars">';
    for (let star = 5; star >= 1; star--) {
      const count = distribution[star - 1];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      html +=
        `<div class="distribution-row">` +
          `<span class="distribution-label">${star} ★</span>` +
          `<div class="distribution-bar-track">` +
            `<div class="distribution-bar-fill" style="width: ${pct}%"></div>` +
          `</div>` +
          `<span class="distribution-count">${count}</span>` +
        `</div>`;
    }
    html += "</div>";
    return html;
  };

  /**
   * Build a single review card element.
   * @param {object} fb - Feedback record.
   * @returns {HTMLElement}
   */
  const buildReviewCard = (fb) => {
    const card = document.createElement("div");
    card.className = "review-card card";

    // Look up student name from registrations
    const regs = StorageService.getRegistrations();
    const reg = regs.find((r) => r.studentId === fb.studentId && r.eventId === fb.eventId);
    const studentName = reg ? reg.name : fb.studentId;

    // Build star display
    let starsHtml = '<span class="review-stars">';
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= fb.rating
        ? '<span class="star-filled">★</span>'
        : '<span class="star-empty">☆</span>';
    }
    starsHtml += "</span>";

    card.innerHTML =
      `<div class="review-card-header">` +
        `<span class="review-student">${escapeHtml(studentName)}</span>` +
        starsHtml +
      `</div>` +
      `<p class="review-date">${formatDate(fb.timestamp)}</p>` +
      `${fb.comment
        ? `<p class="review-comment">${escapeHtml(fb.comment)}</p>`
        : '<p class="review-comment review-comment--empty">No written comments.</p>'
      }`;

    return card;
  };

  // ─── Event binding ────────────────────────────────────────────────────────────
  const bindEvents = () => {
    // Form submission
    if (feedbackForm) {
      feedbackForm.addEventListener("submit", handleFeedbackSubmit);
    }

    // Cancel button
    if (btnCancelFeedback) {
      btnCancelFeedback.addEventListener("click", closeFeedbackDialog);
    }

    // Dialog close (× button in header)
    if (feedbackDialog) {
      const closeBtn = feedbackDialog.querySelector(".dialog-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", closeFeedbackDialog);
      }
      // Also close on backdrop click (dialog native)
      feedbackDialog.addEventListener("click", (e) => {
        if (e.target === feedbackDialog) closeFeedbackDialog();
      });
    }

    // Star radio change (fallback for keyboard / screen reader usage)
    if (starRatingContainer) {
      starRatingContainer.addEventListener("change", (e) => {
        if (e.target.name === "rating") {
          selectedRating = parseInt(e.target.value, 10);
          highlightStars(selectedRating);
          updateStarHint(selectedRating);
          updateSubmitButton();
        }
      });
    }

    // Re‑render admin dashboard when the feedback tab is activated
    document.querySelectorAll('.nav-link[data-tab="feedback"]').forEach((link) => {
      link.addEventListener("click", () => renderAdminDashboard());
    });
  };

  // ─── Public API ───────────────────────────────────────────────────────────────
  const init = () => {
    initStarWidget();
    bindEvents();
  };

  return {
    init,
    openFeedbackDialog,
    renderAdminDashboard,
  };
})();

export default FeedbackModule;
