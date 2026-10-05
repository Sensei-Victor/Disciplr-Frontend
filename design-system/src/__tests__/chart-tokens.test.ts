import {
  loadTokens,
  getAllTokens,
  isValidColorString,
  isValidColorToken,
  isValidChartTokens,
  isValidHexColor,
  isValidRgbColor,
  isValidHslColor,
  isKebabCase,
  hasValidTokenPrefix
} from '../index';

// Relative luminance calculation for contrast verification
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`Invalid hex color: ${hex}`);
  
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

describe('Chart Tokens Validation & Safety Suite', () => {
  let tokens: any;

  beforeAll(() => {
    tokens = loadTokens('colors.json');
  });

  test('should load colors.json tokens successfully', () => {
    expect(tokens).toBeDefined();
    expect(tokens.color).toBeDefined();
    expect(tokens.color.chart).toBeDefined();
  });

  test('should run token loaders and handle coverage', () => {
    const all = getAllTokens();
    expect(all).toBeDefined();
    expect(all.color).toBeDefined();
  });

  test('should validate structural integrity of chart tokens via isValidChartTokens', () => {
    expect(isValidChartTokens(tokens.color.chart)).toBe(true);
  });

  test('should fail validation on malformed chart token structures', () => {
    expect(isValidChartTokens(null)).toBe(false);
    expect(isValidChartTokens('not-an-object')).toBe(false);
    expect(isValidChartTokens({})).toBe(false);
    
    // Missing categorical ramp
    expect(isValidChartTokens({
      axis: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } },
      grid: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } },
      tooltipBg: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } },
      tooltipBorder: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } },
      tooltipText: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } },
      tooltipLabel: { light: { $type: 'color', $value: '#000000' }, dark: { $type: 'color', $value: '#ffffff' } }
    })).toBe(false);

    // Invalid surface key value type
    expect(isValidChartTokens({
      axis: 'not-object',
      grid: {}, tooltipBg: {}, tooltipBorder: {}, tooltipText: {}, tooltipLabel: {}
    })).toBe(false);

    // Invalid light/dark under surface
    expect(isValidChartTokens({
      axis: { light: 'invalid', dark: {} },
      grid: { light: {}, dark: {} },
      tooltipBg: { light: {}, dark: {} },
      tooltipBorder: { light: {}, dark: {} },
      tooltipText: { light: {}, dark: {} },
      tooltipLabel: { light: {}, dark: {} }
    })).toBe(false);

    // Categorical ramp steps < 5
    const validSurface = {
      $type: 'color',
      $value: '#ffffff'
    };
    const validGroup = { light: validSurface, dark: validSurface };
    const baseChart = {
      axis: validGroup,
      grid: validGroup,
      tooltipBg: validGroup,
      tooltipBorder: validGroup,
      tooltipText: validGroup,
      tooltipLabel: validGroup
    };

    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": validGroup }
    })).toBe(false);

    // Categorical step is not object
    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": "not-object", "2": {}, "3": {}, "4": {}, "5": {} }
    })).toBe(false);

    // Categorical step invalid light/dark
    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": { light: 'invalid' }, "2": {}, "3": {}, "4": {}, "5": {} }
    })).toBe(false);

    // Sequential steps < 5
    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": validGroup, "2": validGroup, "3": validGroup, "4": validGroup, "5": validGroup },
      sequential: { "1": validGroup }
    })).toBe(false);

    // Sequential step is not object
    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": validGroup, "2": validGroup, "3": validGroup, "4": validGroup, "5": validGroup },
      sequential: { "1": "not-object", "2": {}, "3": {}, "4": {}, "5": {} }
    })).toBe(false);

    // Sequential step invalid light/dark
    expect(isValidChartTokens({
      ...baseChart,
      categorical: { "1": validGroup, "2": validGroup, "3": validGroup, "4": validGroup, "5": validGroup },
      sequential: { "1": { light: 'invalid' }, "2": {}, "3": {}, "4": {}, "5": {} }
    })).toBe(false);
  });

  test('should validate standalone color utilities', () => {
    expect(isValidColorString('#FFFFFF')).toBe(true);
    expect(isValidColorString('rgb(255, 255, 255)')).toBe(true);
    expect(isValidColorString('hsl(0, 0%, 100%)')).toBe(true);
    expect(isValidColorString('invalid-color')).toBe(false);

    expect(isValidColorToken({ $type: 'color', $value: '#112233' })).toBe(true);
    expect(isValidColorToken(null)).toBe(false);
    expect(isValidColorToken('not-object')).toBe(false);
    expect(isValidColorToken({ $type: 'not-color', $value: '#112233' })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: 12345 })).toBe(false);
    expect(isValidColorToken({ $type: 'color', $value: '#invalid' })).toBe(false);

    // Accessibility sub-validation
    const validAccToken = {
      $type: 'color',
      $value: '#112233',
      accessibility: {
        wcagLevel: 'AA',
        colorblindSafe: true,
        colorblindSimulation: {
          protanopia: '#112234',
          deuteranopia: '#112235',
          tritanopia: '#112236'
        }
      }
    };
    expect(isValidColorToken(validAccToken)).toBe(true);

    const invalidAccToken1 = {
      ...validAccToken,
      accessibility: 'not-object'
    };
    expect(isValidColorToken(invalidAccToken1)).toBe(false);

    const invalidAccToken2 = {
      ...validAccToken,
      accessibility: { wcagLevel: 'AAA-plus' }
    };
    expect(isValidColorToken(invalidAccToken2)).toBe(false);

    const invalidAccToken3 = {
      ...validAccToken,
      accessibility: { colorblindSafe: 'yes-please' }
    };
    expect(isValidColorToken(invalidAccToken3)).toBe(false);

    const invalidAccToken4 = {
      ...validAccToken,
      accessibility: { colorblindSimulation: 'not-object' }
    };
    expect(isValidColorToken(invalidAccToken4)).toBe(false);

    const invalidAccToken5 = {
      ...validAccToken,
      accessibility: {
        colorblindSimulation: { protanopia: '#invalid-simulation' }
      }
    };
    expect(isValidColorToken(invalidAccToken5)).toBe(false);

    const invalidAccToken6 = {
      ...validAccToken,
      accessibility: {
        colorblindSimulation: { protanopia: '#112233', deuteranopia: '#invalid' }
      }
    };
    expect(isValidColorToken(invalidAccToken6)).toBe(false);

    const invalidAccToken7 = {
      ...validAccToken,
      accessibility: {
        colorblindSimulation: { protanopia: '#112233', deuteranopia: '#112233', tritanopia: '#invalid' }
      }
    };
    expect(isValidColorToken(invalidAccToken7)).toBe(false);
  });


  test('should verify WCAG contrast compliance for categorical steps', () => {
    const categorical = tokens.color.chart.categorical;
    
    // Validate Light mode contrast ratio >= 3.0:1 (WCAG AA Graphical Elements) on White background
    const whiteBackground = '#FFFFFF';
    for (const key of Object.keys(categorical)) {
      const step = categorical[key];
      const lightVal = step.light.$value;
      const contrast = getContrastRatio(lightVal, whiteBackground);
      
      // Assert that contrast meets AA target
      expect(contrast).toBeGreaterThanOrEqual(3.0);
      
      // Verify matches colors.json metadata
      expect(step.light.accessibility.contrastRatios.onWhite).toEqual(contrast);
    }

    // Validate Dark mode contrast ratio >= 3.0:1 on Neutral-900 (#111827) background
    const darkBackground = '#111827';
    for (const key of Object.keys(categorical)) {
      const step = categorical[key];
      const darkVal = step.dark.$value;
      const contrast = getContrastRatio(darkVal, darkBackground);
      
      // Assert that contrast meets AA target
      expect(contrast).toBeGreaterThanOrEqual(3.0);
      
      // Verify matches colors.json metadata
      expect(step.dark.accessibility.contrastRatios.onNeutral900).toEqual(contrast);
    }
  });

  test('should verify WCAG contrast compliance and progressive density for sequential steps', () => {
    const sequential = tokens.color.chart.sequential;
    const steps = Object.keys(sequential).sort();
    
    const whiteBg = '#FFFFFF';
    const darkBg = '#111827';

    // Verify each sequential step matches its simulated metadata and contrast
    for (const key of steps) {
      const step = sequential[key];
      
      const lightContrast = getContrastRatio(step.light.$value, whiteBg);
      expect(step.light.accessibility.contrastRatios.onWhite).toEqual(lightContrast);

      const darkContrast = getContrastRatio(step.dark.$value, darkBg);
      expect(step.dark.accessibility.contrastRatios.onNeutral900).toEqual(darkContrast);
    }

    // Assert that the light sequential ramp is progressive (getting darker / higher contrast against white background)
    for (let i = 0; i < steps.length - 1; i++) {
      const currentVal = sequential[steps[i]].light.$value;
      const nextVal = sequential[steps[i + 1]].light.$value;
      const currentContrast = getContrastRatio(currentVal, whiteBg);
      const nextContrast = getContrastRatio(nextVal, whiteBg);
      
      expect(nextContrast).toBeGreaterThan(currentContrast);
    }

    // Assert that the dark sequential ramp is progressive (getting lighter / higher contrast against dark background)
    for (let i = 0; i < steps.length - 1; i++) {
      const currentVal = sequential[steps[i]].dark.$value;
      const nextVal = sequential[steps[i + 1]].dark.$value;
      const currentContrast = getContrastRatio(currentVal, darkBg);
      const nextContrast = getContrastRatio(nextVal, darkBg);
      
      expect(nextContrast).toBeGreaterThan(currentContrast);
    }
  });

  test('should verify colorblind safety and pairwise distinctness of categorical steps', () => {
    const categorical = tokens.color.chart.categorical;
    const steps = Object.keys(categorical);

    // Verify Light mode simulations are safe and pairwise distinct
    for (let i = 0; i < steps.length; i++) {
      for (let j = i + 1; j < steps.length; j++) {
        const stepA = categorical[steps[i]].light.accessibility.colorblindSimulation;
        const stepB = categorical[steps[j]].light.accessibility.colorblindSimulation;

        expect(stepA.protanopia).not.toEqual(stepB.protanopia);
        expect(stepA.deuteranopia).not.toEqual(stepB.deuteranopia);
        expect(stepA.tritanopia).not.toEqual(stepB.tritanopia);
      }
    }

    // Verify Dark mode simulations are safe and pairwise distinct
    for (let i = 0; i < steps.length; i++) {
      for (let j = i + 1; j < steps.length; j++) {
        const stepA = categorical[steps[i]].dark.accessibility.colorblindSimulation;
        const stepB = categorical[steps[j]].dark.accessibility.colorblindSimulation;

        expect(stepA.protanopia).not.toEqual(stepB.protanopia);
        expect(stepA.deuteranopia).not.toEqual(stepB.deuteranopia);
        expect(stepA.tritanopia).not.toEqual(stepB.tritanopia);
      }
    }
  });

  test('should verify basic validator coverage', () => {
    // '#abc' is a valid CSS 3-digit hex shorthand (a=0xAA, b=0xBB, c=0xCC).
    // The validator must accept it — use a genuinely invalid string instead.
    expect(isValidHexColor('#xyz')).toBe(false);
    expect(isValidHexColor('#abc')).toBe(true);
    expect(isValidRgbColor('rgb(a, b, c)')).toBe(false);
    expect(isValidHslColor('hsl(a, b, c)')).toBe(false);
    expect(isKebabCase('Kebab-Case')).toBe(false);
    expect(hasValidTokenPrefix('invalidPrefix-token')).toBe(false);
  });
});
