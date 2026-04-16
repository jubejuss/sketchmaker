import type { MoodboardData, OutputMode } from '../../shared/types.js'

export interface GeneratedPrompt {
  mode: OutputMode
  title: string
  description: string
  prompt: string
  toolCalls?: Array<{ tool: string; params: Record<string, unknown> }>
}

export function buildPrompt(data: MoodboardData, mode: OutputMode): GeneratedPrompt {
  const { synthesis, projectName } = data
  const colors = synthesis.colorStrategy

  if (mode === 'figma-prompt') {
    return buildFigmaPrompt(data)
  } else if (mode === 'paper-prompt') {
    return buildPaperPrompt(data)
  } else if (mode === 'figma-execute') {
    return buildFigmaExecute(data)
  } else {
    return buildPaperExecute(data)
  }
}

const SECTION_LABELS: Record<string, string> = {
  header: 'Header (logo + nav)',
  hero: 'Hero with CTA',
  services: 'Services / features',
  events: 'Events / calendar',
  gallery: 'Gallery',
  news: 'News / blog',
  team: 'Team / people',
  testimonials: 'Testimonials',
  cta: 'CTA banner',
  contact: 'Contact form',
  footer: 'Footer'
}

function buildFigmaPrompt(data: MoodboardData): GeneratedPrompt {
  const { synthesis, projectName, sections } = data
  const { colorStrategy, suggestedFonts, moodboardKeywords, styleRecommendations, brandPersonality } = synthesis
  const sectionList = (sections && sections.length > 0 ? sections : ['header', 'hero', 'events', 'news', 'footer'])
    .map((s) => `- ${SECTION_LABELS[s] ?? s}`)
    .join('\n')

  const prompt = `Create a moodboard/stylescape in Figma for "${projectName}".

## Brand Direction
${synthesis.visualDirection}

**Personality:** ${brandPersonality.join(' · ')}
**Brand Voice:** ${synthesis.brandVoice}

## Color Palette
- Primary: ${colorStrategy.primary}
- Accent: ${colorStrategy.accent}
- Neutral: ${colorStrategy.neutral}
- Background: ${colorStrategy.background}

${colorStrategy.rationale}

## Typography
- Heading font: ${suggestedFonts.heading}
- Body font: ${suggestedFonts.body}

${synthesis.typographyRationale}

## Moodboard Keywords
${moodboardKeywords.join(' · ')}

## Page Sections (build mockups with these, in this order)
${sectionList}

## Style Direction
${styleRecommendations.map((r) => `**${r.type}:** ${r.value} — ${r.rationale}`).join('\n')}

## Instructions for Figma
1. Create a new page called "Moodboard — ${projectName}"
2. Add a 1920×1080 frame as the canvas
3. Create color variable collection "Brand" with the palette above
4. Build a moodboard grid with:
   - Large color swatches for each brand color
   - Typography specimens showing heading and body fonts
   - A section for each style keyword with a representative color block
   - The visual direction text as a design statement
5. Use the color variables for all fills
6. Export as PNG at 2x resolution`

  return {
    mode: 'figma-prompt',
    title: `Figma Moodboard — ${projectName}`,
    description: 'Copy this prompt into Claude Code with Figma MCP active',
    prompt,
    toolCalls: buildFigmaToolCalls(data)
  }
}

function buildPaperPrompt(data: MoodboardData): GeneratedPrompt {
  const { synthesis, projectName } = data
  const { colorStrategy, suggestedFonts, moodboardKeywords, brandPersonality } = synthesis

  const moodboardHtml = buildMoodboardHtml(data)

  const prompt = `Create a moodboard artboard in Paper/Pencil for "${projectName}".

Use the Paper MCP tools in this sequence:
1. get_basic_info — understand canvas
2. create_artboard with name "Moodboard — ${projectName}", width: 1440, height: 900
3. write_html with the following HTML content:

---
${moodboardHtml}
---

4. get_screenshot — verify the result
5. finish_working_on_nodes`

  return {
    mode: 'paper-prompt',
    title: `Paper Moodboard — ${projectName}`,
    description: 'Copy this prompt into Claude Code with Paper MCP active',
    prompt
  }
}

