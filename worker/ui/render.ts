import type { ActionItemInput, DashboardStats, DigestView, PostListItem } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderActionItems(items: ActionItemInput[] | undefined): string {
  if (!items || items.length === 0) {
    return '<p class="muted">No action items yet.</p>';
  }

  return `<ol class="actions">${items
    .map(
      (item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span><em>${escapeHtml(item.difficulty)} · ${item.estimated_minutes} min</em></li>`,
    )
    .join('')}</ol>`;
}

function renderNav(): string {
  return `<nav class="nav" aria-label="Primary">
    <a href="/">Desk</a>
    <a href="/posts">Archive</a>
    <a href="/digests/latest">Digest</a>
    <a href="/setup/shortcut">iPhone Share</a>
    <a href="/health">Health</a>
  </nav>`;
}

function renderPostCard(post: PostListItem): string {
  const actionCount = post.analysis?.action_items.length ?? 0;
  return `<article class="paper">
    <div class="card-top">
      <span class="eyebrow">${escapeHtml(post.platform)}</span>
      <a class="inline-link" href="/posts/${post.id}">Open Notes</a>
    </div>
    <h3>${escapeHtml(post.title ?? post.canonical_url)}</h3>
    <p class="source-link"><a href="${escapeHtml(post.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(post.canonical_url)}</a></p>
    ${post.analysis
      ? `<div class="summary-block">
           <p>${escapeHtml(post.analysis.summary)}</p>
           <p class="why">${escapeHtml(post.analysis.why_it_matters)}</p>
         </div>
         <div class="micro-meta"><span>${actionCount} next step${actionCount === 1 ? '' : 's'}</span></div>
         ${renderActionItems(post.analysis.action_items)}`
      : `<p class="muted">Queued for analysis.</p>`}
  </article>`;
}

function renderStats(stats: DashboardStats): string {
  return `<section class="stat-grid" aria-label="Inbox stats">
    <article class="stat-card"><span class="stat-label">Pending</span><strong>${stats.pending}</strong></article>
    <article class="stat-card"><span class="stat-label">Processed</span><strong>${stats.processed}</strong></article>
    <article class="stat-card"><span class="stat-label">Failed</span><strong>${stats.failed}</strong></article>
    <article class="stat-card"><span class="stat-label">Posts</span><strong>${stats.total_posts}</strong></article>
  </section>`;
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f5efe4" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe4;
        --bg-deep: #e7d8c2;
        --paper: rgba(255, 251, 245, 0.9);
        --paper-strong: #fffaf4;
        --ink: #1f1a16;
        --muted: #6d6255;
        --accent: #a4492a;
        --accent-soft: rgba(164, 73, 42, 0.08);
        --line: rgba(58, 40, 25, 0.14);
        --line-strong: rgba(58, 40, 25, 0.22);
        --shadow-a: 0 1px 0 rgba(255,255,255,0.75);
        --shadow-b: 0 26px 60px rgba(81, 56, 34, 0.08);
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.55), transparent 32%),
          linear-gradient(180deg, #fbf6ee 0%, var(--bg) 54%, var(--bg-deep) 100%);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      a { color: inherit; }
      a:focus-visible, button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 3px;
      }
      .skip-link {
        position: absolute;
        left: 16px;
        top: 16px;
        transform: translateY(-150%);
        background: var(--paper-strong);
        border: 1px solid var(--line-strong);
        border-radius: 999px;
        padding: 10px 14px;
        text-decoration: none;
      }
      .skip-link:focus-visible { transform: translateY(0); }
      .shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 28px 18px 72px;
      }
      .masthead {
        display: grid;
        gap: 18px;
        margin-bottom: 22px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.72rem;
        color: var(--muted);
      }
      .eyebrow::before {
        content: "";
        width: 28px;
        height: 1px;
        background: currentColor;
        opacity: 0.65;
      }
      .headline {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
        gap: 24px;
        align-items: end;
      }
      .headline h1, .section-title h1 {
        margin: 0;
        font-size: clamp(2.5rem, 5vw, 5.1rem);
        line-height: 0.92;
        letter-spacing: -0.04em;
      }
      .lede {
        margin: 12px 0 0;
        max-width: 60ch;
        color: var(--muted);
        font-size: 1.04rem;
        line-height: 1.6;
      }
      .nav {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 10px;
      }
      .nav a {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255, 250, 244, 0.72);
        text-decoration: none;
        transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
        touch-action: manipulation;
      }
      .nav a:hover {
        transform: translateY(-1px);
        border-color: var(--line-strong);
        background: rgba(255, 250, 244, 0.96);
      }
      .dashboard-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
        gap: 18px;
        align-items: start;
      }
      .paper, .feature-panel, .stat-card, .aside-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.7), var(--paper));
        border: 1px solid var(--line);
        box-shadow: var(--shadow-a), var(--shadow-b);
      }
      .feature-panel, .aside-card, .paper {
        border-radius: 24px;
      }
      .feature-panel {
        padding: 28px;
        position: relative;
        overflow: hidden;
      }
      .feature-panel::after {
        content: "";
        position: absolute;
        inset: auto -60px -70px auto;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(164, 73, 42, 0.18), transparent 68%);
        pointer-events: none;
      }
      .feature-panel h2, .paper h2, .aside-card h2, .section-title h2 {
        margin: 0 0 12px;
        font-size: clamp(1.5rem, 2vw, 2rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .feature-panel p,
      .paper p,
      .aside-card p,
      .aside-card li,
      .paper li {
        line-height: 1.65;
      }
      .kicker {
        display: inline-block;
        margin-bottom: 12px;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }
      .muted { color: var(--muted); }
      .feature-meta, .micro-meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 16px;
        color: var(--muted);
        font-size: 0.92rem;
      }
      .feature-meta span, .micro-meta span {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.5);
        border: 1px solid rgba(58, 40, 25, 0.08);
      }
      .aside {
        display: grid;
        gap: 14px;
      }
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .stat-card {
        border-radius: 18px;
        padding: 16px;
      }
      .stat-card strong {
        display: block;
        margin-top: 8px;
        font-size: 2rem;
        line-height: 1;
        letter-spacing: -0.05em;
      }
      .stat-label {
        color: var(--muted);
        font-size: 0.86rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .aside-card {
        padding: 18px;
      }
      .aside-card ul, .steps, .field-list {
        margin: 0;
        padding-left: 18px;
      }
      .aside-card li + li, .steps li + li, .field-list li + li {
        margin-top: 8px;
      }
      .section-title {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 18px;
        margin: 38px 0 18px;
      }
      .section-title p {
        max-width: 56ch;
        margin: 0;
      }
      .post-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .paper {
        padding: 20px;
      }
      .card-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .inline-link {
        color: var(--accent);
        text-decoration: none;
        font-size: 0.94rem;
      }
      h3 {
        margin: 14px 0 8px;
        font-size: 1.35rem;
        line-height: 1.15;
        letter-spacing: -0.025em;
      }
      .source-link {
        margin: 0 0 12px;
        word-break: break-word;
        font-size: 0.94rem;
        color: var(--muted);
      }
      .source-link a {
        color: inherit;
        text-decoration-color: rgba(58, 40, 25, 0.22);
      }
      .summary-block {
        display: grid;
        gap: 12px;
      }
      .why {
        margin: 0;
        padding: 12px 14px;
        border-left: 3px solid var(--accent);
        border-radius: 0 14px 14px 0;
        background: var(--accent-soft);
      }
      .actions {
        margin: 16px 0 0;
        padding-left: 18px;
        display: grid;
        gap: 12px;
      }
      .actions li {
        padding-left: 4px;
      }
      .actions strong {
        display: block;
        margin-bottom: 4px;
      }
      .actions em {
        display: inline-block;
        margin-top: 6px;
        font-style: normal;
        color: var(--muted);
        font-size: 0.92rem;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        gap: 18px;
      }
      .prose-block {
        white-space: pre-wrap;
      }
      .field-list code, pre code {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
        font-size: 0.92rem;
        font-variant-numeric: tabular-nums;
      }
      pre {
        margin: 0;
        overflow-x: auto;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(40, 29, 20, 0.05);
        padding: 16px;
      }
      .callout-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .callout {
        padding: 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.45);
      }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        .nav a { transition: none; }
      }
      @media (max-width: 960px) {
        .headline,
        .dashboard-grid,
        .detail-grid {
          grid-template-columns: 1fr;
        }
        .nav { justify-content: flex-start; }
      }
      @media (max-width: 640px) {
        .shell { padding: 20px 14px 56px; }
        .feature-panel, .paper, .aside-card { padding: 18px; }
        .stat-grid { grid-template-columns: 1fr 1fr; }
        .section-title { align-items: start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <main id="content" class="shell">${body}</main>
  </body>
</html>`;
}

