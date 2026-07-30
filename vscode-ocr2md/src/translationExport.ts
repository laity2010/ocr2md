export type ObsidianTranslationUnitKind = "yaml" | "sentence" | "footnote" | "structure";
export type ObsidianStructureRole =
  | "marker"
  | "image"
  | "callout"
  | "html"
  | "latex"
  | "latex-marker"
  | "latex-code"
  | "other";

export interface ObsidianTranslationUnit {
  kind: ObsidianTranslationUnitKind;
  source: string;
  translation?: string;
  anchorId?: string;
  breakAfter?: boolean;
  groupId?: string;
  structureRole?: ObsidianStructureRole;
}

export interface ObsidianTranslationExportInput {
  units: ObsidianTranslationUnit[];
  sourceLinkTarget: string;
  translationLinkTarget: string;
}

export interface ObsidianTranslationBundle {
  org: string;
  trans: string;
  trans2org: string;
  org2trans: string;
  translatedCount: number;
  missingTranslationCount: number;
}

export function renderObsidianTranslationBundle(
  input: ObsidianTranslationExportInput,
): ObsidianTranslationBundle {
  const translatedCount = input.units.filter((unit) => isTranslatable(unit) && hasTranslation(unit)).length;
  const missingTranslationCount = input.units.filter((unit) => isTranslatable(unit) && !hasTranslation(unit)).length;

  return {
    org: renderVariant(input.units, "org", input),
    trans: renderVariant(input.units, "trans", input),
    trans2org: renderVariant(input.units, "trans2org", input),
    org2trans: renderVariant(input.units, "org2trans", input),
    translatedCount,
    missingTranslationCount,
  };
}

function renderVariant(
  units: ObsidianTranslationUnit[],
  variant: "org" | "trans" | "trans2org" | "org2trans",
  input: ObsidianTranslationExportInput,
): string {
  if (variant === "trans2org" || variant === "org2trans") {
    return renderCrossVariant(units, variant, input);
  }

  const chunks = units
    .map((unit) => renderStandaloneUnit(unit, variant))
    .filter((value) => value.trim().length > 0);
  return `${chunks.join("\n\n").replace(/\n{4,}/g, "\n\n\n")}\n`;
}

function renderStandaloneUnit(
  unit: ObsidianTranslationUnit,
  variant: "org" | "trans",
): string {
  const source = normalizeBlockText(unit.source);
  if (!source) {
    return "";
  }
  if (unit.kind === "yaml") {
    return source;
  }

  const anchorId = normalizeAnchorId(unit.anchorId);
  const translation = normalizedTranslation(unit);
  let rendered: string;

  if (unit.kind === "footnote") {
    if (variant === "org") {
      rendered = appendAnchor(source, anchorId);
    } else {
      rendered = appendAnchor(normalizeFootnoteTranslation(source, translation), anchorId);
    }
  } else {
    const primary = variant === "org" ? source : translation;
    rendered = appendAnchor(primary, anchorId, unit.kind === "structure");
  }

  return unit.breakAfter ? `${rendered}\n\n<br>` : rendered;
}

function renderCrossVariant(
  units: ObsidianTranslationUnit[],
  variant: "trans2org" | "org2trans",
  input: ObsidianTranslationExportInput,
): string {
  const target = variant === "trans2org" ? input.sourceLinkTarget : input.translationLinkTarget;
  const groups: ObsidianTranslationUnit[][] = [];

  for (const unit of units) {
    const previous = groups.at(-1);
    if (
      previous
      && unit.groupId
      && previous[0]?.groupId === unit.groupId
      && previous[0]?.kind !== "yaml"
    ) {
      previous.push(unit);
    } else {
      groups.push([unit]);
    }
  }

  const chunks = groups
    .map((group) => renderCrossGroup(group, variant, target))
    .filter((value) => value.trim().length > 0);
  return `${chunks.join("\n\n").replace(/\n{4,}/g, "\n\n\n")}\n`;
}

