import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// renderer-modular.js is a classic script with no exports, so the citation helpers are
// lifted out of the class body by line range (Prettier keeps the indentation stable).
const rendererSource = fs.readFileSync(path.join(process.cwd(), 'src/renderer/renderer-modular.js'), 'utf8');
const rendererLines = rendererSource.split('\n');

function extractMethod(name) {
  const start = rendererLines.findIndex(line => line.startsWith(`  ${name}(`));
  expect(start, `method ${name} not found`).toBeGreaterThan(-1);
  const end = rendererLines.findIndex((line, index) => index > start && line === '  }');
  expect(end, `method ${name} has no closing brace`).toBeGreaterThan(start);
  return rendererLines.slice(start, end + 1).join('\n');
}

function createRenderer() {
  const body = [
    'processUnifiedCitations',
    'addUnifiedCitation',
    'getCitationUrl',
    'enhanceGeneAttributeWithLinks',
    'splitAnnotationNoteSections',
    'renderAnnotationNoteBody',
    'renderAnnotationNoteSources',
  ]
    .map(extractMethod)
    .join('\n');
  const Harness = vm.runInNewContext(`(class CitationHarness {
    constructor() { this.citationCollector = new Map(); this.citationCounter = 0; }
    ${body}
  })`);
  const harness = new Harness();
  return {
    harness,
    render: value => harness.processUnifiedCitations(harness.enhanceGeneAttributeWithLinks(value)),
    renderNote: value => harness.renderAnnotationNoteBody(value),
  };
}

describe('Genome annotation note citation rendering', () => {
  it('consumes the whole |CITS: [PMID]| marker instead of leaving the pipes behind', () => {
    const { render } = createRenderer();
    const html = render('acquired by horizontal gene transfer |CITS: [39501255]| and may be a pseudogene.');

    expect(html).not.toContain('|CITS:');
    expect(html).not.toContain('|');
    expect(html).toContain('https://pubmed.ncbi.nlm.nih.gov/39501255/');
    expect(html).toContain('<sup>1</sup>');
  });

  it('numbers every PMID in a multi-id marker and reuses numbers across markers', () => {
    const { harness, render } = createRenderer();
    const html = render('first |CITS: 20974832 21876789| second |CITS: [20974832]|');

    expect(html).not.toContain('|CITS:');
    expect(html).toContain('<sup>1</sup>');
    expect(html).toContain('<sup>2</sup>');
    expect(harness.citationCollector.size).toBe(2);
  });

  it('does not fabricate a PubMed link for short reference numbers', () => {
    const { harness, render } = createRenderer();
    const html = render('already resolved elsewhere |CITS: 3|');

    expect(html).toContain('<sup class="cits-ref">3</sup>');
    expect(html).not.toContain('pubmed.ncbi.nlm.nih.gov/3');
    expect(harness.citationCollector.size).toBe(0);
  });

  it('links short legacy PMIDs instead of leaving them as raw text', () => {
    const { render } = createRenderer();
    const html = render('described earlier (PMID:28751).');

    expect(html).toContain('https://pubmed.ncbi.nlm.nih.gov/28751/');
    expect(html).not.toContain('PMID:28751');
  });

  it('keeps a slash-bearing DOI whole instead of splitting it at the registrant prefix', () => {
    const { harness, render } = createRenderer();
    const html = render('see DOI:10.1111/j.1432-1033.1976.tb10182.x. for details');

    expect(html).toContain('https://doi.org/10.1111/j.1432-1033.1976.tb10182.x');
    // The sentence full stop stays text; the truncated "DOI:10.1111" badge that
    // left "/j.1432-..." dangling must not come back.
    expect(html).not.toContain('&gt;DOI:10.1111&lt;');
    expect(html).not.toContain('/j.1432-1033.1976.tb10182.x.');
    expect(harness.citationCollector.get('DOI:10.1111/j.1432-1033.1976.tb10182.x')).toBeDefined();
  });

  it('moves the Supporting sources clause into its own chip row and drops the duplicated provenance sentence', () => {
    const { harness, renderNote } = createRenderer();
    const html = renderNote(
      'Catalyses the first step. Supporting sources: PMID:4887501. PMID:28751. DOI:10.1111/j.1432-1033.1976.tb10182.x. Annotation by Deep Gene Research on August 20, 2026.'
    );

    expect(html).toContain('gene-annotation-note-sources');
    expect(html).toContain('Supporting sources (3)');
    // The narrative keeps the clause out of its prose, and the source badge
    // already carries the provenance date.
    expect(html).not.toContain('Supporting sources: PMID');
    expect(html).not.toContain('Annotation by Deep Gene Research on August 20, 2026.');
    expect(html).toContain('https://pubmed.ncbi.nlm.nih.gov/28751/');
    expect(html).toContain('https://doi.org/10.1111/j.1432-1033.1976.tb10182.x');
    expect(harness.citationCollector.size).toBe(3);
  });

  it('leaves an unrecognised sources clause in the note body rather than dropping curated text', () => {
    const { renderNote } = createRenderer();
    const html = renderNote('Catalyses the first step. Supporting sources: internal curation notes and lab records.');

    expect(html).not.toContain('gene-annotation-note-sources');
    expect(html).toContain('internal curation notes and lab records.');
  });

  it('renders an original GenBank note without a bibliography footer', () => {
    const { renderNote } = createRenderer();
    const html = renderNote('Original annotation text without citations.');

    expect(html).toContain('<div class="gene-annotation-note-text">Original annotation text without citations.</div>');
    expect(html).not.toContain('gene-annotation-note-sources');
  });

  it('renders inline italics from the note but keeps dangerous markup escaped', () => {
    const { render } = createRenderer();
    const html = render('The <i>eaeH</i> gene of <em>E. coli</em>. <script>alert(1)</script> <img src=x onerror=y>');

    expect(html).toContain('<i>eaeH</i>');
    expect(html).toContain('<em>E. coli</em>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
