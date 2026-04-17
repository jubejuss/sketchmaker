import type { OutputLanguage } from './types.js'

interface OutputStrings {
  // Report cover + meta
  reportCoverLabel: string
  reportProjectFallback: string
  dateLocale: string
  numberLocale: string
  htmlLangAttr: string

  // Report sections
  sectionBrief: string
  sectionWebsite: string
  sectionCompetitors: string
  sectionStrategy: string
  sectionMoodboard: string
  sectionSeoWcag: string

  // Brief section
  briefFallback: string
  targetAudienceLabel: string
  brandPersonalityLabel: string

  // Website section
  websiteFirstViewAlt: string
  websiteFirstViewCaption: string
  websiteFontsLabel: string
  websiteCurrentPaletteLabel: string

  // Competitors section
  competitorsDomainHeader: string
  competitorsDrHeader: string
  competitorsTrafficHeader: string
  competitorsTypeHeader: string
  competitorsClientLabel: string
  competitorsCompetitorLabel: string
  competitorsGapsLabel: string

  // Strategy section
  strategyPaletteLabel: string
  strategyColorPrimary: string
  strategyColorAccent: string
  strategyColorNeutral: string
  strategyColorBackground: string
  strategyTypographyLabel: string
  strategyHeadingFontLabel: string
  strategyBodyFontLabel: string

  // Moodboard section (in report)
  moodboardKeywordsTitle: string
  moodboardRecommendationsLabel: string

  // SEO/WCAG section
  seoWcagTitle: string
  seoScoreLabel: string
  wcagScoreLabel: string
  wcagLevelLabel: string
  seoTechnicalIssuesLabel: string
  seoOpportunitiesLabel: string
  wcagIssuesLabel: string
  seoKeywordsLabel: string

  // Moodboard HTML (prompt-builder)
  moodboardStylescapeLabel: string
  moodboardBrandPaletteLabel: string
  moodboardMoodKeywordsLabel: string
  moodboardTypographyLabel: string
  moodboardBrandPersonalityLabel: string

  // Figma script labels
  figmaStyleSketchesPageName: (projectName: string) => string
  figmaStyleSketchesLabel: string
  figmaStyleSketchesCanvasTitle: string
  figmaDirectionLabel: string
}

const ET: OutputStrings = {
  reportCoverLabel: 'Stiilileidja · Brändianalüüs',
  reportProjectFallback: 'Projekt',
  dateLocale: 'et-EE',
  numberLocale: 'et-EE',
  htmlLangAttr: 'et',

  sectionBrief: 'Lähteülesanne',
  sectionWebsite: 'Veebisaidi analüüs',
  sectionCompetitors: 'Konkurentsiolukord',
  sectionStrategy: 'Visuaalne strateegia',
  sectionMoodboard: 'Stiilimärgid',
  sectionSeoWcag: 'Otsimootorite optimeerimine ja ligipääsetavus',

  briefFallback: 'Lähteülesanne puudub.',
  targetAudienceLabel: 'Sihtgrupp',
  brandPersonalityLabel: 'Brändi iseloom',

  websiteFirstViewAlt: 'Veebisait — esimene vaade',
  websiteFirstViewCaption: 'Esimene vaade (1440×900)',
  websiteFontsLabel: 'Hetkel kasutusel olevad fondid:',
  websiteCurrentPaletteLabel: 'Praegune värvipalett (ekraanipildi analüüs)',

  competitorsDomainHeader: 'Domeen',
  competitorsDrHeader: 'DR',
  competitorsTrafficHeader: 'Orgaaniline liiklus/kuu',
  competitorsTypeHeader: 'Tüüp',
  competitorsClientLabel: 'Klient',
  competitorsCompetitorLabel: 'Konkurent',
  competitorsGapsLabel: 'Võimalused turul',

  strategyPaletteLabel: 'Soovituslik värvipalett',
  strategyColorPrimary: 'Põhivärv',
  strategyColorAccent: 'Aktsent',
  strategyColorNeutral: 'Neutraalne',
  strategyColorBackground: 'Taust',
  strategyTypographyLabel: 'Tüpograafia',
  strategyHeadingFontLabel: 'Pealkirjafont',
  strategyBodyFontLabel: 'Tekstifont',

  moodboardKeywordsTitle: 'Stiilimärgid',
  moodboardRecommendationsLabel: 'Disainisoovitused',

  seoWcagTitle: 'Otsimootorite optimeerimine ja ligipääsetavus',
  seoScoreLabel: 'SEO skoor',
  wcagScoreLabel: 'WCAG skoor',
  wcagLevelLabel: 'Tase',
  seoTechnicalIssuesLabel: 'SEO tehnilised probleemid',
  seoOpportunitiesLabel: 'SEO võimalused',
  wcagIssuesLabel: 'WCAG probleemid',
  seoKeywordsLabel: 'Märksõnad',

  moodboardStylescapeLabel: 'Stiilikaart',
  moodboardBrandPaletteLabel: 'Brändi palett',
  moodboardMoodKeywordsLabel: 'Meeleolu märksõnad',
  moodboardTypographyLabel: 'Tüpograafia',
  moodboardBrandPersonalityLabel: 'Brändi iseloom',

  figmaStyleSketchesPageName: (projectName: string) => `Stiilivisandid — ${projectName}`,
  figmaStyleSketchesLabel: 'Stiilivisandid',
  figmaStyleSketchesCanvasTitle: 'STIILIVISANDID — ',
  figmaDirectionLabel: 'Suund'
}