export function renderDashboard(stats: DashboardStats, posts: PostListItem[], digest: DigestView | null): string {
  const body = `
    <header class="masthead">
      <div class="eyebrow">Private Learning Desk</div>
      <div class="headline">
        <div>
          <h1>Turn saved posts into work you can actually try.</h1>
          <p class="lede">A quiet research desk for the ideas you collect across Instagram, Threads, Rednote, and beyond. Every capture gets reduced into a short brief, a reason to care, and a handful of experiments worth doing next.</p>
        </div>
        ${renderNav()}
      </div>
    </header>
    <section class="dashboard-grid">
      <article class="feature-panel">
        <span class="kicker">Latest Digest</span>
        <h2>What deserves attention next</h2>
        ${digest
          ? `<p>${escapeHtml(digest.summary)}</p>
             ${renderActionItems(digest.action_items)}
             <div class="feature-meta">
               <span>${digest.coverage_count} priority items</span>
               <span>${escapeHtml(digest.model_name)}</span>
             </div>`
          : '<p class="muted">No digest yet. Run the nightly cron or trigger the internal digest endpoint once you have a few processed posts.</p>'}
      </article>
      <aside class="aside">
        ${renderStats(stats)}
        <article class="aside-card">
          <span class="kicker">Phone Capture</span>
          <h2>Share from iPhone</h2>
          <p class="muted">Your webhook is live. The remaining setup is just the Shortcuts share-sheet wrapper.</p>
          <p><a class="inline-link" href="/setup/shortcut">Open iPhone share setup</a></p>
        </article>
      </aside>
    </section>
    <section class="section-title">
      <div>
        <div class="eyebrow">Recent Archive</div>
        <h2>Fresh reading notes</h2>
      </div>
      <p class="muted">This is the working set: summaries in plain English, a short explanation of why each post matters, and the next things to test or read.</p>
    </section>
    <section class="post-grid">${posts.map(renderPostCard).join('')}</section>
  `;
  return layout('AI Learning Inbox', body);
}