function buildFigmaExecute(data: MoodboardData): GeneratedPrompt {
  return {
    ...buildFigmaPrompt(data),
    mode: 'figma-execute',
    description: 'Executing directly via Figma MCP'
  }
}

function buildPaperExecute(data: MoodboardData): GeneratedPrompt {
  return {
    ...buildPaperPrompt(data),
    mode: 'paper-execute',
    description: 'Executing directly via Paper MCP'
  }
}

function buildFigmaToolCalls(data: MoodboardData): Array<{ tool: string; params: Record<string, unknown> }> {
  const { synthesis, projectName } = data
  const { colorStrategy, suggestedFonts, moodboardKeywords } = synthesis

  return [
    {
      tool: 'figma_batch_create_variables',
      params: {
        collection_name: 'Brand',
        variables: [
          { name: 'color/primary', type: 'COLOR', value: colorStrategy.primary },
          { name: 'color/accent', type: 'COLOR', value: colorStrategy.accent },
          { name: 'color/neutral', type: 'COLOR', value: colorStrategy.neutral },
          { name: 'color/background', type: 'COLOR', value: colorStrategy.background }
        ]
      }
    },
    {
      tool: 'figma_execute',
      params: {
        code: buildFigmaScript(data)
      }
    }
  ]
}

function buildFigmaScript(data: MoodboardData): string {
  const { synthesis, projectName } = data
  const { colorStrategy, moodboardKeywords, brandPersonality, suggestedFonts } = synthesis

  return `
// Create moodboard page
const page = figma.createPage();
page.name = "Moodboard — ${projectName.replace(/"/g, '\\"')}";
figma.currentPage = page;

// Main canvas frame
const canvas = figma.createFrame();
canvas.name = "Moodboard";
canvas.resize(1920, 1080);
canvas.fills = [{ type: 'SOLID', color: hexToRgb("${colorStrategy.background}") }];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return { r, g, b };
}

// Left panel — color palette
const palette = ["${colorStrategy.primary}","${colorStrategy.accent}","${colorStrategy.neutral}","${colorStrategy.background}"];
const roles = ["Primary","Accent","Neutral","Background"];
palette.forEach((hex, i) => {
  const swatch = figma.createFrame();
  swatch.resize(200, 200);
  swatch.x = 60 + (i * 220);
  swatch.y = 60;
  swatch.fills = [{ type: 'SOLID', color: hexToRgb(hex) }];
  swatch.cornerRadius = 12;
  canvas.appendChild(swatch);
});

// Brand direction text
const title = figma.createText();
await figma.loadFontAsync({ family: "${suggestedFonts.heading}", style: "Regular" });
title.fontName = { family: "${suggestedFonts.heading}", style: "Regular" };
title.characters = "${synthesis.visualDirection.slice(0, 80).replace(/"/g, '\\"')}";
title.fontSize = 24;
title.x = 60;
title.y = 300;
title.fills = [{ type: 'SOLID', color: hexToRgb("${colorStrategy.primary}") }];
canvas.appendChild(title);

// Keywords
const keywords = ${JSON.stringify(moodboardKeywords)};
keywords.forEach((kw, i) => {
  const kwFrame = figma.createFrame();
  kwFrame.resize(180, 60);
  kwFrame.x = 60 + (i % 3) * 200;
  kwFrame.y = 400 + Math.floor(i / 3) * 80;
  kwFrame.fills = [{ type: 'SOLID', color: hexToRgb(i % 2 === 0 ? "${colorStrategy.primary}" : "${colorStrategy.accent}"), opacity: 0.1 }];
  kwFrame.cornerRadius = 8;
  canvas.appendChild(kwFrame);
});
`.trim()
}

