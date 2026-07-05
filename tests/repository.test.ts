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
});
