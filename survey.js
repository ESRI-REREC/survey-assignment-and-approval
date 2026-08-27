/* ---------------------------------------------------------------------------
 * survey.js — Survey Assignment & Approval (ES module).
 *
 * Four workflow tabs (Unassigned / In progress / Completed / All), each an
 * <arcgis-feature-table> over the secured Projects table filtered by that
 * tab's base where-clause (config.surveyTabs). Column ⋯ menus add per-column
 * filters (AND-ed on top of the base clause) surfaced as removable chips with
 * a Clear all button. Clicking a row opens detail.html?oid=<objectid>.
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import esriId from "https://js.arcgis.com/4.31/@arcgis/core/identity/IdentityManager.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

/* One controller per tab. Built up-front; the layer/table is initialised
 * lazily the first time its tab is shown. */
const controllers = {}; // tabId -> { tab, barEl, chipsEl, tableEl, layer, activeFilters, ready }

/* The column being edited in the shared filter modal. */
let filterTarget = null; // { tabId, field }

/* ------------------------------------------------------------------------ *
 * Table construction
 * ------------------------------------------------------------------------ */

/** Build the per-tab pane DOM (filter bar + table) inside its calcite-tab. */
function buildPane(tab) {
  const pane = $("pane-" + tab.id);

  const panel = document.createElement("div");
  panel.className = "tab-panel";

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
  clearAll.addEventListener("click", () => clearAllFilters(tab.id));

  bar.append(label, chips, clearAll);

  // Table
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("arcgis-feature-table");
  table.setAttribute("attachments-enabled", "");
  table.setAttribute("hide-selection-column", "");
  table.setAttribute("hide-header", "");
  wrap.appendChild(table);

  panel.append(bar, wrap);
  pane.appendChild(panel);

  controllers[tab.id] = {
    tab,
    barEl: bar,
    chipsEl: chips,
    tableEl: table,
    layer: null,
    activeFilters: {},
    ready: false
  };
}

/** Column templates: each header ⋯ menu gets Filter… / Clear filter. */
function buildTableTemplate(tabId) {
  return {
    columnTemplates: CFG.projectColumns.map((c) => ({
      type: "field",
      fieldName: c.field,
      label: c.label,
      width: c.width,
      autoWidth: false,
      menuConfig: {
        items: [
          {
            label: "Filter…",
            iconClass: "esri-icon-filter",
            clickFunction: () => promptFilter(tabId, c.field, c.label)
          },
          {
            label: "Clear filter",
            iconClass: "esri-icon-close",
            clickFunction: () => applyFilter(tabId, c.field, null)
          }
        ]
      }
    }))
  };
}

/** Initialise a tab's FeatureLayer + table the first time its tab is shown. */
async function initTab(tabId) {
  const ctrl = controllers[tabId];
  if (ctrl.ready) return;
  ctrl.ready = true;

  ctrl.layer = new FeatureLayer({
    url: CFG.projectsLayerUrl,
    outFields: ["*"],
    displayField: "name",
    definitionExpression: ctrl.tab.where
  });
  await ctrl.layer.load();

  ctrl.tableEl.tableTemplate = buildTableTemplate(tabId);
  ctrl.tableEl.layer = ctrl.layer;

  ctrl.tableEl.addEventListener("arcgisCellClick", (event) => {
    const oid = objectIdFromCellEvent(event);
    if (oid != null) goToDetails(oid);
  });
}

/* ------------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------------ */

/** Open the shared filter modal for a column in a given tab. */
function promptFilter(tabId, field, label) {
  filterTarget = { tabId, field };
  const input = $("filter-input");
  $("filter-dialog-heading").textContent = `Filter — ${label}`;
  $("filter-dialog-label").textContent = `"${label}" contains`;
  input.value = controllers[tabId].activeFilters[field] || "";
  $("filter-dialog").open = true;
  requestAnimationFrame(() => input.setFocus && input.setFocus());
}

