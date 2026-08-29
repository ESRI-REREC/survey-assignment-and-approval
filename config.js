/* ---------------------------------------------------------------------------
 * config.js — settings for the Survey Assignment & Approval UI.
 *
 * The tables + info panels read a secured joined Projects × Facilities view
 * (viewLayerUrl) so they can show/filter county, constituency and ward. All
 * tables are scoped to the Survey stage (implementation_status = 'Survey');
 * approving a survey advances the project to 'Design', dropping it from view.
 * No credentials in the browser: auth.js fetches a short-lived token.
 * ------------------------------------------------------------------------- */

window.APP_CONFIG = {
	portalUrl: "https://development.esriea.com/portal",
	serverRestUrl: "https://development.esriea.com/server/rest/services",

	// The Projects hosted table (non-spatial). Kept for reference; the survey
	// workflow now reads the joined view below (which carries the facility's
	// county/constituency/ward alongside the project fields).
	projectsLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/electrification_projects/FeatureServer/0",

	// Joined Projects × Facilities view (non-spatial). Every table + the detail /
	// map info panels read from this so they can show/filter the facility's
	// county, constituency and ward next to the project fields. It exposes the
	// project fields (project_name, project_reference_number, surveyed_by,
	// survey_*_date/by, implementation_status, funding_*) AND the facility fields
	// (county, constituency, ward, reference_number, esritask_*). Its own
	// `objectid` keys the detail / map lookups. Writes still go through the
	// server endpoints to the base Facilities / Projects layers, not this view.
	viewLayerUrl:
		"https://development.esriea.com/server/rest/services/Hosted/Electrification_Projects_and_Facilities/FeatureServer/0",

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

	// Survey-assignment endpoint. The sheet POSTs the assignment here; the server
	// updates the Facilities task fields + the project's surveyed_by.
	assignmentEndpoint:
		"https://dev-server-rerec-poc.vercel.app/api/survey-assignments",

	// Survey-approval endpoint. The Approve action (Completed map page) POSTs here;
	// the server sets Facilities esritask_status = Completed and the project's
	// survey_approved_by + survey_approved_date.
	approvalEndpoint:
		"https://dev-server-rerec-poc.vercel.app/api/survey-approvals",

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
			// Survey stage, no surveyor assigned yet.
			where: "implementation_status = 'Survey' AND surveyed_by IS NULL",
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
				{ field: "funding_category", label: "Funding Category", width: 180 },
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
		},
		{
			id: "in-progress",
			label: "In progress",
			// Survey stage, assigned, but survey not completed or approved.
			where:
				"implementation_status = 'Survey' AND surveyed_by IS NOT NULL AND " +
				"survey_completion_date IS NULL AND " +
				"survey_approved_date IS NULL AND survey_approved_by IS NULL",
			// In progress drops Implementation Status and shows the assigned
			// surveyor (surveyed_by) instead — filterable like the other text cols.
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "surveyed_by", label: "Surveyed By", width: 160 },
				{ field: "funding_year", label: "Funding Year", width: 120 },
				{ field: "initiator_category", label: "Initiator Category", width: 170 },
				{ field: "funding_category", label: "Funding Category", width: 180 },
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
		},
		{
			id: "completed",
			label: "Completed",
			// Survey stage, completed (surveyor + completion date), not yet approved.
			where:
				"implementation_status = 'Survey' AND survey_completion_date IS NOT NULL AND " +
				"surveyed_by IS NOT NULL AND " +
				"survey_approved_date IS NULL AND survey_approved_by IS NULL",
			// Completed shows who surveyed it and when the survey finished — the
			// context an approver needs. Clicking a row opens the map with Approve.
			columns: [
				{ field: "project_name", label: "Project Name", width: 200 },
				{ field: "project_reference_number", label: "Reference No.", width: 150 },
				{ field: "surveyed_by", label: "Surveyed By", width: 160 },
				{
					field: "survey_completion_date",
					label: "Survey Completed",
					width: 150,
					filterable: false,
					dateFormat: "short-date"
				},
				{ field: "funding_year", label: "Funding Year", width: 120 },
				{ field: "funding_category", label: "Funding Category", width: 180 },
				{ field: "county", label: "County", width: 130 },
				{ field: "constituency", label: "Constituency", width: 150 },
				{ field: "ward", label: "Ward", width: 150 }
			]
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
		},
		{
			// From the joined view — the facility's administrative area.
			title: "Location",
			icon: "pin",
			fields: [
				{ field: "county", label: "County" },
				{ field: "constituency", label: "Constituency" },
				{ field: "ward", label: "Ward" }
			]
		}
	]
};