export function renderPosts(posts: PostListItem[]): string {
  return layout(
    'Posts',
    `<header class="masthead">
      <div class="eyebrow">Archive</div>
      <div class="headline">
        <div>
          <h1>Saved posts, cleaned up.</h1>
          <p class="lede">Everything captured so far, arranged as a reading archive instead of a chat transcript.</p>
        </div>
        ${renderNav()}
      </div>
    </header>
    <section class="post-grid">${posts.map(renderPostCard).join('')}</section>`,
  );
}

export function renderPostDetail(post: PostListItem): string {
  return layout(
    post.title ?? 'Post Detail',
    `<header class="masthead">
      <div class="eyebrow">${escapeHtml(post.platform)}</div>
      <div class="headline">
        <div class="section-title">
          <div>
            <h1>${escapeHtml(post.title ?? post.canonical_url)}</h1>
            <p class="lede"><a href="${escapeHtml(post.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(post.canonical_url)}</a></p>
          </div>
        </div>
        ${renderNav()}
      </div>
    </header>
    <section class="detail-grid">
      <article class="paper">
        <span class="kicker">Captured Text</span>
        <h2>Source material</h2>
        <p class="prose-block">${escapeHtml(post.normalized_text)}</p>
      </article>
      ${post.analysis
        ? `<article class="paper">
            <span class="kicker">Analysis</span>
            <h2>Working notes</h2>
            <p>${escapeHtml(post.analysis.summary)}</p>
            <p class="why">${escapeHtml(post.analysis.why_it_matters)}</p>
            <h2>Action items</h2>
            ${renderActionItems(post.analysis.action_items)}
          </article>`
        : '<article class="paper"><p class="muted">This post has not been analyzed yet.</p></article>'}
    </section>`,
  );
}

