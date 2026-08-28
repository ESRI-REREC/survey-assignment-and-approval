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
		"https://development.esriea.com/server/rest/services/Hosted/electrification_projects/FeatureServer/0",

	// Token server (../server). Holds the credentials, exposes GET /api/token.
	// The token is referer-bound — serve these pages from the matching origin.
	serverUrl: "https://dev-server-rerec-poc.vercel.app",

	// Facilities layer — source of the surveyor list AND the facility points the
	// map view centres on (its reference_number matches a project's). The
	// assignment sheet's Surveyor <select> is populated from this field's
	// coded-value domain.
	facilitiesLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Facilities/FeatureServer/0",
	surveyorField: "esritask_assignee",

	// Survey & Design Assets feature service — every sublayer is added to the
	// map view (map.html) and toggled through the layer list.
	assetsServiceUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Survey_and_Design_Assets/FeatureServer",

	// Map view settings (map.html).
	mapBasemap: "hybrid",
	// Fallback framing (Nairobi) used until — or if — the matching facility
	// point is found; then the map centres on it at mapFacilityZoom.
	mapFallbackCenter: [36.79037290204911, -1.2597187025957526],
	mapFallbackZoom: 12,
	mapFacilityZoom: 17,
	// Asset sublayers (by service layer name) that start visible; the rest are
	// switched on from the layer list.
	mapDefaultVisibleLayers: ["suggested_route", "suggested_toff", "suggested_tx"],

	// Priority options for the assignment sheet.
	priorityOptions: ["Low", "Medium", "High"],

	// Mock survey-assignment endpoint. The sheet POSTs the assignment here as
	// query params (no real backend yet — the request is best-effort).
	assignmentEndpoint:
		"https://dev-server-rerec-poc.vercel.app/api/survey-assignments",

	/* Columns rendered in every tab's table, in order — same as the wayleave
	 * projects list. Each column's ⋯ menu also gets a Filter… item. */
	projectColumns: [
		{ field: "project_name", label: "Project Name", width: 200 },
		{ field: "project_reference_number", label: "Reference No.", width: 150 },
		{
			field: "implementation_status",
			label: "Implementation Status",
			width: 160
		},
		{ field: "funding_year", label: "Funding Year", width: 120 },
		{ field: "initiator_category", label: "Initiator Category", width: 170 },
		{ field: "funding_category", label: "Funding Category", width: 180 }
	],

	/* The survey workflow pages. `where` is the base definitionExpression that
	 * always applies for that page; column filters are AND-ed on top of it. */
	surveyPages: [
		{
			id: "unassigned",
			label: "Unassigned",
			// No surveyor assigned yet.
			where: "surveyed_by IS NULL",
			// Unassigned uses its own columns: no implementation status, plus the
			// added date. (add_date is a date field, so it is not text-filterable.)
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{
					field: "add_date",
					label: "Added Date",
					width: 130,
					filterable: false,
					dateFormat: "short-date"
				},
				{ field: "funding_year", label: "Funding Year", width: 120 },
				{
					field: "initiator_category",
					label: "Initiator Category",
					width: 170
				},
				{ field: "funding_category", label: "Funding Category", width: 180 }
			]
		},
		{
			id: "in-progress",
			label: "In progress",
			// Assigned, but survey not completed or approved.
			where:
				"surveyed_by IS NOT NULL AND survey_completion_date IS NULL AND " +
				"survey_approved_date IS NULL AND survey_approved_by IS NULL",
			// In progress drops Implementation Status and shows the assigned
			// surveyor (surveyed_by) instead — filterable like the other text cols.
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "surveyed_by", label: "Surveyed By", width: 160 },
				{ field: "funding_year", label: "Funding Year", width: 120 },
				{ field: "initiator_category", label: "Initiator Category", width: 170 },
				{ field: "funding_category", label: "Funding Category", width: 180 }
			]
		},
		{
			id: "completed",
			label: "Completed",
			// Survey completed (surveyor + completion date), not yet approved.
			where:
				"survey_completion_date IS NOT NULL AND surveyed_by IS NOT NULL AND " +
				"survey_approved_date IS NULL AND survey_approved_by IS NULL"
		}
	],

	/* Panels shown on the detail page opened when a row is clicked. */
	detailSections: [
		{
			title: "Project Details",
			icon: "information",
			fields: [
				{ field: "project_reference_number", label: "Reference Number" },
				{ field: "implementation_status", label: "Implementation Status" },
				{ field: "funding_year", label: "Funding Year" },
				{ field: "initiator_category", label: "Initiator Category" },
				{ field: "funding_category", label: "Funding Category" }
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
