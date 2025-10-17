// CHANGE: Display module for duplicates
// WHY: Extract display logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-DISPLAY-001
// SOURCE: lint.ts display functions

import * as fs from "fs";

import type { DuplicateInfo } from './sarif.js';

export const displayClonesFromSarif = (
  duplicates: readonly DuplicateInfo[],
  width: number,
  maxClones: number,
  logger: (msg: string) => void,
): void => {
  for (let i = 0; i < duplicates.length; i++) {
    const dup = duplicates[i];
    if (!dup) continue;
    const dupNum = i + 1;

    logger(`\n=========================== DUPLICATE #${dupNum} ===========================`);
    logger(`A: ${dup.fileA}:${dup.startA}-${dup.endA}                 │ B: ${dup.fileB}:${dup.startB}-${dup.endB}`);
    logger("-------------------------------------------┆------------------------------------------");

    const fileAContent = fs.readFileSync(dup.fileA, "utf8").split("\n");
    const fileBContent = fs.readFileSync(dup.fileB, "utf8").split("\n");

    const linesA = dup.endA - dup.startA + 1;
    const linesB = dup.endB - dup.startB + 1;
    const minLines = Math.min(linesA, linesB);

    for (let lineIdx = 0; lineIdx < minLines; lineIdx++) {
      const lineNumA = dup.startA + lineIdx;
      const lineNumB = dup.startB + lineIdx;

      const contentA = fileAContent[lineNumA - 1] || "";
      const contentB = fileBContent[lineNumB - 1] || "";

      const availableWidth = width - 20;
      const halfWidth = Math.floor(availableWidth / 2);

      const truncatedA =
        contentA.length > halfWidth
          ? contentA.substring(0, halfWidth - 1) + "…"
          : contentA;
      const truncatedB =
        contentB.length > halfWidth
          ? contentB.substring(0, halfWidth - 1) + "…"
          : contentB;

      logger(`${lineNumA.toString().padStart(3)} │ ${truncatedA.padEnd(halfWidth)} │ ${lineNumB.toString().padStart(3)} │ ${truncatedB}`);
    }
  }

  if (duplicates.length >= maxClones) {
    logger(`\n(Showing first ${maxClones} of ${duplicates.length}+ duplicates found)`);
  }
};