export function renderDigest(digest: DigestView | null): string {
  return layout(
    'Latest Digest',
    `<header class="masthead">
      <div class="eyebrow">Nightly Review</div>
      <div class="headline">
        <div>
          <h1>Latest digest.</h1>
          <p class="lede">A compact review of the ideas worth revisiting and the next few things worth trying.</p>
        </div>
        ${renderNav()}
      </div>
    </header>
    ${digest
      ? `<article class="feature-panel">
          <span class="kicker">Generated ${escapeHtml(digest.created_at)}</span>
          <h2>Daily synthesis</h2>
          <p>${escapeHtml(digest.summary)}</p>
          ${renderActionItems(digest.action_items)}
          <div class="feature-meta"><span>${escapeHtml(digest.model_name)}</span></div>
        </article>`
      : '<article class="feature-panel"><p class="muted">No digest has been generated yet.</p></article>'}`,
  );
}

export function renderShortcutSetup(workerUrl: string): string {
  const webhookUrl = `${workerUrl.replace(/\/$/, '')}/ingest/share`;
  const samplePayload = `{
  "source_platform": "instagram",
  "source_url": "Shortcut Input URL",
  "shared_text": "Shortcut Input Text",
  "user_note": "Optional note from Ask for Input",
  "capture_method": "ios_share_sheet",
  "shared_at": "Current Date as ISO 8601"
}`;

  return layout(
    'iPhone Share Setup',
    `<header class="masthead">
      <div class="eyebrow">iPhone Share Setup</div>
      <div class="headline">
        <div>
          <h1>Wrap your webhook in a share sheet.</h1>
          <p class="lede">Your backend is already ready. The shortcut can forward the shared Threads URL, any visible text, and an optional note to your Worker; the backend will try to extract public post text first and fall back gracefully if it cannot.</p>
        </div>
        ${renderNav()}
      </div>
    </header>
    <section class="callout-row">
      <article class="callout">
        <span class="kicker">Webhook</span>
        <p><code>${escapeHtml(webhookUrl)}</code></p>
      </article>
      <article class="callout">
        <span class="kicker">Header</span>
        <p><code>x-aili-secret</code> = your secret</p>
      </article>
      <article class="callout">
        <span class="kicker">Method</span>
        <p><code>POST</code> with JSON body</p>
      </article>
    </section>
    <section class="detail-grid" style="margin-top: 18px;">
      <article class="paper">
        <span class="kicker">What The Shortcut Does</span>
        <h2>Action recipe</h2>
        <ol class="steps">
          <li>Enable the shortcut in the iPhone share sheet and allow <code>URLs</code> plus <code>Text</code> input.</li>
          <li>Read the incoming shared item and split it into URL text and visible text when available.</li>
          <li>Optionally ask you for a one-line note so you can add context before sending.</li>
          <li>POST the payload to your Worker with the shared secret header.</li>
          <li>Show a success or failure notification so you know the capture landed.</li>
        </ol>
        <h2>Fields to send</h2>
        <ul class="field-list">
          <li><code>source_platform</code>: set manually per shortcut, or infer from the shared URL host.</li>
          <li><code>source_url</code>: the shared URL when present.</li>
          <li><code>shared_text</code>: the text portion from the share sheet input.</li>
          <li><code>user_note</code>: your optional note from the shortcut prompt.</li>
          <li><code>capture_method</code>: use <code>ios_share_sheet</code>.</li>
          <li><code>shared_at</code>: current date in ISO 8601 format.</li>
        </ul>
      </article>
      <article class="paper">
        <span class="kicker">Payload Shape</span>
        <h2>JSON body</h2>
        <pre><code>${escapeHtml(samplePayload)}</code></pre>
        <h2>Current limitation</h2>
        <p class="muted">I tried to generate a fully importable Apple Shortcut file from this Mac, but the local Shortcuts helper is not responding to automation, so I could not safely produce a signed one-click import artifact from here. The backend side is done; the remaining phone-side setup is still just the shortcut wrapper.</p>
      </article>
    </section>`,
  );
}
