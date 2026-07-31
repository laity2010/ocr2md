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
  crossOnly?: boolean;
  crossSource?: string;
  crossCallout?: boolean;
  suppressCrossAnchor?: boolean;
  crossBreakBefore?: boolean;
  suppressCrossCounterpart?: boolean;
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
  const units = input.units.map(normalizeStructuralUnit);
  const crossUnits = normalizeCompositeTranslationUnits(units);
  const translatedCount = units.filter((unit) => isTranslatable(unit) && hasTranslation(unit)).length;
  const missingTranslationCount = units.filter((unit) => isTranslatable(unit) && !hasTranslation(unit)).length;

  return {
    org: renderVariant(units, "org", input),
    trans: renderVariant(units, "trans", input),
    trans2org: renderVariant(crossUnits, "trans2org", input),
    org2trans: renderVariant(crossUnits, "org2trans", input),
    translatedCount,
    missingTranslationCount,
  };
}

export function normalizeCompositeTranslationUnits(
  inputUnits: ObsidianTranslationUnit[],
): ObsidianTranslationUnit[] {
  const units = inputUnits.map(normalizeStructuralUnit);
  const groups: ObsidianTranslationUnit[][] = [];
  for (const unit of units) {
    const previous = groups.at(-1);
    if (previous && unit.groupId && previous[0]?.groupId === unit.groupId) {
      previous.push(unit);
    } else {
      groups.push([unit]);
    }
  }

  const output: ObsidianTranslationUnit[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const captionGroup = groups[index];
    const followingGroup = groups[index + 1];

    const explicitComposite = normalizeExplicitCompositeGroup(captionGroup, index);
    if (explicitComposite) {
      output.push(...explicitComposite);
      continue;
    }

    const multiPanelFigure = inferredMultiPanelFigure(groups, index);
    if (multiPanelFigure) {
      output.push(...multiPanelFigure.units);
      index = multiPanelFigure.lastGroupIndex;
      continue;
    }

    if (isImageGroup(captionGroup) && followingGroup && isShortCaptionGroup(followingGroup)) {
      output.push(...asInferredComposite([captionGroup, followingGroup], index, true));
      index += 1;
      continue;
    }

    if (!isFigureTableCaptionGroup(captionGroup) || captionGroup.some((unit) => unit.kind === "structure")) {
      output.push(...captionGroup);
      continue;
    }

    const collected = [captionGroup];
    let hasVisualStructure = false;
    let cursor = index + 1;
    while (cursor < groups.length && isCompositeContinuationGroup(groups[cursor])) {
      const group = groups[cursor];
      hasVisualStructure ||= group.some((unit) =>
        unit.kind === "structure" && (unit.structureRole === "image" || unit.structureRole === "html"),
      );
      if (isNotesGroup(group) && group.length > 1) {
        collected.push(group);
        cursor += 1;
        break;
      }
      collected.push(group);
      cursor += 1;
    }
    if (!hasVisualStructure) {
      output.push(...captionGroup);
      continue;
    }

    output.push(...(
      isTableCaptionGroup(captionGroup)
        ? asInferredTable(collected, index)
        : asInferredComposite(collected, index)
    ));
    index = cursor - 1;
  }
  return output;
}

