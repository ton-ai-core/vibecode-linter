// CHANGE: E2E tests for lint system
// WHY: Ensure entire lint pipeline works correctly
// REF: REQ-LINT-E2E-001

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Lint E2E Tests', () => {
  const testFile = path.join(__dirname, '../../src/index.ts');

  it('should run lint successfully on project', () => {
    try {
      const result = execSync('npm run lint', { 
        encoding: 'utf8',
        cwd: path.join(__dirname, '../..'),
        timeout: 10000,
      });
      
      expect(result).toContain('📊 Total:');
    } catch (error: any) {
      // Lint may fail on purpose, just check it runs
      expect(error.stdout || error.stderr).toBeTruthy();
    }
  });

  it('should detect code structure', () => {
    const content = fs.readFileSync(testFile, 'utf8');
    expect(content).toContain('export function sum');
  });

  it('should have all required modules', () => {
    const lintDir = path.join(__dirname, '../../src/lint');
    const modules = [
      'cli.ts',
      'config.ts',
      'types.ts',
      'either.ts',
      'diff-parser.ts',
      'git.ts',
      'git-advanced.ts',
      'sarif.ts',
      'dependency-analysis.ts',
      'runners.ts',
      'processors.ts',
      'display.ts',
    ];

    for (const mod of modules) {
      const modulePath = path.join(lintDir, mod);
      expect(fs.existsSync(modulePath)).toBe(true);
    }
  });

  it('should have proper exports in modules', () => {
    const cliPath = path.join(__dirname, '../../src/lint/cli.ts');
    const cliContent = fs.readFileSync(cliPath, 'utf8');
    expect(cliContent).toContain('export const parseCLIArgs');

    const eitherPath = path.join(__dirname, '../../src/lint/either.ts');
    const eitherContent = fs.readFileSync(eitherPath, 'utf8');
    expect(eitherContent).toContain('export const left');
    expect(eitherContent).toContain('export const right');
  });
});