function renderCrossGroup(
  units: ObsidianTranslationUnit[],
  variant: "trans2org" | "org2trans",
  target: string,
): string {
  if (units.length === 1 && units[0].kind === "yaml") {
    return normalizeBlockText(units[0].source);
  }

  if (units.every((unit) => unit.kind === "footnote")) {
    return units.map((unit) => renderCrossFootnote(unit, variant)).join("\n\n");
  }

  const pieces: string[] = [];
  let structuralLines: string[] = [];
  let quoteDepth = 0;
  let hasSentence = false;
  let pendingReturnDepth = 0;
  const isCompositeGroup = units.some((unit) => unit.kind === "structure");

  const flushStructures = () => {
    if (!structuralLines.length) {
      return;
    }
    pieces.push(structuralLines.join("\n"));
    structuralLines = [];
  };

  for (const unit of units) {
    const source = normalizeBlockText(unit.source);
    if (!source) {
      continue;
    }

    const sourceQuoteDepth = leadingQuoteDepthOf(source);
    const explicitResetDepth = bareQuoteMarkerDepth(source);
    if (pendingReturnDepth > 0) {
      if (explicitResetDepth === undefined && sourceQuoteDepth < pendingReturnDepth) {
        structuralLines.push(">".repeat(pendingReturnDepth));
        quoteDepth = pendingReturnDepth;
      } else if (sourceQuoteDepth > 0) {
        quoteDepth = sourceQuoteDepth;
      }
      pendingReturnDepth = 0;
    }

    if (unit.kind === "structure") {
      quoteDepth = explicitResetDepth ?? Math.max(quoteDepth, quoteDepthOf(source));
      structuralLines.push(renderCrossStructure(unit, source, target, quoteDepth));
      if (structureHasCounterpart(unit, source) && quoteDepth > 0) {
        pendingReturnDepth = quoteDepth;
      }
      continue;
    }

    if (unit.kind !== "sentence") {
      flushStructures();
      continue;
    }

    hasSentence = true;
    const anchorId = normalizeAnchorId(unit.anchorId);
    const primary = variant === "org2trans" ? source : normalizedTranslation(unit);
    const sentenceQuoteDepth = Math.max(quoteDepth, quoteDepthOf(primary));
    quoteDepth = sentenceQuoteDepth;
    const rendered = `${appendAnchor(primary, anchorId)}\n${renderCounterpartLink(target, anchorId, sentenceQuoteDepth)}`;
    if (sentenceQuoteDepth > 0) {
      pendingReturnDepth = sentenceQuoteDepth;
    }
    if (structuralLines.length) {
      pieces.push(`${structuralLines.join("\n")}\n${rendered}`);
      structuralLines = [];
    } else {
      pieces.push(rendered);
    }
  }

  flushStructures();
  // A composite block must remain one uninterrupted Markdown structure.
  // Blank lines here would split a figure title from its image and notes.
  let rendered = pieces.join(isCompositeGroup ? "\n" : "\n\n");
  const shouldBreak = units.some((unit) => unit.kind === "sentence" && unit.breakAfter)
    || (!hasSentence && units.some((unit) => unit.breakAfter));
  if (shouldBreak) {
    rendered += "\n\n<br>";
  }
  return rendered;
}

function renderCrossFootnote(
  unit: ObsidianTranslationUnit,
  variant: "trans2org" | "org2trans",
): string {
  const source = normalizeBlockText(unit.source);
  const translation = normalizedTranslation(unit);
  const primary = variant === "trans2org"
    ? normalizeFootnoteTranslation(source, translation)
    : source;
  const counterpart = variant === "trans2org"
    ? stripFootnotePrefix(source)
    : stripFootnotePrefix(normalizeFootnoteTranslation(source, translation));
  const rendered = appendAnchor(
    `${primary}\n<br>${counterpart}`.trimEnd(),
    normalizeAnchorId(unit.anchorId),
  );
  return unit.breakAfter ? `${rendered}\n\n<br>` : rendered;
}