function normalizeExplicitCompositeGroup(
  group: ObsidianTranslationUnit[],
  groupIndex: number,
): ObsidianTranslationUnit[] | undefined {
  if (!group.some(isCompositeVisualStructure)) {
    return undefined;
  }

  const sentenceSources = group
    .filter((unit) => unit.kind === "sentence")
    .map((unit) => stripLeadingQuotes(unit.source));
  const hasPanelHeadings = sentenceSources.some((source) => /^[A-Z]\.\s+\S/.test(source));
  if (hasPanelHeadings) {
    const figureCaptionIndex = group.findIndex((unit) =>
      unit.kind === "sentence"
      && /^Figure\s+\d+[.: ]\s*\S/i.test(stripLeadingQuotes(unit.source))
    );
    const imageCount = group.filter((unit) =>
      unit.kind === "structure" && unit.structureRole === "image"
    ).length;
    if (figureCaptionIndex >= 0 && imageCount >= 2) {
      return group.map((unit, index) => index === figureCaptionIndex
        ? { ...unit, suppressCrossAnchor: true }
        : unit);
    }
    return undefined;
  }

  const isFigure = sentenceSources.some((source) => /^Figure\s+\d+\b/i.test(source));
  const isTable = sentenceSources.some((source) => /^(?:Table|Exhibit)\s+\d+\b/i.test(source))
    || group.some((unit) =>
      unit.kind === "structure"
      && unit.structureRole === "callout"
      && /^(?:Table|Exhibit)\s+\d+\b/i.test(
        stripLeadingQuotes(unit.source).replace(/^\[!\s*\]-\s*/, ""),
      )
    );
  if (!isFigure && !isTable) {
    const sentenceUnits = group.filter((unit) => unit.kind === "sentence");
    const isExplicitImageCaption = group.some((unit) =>
      unit.kind === "structure" && unit.structureRole === "image"
    ) && isShortCaptionGroup(sentenceUnits);
    if (isExplicitImageCaption) {
      return group.map((unit, index) => ({
        ...unit,
        crossBreakBefore: index === 0,
      }));
    }
    return undefined;
  }

  const firstVisualIndex = group.findIndex(isCompositeVisualStructure);
  const firstTitleIndex = group.findIndex((unit) => {
    const source = stripLeadingQuotes(unit.source);
    if (unit.kind === "sentence") {
      return /^(?:Figure|Table|Exhibit)\s+\d+(?:[.:： ]|\s{2,})/i.test(source);
    }
    return unit.kind === "structure"
      && unit.structureRole === "callout"
      && /^(?:Figure|Table|Exhibit)\s+\d+(?:[.:： ]|\s{2,})/i.test(
        source.replace(/^\[!\s*\]-\s*/, ""),
      );
  });
  let compositeStartIndex = Math.min(
    firstVisualIndex < 0 ? group.length : firstVisualIndex,
    firstTitleIndex < 0 ? group.length : firstTitleIndex,
  );
  while (compositeStartIndex > 0 && isBareQuoteMarker(group[compositeStartIndex - 1])) {
    compositeStartIndex -= 1;
  }

  const prefix = group.slice(0, compositeStartIndex).map((unit, index) => ({
    ...unit,
    groupId: `${group[0]?.groupId ?? `explicit-composite-${groupIndex + 1}`}-prefix-${index + 1}`,
  }));
  const compositeGroup = group.slice(compositeStartIndex);
  const lastVisualIndex = compositeGroup.reduce(
    (found, unit, index) => isCompositeVisualStructure(unit) ? index : found,
    -1,
  );
  const firstNoteIndex = compositeGroup.findIndex((unit, index) => {
    if (index <= lastVisualIndex || isBareQuoteMarker(unit)) {
      return false;
    }
    if (unit.kind === "sentence") {
      return /^(?:Notes?|Source):\s+/i.test(stripLeadingQuotes(unit.source));
    }
    return isTable && unit.kind === "structure" && hasVisibleStructureText(unit.source);
  });
  if (firstNoteIndex < 0) {
    return undefined;
  }

  const baseGroupId = group[0]?.groupId ?? `explicit-composite-${groupIndex + 1}`;
  const visualImageCount = compositeGroup.filter((unit) =>
    unit.kind === "structure" && unit.structureRole === "image"
  ).length;
  const hasTrailingStructureNote = compositeGroup
    .slice(lastVisualIndex + 1)
    .some((unit) => unit.kind === "structure" && hasVisibleStructureText(unit.source));
  const requiresLeadingBreak = isTable && (visualImageCount > 1 || hasTrailingStructureNote);
  const nested = compositeGroup.map((unit, index) => {
    return {
      ...unit,
      groupId: baseGroupId,
      crossBreakBefore: index === 0 && requiresLeadingBreak,
      crossSource: index >= firstNoteIndex && !isBareQuoteMarker(unit)
        ? stripLeadingQuotes(unit.crossSource ?? unit.source)
        : unit.crossSource,
      suppressCrossCounterpart: isTable
        && visualImageCount > 1
        && unit.kind === "structure"
        && unit.structureRole === "callout",
    };
  });

  return [...prefix, ...nested];
}

function isCompositeVisualStructure(unit: ObsidianTranslationUnit): boolean {
  if (unit.kind !== "structure") {
    return false;
  }
  if (unit.structureRole === "image") {
    return true;
  }
  if (unit.structureRole !== "html") {
    return false;
  }
  const source = stripLeadingQuotes(unit.crossSource ?? unit.source);
  return /^<(?:table|img|figure|picture|svg)\b/i.test(source);
}

function isBareQuoteMarker(unit: ObsidianTranslationUnit): boolean {
  return unit.kind === "structure"
    && unit.structureRole === "marker"
    && bareQuoteMarkerDepth(unit.crossSource ?? unit.source) !== undefined;
}

function hasVisibleStructureText(source: string): boolean {
  const visible = stripLeadingQuotes(source).replace(/<[^>]+>/g, "").trim();
  return /[\p{L}\p{N}]/u.test(visible);
}

