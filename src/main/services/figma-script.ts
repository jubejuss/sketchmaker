import type { MoodboardData, DirectionSpec, SectionSpec, VisualElement, PageSection } from '../../shared/types.js'

const DEFAULT_SECTIONS: PageSection[] = ['header', 'hero', 'events', 'news', 'footer']
const SECTION_HEIGHT_FALLBACK: Record<string, number> = {
  header: 64, hero: 440, services: 320, events: 320, gallery: 340,
  news: 320, team: 320, testimonials: 240, cta: 200, contact: 260, footer: 80
}

export function buildFigmaScript(data: MoodboardData): string {
  const { synthesis, projectName } = data
  const specs = (synthesis.directionSpecs && synthesis.directionSpecs.length > 0)
    ? synthesis.directionSpecs.slice(0, 3)
    : buildFallbackSpecs(synthesis, data.sections ?? DEFAULT_SECTIONS)

  const padded = padToThree(specs, synthesis, data.sections ?? DEFAULT_SECTIONS)
  const fontReqs = collectFontRequests(padded)
  const canvasName = esc(projectName || 'Moodboard')

  const specsJson = JSON.stringify(padded)
  const fontReqsJson = JSON.stringify(fontReqs)

  const imageElementCount = countImageElements(padded)

  return `
const __SL_STATS = { imgResolved: 0, imgFailed: 0, imgMissingUrl: 0, imgTotal: ${imageElementCount} };
console.log('[stiilileidja] script start — directions:', ${padded.length}, 'imageElements:', ${imageElementCount});

async function main() {
  await figma.loadAllPagesAsync();
  let page = figma.root.children.find(p => p.name === "Style Sketches — ${canvasName}");
  if (!page) { page = figma.createPage(); page.name = "Style Sketches — ${canvasName}"; }
  await figma.setCurrentPageAsync(page);
  for (const c of [...page.children]) c.remove();

  // ── Font loading (deduped) ──────────────────────────────────────────────────
  const FONT_REQS = ${fontReqsJson};
  const frResults = await Promise.allSettled(FONT_REQS.map(f => figma.loadFontAsync(f)));
  const FONT_OK = {};
  FONT_REQS.forEach((f, i) => { if (frResults[i].status === 'fulfilled') FONT_OK[f.family + '|' + f.style] = f; });
  const FALLBACK_FONT = FONT_OK['Inter|Regular'] || { family: 'Inter', style: 'Regular' };
  function pickFont(family, weight) {
    if (!family) family = 'Inter';
    if (!weight) weight = 'Regular';
    if (FONT_OK[family + '|' + weight]) return FONT_OK[family + '|' + weight];
    for (const w of ['Bold', 'SemiBold', 'Medium', 'Regular']) {
      if (FONT_OK[family + '|' + w]) return FONT_OK[family + '|' + w];
    }
    for (const w of ['Medium', 'Regular', 'Bold']) {
      if (FONT_OK['Inter|' + w]) return FONT_OK['Inter|' + w];
    }
    return FALLBACK_FONT;
  }

  // ── Color + fill helpers ────────────────────────────────────────────────────
  function rgb(h) {
    if (!h || typeof h !== 'string' || h.length < 4) return { r: 0.5, g: 0.5, b: 0.5 };
    let s = h.trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length < 6) return { r: 0.5, g: 0.5, b: 0.5 };
    return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255 };
  }
  function solidFill(color, opacity) {
    const f = { type: 'SOLID', color: rgb(color) };
    if (opacity !== undefined && opacity !== null) f.opacity = Math.max(0, Math.min(1, opacity));
    return f;
  }
  function transformCase(str, mode) {
    if (!str || typeof str !== 'string') return str || '';
    if (mode === 'upper') return str.toUpperCase();
    if (mode === 'lower') return str.toLowerCase();
    if (mode === 'title') return str.replace(/\\w\\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
    return str;
  }

  // Image fills cannot be applied from this eval sandbox: createImageAsync
  // returns a hash but the bytes never reach Figma's document-level image
  // store, so rendering shows solid grey. Instead we collect nodeId + source
  // (an absolute temp-file path, see image-gen.ts) and return it to the main
  // process, which calls figma_set_image_fill. That MCP tool reads the file
  // in the bridge server and uploads the bytes through its own handler,
  // which runs in the main plugin context where images persist.
  const __SL_IMG_REQUESTS = [];

  // ── Element renderer (recursive for frames) ────────────────────────────────
  async function renderElement(parent, el, direction) {
    if (!el || !el.kind) return;
    try {
      if (el.kind === 'text') return renderText(parent, el, direction);
      if (el.kind === 'rect') return renderRect(parent, el);
      if (el.kind === 'ellipse') return renderEllipse(parent, el);
      if (el.kind === 'line') return renderLine(parent, el);
      if (el.kind === 'frame') return await renderFrame(parent, el, direction);
      if (el.kind === 'image') return await renderImage(parent, el);
    } catch (e) {
      console.warn('renderElement', el.kind, 'failed:', e && e.message);
    }
  }

  function renderText(parent, el, direction) {
    const t = figma.createText();
    const family = el.fontFamily || direction.fonts.body || 'Inter';
    const weight = el.fontWeight || 'Regular';
    const font = pickFont(family, weight);
    t.fontName = font;
    t.characters = transformCase(el.text || '', el.textCase);
    t.fontSize = el.fontSize || 16;
    if (el.letterSpacing !== undefined) t.letterSpacing = { value: el.letterSpacing, unit: 'PERCENT' };
    if (el.lineHeight !== undefined) t.lineHeight = { value: el.lineHeight * 100, unit: 'PERCENT' };
    t.x = el.x || 0;
    t.y = el.y || 0;
    if (el.color) t.fills = [solidFill(el.color, el.opacity)];
    if (el.w) { t.resize(el.w, Math.max(el.fontSize * 1.2, 16)); t.textAutoResize = 'HEIGHT'; }
    if (el.rotation) t.rotation = el.rotation;
    parent.appendChild(t);
    return t;
  }

  function renderRect(parent, el) {
    const r = figma.createRectangle();
    r.resize(Math.max(el.w || 1, 1), Math.max(el.h || 1, 1));
    r.x = el.x || 0;
    r.y = el.y || 0;
    if (el.color) r.fills = [solidFill(el.color, el.opacity)];
    else r.fills = [];
    if (el.cornerRadius) r.cornerRadius = el.cornerRadius;
    if (el.strokeColor) { r.strokes = [solidFill(el.strokeColor, 1)]; r.strokeWeight = el.strokeWeight || 1; }
    if (el.rotation) r.rotation = el.rotation;
    parent.appendChild(r);
    return r;
  }

  function renderEllipse(parent, el) {
    const e = figma.createEllipse();
    e.resize(Math.max(el.w || 1, 1), Math.max(el.h || 1, 1));
    e.x = el.x || 0;
    e.y = el.y || 0;
    if (el.color) e.fills = [solidFill(el.color, el.opacity)];
    else e.fills = [];
    if (el.strokeColor) { e.strokes = [solidFill(el.strokeColor, 1)]; e.strokeWeight = el.strokeWeight || 1; }
    if (el.rotation) e.rotation = el.rotation;
    parent.appendChild(e);
    return e;
  }

  function renderLine(parent, el) {
    const ln = figma.createLine();
    const x1 = el.x || 0, y1 = el.y || 0, x2 = el.x2 || x1, y2 = el.y2 || y1;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    ln.resize(Math.max(len, 1), 0);
    ln.x = x1;
    ln.y = y1;
    if (el.color) ln.strokes = [solidFill(el.color, el.opacity)];
    ln.strokeWeight = el.strokeWeight || 1;
    if (len > 0) ln.rotation = -Math.atan2(dy, dx) * 180 / Math.PI;
    parent.appendChild(ln);
    return ln;
  }

  async function renderFrame(parent, el, direction) {
    const fr = figma.createFrame();
    fr.resize(Math.max(el.w || 1, 1), Math.max(el.h || 1, 1));
    fr.x = el.x || 0;
    fr.y = el.y || 0;
    if (el.color) fr.fills = [solidFill(el.color, el.opacity)];
    else fr.fills = [];
    if (el.cornerRadius) fr.cornerRadius = el.cornerRadius;
    if (el.strokeColor) { fr.strokes = [solidFill(el.strokeColor, 1)]; fr.strokeWeight = el.strokeWeight || 1; }
    if (el.clipsContent !== undefined) fr.clipsContent = !!el.clipsContent;
    if (el.rotation) fr.rotation = el.rotation;
    parent.appendChild(fr);
    if (Array.isArray(el.children)) {
      for (const child of el.children) await renderElement(fr, child, direction);
    }
    return fr;
  }

  async function renderImage(parent, el) {
    const r = figma.createRectangle();
    r.resize(Math.max(el.w || 1, 1), Math.max(el.h || 1, 1));
    r.x = el.x || 0;
    r.y = el.y || 0;
    if (el.cornerRadius) r.cornerRadius = el.cornerRadius;
    if (el.rotation) r.rotation = el.rotation;
    parent.appendChild(r);

    // Always start with a tinted placeholder fill; if imageUrl is present,
    // record a request for the main process to overwrite it via the native
    // figma_set_image_fill MCP tool after this script returns.
    r.fills = [solidFill('#C7C2BA', 1)];

    if (el.imageUrl) {
      __SL_IMG_REQUESTS.push({ nodeId: r.id, url: el.imageUrl });
      __SL_STATS.imgResolved++;
      return r;
    }

    __SL_STATS.imgMissingUrl++;
    if (el.imagePrompt) {
      try {
        const cap = figma.createText();
        cap.fontName = FALLBACK_FONT;
        cap.characters = 'IMAGE · ' + String(el.imagePrompt).slice(0, 80);
        cap.fontSize = 10;
        cap.fills = [solidFill('#1A1A1A', 0.55)];
        cap.x = r.x + 8;
        cap.y = r.y + 8;
        cap.resize(Math.max((el.w || 100) - 16, 20), 40);
        cap.textAutoResize = 'HEIGHT';
        parent.appendChild(cap);
      } catch (e) { /* ignore caption failure */ }
    }
    return r;
  }

  // ── Canvas layout ───────────────────────────────────────────────────────────
  const DIRECTIONS = ${specsJson};
  const FW = 1440, GAP = 80, M = 60;
  const heights = DIRECTIONS.map(d => d.sections.reduce((acc, s) => acc + (s.height || 300), 0));
  const FH = Math.max.apply(null, heights);
  const CW = M * 2 + FW * 3 + GAP * 2;
  const CH = FH + 160;

  const canvas = figma.createFrame();
  canvas.name = 'Style Sketches';
  canvas.resize(CW, CH);
  canvas.fills = [solidFill('#E8E5DF', 1)];
  page.appendChild(canvas);

  const titleFont = pickFont('Inter', 'Medium');
  try {
    const title = figma.createText();
    title.fontName = titleFont;
    title.characters = ('STYLE SKETCHES — ' + '${canvasName}').toUpperCase();
    title.fontSize = 11;
    title.fills = [solidFill('#1A1A2E', 0.35)];
    title.x = M;
    title.y = 36;
    canvas.appendChild(title);
  } catch (e) { /* ignore title failure */ }

  for (let di = 0; di < DIRECTIONS.length && di < 3; di++) {
    const direction = DIRECTIONS[di];
    const fx = M + di * (FW + GAP);
    const column = figma.createFrame();
    column.resize(FW, FH);
    column.x = fx;
    column.y = 76;
    column.cornerRadius = 10;
    column.clipsContent = true;
    column.name = direction.title || ('Direction ' + (di + 1));
    const bgColor = (direction.palette && direction.palette[direction.palette.length - 1]) || '#F4F1EA';
    column.fills = [solidFill(bgColor, 1)];
    canvas.appendChild(column);

    let yCursor = 0;
    for (const section of direction.sections) {
      const sectionFrame = figma.createFrame();
      sectionFrame.resize(FW, section.height || 300);
      sectionFrame.x = 0;
      sectionFrame.y = yCursor;
      sectionFrame.fills = [];
      sectionFrame.clipsContent = true;
      sectionFrame.name = section.type;
      column.appendChild(sectionFrame);
      if (Array.isArray(section.elements)) {
        for (const el of section.elements) await renderElement(sectionFrame, el, direction);
      }
      yCursor += section.height || 300;
    }

    // Direction label beneath column
    try {
      const lbl = figma.createText();
      lbl.fontName = titleFont;
      lbl.characters = direction.title || ('Direction ' + (di + 1));
      lbl.fontSize = 13;
      lbl.fills = [solidFill('#1A1A2E', 0.55)];
      lbl.x = fx;
      lbl.y = 76 + FH + 16;
      lbl.resize(FW, 18);
      lbl.textAutoResize = 'HEIGHT';
      canvas.appendChild(lbl);
      if (direction.concept) {
        const sub = figma.createText();
        sub.fontName = FALLBACK_FONT;
        sub.characters = direction.concept;
        sub.fontSize = 11;
        sub.fills = [solidFill('#1A1A2E', 0.4)];
        sub.x = fx;
        sub.y = 76 + FH + 40;
        sub.resize(FW, 14);
        sub.textAutoResize = 'HEIGHT';
        canvas.appendChild(sub);
      }
    } catch (e) { /* ignore label failure */ }
  }

  figma.viewport.scrollAndZoomIntoView([canvas]);
  console.log('[stiilileidja] done. images:', __SL_STATS, 'pending fills:', __SL_IMG_REQUESTS.length);
  return { stats: __SL_STATS, imgRequests: __SL_IMG_REQUESTS };
}

return await main();
`.trim()
}

