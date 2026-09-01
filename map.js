/* ---------------------------------------------------------------------------
 * map.js — in-progress survey map view (ES module).
 *
 * Opened from an In progress row (map.html?oid=<objectid>) or a Completed row
 * (…&mode=approve). Shows a full-page map with:
 *   • a closable left panel of survey data (config.detailSections) + either a
 *     Reassign button (in progress → assign.js) or an Approve button
 *     (completed → approve.js), depending on ?mode;
 *   • a basemap gallery + every Survey_and_Design_Assets sublayer, toggled via
 *     the layer list;
 *   • the view centred on the Facilities point whose reference_number matches
 *     the project's.
 * ------------------------------------------------------------------------- */

import esriConfig from "https://js.arcgis.com/4.31/@arcgis/core/config.js";
import FeatureLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/FeatureLayer.js";
import GroupLayer from "https://js.arcgis.com/4.31/@arcgis/core/layers/GroupLayer.js";
import Graphic from "https://js.arcgis.com/4.31/@arcgis/core/Graphic.js";
import { ensureSignedIn, getServerToken } from "./oauth.js";
import { initAssignSheet, openAssignSheet } from "./assign.js";
import { initApproveSheet, openApproveSheet } from "./approve.js";

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

/* Latest project attributes (kept fresh so Reassign always sends current data). */
let attrs = null;

/* ------------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------------ */

function getOid() {
  const oid = new URLSearchParams(window.location.search).get("oid");
  return oid ? Number(oid) : null;
}

/** "approve" (from Completed) or "reassign" (from In progress; the default). */
function getMode() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "approve" ? "approve" : "reassign";
}

async function fetchProject(oid) {
  const layer = new FeatureLayer({ url: CFG.projectsLayerUrl, outFields: ["*"] });
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

/* ------------------------------------------------------------------------ *
 * Info panel
 * ------------------------------------------------------------------------ */

function renderInfo() {
  $("info-title").textContent = attrs.project_name || "Untitled project";
  document.title = (attrs.project_name || "Project") + " · Survey Map";

  const ref = attrs.project_reference_number;
  $("info-ref").textContent = ref ? "Ref: " + ref : "";

  const status = attrs.implementation_status;
  const chip = $("status-chip");
  if (status) {
    chip.textContent = status;
    chip.kind = STATUS_KIND[status.toLowerCase()] || "neutral";
    chip.hidden = false;
  } else {
    chip.hidden = true;
  }

  const container = $("info-sections");
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

/** Show / hide the floating info panel. */
function setInfoOpen(open) {
  // The closable X sets calcite-panel `closed`; clear it so a reopen shows content.
  if (open) $("info-panel").closed = false;
  $("info-card").hidden = !open;
  $("info-reopen").hidden = open;
}

/* ------------------------------------------------------------------------ *
 * Map
 * ------------------------------------------------------------------------ */

/** Add every Survey_and_Design_Assets sublayer as a toggleable feature layer,
 * grouped so the layer list stays tidy. */
async function loadAssetLayers(map) {
  const token = await getServerToken();
  const res = await fetch(
    CFG.assetsServiceUrl + "?f=json&token=" + encodeURIComponent(token)
  );
  const svc = await res.json();
  if (svc.error) throw new Error(svc.error.message || "Could not read asset layers.");

  const defaults = new Set(CFG.mapDefaultVisibleLayers || []);
  const group = new GroupLayer({
    title: "Survey & Design Assets",
    visibilityMode: "independent"
  });

  (svc.layers || []).forEach((l) => {
    group.add(
      new FeatureLayer({
        url: CFG.assetsServiceUrl + "/" + l.id,
        title: l.name,
        visible: defaults.has(l.name),
        outFields: ["*"]
      })
    );
  });

  map.add(group);
}

/** Centre the view on the Facilities point matching the project's reference
 * number and drop a marker there. Falls back to the initial framing. */
async function centerOnFacility(view, ref) {
  if (!ref) return;

  const facilities = new FeatureLayer({ url: CFG.facilitiesLayerUrl });
  await facilities.load();

  const result = await facilities.queryFeatures({
    where: `reference_number = '${ref.replace(/'/g, "''")}'`,
    outFields: ["objectid", "name"],
    returnGeometry: true,
    num: 1
  });

  const feature = (result.features || [])[0];
  if (!feature || !feature.geometry) {
    alertUser(
      "No facility located",
      `No facility point matches reference ${ref}; showing the default extent.`,
      "warning"
    );
    return;
  }

  view.graphics.add(
    new Graphic({
      geometry: feature.geometry,
      symbol: {
        type: "simple-marker",
        style: "circle",
        size: 14,
        color: [0, 122, 194, 0.9],
        outline: { color: [255, 255, 255], width: 2 }
      }
    })
  );

  await view.goTo({ target: feature.geometry, zoom: CFG.mapFacilityZoom || 17 });
}

function initMap() {
  const mapEl = $("map");
  mapEl.basemap = CFG.mapBasemap;
  mapEl.center = CFG.mapFallbackCenter;
  mapEl.zoom = CFG.mapFallbackZoom;

  const onReady = async () => {
    try {
      await loadAssetLayers(mapEl.map);
      await centerOnFacility(mapEl.view, attrs.project_reference_number);
    } catch (err) {
      alertUser("Map error", err.message, "danger");
    }
  };

  if (mapEl.ready) {
    onReady();
  } else {
    mapEl.addEventListener(
      "arcgisViewReadyChange",
      () => {
        if (mapEl.ready) onReady();
      },
      { once: true }
    );
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
 * Boot
 * ------------------------------------------------------------------------ */

async function boot() {
  const mode = getMode();
  const backHref = mode === "approve" ? "completed.html" : "in-progress.html";
  $("back-btn").addEventListener("click", () => {
    window.location.href = backHref;
  });
  $("info-panel").addEventListener("calcitePanelClose", () => setInfoOpen(false));
  $("info-reopen").addEventListener("click", () => setInfoOpen(true));

  try {
    const oid = getOid();
    if (oid == null) throw new Error("No project id in the URL (?oid=…).");

    esriConfig.portalUrl = CFG.portalUrl;
    await ensureSignedIn();

    attrs = await fetchProject(oid);
    renderInfo();

    if (mode === "approve") {
      // Completed page: Approve the survey. Once approved the project leaves the
      // Completed list, so return there on success.
      initApproveSheet({
        onApproved: () => {
          setTimeout(() => (window.location.href = "completed.html"), 1200);
        }
      });
      const approveBtn = $("approve-btn");
      approveBtn.hidden = false;
      approveBtn.addEventListener("click", () => openApproveSheet(attrs));
    } else {
      // In progress page: Reassign uses the same sheet + endpoint. On success,
      // re-read the project so the panel reflects the new surveyor.
      await initAssignSheet({
        onAssigned: async () => {
          attrs = await fetchProject(oid);
          renderInfo();
        }
      });
      const reassignBtn = $("reassign-btn");
      reassignBtn.hidden = false;
      reassignBtn.addEventListener("click", () => openAssignSheet(attrs));
    }

    await customElements.whenDefined("arcgis-map");
    initMap();
  } catch (err) {
    $("info-title").textContent = "Could not load project";
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