function inferredMultiPanelFigure(
  groups: ObsidianTranslationUnit[][],
  startIndex: number,
): { units: ObsidianTranslationUnit[]; lastGroupIndex: number } | undefined {
  const captionGroup = groups[startIndex];
  const caption = captionGroup.find((unit) => unit.kind === "sentence");
  if (!caption || !/^Figure\s+\d+[.:]\s*\S/i.test(normalizeBlockText(caption.source))) {
    return undefined;
  }

  const collected: ObsidianTranslationUnit[][] = [captionGroup];
  let cursor = startIndex + 1;
  while (cursor < groups.length && isCompositeContinuationGroup(groups[cursor])) {
    collected.push(groups[cursor]);
    cursor += 1;
  }

  const panelHeadings = collected.filter(isPanelHeadingGroup);
  const imageGroups = collected.filter(isImageGroup);
  if (panelHeadings.length < 2 || imageGroups.length < 2) {
    return undefined;
  }

  const panels = panelHeadings.map((headingGroup) => ({
    label: panelLabel(headingGroup),
    headingGroup,
    imageGroups: [] as ObsidianTranslationUnit[][],
    noteUnits: [] as ObsidianTranslationUnit[],
  }));
  let activePanel = -1;
  for (const group of collected.slice(1)) {
    if (isPanelHeadingGroup(group)) {
      activePanel = panels.findIndex((panel) => panel.headingGroup === group);
      continue;
    }
    if (isImageGroup(group) && activePanel >= 0) {
      panels[activePanel].imageGroups.push(group);
    }
  }

  for (const group of collected.filter(isNotesGroup)) {
    let notePanel = panels.length - 1;
    for (const unit of group) {
      const label = notePanelLabel(unit.source);
      if (label) {
        const found = panels.findIndex((panel) => panel.label === label);
        if (found >= 0) {
          notePanel = found;
        }
      }
      panels[notePanel].noteUnits.push(unit);
    }
  }

  const groupId = captionGroup[0]?.groupId ?? `composite-${startIndex + 1}`;
  const units: ObsidianTranslationUnit[] = [
    crossMarker(">", groupId, `multi-panel-${startIndex + 1}-root`),
    ...captionGroup.map((unit) => ({
      ...unit,
      groupId,
      suppressCrossAnchor: true,
    })),
  ];
  for (const [panelIndex, panel] of panels.entries()) {
    units.push(
      crossMarker(">", groupId, `multi-panel-${startIndex + 1}-${panelIndex + 1}-reset`),
      ...panel.headingGroup.map((unit) => ({
        ...unit,
        groupId,
        crossSource: `>>${stripLeadingQuotes(unit.source)}`,
      })),
      crossMarker(">>", groupId, `multi-panel-${startIndex + 1}-${panelIndex + 1}-body`),
      ...panel.imageGroups.flat().map((unit) => ({ ...unit, groupId })),
      ...panel.noteUnits.map((unit) => ({ ...unit, groupId })),
    );
  }

  return { units, lastGroupIndex: cursor - 1 };
}

function asInferredTable(
  groups: ObsidianTranslationUnit[][],
  index: number,
): ObsidianTranslationUnit[] {
  const groupId = groups[0]?.[0]?.groupId ?? `composite-${index + 1}`;
  const [captionGroup, ...bodyGroups] = groups;
  const units: ObsidianTranslationUnit[] = [
    crossMarker(">", groupId, `table-${index + 1}-root`),
    ...captionGroup.map((unit) => ({
      ...unit,
      groupId,
      crossSource: `>>[! ]- ${stripLeadingQuotes(unit.source)}`,
      crossCallout: true,
    })),
  ];

  let noteMarkerAdded = false;
  for (const group of bodyGroups) {
    if (isNotesGroup(group) && !noteMarkerAdded) {
      units.push(crossMarker(">>", groupId, `table-${index + 1}-notes`));
      noteMarkerAdded = true;
    }
    units.push(...group.map((unit) => ({
      ...unit,
      groupId,
      crossSource: unit.kind === "structure" && unit.structureRole === "html"
        ? `>>${stripLeadingQuotes(unit.source)}`
        : unit.crossSource,
    })));
  }
  return units;
}

function asInferredComposite(
  groups: ObsidianTranslationUnit[][],
  index: number,
  crossBreakBefore = false,
): ObsidianTranslationUnit[] {
  const groupId = groups[0]?.[0]?.groupId ?? `composite-${index + 1}`;
  const composite = [
    crossMarker(">", groupId, `${groupId}-marker`),
    ...groups.flat().map((unit) => ({ ...unit, groupId })),
  ];
  if (crossBreakBefore) {
    composite[0] = { ...composite[0], crossBreakBefore: true };
  }
  return composite;
}