function countImageElements(specs: DirectionSpec[]): number {
  let n = 0
  const walk = (els: VisualElement[] | undefined): void => {
    if (!els) return
    for (const el of els) {
      if (el.kind === 'image') n++
      if (el.children) walk(el.children)
    }
  }
  for (const d of specs) for (const s of d.sections ?? []) walk(s.elements)
  return n
}

// ── TypeScript-side helpers ──────────────────────────────────────────────────

function esc(str: string): string {
  return (str || '').replace(/`/g, "'").replace(/\$\{/g, '\\${').replace(/\\/g, '/').replace(/\n/g, ' ')
}

function padToThree(specs: DirectionSpec[], synthesis: MoodboardData['synthesis'], sections: PageSection[]): DirectionSpec[] {
  const out = specs.slice(0, 3)
  while (out.length < 3) out.push(buildFallbackSpec(out.length, synthesis, sections))
  return out
}

function buildFallbackSpecs(synthesis: MoodboardData['synthesis'], sections: PageSection[]): DirectionSpec[] {
  return [0, 1, 2].map((i) => buildFallbackSpec(i, synthesis, sections))
}

function buildFallbackSpec(index: number, synthesis: MoodboardData['synthesis'], sections: PageSection[]): DirectionSpec {
  const { colorStrategy, suggestedFonts } = synthesis
  const palette = [colorStrategy.primary, colorStrategy.accent, colorStrategy.neutral, colorStrategy.background]
  return {
    title: `Suund ${index + 1}: Fallback`,
    concept: 'Fallback direction — Claude output missing or malformed.',
    palette,
    fonts: { heading: suggestedFonts.heading, headingWeight: 'Bold', body: suggestedFonts.body },
    mood: ['fallback'],
    sections: sections.map((sid) => ({
      type: sid,
      height: SECTION_HEIGHT_FALLBACK[sid] ?? 300,
      elements: [
        {
          kind: 'text' as const,
          x: 48,
          y: 24,
          text: sid.toUpperCase(),
          fontFamily: suggestedFonts.heading,
          fontWeight: 'Bold' as const,
          fontSize: 24,
          color: palette[0]
        }
      ]
    }))
  }
}

function collectFontRequests(specs: DirectionSpec[]): Array<{ family: string; style: string }> {
  const seen = new Set<string>()
  const out: Array<{ family: string; style: string }> = []
  const push = (family: string | undefined, style: string) => {
    if (!family) return
    const key = `${family}|${style}`
    if (!seen.has(key)) { seen.add(key); out.push({ family, style }) }
  }
  for (const spec of specs) {
    const headingWeight = spec.fonts?.headingWeight || 'Bold'
    push(spec.fonts?.heading, headingWeight)
    push(spec.fonts?.heading, 'Regular')
    push(spec.fonts?.heading, 'Medium')
    push(spec.fonts?.heading, 'Bold')
    push(spec.fonts?.body, 'Regular')
    push(spec.fonts?.body, 'Medium')
    walkElements(spec.sections, (el) => {
      if (el.fontFamily) push(el.fontFamily, el.fontWeight || 'Regular')
    })
  }
  for (const w of ['Regular', 'Medium', 'SemiBold', 'Bold', 'Black']) push('Inter', w)
  return out
}

function walkElements(sections: SectionSpec[], fn: (el: VisualElement) => void): void {
  const walk = (el: VisualElement): void => {
    fn(el)
    if (el.children) for (const child of el.children) walk(child)
  }
  for (const section of sections) {
    if (Array.isArray(section.elements)) for (const el of section.elements) walk(el)
  }
}
