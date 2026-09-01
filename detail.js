/* ---------------------------------------------------------------------------
 * detail.js — Project detail screen (ES module).
 *
 * Reads ?oid=<objectid>, queries that project from the secured Projects table,
 * and renders the header + collapsible panels from config.detailSections
 * (Project Details, Survey Details). Opened when a table row is clicked.
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import { ensureSignedIn } from "./oauth.js";

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

const STATUS_KIND = {
  completed: "success",
  ongoing: "brand",
  planning: "warning",
  "on hold": "warning",
  stalled: "warning",
  cancelled: "danger"
};

/* field name -> esri field type, so we can format date fields. */
const fieldTypes = {};

function getOid() {
  const oid = new URLSearchParams(window.location.search).get("oid");
  return oid ? Number(oid) : null;
}

async function fetchProject(oid) {
  const layer = new FeatureLayer({
    url: CFG.projectsLayerUrl,
    outFields: ["*"]
  });
  await layer.load();
  layer.fields.forEach((f) => (fieldTypes[f.name] = f.type));

  const result = await layer.queryFeatures({
    objectIds: [oid],
    outFields: ["*"],
    returnGeometry: false
  });

  const feature = (result.features || [])[0];
  if (!feature) throw new Error("Project " + oid + " was not found.");
  return feature.attributes;
}

function renderHeader(attrs) {
  $("project-title").textContent = attrs.project_name || "Untitled project";
  document.title =
    (attrs.project_name || "Project") + " · Survey Assignment & Approval";

  const ref = attrs.project_reference_number;
  $("project-ref").textContent = ref ? "Ref: " + ref : "";

  const status = attrs.implementation_status;
  if (status) {
    const chip = $("status-chip");
    chip.textContent = status;
    chip.kind = STATUS_KIND[status.toLowerCase()] || "neutral";
    chip.hidden = false;
  }
}

/** Format one attribute: dates → readable, empties → em dash. */
function formatValue(value, field) {
  if (value == null || value === "") return "—";
  if (["date", "date-only", "timestamp-offset"].includes(fieldTypes[field])) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  return String(value);
}

/** Build one collapsible panel per config.detailSections section. */
function renderOverview(attrs) {
  const container = $("overview-sections");
  container.innerHTML = "";

  CFG.detailSections.forEach((section, idx) => {
    const block = document.createElement("calcite-block");
    block.setAttribute("heading", section.title);
    block.setAttribute("collapsible", "");
    if (idx === 0) block.setAttribute("open", "");
    if (section.icon) block.setAttribute("icon-start", section.icon);

    const dl = document.createElement("dl");
    dl.className = "detail-list";
    section.fields.forEach((f) => {
      const dt = document.createElement("dt");
      dt.textContent = f.label;
      const dd = document.createElement("dd");
      dd.textContent = formatValue(attrs[f.field], f.field);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });

    block.appendChild(dl);
    container.appendChild(block);
  });
}

function alertUser(title, message, kind) {
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  const el = $("app-alert");
  el.kind = kind;
  el.open = true;
}

async function boot() {
  $("back-btn").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  try {
    const oid = getOid();
    if (oid == null) throw new Error("No project id in the URL (?oid=…).");

    esriConfig.portalUrl = CFG.portalUrl;
    await ensureSignedIn();

    const attrs = await fetchProject(oid);
    renderHeader(attrs);
    renderOverview(attrs);
  } catch (err) {
    $("project-title").textContent = "Could not load project";
    alertUser("Error", err.message, "danger");
  } finally {
    $("boot-scrim").hidden = true;
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
