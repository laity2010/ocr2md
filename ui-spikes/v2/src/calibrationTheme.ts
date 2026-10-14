/** Shared v2 calibration/table-settings AG Grid theme, no business imports. */
import { themeQuartz, colorSchemeDark } from "ag-grid-community";

export const calibrationTheme = themeQuartz
  .withPart(colorSchemeDark)
  .withParams({
    backgroundColor: "#2f383e",
    foregroundColor: "#d3c6aa",
    chromeBackgroundColor: "#272f34",
    borderColor: "#475258",
    accentColor: "#83c092",
    headerTextColor: "#d3c6aa",
    oddRowBackgroundColor: "#2c353a",
    rowHoverColor: "rgba(131, 192, 146, 0.12)",
    selectedRowBackgroundColor: "rgba(131, 192, 146, 0.18)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "var(--grid-font-size)",
  });
