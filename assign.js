/* ---------------------------------------------------------------------------
 * assign.js — the shared "assign / reassign surveyor" sheet.
 *
 * Both the Unassigned list page (page.js) and the in-progress map page (map.js)
 * use the same <calcite-sheet id="assign-sheet"> markup and post to the same
 * endpoint (config.assignmentEndpoint). Usage:
 *
 *     import { initAssignSheet, openAssignSheet } from "./assign.js";
 *     await initAssignSheet({ onAssigned: (target) => { ... } });
 *     openAssignSheet(projectAttributes);   // on a row / button click
 *
 * The optional `onAssigned` callback fires after a successful assignment (e.g.
 * to refresh a table, or re-render the map info panel).
 * ------------------------------------------------------------------------- */

import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let surveyorOptions = []; // [{ code, name }]
let assignTarget = null; // { oid, name, ref }
let onAssignedCb = null;

/* ------------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------------ */

/** Wire the sheet and load the surveyor + priority options. Call once. */
export async function initAssignSheet({ onAssigned } = {}) {
  onAssignedCb = onAssigned || null;
  wireAssignSheet();
  await loadSurveyors();
}

/** Load the surveyor list from the Facilities coded-value domain and fill the
 * Surveyor + Priority selects. */
async function loadSurveyors() {
  const layer = new FeatureLayer({ url: CFG.facilitiesLayerUrl });
  await layer.load();
  const field = layer.fields.find((f) => f.name === CFG.surveyorField);
  const coded = (field && field.domain && field.domain.codedValues) || [];
  surveyorOptions = coded.map((c) => ({ code: c.code, name: c.name }));

  const surveyor = $("assign-surveyor");
  surveyor.innerHTML = "";
  surveyor.appendChild(makeOption("", "Select a surveyor…"));
  surveyorOptions.forEach((s) => surveyor.appendChild(makeOption(s.code, s.name)));

  const priority = $("assign-priority");
  priority.innerHTML = "";
  CFG.priorityOptions.forEach((p) => priority.appendChild(makeOption(p, p)));
  priority.value = defaultPriority();
}

function makeOption(value, text) {
  const opt = document.createElement("calcite-option");
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function defaultPriority() {
  const list = CFG.priorityOptions;
  return list[Math.floor(list.length / 2)] || list[0] || "";
}

function surveyorName(code) {
  const s = surveyorOptions.find((x) => x.code === code);
  return s ? s.name : code;
}

/* ------------------------------------------------------------------------ *
 * Open / wire / submit
 * ------------------------------------------------------------------------ */

/** Open the assignment sheet for a project, with a clean form. */
export function openAssignSheet(attrs) {
  const oid = attrs.objectid ?? attrs.OBJECTID;
  assignTarget = {
    oid,
    name: attrs.project_name || "Project #" + oid,
    ref: attrs.project_reference_number || ""
  };
  $("assign-subheading").textContent = assignTarget.name;
  $("assign-surveyor").value = "";
  $("assign-priority").value = defaultPriority();
  $("assign-due").value = "";
  $("assign-desc").value = "";
  $("assign-sheet").open = true;
}

/** Wire the sheet's close / cancel / submit interactions once. */
function wireAssignSheet() {
  const close = () => ($("assign-sheet").open = false);
  $("assign-close").addEventListener("click", close);
  $("assign-cancel").addEventListener("click", close);
  $("assign-submit").addEventListener("click", submitAssignment);
}

/** Validate (surveyor required) and submit the assignment to the server, which
 * updates the Facilities task fields + the project's surveyed_by. */
async function submitAssignment() {
  const surveyorCode = $("assign-surveyor").value;
  if (!surveyorCode) {
    alertUser("Surveyor required", "Please select a surveyor to assign.", "warning");
    if ($("assign-surveyor").setFocus) $("assign-surveyor").setFocus();
    return;
  }
  if (!assignTarget || !assignTarget.ref) {
    alertUser("Missing reference", "This project has no reference number to match.", "danger");
    return;
  }

  const payload = {
    reference_number: assignTarget.ref,
    surveyor: surveyorCode,
    surveyor_name: surveyorName(surveyorCode),
    priority: $("assign-priority").value || "",
    due_date: $("assign-due").value || "",
    description: $("assign-desc").value || ""
  };

  const submit = $("assign-submit");
  submit.loading = true;
  try {
    const res = await fetch(CFG.assignmentEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json.error || `Request failed (${res.status}).`);
    }

    $("assign-sheet").open = false;
    alertUser(
      "Surveyor assigned",
      `${assignTarget.name} assigned to ${surveyorName(surveyorCode)}.`,
      "success"
    );
    if (onAssignedCb) onAssignedCb(assignTarget);
  } catch (err) {
    alertUser("Assignment failed", err.message, "danger");
  } finally {
    submit.loading = false;
  }
}

/* ------------------------------------------------------------------------ *
 * Shared alert (both pages include <calcite-alert id="app-alert">)
 * ------------------------------------------------------------------------ */

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}
