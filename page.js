/* ---------------------------------------------------------------------------
 * page.js — shared engine for the Survey Assignment & Approval pages.
 *
 * Each workflow stage is its own standalone page: unassigned.html +
 * unassigned.js, in-progress.html + in-progress.js, completed.html +
 * completed.js. Every one of those tiny JS files does the same thing:
 *
 *     import { initPage } from "./page.js";
 *     initPage("unassigned");
 *
 * This module holds the implementation they share: it renders that page's
 * <arcgis-feature-table> over the secured Projects table filtered by the page's
 * base where-clause (config.surveyPages), adds per-column filters surfaced as
 * removable chips, and — on the Unassigned page only — wires the assignment
 * sheet. Clicking a row opens the assignment sheet (Unassigned) or
 * detail.html?oid=<objectid> (the other pages).
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import esriId from "https://js.arcgis.com/4.31/@arcgis/core/identity/IdentityManager.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

/* This page renders one project list. `ctrl` holds its layer/table/filters. */
let pageId = null;
let ctrl = null; // { page, barEl, chipsEl, tableEl, layer, activeFilters }

/* The column being edited in the shared filter modal. */
let filterField = null;

/* Surveyor coded-value options (Unassigned page only) + the row being
 * assigned in the sheet. */
let surveyorOptions = []; // [{ code, name }]
let assignTarget = null; // { oid, name, ref }

/* ------------------------------------------------------------------------ *
 * Table construction
 * ------------------------------------------------------------------------ */

/** Look up this page's config from config.surveyPages. */
function pageConfig(id) {
  const page = CFG.surveyPages.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown page "${id}".`);
  return page;
}

/** Build the pane DOM (filter bar + table) inside this page's pane host. */
function buildPane(page) {
  const host = $("pane-" + page.id);

  const body = document.createElement("div");
  body.className = "pane-body";

  // Applied-filters bar
  const bar = document.createElement("div");
  bar.className = "active-filters";
  bar.hidden = true;

  const label = document.createElement("span");
  label.className = "af-label";
  label.textContent = "Filters:";

  const chips = document.createElement("div");
  chips.className = "filter-chips";

  const clearAll = document.createElement("calcite-button");
  clearAll.className = "clear-all-filters";
  clearAll.setAttribute("appearance", "transparent");
  clearAll.setAttribute("kind", "danger");
  clearAll.setAttribute("scale", "s");
  clearAll.setAttribute("icon-start", "x-circle");
  clearAll.textContent = "Clear all";
  clearAll.addEventListener("click", clearAllFilters);

  bar.append(label, chips, clearAll);

  // Table
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("arcgis-feature-table");
  table.setAttribute("attachments-enabled", "");
  table.setAttribute("hide-selection-column", "");
  table.setAttribute("hide-header", "");
  wrap.appendChild(table);

  body.append(bar, wrap);
  host.appendChild(body);

  ctrl = { page, barEl: bar, chipsEl: chips, tableEl: table, layer: null, activeFilters: {} };
}

/** Columns for this page: its own `columns` override, or the shared default. */
function columnsFor() {
  return ctrl.page.columns || CFG.projectColumns;
}

/** Column templates. Text-filterable columns get Filter… / Clear filter in
 * their ⋯ menu; others (e.g. date fields) keep just the built-in Sort. */
function buildTableTemplate() {
  return {
    columnTemplates: columnsFor().map((c) => {
      const template = {
        type: "field",
        fieldName: c.field,
        label: c.label,
        width: c.width,
        autoWidth: false
      };
      if (c.dateFormat) template.format = { dateFormat: c.dateFormat };
      if (c.filterable !== false) {
        template.menuConfig = {
          items: [
            {
              label: "Filter…",
              iconClass: "esri-icon-filter",
              clickFunction: () => promptFilter(c.field, c.label)
            },
            {
              label: "Clear filter",
              iconClass: "esri-icon-close",
              clickFunction: () => applyFilter(c.field, null)
            }
          ]
        };
      }
      return template;
    })
  };
}

/** Initialise this page's FeatureLayer + table. */
async function initTable() {
  ctrl.layer = new FeatureLayer({
    url: CFG.projectsLayerUrl,
    outFields: ["*"],
    displayField: "name",
    definitionExpression: ctrl.page.where
  });
  await ctrl.layer.load();

  ctrl.tableEl.tableTemplate = buildTableTemplate();
  ctrl.tableEl.layer = ctrl.layer;

  ctrl.tableEl.addEventListener("arcgisCellClick", (event) => {
    const feature = featureFromCellEvent(event);
    const oid = objectIdFromCellEvent(event);
    if (oid == null) return;
    // Unassigned rows open the assignment sheet; other pages open the detail page.
    if (pageId === "unassigned") {
      openAssignSheet((feature && feature.attributes) || { objectid: oid });
    } else {
      goToDetails(oid);
    }
  });
}

/* ------------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------------ */

/** Open the shared filter modal for a column. */
function promptFilter(field, label) {
  filterField = field;
  const input = $("filter-input");
  $("filter-dialog-heading").textContent = `Filter — ${label}`;
  $("filter-dialog-label").textContent = `"${label}" contains`;
  input.value = ctrl.activeFilters[field] || "";
  $("filter-dialog").open = true;
  requestAnimationFrame(() => input.setFocus && input.setFocus());
}

/** Wire the shared modal's Apply / Cancel / Enter once. */
function wireFilterDialog() {
  const dialog = $("filter-dialog");
  const input = $("filter-input");

  const apply = () => {
    if (filterField) applyFilter(filterField, input.value.trim() || null);
    dialog.open = false;
  };

  $("filter-apply").addEventListener("click", apply);
  $("filter-cancel").addEventListener("click", () => (dialog.open = false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
  });
}

/** Set or clear one column filter. */
function applyFilter(field, value) {
  if (value) ctrl.activeFilters[field] = value;
  else delete ctrl.activeFilters[field];
  syncFilters();
}

/** Clear every column filter. */
function clearAllFilters() {
  Object.keys(ctrl.activeFilters).forEach((f) => delete ctrl.activeFilters[f]);
  syncFilters();
}

/** Rebuild the definitionExpression (base AND filters) + the chip bar. */
function syncFilters() {
  const base = ctrl.page.where;

  const clauses = Object.entries(ctrl.activeFilters).map(
    ([f, v]) => `UPPER(${f}) LIKE UPPER('%${v.replace(/'/g, "''")}%')`
  );
  const filterExpr = clauses.join(" AND ");

  ctrl.layer.definitionExpression = filterExpr
    ? `(${base}) AND (${filterExpr})`
    : base;

  renderChips();
}

