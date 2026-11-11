import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const backend = read('../../../services/design_studio/color_extractor.py');
const schema = read('../../api/schemas.py');
const router = read('../../api/routers/studios.py');
const api = read('../src/services/api/studios.ts');
const view = read('../src/components/DesignStudioView.tsx');

test('palette colors and CSS variable names are validated server-side', () => {
  assert.match(backend, /re\.fullmatch\(r"#\(\?:\[0-9a-fA-F\]\{3\}/);
  assert.match(backend, /re\.fullmatch\(r"\[A-Za-z0-9_-\]\{1,40\}"/);
  assert.match(schema, /hex_primary: str = Field\([\s\S]*?pattern=/);
  assert.match(schema, /name: str = Field\([\s\S]*?pattern=/);
});

test('unsupported component templates return a real error instead of a fallback', () => {
  assert.match(backend, /if clean_type not in templates/);
  assert.match(router, /Tipo de componente não suportado/);
});

test('WCAG audit input is bounded and authenticated', () => {
  assert.match(schema, /markup: str = Field\(\.\.\., min_length=1, max_length=100000/);
  assert.match(router, /audit_wcag_accessibility_endpoint[\s\S]*?_require_human\(principal\)/);
});

test('Design Studio API preserves errors rather than fabricating output', () => {
  assert.match(api, /handleApiResponse/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return/);
});

test('Design Studio UI debounces palette generation and shows loading and error states', () => {
  assert.match(view, /window\.setTimeout\(\(\) => loadPalette/);
  assert.match(view, /paletteLoading/);
  assert.match(view, /paletteError/);
  assert.match(view, /wcagError/);
  assert.match(view, /componentLoading/);
  assert.match(view, /componentError/);
  assert.doesNotMatch(view, /alert\(/);
});
