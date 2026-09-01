/* ---------------------------------------------------------------------------
 * approve.js — direct "approve survey" action (Completed map page).
 *
 * No sheet: clicking Approve immediately records the signed-in user
 * (survey_approved_by) and the current time (survey_approved_date, set by the
 * server) via config.approvalEndpoint. The server also sets the Facilities
 * esritask_status to Completed. Usage:
 *
 *     import { approveSurvey } from "./approve.js";
 *     approveSurvey(projectAttributes, { onApproved: () => { ... } });
 * ------------------------------------------------------------------------- */

import { getUsername } from "./oauth.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

/** Approve the survey for `attrs` (the joined/project row). Records the
 * signed-in user + now; calls onApproved on success. */
export async function approveSurvey(attrs, { onApproved } = {}) {
  const ref = attrs.project_reference_number || "";
  const approvedBy = getUsername();
  if (!ref) {
    return alertUser("Missing reference", "This project has no reference number to match.", "danger");
  }
  if (!approvedBy) {
    return alertUser("Not signed in", "Could not determine the signed-in user.", "danger");
  }

  const btn = $("approve-btn");
  if (btn) btn.loading = true;
  try {
    const res = await fetch(CFG.approvalEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // approved_date is omitted — the server records the current time.
      body: JSON.stringify({ reference_number: ref, approved_by: approvedBy })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json.error || `Request failed (${res.status}).`);
    }
    alertUser(
      "Survey approved",
      `${attrs.project_name || "Project"} approved by ${approvedBy}.`,
      "success"
    );
    if (onApproved) onApproved();
  } catch (err) {
    alertUser("Approval failed", err.message, "danger");
  } finally {
    if (btn) btn.loading = false;
  }
}

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}
