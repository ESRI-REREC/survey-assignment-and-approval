/* ---------------------------------------------------------------------------
 * config.js — settings for the Survey Assignment & Approval UI.
 *
 * Same secured Projects table as the wayleave app. No credentials in the
 * browser: auth.js fetches a short-lived token from the token server.
 * ------------------------------------------------------------------------- */

window.APP_CONFIG = {
  portalUrl: "https://development.esriea.com/portal",
  serverRestUrl: "https://development.esriea.com/server/rest/services",

  // The Projects hosted table (non-spatial). Row per wayleave project.
  projectsLayerUrl:
    "https://development.esriea.com/server/rest/services/Hosted/Projects/FeatureServer/0",

  // Token server (../server). Holds the credentials, exposes GET /api/token.
  // The token is referer-bound — serve these pages from the matching origin.
  serverUrl: "https://dev-server-rerec-poc.vercel.app",

  /* Columns rendered in every tab's table, in order — same as the wayleave
   * projects list. Each column's ⋯ menu also gets a Filter… item. */
  projectColumns: [
    { field: "name", label: "Project Name", width: 200 },
    { field: "reference_number", label: "Reference No.", width: 150 },
    { field: "implementation_status", label: "Implementation Status", width: 160 },
    { field: "funding_year", label: "Funding Year", width: 120 },
    { field: "initiator_category", label: "Initiator Category", width: 170 },
    { field: "funding_category", label: "Funding Category", width: 180 }
  ],

  /* The four workflow tabs. `where` is the base definitionExpression that
   * always applies for that tab; column filters are AND-ed on top of it. */
  surveyTabs: [
    {
      id: "unassigned",
      label: "Unassigned",
      // No surveyor assigned yet.
      where: "surveyed_by IS NULL"
    },
    {
      id: "in-progress",
      label: "In progress",
      // Assigned, but survey not completed or approved.
      where:
        "surveyed_by IS NOT NULL AND survey_completion_date IS NULL AND " +
        "survey_approved_date IS NULL AND survey_approved_by IS NULL"
    },
    {
      id: "completed",
      label: "Completed",
      // Survey completed (surveyor + completion date), not yet approved.
      where:
        "survey_completion_date IS NOT NULL AND surveyed_by IS NOT NULL AND " +
        "survey_approved_date IS NULL AND survey_approved_by IS NULL"
    },
    {
      id: "all",
      label: "All",
      where: "1=1"
    }
  ],

  /* Panels shown on the detail page opened when a row is clicked. */
  detailSections: [
    {
      title: "Project Details",
      icon: "information",
      fields: [
        { field: "reference_number", label: "Reference Number" },
        { field: "implementation_status", label: "Implementation Status" },
        { field: "funding_year", label: "Funding Year" },
        { field: "initiator_category", label: "Initiator Category" },
        { field: "funding_category", label: "Funding Category" },
        { field: "constituency", label: "Constituency" }
      ]
    },
    {
      title: "Survey Details",
      icon: "compass",
      fields: [
        { field: "surveyed_by", label: "Surveyed By" },
        { field: "survey_completion_date", label: "Survey Completion Date" },
        { field: "survey_approved_by", label: "Survey Approved By" },
        { field: "survey_approved_date", label: "Survey Approved Date" }
      ]
    }
  ]
};
