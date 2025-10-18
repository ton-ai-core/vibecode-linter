// CHANGE: SARIF report handling module
// WHY: Extract SARIF logic from lint.ts
// QUOTE(TЗ): "функциональная парадигма", "модульная архитектура"
// REF: REQ-LINT-SARIF-001
// SOURCE: lint.ts SARIF functions

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
    };
    region: {
      startLine: number;
      startColumn?: number;
      endLine: number;
      endColumn?: number;
    };
  };
}

interface SarifResult {
  locations: SarifLocation[];
  relatedLocations: SarifLocation[];
  message: {
    text: string;
  };
}

interface SarifReport {
  runs: Array<{
    results: SarifResult[];
  }>;
}

export interface DuplicateInfo {
  readonly fileA: string;
  readonly fileB: string;
  readonly startA: number;
  readonly endA: number;
  readonly startB: number;
  readonly endB: number;
}

/**
 * Generates SARIF report using jscpd.
 * 
 * @returns Promise of SARIF file path
 */
export const generateSarifReport = async (): Promise<string> => {
  const reportsDir = "reports/jscpd";
  const sarifPath = path.join(reportsDir, "jscpd-sarif.json");

  if (!fs.existsSync("reports")) {
    fs.mkdirSync("reports");
  }
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }

  await execAsync(
    `npx jscpd src --format "typescript,tsx" --mode weak --min-tokens 30 --threshold 0 --reporters sarif --output "${reportsDir}"`,
  );

  return sarifPath;
};

/**
 * Parses SARIF report for duplicates.
 * 
 * @param sarifPath - Path to SARIF file
 * @param maxClones - Maximum duplicates to return
 * @returns Array of duplicate info
 */
export const parseSarifReport = (sarifPath: string, maxClones: number): readonly DuplicateInfo[] => {
  if (!fs.existsSync(sarifPath)) {
    return [];
  }

  const sarifContent = fs.readFileSync(sarifPath, "utf8");
  const sarif: SarifReport = JSON.parse(sarifContent);
  const duplicates: DuplicateInfo[] = [];

  if (!sarif.runs || !sarif.runs[0] || !sarif.runs[0].results) {
    return [];
  }

  for (const result of sarif.runs[0].results) {
    if (result.locations && result.locations.length > 0 && result.message) {
      const messageText = result.message.text;
      const locationMatch = messageText.match(
        /Clone detected in typescript, - (.+?)\[(\d+):(\d+) - (\d+):(\d+)\] and (.+?)\[(\d+):(\d+) - (\d+):(\d+)\]/,
      );

      if (locationMatch) {
        const [
          ,
          fileA,
          startLineA,
          ,
          endLineA,
          ,
          fileB,
          startLineB,
          ,
          endLineB,
        ] = locationMatch;

        duplicates.push({
          fileA: fileA!,
          fileB: fileB!,
          startA: Number.parseInt(startLineA!, 10),
          endA: Number.parseInt(endLineA!, 10),
          startB: Number.parseInt(startLineB!, 10),
          endB: Number.parseInt(endLineB!, 10),
        });
      }
    }
  }

  return duplicates.slice(0, maxClones);
};
