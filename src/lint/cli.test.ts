// CHANGE: Tests for CLI module
// WHY: Ensure CLI parsing works correctly
// REF: REQ-LINT-CLI-001

import { parseCLIArgs } from './cli';

describe('parseCLIArgs', () => {
  it('should parse default options', () => {
    const result = parseCLIArgs([]);
    expect(result.targetPath).toBe('.');
    expect(result.maxClones).toBe(15);
    expect(result.noFix).toBe(false);
  });

  it('should parse target path', () => {
    const result = parseCLIArgs(['src']);
    expect(result.targetPath).toBe('src');
  });

  it('should parse --max-clones', () => {
    const result = parseCLIArgs(['--max-clones', '10']);
    expect(result.maxClones).toBe(10);
  });

  it('should parse --width', () => {
    const result = parseCLIArgs(['--width', '80']);
    expect(result.width).toBe(80);
  });

  it('should parse --context', () => {
    const result = parseCLIArgs(['--context', '5']);
    expect(result.context).toBe(5);
  });

  it('should parse --no-fix', () => {
    const result = parseCLIArgs(['--no-fix']);
    expect(result.noFix).toBe(true);
  });

  it('should parse multiple options', () => {
    const result = parseCLIArgs(['src', '--max-clones', '20', '--no-fix']);
    expect(result.targetPath).toBe('src');
    expect(result.maxClones).toBe(20);
    expect(result.noFix).toBe(true);
  });
});
