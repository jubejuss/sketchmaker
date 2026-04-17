import type { ReportData } from '../../shared/types.js'
import { outputStrings } from '../../shared/i18n.js'

export function buildReportHtml(data: ReportData): string {
  const { brief, scrapedSite, competitors, synthesis, seoWcag } = data
  const t = outputStrings(data.language)
  const date = new Date().toLocaleDateString(t.dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })
  const projectName = scrapedSite?.title || t.reportProjectFallback

  return `<!DOCTYPE html>
<html lang="${t.htmlLangAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.reportCoverLabel} — ${escapeHtml(projectName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary: ${synthesis.colorStrategy.primary};
      --accent: ${synthesis.colorStrategy.accent};
      --neutral: ${synthesis.colorStrategy.neutral};
      --bg: ${synthesis.colorStrategy.background};
      --text: #1a1a1a;
      --text-muted: #666;
      --border: #e5e5e5;
    }

    body {
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      color: var(--text);
      background: #fff;
      line-height: 1.6;
    }

    .page { max-width: 1200px; margin: 0 auto; padding: 60px 80px; }

    /* Cover */
    .cover {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 80px;
      background: var(--text);
      color: #fff;
      page-break-after: always;
    }
    .cover-label { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.5; margin-bottom: 24px; }
    .cover-title { font-family: 'Playfair Display', serif; font-size: 64px; font-weight: 400; line-height: 1.1; margin-bottom: 16px; }
    .cover-date { opacity: 0.4; font-size: 13px; margin-top: 40px; }
    .cover-color-strip { display: flex; gap: 0; margin-top: 60px; height: 8px; border-radius: 4px; overflow: hidden; }
    .cover-color-strip span { flex: 1; }

    /* Section headings */
    .section { padding: 60px 0; border-bottom: 1px solid var(--border); }
    .section:last-child { border-bottom: none; }
    .section-label { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
    .section-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 400; margin-bottom: 40px; }

    /* Screenshots */
    .screenshots { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 40px; }
    .screenshot-card { background: #f5f5f5; border-radius: 8px; overflow: hidden; }
    .screenshot-card img { width: 100%; display: block; }
    .screenshot-label { padding: 8px 12px; font-size: 11px; color: var(--text-muted); }

    /* Color palette */
    .palette { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 40px; }
    .swatch { text-align: center; }
    .swatch-color { width: 80px; height: 80px; border-radius: 8px; margin-bottom: 8px; }
    .swatch-hex { font-size: 11px; font-family: monospace; color: var(--text-muted); }
    .swatch-name { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }

    /* Strategy palette */
    .strategy-palette { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .strategy-swatch { border-radius: 8px; overflow: hidden; }
    .strategy-swatch-color { height: 80px; }
    .strategy-swatch-info { padding: 12px; background: #f9f9f9; }
    .strategy-swatch-role { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
    .strategy-swatch-hex { font-family: monospace; font-size: 13px; font-weight: 500; }

    /* Competitors table */
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); padding: 8px 12px; border-bottom: 2px solid var(--border); }
    td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
    tr.client-row td { background: #f9f9f9; font-weight: 500; }
    .dr-badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; background: var(--text); color: #fff; }

    /* Personality tags */
    .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .tag { padding: 6px 14px; border-radius: 100px; font-size: 12px; border: 1px solid var(--border); }
    .tag-primary { background: var(--text); color: #fff; border-color: var(--text); }

    /* Keywords grid */
    .keywords-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .keyword-card { padding: 16px; background: #f5f5f5; border-radius: 8px; font-size: 14px; font-weight: 500; text-align: center; }

    /* Font specimens */
    .font-specimens { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .font-specimen { padding: 24px; background: #f9f9f9; border-radius: 8px; }
    .font-specimen-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 8px; }
    .font-specimen-name { font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    .font-specimen-sample { font-size: 32px; line-height: 1.2; }

    /* Recommendations */
    .recommendations { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .rec-card { padding: 20px; border: 1px solid var(--border); border-radius: 8px; }
    .rec-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 6px; }
    .rec-value { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
    .rec-rationale { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

    /* Brief box */
    .brief-box { padding: 24px; background: #f9f9f9; border-left: 3px solid var(--text); border-radius: 0 8px 8px 0; font-style: italic; line-height: 1.7; }

    /* SEO/WCAG */
    .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .score-box { padding: 20px 24px; background: #f9f9f9; border-radius: 8px; }
    .score-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); margin-bottom: 6px; }
    .score-value { font-family: 'Playfair Display', serif; font-size: 48px; line-height: 1; font-weight: 400; }
    .score-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .issue-list { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px; }
    .issue-item { display: flex; gap: 10px; align-items: flex-start; }
    .issue-dot { margin-top: 5px; flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: #666; }
    .issue-dot.critical { background: #dc2626; }
    .issue-dot.opportunity { background: #b45309; }
    .wcag-issue { padding: 10px 14px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; }
    .wcag-issue.critical { border-color: #fca5a5; }
    .wcag-issue.major { border-color: #fcd34d; }
    .wcag-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; margin-bottom: 4px; }
    .wcag-badge.critical { background: #fee2e2; color: #dc2626; }
    .wcag-badge.major { background: #fef3c7; color: #92400e; }
    .wcag-badge.minor { background: #f3f4f6; color: #6b7280; }
    .keyword-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; }
    .keyword-pill { padding: 4px 12px; border: 1px solid var(--border); border-radius: 100px; font-size: 11px; }

    /* Print */
    @media print {
      .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .swatch-color, .strategy-swatch-color, .cover-color-strip span,
      .dr-badge, .tag-primary { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-label">${t.reportCoverLabel}</div>
  <div class="cover-title">${escapeHtml(projectName)}</div>
  ${scrapedSite ? `<div style="opacity:0.6;font-size:14px;margin-top:8px">${escapeHtml(scrapedSite.url)}</div>` : ''}
  <div style="opacity:0.6;font-size:14px;margin-top:24px;max-width:600px;line-height:1.6">${escapeHtml(synthesis.brandVoice)}</div>
  <div class="cover-date">${date}</div>
  <div class="cover-color-strip">
    <span style="background:${synthesis.colorStrategy.primary}"></span>
    <span style="background:${synthesis.colorStrategy.accent}"></span>
    <span style="background:${synthesis.colorStrategy.neutral}"></span>
    <span style="background:${synthesis.colorStrategy.background}"></span>
  </div>
</div>

<div class="page">

  <!-- SECTION 1: Brief -->
  <div class="section">
    <div class="section-label">01</div>
    <div class="section-title">${t.sectionBrief}</div>
    <div class="brief-box">${escapeHtml(brief || t.briefFallback)}</div>

    <div style="margin-top:32px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:12px">${t.targetAudienceLabel}</div>
      <div style="font-size:15px">${escapeHtml(synthesis.targetAudience)}</div>
    </div>

    <div style="margin-top:24px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:12px">${t.brandPersonalityLabel}</div>
      <div class="tags">
        ${synthesis.brandPersonality.map((p, i) => `<span class="tag ${i === 0 ? 'tag-primary' : ''}">${escapeHtml(p)}</span>`).join('')}
      </div>
    </div>
  </div>

  ${scrapedSite ? `
  <!-- SECTION 2: Website Analysis -->
  <div class="section">
    <div class="section-label">02</div>
    <div class="section-title">${t.sectionWebsite}</div>

    <div class="screenshots">
      <div class="screenshot-card">
        <img src="data:image/png;base64,${scrapedSite.screenshots.aboveFold}" alt="${t.websiteFirstViewAlt}">
        <div class="screenshot-label">${t.websiteFirstViewCaption}</div>
      </div>
      <div>
        <div style="font-size:13px;color:#666;line-height:1.7;margin-bottom:16px">${escapeHtml(scrapedSite.description || '—')}</div>
        <div style="font-size:12px;color:#999">${t.websiteFontsLabel}</div>
        ${scrapedSite.fonts.map((f) => `
          <div style="margin-top:8px;padding:8px 12px;background:#f5f5f5;border-radius:6px">
            <div style="font-weight:600;font-size:13px">${escapeHtml(f.family)}</div>
            <div style="font-size:11px;color:#999">${f.source} · ${f.usedOn.join(', ')}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="margin-bottom:16px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666">${t.websiteCurrentPaletteLabel}</div>
    <div class="palette">
      ${scrapedSite.colors.slice(0, 6).map((c) => `
        <div class="swatch">
          <div class="swatch-color" style="background:${c.hex}"></div>
          <div class="swatch-hex">${c.hex}</div>
          <div class="swatch-name">${c.name}</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <!-- SECTION 3: Competitors -->
  ${competitors.length > 1 ? `
  <div class="section">
    <div class="section-label">${scrapedSite ? '03' : '02'}</div>
    <div class="section-title">${t.sectionCompetitors}</div>

    <table>
      <thead>
        <tr>
          <th>${t.competitorsDomainHeader}</th>
          <th>${t.competitorsDrHeader}</th>
          <th>${t.competitorsTrafficHeader}</th>
          <th>${t.competitorsTypeHeader}</th>
        </tr>
      </thead>
      <tbody>
        ${competitors.map((c) => `
          <tr class="${c.isLocal ? 'client-row' : ''}">
            <td>${escapeHtml(c.domain)}</td>
            <td><span class="dr-badge">${c.domainRating ?? '—'}</span></td>
            <td>${c.organicTraffic != null ? c.organicTraffic.toLocaleString(t.numberLocale) : '—'}</td>
            <td style="font-size:11px;color:#999">${c.isLocal ? t.competitorsClientLabel : t.competitorsCompetitorLabel}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${synthesis.competitorGaps.length > 0 ? `
    <div style="margin-top:32px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:16px">${t.competitorsGapsLabel}</div>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:10px">
        ${synthesis.competitorGaps.map((gap) => `
          <li style="display:flex;gap:10px;align-items:flex-start">
            <span style="margin-top:2px;flex-shrink:0;width:6px;height:6px;background:var(--text);border-radius:50%"></span>
            <span style="font-size:13px">${escapeHtml(gap)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}
  </div>
  ` : ''}

  <!-- SECTION 4: Brand Strategy -->
  <div class="section">
    <div class="section-label">${scrapedSite ? (competitors.length > 1 ? '04' : '03') : (competitors.length > 1 ? '03' : '02')}</div>
    <div class="section-title">${t.sectionStrategy}</div>

    <div style="font-size:15px;line-height:1.8;max-width:720px;margin-bottom:40px">${escapeHtml(synthesis.visualDirection)}</div>

    <div style="margin-bottom:16px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666">${t.strategyPaletteLabel}</div>
    <div class="strategy-palette">
      ${[
        { role: t.strategyColorPrimary, hex: synthesis.colorStrategy.primary },
        { role: t.strategyColorAccent, hex: synthesis.colorStrategy.accent },
        { role: t.strategyColorNeutral, hex: synthesis.colorStrategy.neutral },
        { role: t.strategyColorBackground, hex: synthesis.colorStrategy.background }
      ].map((s) => `
        <div class="strategy-swatch">
          <div class="strategy-swatch-color" style="background:${s.hex}"></div>
          <div class="strategy-swatch-info">
            <div class="strategy-swatch-role">${s.role}</div>
            <div class="strategy-swatch-hex">${s.hex}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="font-size:12px;color:#666;line-height:1.6;max-width:600px;margin-bottom:40px">${escapeHtml(synthesis.colorStrategy.rationale)}</div>

    <div style="margin-bottom:16px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666">${t.strategyTypographyLabel}</div>
    <div class="font-specimens" style="margin-bottom:40px">
      <div class="font-specimen">
        <div class="font-specimen-label">${t.strategyHeadingFontLabel}</div>
        <div class="font-specimen-name">${escapeHtml(synthesis.suggestedFonts.heading)}</div>
        <div class="font-specimen-sample" style="font-family:'${escapeHtml(synthesis.suggestedFonts.heading)}',serif">
          Aa Bb Cc
        </div>
      </div>
      <div class="font-specimen">
        <div class="font-specimen-label">${t.strategyBodyFontLabel}</div>
        <div class="font-specimen-name">${escapeHtml(synthesis.suggestedFonts.body)}</div>
        <div class="font-specimen-sample" style="font-family:'${escapeHtml(synthesis.suggestedFonts.body)}',sans-serif">
          Aa Bb Cc
        </div>
      </div>
    </div>
    <div style="font-size:13px;color:#666;line-height:1.7;max-width:600px;margin-bottom:40px">${escapeHtml(synthesis.typographyRationale)}</div>
  </div>

  <!-- SECTION 5: Moodboard Direction -->
  <div class="section">
    <div class="section-label">Moodboard</div>
    <div class="section-title">${t.moodboardKeywordsTitle}</div>

    <div class="keywords-grid" style="margin-bottom:40px">
      ${synthesis.moodboardKeywords.map((kw) => `<div class="keyword-card">${escapeHtml(kw)}</div>`).join('')}
    </div>

    <div style="margin-bottom:24px;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#666">${t.moodboardRecommendationsLabel}</div>
    <div class="recommendations">
      ${synthesis.styleRecommendations.map((rec) => `
        <div class="rec-card">
          <div class="rec-type">${escapeHtml(rec.type)}</div>
          <div class="rec-value">${escapeHtml(rec.value)}</div>
          <div class="rec-rationale">${escapeHtml(rec.rationale)}</div>
        </div>
      `).join('')}
    </div>
  </div>

  ${seoWcag ? `
  <!-- SECTION 6: SEO & WCAG -->
  <div class="section">
    <div class="section-label">SEO &amp; WCAG</div>
    <div class="section-title">${t.sectionSeoWcag}</div>

    <div class="score-grid">
      <div class="score-box">
        <div class="score-label">${t.seoScoreLabel}</div>
        <div class="score-value" style="color:${seoWcag.seo.score >= 80 ? '#16a34a' : seoWcag.seo.score >= 50 ? '#d97706' : '#dc2626'}">${seoWcag.seo.score}</div>
        <div class="score-sub">/ 100</div>
      </div>
      <div class="score-box">
        <div class="score-label">${t.wcagScoreLabel}</div>
        <div class="score-value" style="color:${seoWcag.wcag.score >= 80 ? '#16a34a' : seoWcag.wcag.score >= 50 ? '#d97706' : '#dc2626'}">${seoWcag.wcag.score}</div>
        <div class="score-sub">/ 100 · ${t.wcagLevelLabel} ${escapeHtml(seoWcag.wcag.level)}</div>
      </div>
    </div>

    <p style="font-size:14px;line-height:1.7;max-width:720px;margin-bottom:32px">${escapeHtml(seoWcag.summary)}</p>

    ${seoWcag.seo.technicalIssues.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:10px">${t.seoTechnicalIssuesLabel}</div>
      <ul class="issue-list">
        ${seoWcag.seo.technicalIssues.map((issue) => `
          <li class="issue-item">
            <span class="issue-dot critical"></span>
            <span style="font-size:13px">${escapeHtml(issue)}</span>
          </li>
        `).join('')}
      </ul>
    </div>` : ''}

    ${seoWcag.seo.opportunities.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:10px">${t.seoOpportunitiesLabel}</div>
      <ul class="issue-list">
        ${seoWcag.seo.opportunities.map((opp) => `
          <li class="issue-item">
            <span class="issue-dot opportunity"></span>
            <span style="font-size:13px">${escapeHtml(opp)}</span>
          </li>
        `).join('')}
      </ul>
    </div>` : ''}

    ${seoWcag.wcag.issues.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:10px">${t.wcagIssuesLabel}</div>
      ${seoWcag.wcag.issues.map((issue) => `
        <div class="wcag-issue ${issue.severity}">
          <span class="wcag-badge ${issue.severity}">${issue.severity}</span>
          <span style="font-size:10px;color:#666;margin-left:6px">${escapeHtml(issue.criterion)}</span>
          <div style="font-size:12px;color:#444;margin-top:4px;line-height:1.5">${escapeHtml(issue.description)}</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${seoWcag.seo.keywords.length > 0 ? `
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:10px">${t.seoKeywordsLabel}</div>
      <div class="keyword-pills">
        ${seoWcag.seo.keywords.map((kw) => `<span class="keyword-pill">${escapeHtml(kw)}</span>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ` : ''}

</div>

</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
