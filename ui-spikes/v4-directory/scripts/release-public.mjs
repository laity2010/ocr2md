/** RETIRED: unsafe direct overwrite of canonical V4 production files.
 * Use the staged, version-approved single-release promotion pipeline.
 * This entry intentionally fails rather than allowing an unreviewed build
 * to bypass iPhone acceptance and overwrite the live production slot. */
throw new Error('OCR2MD_DIRECT_PUBLIC_PUBLISH_RETIRED: run release-wp3-candidate.mjs for a reviewed candidate; after iPad acceptance use release-production.mjs --approve-build=v4-YYMMDD-HHMM. LAN tracks the same slots automatically.');
