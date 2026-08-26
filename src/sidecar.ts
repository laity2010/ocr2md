import type { AnnotationPair, Candidate, ModuleName } from "./types";
import {
  calibrationsOf,
  candidateFromCalibration,
  type Calibration,
} from "./atoms";

export const SIDECAR_SCHEMA_VERSION = 4;

const LEGACY_MODULE_NAMES: Record<string, ModuleName> = { "图片": "嵌入块" };
const LEGACY_LINE_TYPES: Record<string, string> = {
  "图片标题": "内嵌标题",
  "图片链接": "嵌入链接",
  "图片HTML": "嵌入HTML",
  "图片文本": "嵌入文本",
};

export interface CalibrationSidecar {
  schemaVersion: number;
  sourceFile: string;
  savedAt: string;
  annotations: Calibration[];
  annotationPairs: AnnotationPair[];
}

export function parseSidecar(raw: unknown): {
  annotations: Calibration[];
  annotationPairs: AnnotationPair[];
  sourceFile?: string;
} {
  const data = (raw ?? {}) as {
    schemaVersion?: number;
    sourceFile?: string;
    annotations?: Calibration[];
    rows?: Array<Calibration & { typeLabel?: string; lineType?: string; id?: string; atomId?: string; rowId?: string; range?: Candidate["range"]; line?: number }>;
    annotationPairs?: AnnotationPair[];
  };
  const annotationPairs = Array.isArray(data.annotationPairs) ? data.annotationPairs : [];
  if ((data.schemaVersion ?? 0) >= SIDECAR_SCHEMA_VERSION && Array.isArray(data.annotations)) {
    return {
      annotations: data.annotations.map(normalizeCalibration),
      annotationPairs,
      sourceFile: data.sourceFile,
    };
  }
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return {
    annotations: rows.map((row) => normalizeCalibration({
      ...row,
      atomId: row.atomId ?? row.rowId ?? row.id ?? "",
      rowId: row.rowId ?? row.id,
      raw: row.raw,
    })),
    annotationPairs,
    sourceFile: data.sourceFile,
  };
}

export function serializeSidecar(sourceFile: string, rows: Candidate[], annotationPairs: AnnotationPair[]): CalibrationSidecar {
  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    sourceFile,
    savedAt: new Date().toISOString(),
    annotations: calibrationsOf(rows.filter((row) => isModuleName(row.typeLabel))),
    annotationPairs,
  };
}

export function candidatesFromSidecar(raw: unknown): { rows: Candidate[]; annotationPairs: AnnotationPair[]; sourceFile?: string } {
  const parsed = parseSidecar(raw);
  return {
    rows: parsed.annotations.filter((item) => item.atomId && isModuleName(item.typeLabel)).map(candidateFromCalibration),
    annotationPairs: parsed.annotationPairs,
    sourceFile: parsed.sourceFile,
  };
}

function normalizeCalibration(row: Calibration): Calibration {
  const typeLabel = row.typeLabel ? LEGACY_MODULE_NAMES[row.typeLabel] ?? row.typeLabel : row.typeLabel;
  const lineType = row.lineType ? LEGACY_LINE_TYPES[row.lineType] ?? row.lineType : row.lineType;
  return {
    ...row,
    typeLabel: typeLabel as ModuleName,
    lineType,
    atomId: row.atomId || row.rowId || "",
  };
}

function isModuleName(value: unknown): value is ModuleName {
  return value === "章节定界" || value === "章节标题" || value === "注释" || value === "嵌入块" || value === "非法断行";
}

export { calibrationsOf, candidateFromCalibration };