function renderCrossStructure(
  unit: ObsidianTranslationUnit,
  source: string,
  target: string,
  quoteDepth: number,
): string {
  const role = unit.structureRole ?? "other";
  if (role === "latex" || role === "latex-code") {
    return appendAnchor(source, normalizeAnchorId(unit.anchorId));
  }
  if (role === "callout") {
    const anchorId = normalizeAnchorId(unit.anchorId);
    return `${source}\n${renderCounterpartLink(target, anchorId, quoteDepth)}`;
  }
  if (role === "html" && isTranslatableHtmlStructure(source)) {
    const anchorId = normalizeAnchorId(unit.anchorId);
    return `${appendAnchor(source, anchorId)}\n${renderCounterpartLink(target, anchorId, quoteDepth)}`;
  }
  return source;
}

function renderCounterpartLink(target: string, anchorId: string, quoteDepth: number): string {
  const calloutPrefix = ">".repeat(Math.max(1, quoteDepth + 1));
  const embedPrefix = quoteDepth === 0 ? ">" : "";
  return `${calloutPrefix}[! ds]-\n${embedPrefix}![[${target}#^${anchorId}]]`;
}

function quoteDepthOf(value: string): number {
  return normalizeBlockText(value)
    .split("\n")
    .reduce((depth, line) => Math.max(depth, line.match(/^\s*(>+)/)?.[1].length ?? 0), 0);
}

function leadingQuoteDepthOf(value: string): number {
  const firstLine = normalizeBlockText(value).split("\n")[0] ?? "";
  return firstLine.match(/^\s*(>+)/)?.[1].length ?? 0;
}

function bareQuoteMarkerDepth(value: string): number | undefined {
  const normalized = normalizeBlockText(value);
  const match = normalized.match(/^\s*(>+)\s*$/);
  return match?.[1].length;
}

function structureHasCounterpart(unit: ObsidianTranslationUnit, source: string): boolean {
  return unit.structureRole === "callout"
    || (unit.structureRole === "html" && isTranslatableHtmlStructure(source));
}

function isTranslatableHtmlStructure(value: string): boolean {
  const unquoted = normalizeBlockText(value).replace(/^(?:\s*>)+\s*/gm, "");
  if (/^<\/?(?:table|tr|td|th|tbody|thead|tfoot)\b/i.test(unquoted.trim())) {
    return false;
  }
  const visibleText = unquoted.replace(/<[^>]+>/g, "").trim();
  return /[\p{L}\p{N}]/u.test(visibleText);
}

function isTranslatable(unit: ObsidianTranslationUnit): boolean {
  return unit.kind === "sentence" || unit.kind === "footnote";
}

function hasTranslation(unit: ObsidianTranslationUnit): boolean {
  return Boolean(unit.translation?.trim());
}

function normalizedTranslation(unit: ObsidianTranslationUnit): string {
  return normalizeBlockText(unit.translation ?? "") || normalizeBlockText(unit.source);
}

function normalizeBlockText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .trimEnd();
}

function normalizeAnchorId(value: string | undefined): string {
  const normalized = String(value ?? "")
    .replace(/^\^+/, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Obsidian translation export unit is missing a valid anchor ID.");
  }
  return normalized;
}

function appendAnchor(content: string, anchorId: string, nestedSeparator = false): string {
  const normalized = normalizeBlockText(content);
  if (nestedSeparator && normalized.split("\n").some((line) => line.trimStart().startsWith(">"))) {
    return `${normalized}\n>\n^${anchorId}`;
  }
  return `${normalized}\n^${anchorId}`;
}

function normalizeFootnoteTranslation(source: string, translation: string): string {
  const marker = source.match(/^\s*(\[\^[^\]]+\]:)\s*/)?.[1];
  if (!marker) {
    return translation;
  }
  const translatedBody = stripFootnotePrefix(translation);
  return `${marker} ${translatedBody}`.trimEnd();
}

function stripFootnotePrefix(value: string): string {
  return normalizeBlockText(value).replace(/^\s*\[\^[^\]]+\]:\s*/, "");
}