/** Wire the shared modal's Apply / Cancel / Enter once. */
function wireFilterDialog() {
  const dialog = $("filter-dialog");
  const input = $("filter-input");

  const apply = () => {
    if (filterTarget) {
      applyFilter(filterTarget.tabId, filterTarget.field, input.value.trim() || null);
    }
    dialog.open = false;
  };

  $("filter-apply").addEventListener("click", apply);
  $("filter-cancel").addEventListener("click", () => (dialog.open = false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
  });
}

/** Set or clear one column filter for a tab. */
function applyFilter(tabId, field, value) {
  const ctrl = controllers[tabId];
  if (value) ctrl.activeFilters[field] = value;
  else delete ctrl.activeFilters[field];
  syncFilters(tabId);
}

/** Clear every column filter for a tab. */
function clearAllFilters(tabId) {
  const ctrl = controllers[tabId];
  Object.keys(ctrl.activeFilters).forEach((f) => delete ctrl.activeFilters[f]);
  syncFilters(tabId);
}

/** Rebuild a tab's definitionExpression (base AND filters) + its chip bar. */
function syncFilters(tabId) {
  const ctrl = controllers[tabId];
  const base = ctrl.tab.where;

  const clauses = Object.entries(ctrl.activeFilters).map(
    ([f, v]) => `UPPER(${f}) LIKE UPPER('%${v.replace(/'/g, "''")}%')`
  );
  const filterExpr = clauses.join(" AND ");

  let where = base;
  if (filterExpr) {
    where = base && base !== "1=1" ? `(${base}) AND (${filterExpr})` : filterExpr;
  }
  ctrl.layer.definitionExpression = where;

  renderChips(tabId);
}

/** Render one removable chip per active filter above a tab's table. */
function renderChips(tabId) {
  const ctrl = controllers[tabId];
  ctrl.chipsEl.innerHTML = "";

  const entries = Object.entries(ctrl.activeFilters);
  ctrl.barEl.hidden = entries.length === 0;

  entries.forEach(([field, value]) => {
    const col = CFG.projectColumns.find((c) => c.field === field);
    const chip = document.createElement("calcite-chip");
    chip.setAttribute("closable", "");
    chip.setAttribute("scale", "s");
    chip.setAttribute("appearance", "outline-fill");
    chip.setAttribute("kind", "brand");
    chip.textContent = `${col ? col.label : field}: ${value}`;
    chip.addEventListener("calciteChipClose", () => applyFilter(tabId, field, null));
    ctrl.chipsEl.appendChild(chip);
  });
}

/* ------------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------------ */

function objectIdFromCellEvent(event) {
  const d = event.detail || {};
  const feature =
    d.feature ||
    d.graphic ||
    (d.item && d.item.feature) ||
    (d.target && d.target.feature);

  if (feature && feature.attributes) {
    const a = feature.attributes;
    return a.objectid ?? a.OBJECTID ?? a.ObjectId ?? null;
  }
  if (d.objectId != null) return d.objectId;
  return null;
}

function goToDetails(oid) {
  window.location.href = "detail.html?oid=" + encodeURIComponent(oid);
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
 * Boot
 * ------------------------------------------------------------------------ */

async function boot() {
  try {
    esriConfig.portalUrl = CFG.portalUrl;
    Auth.setIdentityManager(esriId);
    await Auth.mint();

    await customElements.whenDefined("arcgis-feature-table");

    // Build every pane, wire the shared modal.
    CFG.surveyTabs.forEach(buildPane);
    wireFilterDialog();

    // Lazily init a tab's table the first time its title is clicked. A table
    // in a hidden tab has no size, so we defer to the moment it is shown.
    document.querySelectorAll("calcite-tab-title").forEach((title) => {
      title.addEventListener("click", () => {
        const id = title.getAttribute("tab");
        if (id && controllers[id]) requestAnimationFrame(() => initTab(id));
      });
    });

    // The first tab is selected on load — init it now.
    await initTab(CFG.surveyTabs[0].id);
  } catch (err) {
    alertUser("Could not load projects", err.message, "danger");
  } finally {
    $("boot-scrim").hidden = true;
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
