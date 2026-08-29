/* ---------------------------------------------------------------------------
 * approve.js — the "approve survey" sheet, used on the Completed map page.
 *
 * Mirrors assign.js: the map page (map.js) opens this sheet from the Approve
 * button and posts to config.approvalEndpoint. The server sets the Facilities
 * esritask_status to Completed and records survey_approved_by +
 * survey_approved_date on the project. Usage:
 *
 *     import { initApproveSheet, openApproveSheet } from "./approve.js";
 *     await initApproveSheet({ onApproved: (target) => { ... } });
 *     openApproveSheet(projectAttributes);   // on the Approve button click
 * ------------------------------------------------------------------------- */

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let approveTarget = null; // { oid, name, ref }
let onApprovedCb = null;

/** Wire the sheet's close / cancel / submit interactions. Call once. */
export function initApproveSheet({ onApproved } = {}) {
  onApprovedCb = onApproved || null;
  const close = () => ($("approve-sheet").open = false);
  $("approve-close").addEventListener("click", close);
  $("approve-cancel").addEventListener("click", close);
  $("approve-submit").addEventListener("click", submitApproval);
}

/** Open the approval sheet for a project, with a clean form (date = today). */
export function openApproveSheet(attrs) {
  const oid = attrs.objectid ?? attrs.OBJECTID;
  approveTarget = {
    oid,
    name: attrs.project_name || "Project #" + oid,
    ref: attrs.project_reference_number || ""
  };
  $("approve-subheading").textContent = approveTarget.name;
  $("approve-by").value = "";
  $("approve-date").value = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  $("approve-sheet").open = true;
}

/** Validate (approver required) and submit the approval to the server. */
async function submitApproval() {
  const approvedBy = ($("approve-by").value || "").trim();
  if (!approvedBy) {
    alertUser("Approver required", "Enter the name of the approving officer.", "warning");
    if ($("approve-by").setFocus) $("approve-by").setFocus();
    return;
  }
  if (!approveTarget || !approveTarget.ref) {
    alertUser("Missing reference", "This project has no reference number to match.", "danger");
    return;
  }

  const payload = {
    reference_number: approveTarget.ref,
    approved_by: approvedBy,
    approved_date: $("approve-date").value || ""
  };

  const submit = $("approve-submit");
  submit.loading = true;
  try {
    const res = await fetch(CFG.approvalEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json.error || `Request failed (${res.status}).`);
    }

    $("approve-sheet").open = false;
    alertUser("Survey approved", `${approveTarget.name} marked as approved.`, "success");
    if (onApprovedCb) onApprovedCb(approveTarget);
  } catch (err) {
    alertUser("Approval failed", err.message, "danger");
  } finally {
    submit.loading = false;
  }
}

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}