export function buildMoodboardHtml(data: MoodboardData): string {
  const { synthesis, projectName } = data
  const { colorStrategy, suggestedFonts, moodboardKeywords, brandPersonality, styleRecommendations } = synthesis

  return `<div style="
  width: 1440px;
  height: 900px;
  background: ${colorStrategy.background};
  font-family: '${suggestedFonts.body}', sans-serif;
  display: grid;
  grid-template-columns: 380px 1fr;
  grid-template-rows: 1fr;
  overflow: hidden;
">
  <!-- Left panel -->
  <div style="
    background: ${colorStrategy.primary};
    padding: 60px 48px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  ">
    <div>
      <div style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: ${colorStrategy.accent}; margin-bottom: 24px;">
        Stylescape
      </div>
      <div style="
        font-family: '${suggestedFonts.heading}', serif;
        font-size: 42px;
        line-height: 1.1;
        color: ${colorStrategy.background};
        margin-bottom: 32px;
      ">${escapeHtml(projectName)}</div>
      <div style="font-size: 13px; color: ${colorStrategy.neutral}; line-height: 1.7; opacity: 0.8;">
        ${escapeHtml(synthesis.visualDirection.slice(0, 120))}
      </div>
    </div>
    <div>
      <div style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: ${colorStrategy.neutral}; opacity: 0.6; margin-bottom: 16px;">
        Brand Palette
      </div>
      <div style="display: flex; gap: 12px;">
        ${[colorStrategy.primary, colorStrategy.accent, colorStrategy.neutral, colorStrategy.background].map((hex) =>
          `<div style="width: 40px; height: 40px; border-radius: 8px; background: ${hex}; border: 1px solid rgba(255,255,255,0.2)"></div>`
        ).join('')}
      </div>
    </div>
  </div>

  <!-- Right panel -->
  <div style="padding: 60px 48px; display: flex; flex-direction: column; gap: 32px;">
    <!-- Keywords -->
    <div>
      <div style="font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${colorStrategy.neutral}; margin-bottom: 16px;">
        Mood Keywords
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${moodboardKeywords.map((kw, i) => `
          <span style="
            padding: 8px 18px;
            border-radius: 100px;
            font-size: 13px;
            font-weight: 500;
            background: ${i % 2 === 0 ? colorStrategy.accent : colorStrategy.neutral};
            color: ${colorStrategy.background};
          ">${escapeHtml(kw)}</span>
        `).join('')}
      </div>
    </div>

    <!-- Typography specimen -->
    <div style="padding: 28px; background: ${colorStrategy.neutral}10; border-radius: 12px;">
      <div style="font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${colorStrategy.neutral}; margin-bottom: 20px;">Typography</div>
      <div style="font-family: '${suggestedFonts.heading}', serif; font-size: 40px; line-height: 1.1; color: ${colorStrategy.primary}; margin-bottom: 12px;">
        ${escapeHtml(suggestedFonts.heading)}
      </div>
      <div style="font-family: '${suggestedFonts.body}', sans-serif; font-size: 14px; color: ${colorStrategy.neutral}; line-height: 1.7;">
        ${escapeHtml(suggestedFonts.body)} — ${escapeHtml(synthesis.typographyRationale.slice(0, 80))}
      </div>
    </div>

    <!-- Personality -->
    <div>
      <div style="font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${colorStrategy.neutral}; margin-bottom: 12px;">Brand Personality</div>
      <div style="display: flex; gap: 10px;">
        ${brandPersonality.slice(0, 3).map((p, i) => `
          <div style="
            flex: 1;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid ${colorStrategy.neutral}30;
            font-size: 14px;
            font-weight: 600;
            color: ${colorStrategy.primary};
          ">${escapeHtml(p)}</div>
        `).join('')}
      </div>
    </div>
  </div>
</div>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
