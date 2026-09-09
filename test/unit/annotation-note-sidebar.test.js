import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Gene Details annotation note presentation', () => {
  it('places the genome annotation note in General and keeps User Notes separate', () => {
    const renderer = fs.readFileSync(path.join(process.cwd(), 'src/renderer/renderer-modular.js'), 'utf8');
    const notesManager = fs.readFileSync(path.join(process.cwd(), 'src/renderer/modules/GeneNotesManager.js'), 'utf8');
    const index = fs.readFileSync(path.join(process.cwd(), 'src/renderer/index.html'), 'utf8');

    expect(renderer).toContain('Annotation Note');
    expect(renderer).toContain('GenBank /note');
    expect(renderer).toContain("getAllQualifierValues(gene.qualifiers, 'note')");
    expect(renderer).toContain("if (normalizedKey === 'note') return;");
    expect(renderer).toContain('generalAttributesHtml + annotationNoteHtml');
    expect(renderer).toContain("{ id: 'user-notes', label: 'User Notes', content: userNotesTabHtml }");
    expect(renderer).toContain("activeTab?.dataset.tab === 'user-notes'");
    expect(renderer).not.toContain("{ id: 'notes', label: 'Notes'");
    expect(notesManager).toContain('User Notes');
    expect(notesManager).toContain('They do not change the genome annotation');
    expect(notesManager).toContain('Add your own notes about this gene');
    expect(index).toContain('Annotation Note (GenBank /note)');
  });

  it('visually distinguishes Deep Gene Research notes from the original annotation', () => {
    const renderer = fs.readFileSync(path.join(process.cwd(), 'src/renderer/renderer-modular.js'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'src/renderer/css/legacy/02-primer-gene-details.css'), 'utf8');

    // Research-curated /note values are detected via their provenance clause
    // and rendered with a source badge; the original annotation gets a muted
    // badge of its own when both kinds are present.
    expect(renderer).toContain('getAnnotationNoteResearchDate');
    expect(renderer).toContain('Annotation by Deep Gene Research on ');
    expect(renderer).toContain('gene-annotation-note-source-badge research');
    expect(renderer).toContain('gene-annotation-note-source-badge original');
    expect(renderer).toContain('Deep Gene Research &middot;');
    expect(renderer).toContain('Original annotation');
    expect(renderer).toContain('gene-annotation-note-value research-note');
    expect(css).toContain('.gene-annotation-note-value.research-note');
    expect(css).toContain('.gene-annotation-note-source-badge.research');
    expect(css).toContain('.gene-annotation-note-source-badge.original');
  });

  it('renders the note bibliography as a footer chip row instead of inline prose', () => {
    const renderer = fs.readFileSync(path.join(process.cwd(), 'src/renderer/renderer-modular.js'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'src/renderer/css/legacy/02-primer-gene-details.css'), 'utf8');

    expect(renderer).toContain('renderAnnotationNoteBody(String(value))');
    expect(renderer).toContain('splitAnnotationNoteSections');
    expect(renderer).toContain('gene-annotation-note-sources');
    expect(css).toContain('.gene-annotation-note-sources {');
    expect(css).toContain('.gene-annotation-note-sources-list');
  });

  it('detects the Deep Gene Research provenance clause format', () => {
    // Mirrors the provenance contract enforced by AnnotationChangeSetService:
    // "Annotation by Deep Gene Research on <Month D, YYYY>." at end of note.
    const clausePattern = /Annotation by Deep Gene Research on ([A-Z][a-z]+ \d{1,2}, \d{4})\.\s*$/;
    expect('Some curated text. Annotation by Deep Gene Research on August 18, 2026.'.match(clausePattern)?.[1]).toBe(
      'August 18, 2026'
    );
    expect('Original GenBank annotation without provenance.'.match(clausePattern)).toBeNull();
  });
});