/** Render one removable chip per active filter above the table. */
function renderChips() {
  ctrl.chipsEl.innerHTML = "";

  const entries = Object.entries(ctrl.activeFilters);
  ctrl.barEl.hidden = entries.length === 0;

  entries.forEach(([field, value]) => {
    const col = columnsFor().find((c) => c.field === field);
    const chip = document.createElement("calcite-chip");
    chip.setAttribute("closable", "");
    chip.setAttribute("scale", "s");
    chip.setAttribute("appearance", "outline-fill");
    chip.setAttribute("kind", "brand");
    chip.textContent = `${col ? col.label : field}: ${value}`;
    chip.addEventListener("calciteChipClose", () => applyFilter(field, null));
    ctrl.chipsEl.appendChild(chip);
  });
}

/* ------------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------------ */

function featureFromCellEvent(event) {
  const d = event.detail || {};
  return (
    d.feature ||
    d.graphic ||
    (d.item && d.item.feature) ||
    (d.target && d.target.feature) ||
    null
  );
}

function objectIdFromCellEvent(event) {
  const feature = featureFromCellEvent(event);
  if (feature && feature.attributes) {
    const a = feature.attributes;
    return a.objectid ?? a.OBJECTID ?? a.ObjectId ?? null;
  }
  const d = event.detail || {};
  if (d.objectId != null) return d.objectId;
  return null;
}

function goToDetails(oid) {
  window.location.href = "detail.html?oid=" + encodeURIComponent(oid);
}

/* ------------------------------------------------------------------------ *
 * Assignment sheet (Unassigned page only)
 * ------------------------------------------------------------------------ */

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

/** Open the assignment sheet for a project, with a clean form. */
function openAssignSheet(attrs) {
  const oid = attrs.objectid ?? attrs.OBJECTID;
  assignTarget = {
    oid,
    name: attrs.name || "Project #" + oid,
    ref: attrs.reference_number || ""
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
      "Survey assigned",
      `${assignTarget.name} assigned to ${surveyorName(surveyorCode)}.`,
      "success"
    );
    // The project leaves Unassigned once surveyed_by is set — re-query the table.
    if (ctrl.layer) ctrl.layer.refresh();
  } catch (err) {
    alertUser("Assignment failed", err.message, "danger");
  } finally {
    submit.loading = false;
  }
}

/* ------------------------------------------------------------------------ *
 * UI plumbing
 * ------------------------------------------------------------------------ */

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}

/* ------------------------------------------------------------------------ *
 * Boot — the single entry point each page calls.
 * ------------------------------------------------------------------------ */

async function boot() {
  try {
    esriConfig.portalUrl = CFG.portalUrl;
    Auth.setIdentityManager(esriId);
    await Auth.mint();

    await customElements.whenDefined("arcgis-feature-table");

    buildPane(pageConfig(pageId));
    wireFilterDialog();

    // The assignment sheet only exists on the Unassigned page.
    if ($("assign-sheet")) {
      wireAssignSheet();
      await loadSurveyors();
    }

    await initTable();
  } catch (err) {
    alertUser("Could not load projects", err.message, "danger");
  } finally {
    $("boot-scrim").hidden = true;
  }
}

/** Entry point: render the given survey page's project list as this page's content. */
export function initPage(id) {
  pageId = id;
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
