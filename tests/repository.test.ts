import { describe, expect, it } from 'vitest';

import { D1Repository } from '../worker/repositories/d1';

describe('D1Repository', () => {
  it('does not fall back to older analyses when there are no recent ones', async () => {
    let oldQueryCalled = false;

    const env = {
      DB: {
        prepare(sql: string) {
          if (sql.includes('FROM analyses WHERE analyzed_at >= ?')) {
            return {
              bind() {
                return {
                  all: async () => ({ results: [] }),
                };
              },
            };
          }

          if (sql.includes('FROM analyses ORDER BY analyzed_at DESC LIMIT ?')) {
            oldQueryCalled = true;
            throw new Error('older-analysis fallback should not run');
          }

          throw new Error(`unexpected query: ${sql}`);
        },
      } as unknown as D1Database,
    };

    const repo = new D1Repository(env as never);
    const analyses = await repo.listRecentAnalyses({ hoursWindow: 24 });

    expect(analyses).toEqual([]);
    expect(oldQueryCalled).toBe(false);
  });

  it('updates an action item status and records the update timestamp', async () => {
    let updateArgs: unknown[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          if (sql.includes('UPDATE action_items SET status')) {
            return {
              bind(...args: unknown[]) {
                updateArgs = args;
                return { run: async () => ({ meta: { changes: 1 } }) };
              },
            };
          }

          throw new Error(`unexpected query: ${sql}`);
        },
      } as unknown as D1Database,
    };

    const repo = new D1Repository(env as never);
    const updated = await repo.updateActionItemStatus(7, 'planned');

    expect(updated).toBe(true);
    expect(updateArgs[0]).toBe('planned');
    expect(updateArgs[1]).toEqual(expect.any(String));
    expect(updateArgs[2]).toBe(7);
  });

  it('preserves matching action status during reprocessing', async () => {
    const insertedArgs: unknown[][] = [];
    let analysisUpdateArgs: unknown[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          if (sql.includes('SELECT id FROM analyses')) {
            return {
              bind() {
                return { first: async () => ({ id: 11 }) };
              },
            };
          }

          if (sql.includes('SELECT title, description, status, status_updated_at')) {
            return {
              bind() {
                return {
                  all: async () => ({
                    results: [{
                      title: 'Build one experiment',
                      description: 'Try the smallest useful version.',
                      status: 'planned',
                      status_updated_at: '2026-07-12T18:00:00.000Z',
                    }],
                  }),
                };
              },
            };
          }

          if (sql.includes('UPDATE analyses SET')) {
            return {
              bind(...args: unknown[]) {
                analysisUpdateArgs = args;
                return { run: async () => ({ meta: {} }) };
              },
            };
          }

          if (sql.includes('DELETE FROM action_items')) {
            return { bind() { return { run: async () => ({ meta: {} }) }; } };
          }

          if (sql.includes('INSERT INTO action_items')) {
            return {
              bind(...args: unknown[]) {
                insertedArgs.push(args);
                return { run: async () => ({ meta: {} }) };
              },
            };
          }

          throw new Error(`unexpected query: ${sql}`);
        },
      } as unknown as D1Database,
    };

    const repo = new D1Repository(env as never);
    await repo.saveAnalysis({
      postId: 3,
      modelName: 'test-model',
      promptVersion: 'cf-v3',
      summary: 'A refreshed summary.',
      whyItMatters: 'It remains relevant.',
      analysisJson: '{}',
      metrics: {
        inputTokens: 120,
        outputTokens: 80,
        latencyMs: 450,
        evidenceKind: 'text',
        assetStatus: 'not_applicable',
        detailLevel: 'none',
        fallbackUsed: false,
      },
      actionItems: [
        {
          title: 'Build one experiment',
          description: 'Try the smallest useful version.',
          difficulty: 'easy',
          estimated_minutes: 20,
        },
        {
          title: 'Review one result',
          description: 'Check what changed after the experiment.',
          difficulty: 'easy',
          estimated_minutes: 15,
        },
      ],
    });

    expect(insertedArgs[0]?.[5]).toBe('planned');
    expect(insertedArgs[0]?.[6]).toBe('2026-07-12T18:00:00.000Z');
    expect(insertedArgs[1]?.[5]).toBe('open');
    expect(insertedArgs[1]?.[6]).toBeNull();
    expect(analysisUpdateArgs[4]).toBe(120);
    expect(analysisUpdateArgs[5]).toBe(80);
    expect(analysisUpdateArgs[6]).toBe(450);
    expect(analysisUpdateArgs[7]).toBe('text');
    expect(analysisUpdateArgs[10]).toBe(0);
  });
});
