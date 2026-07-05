import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('github actions workflow', () => {
  it('runs checks on pull requests and main pushes', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('name: Run checks');
    expect(workflow).toContain('run: npm run check');
  });

  it('deploys only from main pushes after verify passes', () => {
    expect(workflow).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(workflow).toContain('needs: verify');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('name: Deploy Worker');
    expect(workflow).toContain('run: npx wrangler deploy');
  });
});