const EN: OutputStrings = {
  reportCoverLabel: 'Stiilileidja · Brand Analysis',
  reportProjectFallback: 'Project',
  dateLocale: 'en-GB',
  numberLocale: 'en-GB',
  htmlLangAttr: 'en',

  sectionBrief: 'Brief',
  sectionWebsite: 'Website analysis',
  sectionCompetitors: 'Competitive landscape',
  sectionStrategy: 'Visual strategy',
  sectionMoodboard: 'Mood cues',
  sectionSeoWcag: 'Search optimisation & accessibility',

  briefFallback: 'No brief provided.',
  targetAudienceLabel: 'Target audience',
  brandPersonalityLabel: 'Brand personality',

  websiteFirstViewAlt: 'Website — above the fold',
  websiteFirstViewCaption: 'Above the fold (1440×900)',
  websiteFontsLabel: 'Fonts currently in use:',
  websiteCurrentPaletteLabel: 'Current palette (screenshot analysis)',

  competitorsDomainHeader: 'Domain',
  competitorsDrHeader: 'DR',
  competitorsTrafficHeader: 'Organic traffic/mo',
  competitorsTypeHeader: 'Type',
  competitorsClientLabel: 'Client',
  competitorsCompetitorLabel: 'Competitor',
  competitorsGapsLabel: 'Market opportunities',

  strategyPaletteLabel: 'Recommended palette',
  strategyColorPrimary: 'Primary',
  strategyColorAccent: 'Accent',
  strategyColorNeutral: 'Neutral',
  strategyColorBackground: 'Background',
  strategyTypographyLabel: 'Typography',
  strategyHeadingFontLabel: 'Heading font',
  strategyBodyFontLabel: 'Body font',

  moodboardKeywordsTitle: 'Mood cues',
  moodboardRecommendationsLabel: 'Design recommendations',

  seoWcagTitle: 'Search optimisation & accessibility',
  seoScoreLabel: 'SEO score',
  wcagScoreLabel: 'WCAG score',
  wcagLevelLabel: 'Level',
  seoTechnicalIssuesLabel: 'SEO technical issues',
  seoOpportunitiesLabel: 'SEO opportunities',
  wcagIssuesLabel: 'WCAG issues',
  seoKeywordsLabel: 'Keywords',

  moodboardStylescapeLabel: 'Stylescape',
  moodboardBrandPaletteLabel: 'Brand palette',
  moodboardMoodKeywordsLabel: 'Mood keywords',
  moodboardTypographyLabel: 'Typography',
  moodboardBrandPersonalityLabel: 'Brand personality',

  figmaStyleSketchesPageName: (projectName: string) => `Style Sketches — ${projectName}`,
  figmaStyleSketchesLabel: 'Style Sketches',
  figmaStyleSketchesCanvasTitle: 'STYLE SKETCHES — ',
  figmaDirectionLabel: 'Direction'
}

const TABLE: Record<OutputLanguage, OutputStrings> = { et: ET, en: EN }

export function outputStrings(lang: OutputLanguage | undefined): OutputStrings {
  return TABLE[lang ?? 'et']
}

export const LANGUAGE_NAMES: Record<OutputLanguage, { et: string; en: string }> = {
  et: { et: 'Eesti', en: 'Estonian' },
  en: { et: 'Inglise', en: 'English' }
}