function crossMarker(source: string, groupId: string, id: string): ObsidianTranslationUnit {
  return {
    kind: "structure",
    source,
    anchorId: `bid-${id.replace(/[^A-Za-z0-9-]+/g, "-")}`,
    groupId,
    structureRole: "marker",
    crossOnly: true,
  };
}

function normalizeStructuralUnit(unit: ObsidianTranslationUnit): ObsidianTranslationUnit {
  if (unit.kind !== "sentence") {
    return { ...unit };
  }
  const source = normalizeBlockText(unit.source);
  if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(source) || /^!\[\[[^\]]+\]\]\s*$/.test(source)) {
    return {
      ...unit,
      kind: "structure",
      translation: source,
      structureRole: "image",
    };
  }
  if (/^<(?:table|img|figure|picture|svg)\b/i.test(source)) {
    return {
      ...unit,
      kind: "structure",
      translation: source,
      structureRole: "html",
    };
  }
  return { ...unit };
}

function isImageGroup(group: ObsidianTranslationUnit[]): boolean {
  return group.length > 0 && group.every(
    (unit) => unit.kind === "structure" && unit.structureRole === "image",
  );
}

function isShortCaptionGroup(group: ObsidianTranslationUnit[]): boolean {
  if (group.length !== 1 || group[0].kind !== "sentence") {
    return false;
  }
  const source = normalizeBlockText(group[0].source);
  return source.length > 0
    && source.length <= 160
    && !/^(?:#{1,6}\s+|Figure|Table|Exhibit|Notes?|Source):?/i.test(source)
    && !/[.!?。！？]\s*$/.test(source);
}

function isFigureTableCaptionGroup(group: ObsidianTranslationUnit[]): boolean {
  const firstSentence = group.find((unit) => unit.kind === "sentence");
  return Boolean(firstSentence && /^(?:Figure|Table|Exhibit)\s+\d+[.:]\s*\S/i.test(
    normalizeBlockText(firstSentence.source),
  ));
}

function isTableCaptionGroup(group: ObsidianTranslationUnit[]): boolean {
  const firstSentence = group.find((unit) => unit.kind === "sentence");
  return Boolean(firstSentence && /^(?:Table|Exhibit)\s+\d+[.:]\s*\S/i.test(
    normalizeBlockText(firstSentence.source),
  ));
}

function isNotesGroup(group: ObsidianTranslationUnit[]): boolean {
  return group.length > 0
    && group.every((unit) => unit.kind === "sentence")
    && /^(?:Notes?|Source):\s+/i.test(normalizeBlockText(group[0].source));
}

function isPanelHeadingGroup(group: ObsidianTranslationUnit[]): boolean {
  return group.length > 0
    && group.every((unit) => unit.kind === "sentence")
    && /^[A-Z]\.\s+\S/.test(normalizeBlockText(group[0].source));
}

function panelLabel(group: ObsidianTranslationUnit[]): string {
  return normalizeBlockText(group[0]?.source ?? "").match(/^([A-Z])\./)?.[1] ?? "";
}

function notePanelLabel(source: string): string | undefined {
  return normalizeBlockText(source).match(/^(?:Notes?:\s*)?Panel\s+([A-Z])\b/i)?.[1]?.toUpperCase();
}

function stripLeadingQuotes(value: string): string {
  return normalizeBlockText(value).replace(/^\s*>+\s?/, "");
}

function isCompositeContinuationGroup(group: ObsidianTranslationUnit[]): boolean {
  if (group.every((unit) =>
    unit.kind === "structure" && (unit.structureRole === "image" || unit.structureRole === "html"),
  )) {
    return true;
  }
  if (!group.every((unit) => unit.kind === "sentence")) {
    return false;
  }
  const source = normalizeBlockText(group[0]?.source ?? "");
  return /^(?:Notes?|Source):\s+/i.test(source)
    || /^[A-Z]\.\s+\S/.test(source)
    || /^\(?continued\)?\s*$/i.test(source)
    || (/^(?:Figure|Table|Exhibit)\s+\d+[.:]/i.test(source) && /\(continued\)\s*$/i.test(source));
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
  if (unit.crossOnly) {
    return "";
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

  const chunks: string[] = [];
  for (const group of groups) {
    const rendered = renderCrossGroup(group, variant, target);
    if (!rendered.trim()) {
      continue;
    }
    if (
      (isSectionHeadingGroup(group) || group.some((unit) => unit.crossBreakBefore))
      && chunks.length > 0
      && !chunks.at(-1)?.trimEnd().endsWith("<br>")
    ) {
      chunks.push("<br>");
    }
    chunks.push(rendered);
  }
  return `${chunks.join("\n\n").replace(/\n{4,}/g, "\n\n\n")}\n`;
}

function isSectionHeadingGroup(group: ObsidianTranslationUnit[]): boolean {
  return group.some((unit) =>
    unit.kind === "sentence"
    && /^#{2,6}\s+\S/.test(stripLeadingQuotes(unit.crossSource ?? unit.source))
  );
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
    const source = normalizeBlockText(unit.crossSource ?? unit.source);
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
      structuralLines.push(renderCrossStructure(unit, source, target, quoteDepth, isCompositeGroup));
      if (!isCompositeGroup && structureHasCounterpart(unit, source) && quoteDepth > 0) {
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
    const primary = crossPrimaryText(unit, variant, source);
    const sentenceQuoteDepth = Math.max(quoteDepth, quoteDepthOf(primary));
    quoteDepth = sentenceQuoteDepth;
    const renderedPrimary = isCompositeGroup
      ? primary
      : unit.crossCallout || unit.suppressCrossAnchor
        ? primary
        : appendAnchor(primary, anchorId);
    const counterpart = isCompositeGroup
      ? renderInlineCounterpart(unit, variant, source, sentenceQuoteDepth)
      : renderCounterpartLink(target, anchorId, sentenceQuoteDepth);
    const rendered = `${renderedPrimary}\n${counterpart}`;
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

  if (isCompositeGroup && pendingReturnDepth > 0) {
    structuralLines.push(">".repeat(pendingReturnDepth));
    pendingReturnDepth = 0;
  }
  flushStructures();
  // A composite block must remain one uninterrupted Markdown structure.
  // Blank lines here would split a figure title from its image and notes.
  let rendered = pieces.join(isCompositeGroup ? "\n" : "\n\n");
  const shouldBreak = !isLatexOnlyGroup(units)
    && (
      units.some((unit) => unit.kind === "sentence" && unit.breakAfter)
      || (!hasSentence && units.some((unit) => unit.breakAfter))
    );
  if (shouldBreak) {
    rendered += "\n\n<br>";
  }
  return rendered;
}

function isLatexOnlyGroup(units: ObsidianTranslationUnit[]): boolean {
  return units.length > 0 && units.every((unit) =>
    unit.kind === "structure"
    && (
      unit.structureRole === "latex"
      || unit.structureRole === "latex-marker"
      || unit.structureRole === "latex-code"
    )
  );
}

function crossPrimaryText(
  unit: ObsidianTranslationUnit,
  variant: "trans2org" | "org2trans",
  source: string,
): string {
  if (variant === "org2trans") {
    return source;
  }

  const translation = normalizedTranslation(unit);
  if (!unit.crossSource) {
    return translation;
  }
  if (unit.crossCallout && /^>>\[!\s*\]-\s*/.test(source)) {
    return `>>[! ]- ${stripLeadingQuotes(translation).replace(/^\[!\s*\]-\s*/, "")}`;
  }

  const sourceDepth = leadingQuoteDepthOf(source);
  return sourceDepth > 0
    ? `${">".repeat(sourceDepth)}${stripLeadingQuotes(translation)}`
    : translation;
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
  inlineComposite: boolean,
): string {
  const role = unit.structureRole ?? "other";
  if (role === "latex" || role === "latex-marker" || role === "latex-code") {
    return source;
  }
  if (inlineComposite) {
    return source;
  }
  if (role === "callout") {
    if (unit.suppressCrossCounterpart) {
      return source;
    }
    const anchorId = normalizeAnchorId(unit.anchorId);
    return `${source}\n${renderCounterpartLink(target, anchorId, quoteDepth)}`;
  }
  if (role === "html" && isTranslatableHtmlStructure(source)) {
    const anchorId = normalizeAnchorId(unit.anchorId);
    return `${appendAnchor(source, anchorId)}\n${renderCounterpartLink(target, anchorId, quoteDepth)}`;
  }
  return source;
}

function renderInlineCounterpart(
  unit: ObsidianTranslationUnit,
  variant: "trans2org" | "org2trans",
  _source: string,
  quoteDepth: number,
): string {
  const counterpart = variant === "org2trans"
    ? normalizedTranslation(unit)
    : normalizeBlockText(unit.source);
  const calloutPrefix = ">".repeat(Math.max(1, quoteDepth + 1));
  return `${calloutPrefix}[! ds]-\n${stripLeadingQuotes(counterpart)}`;
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
