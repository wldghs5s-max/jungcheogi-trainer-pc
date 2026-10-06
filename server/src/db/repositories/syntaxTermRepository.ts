import { Database } from "better-sqlite3";
import { getDatabase } from "../database.js";
import { SyntaxTerm } from "@jungcheogi/shared";
import { SEED_SYNTAX_TERMS } from "../fixtures/seedSyntaxTerms.js";

interface SyntaxTermRow {
  id: string;
  language: string;
  canonical_key: string;
  term: string;
  display_token: string;
  term_type: string;
  short_description: string;
  syntax_pattern: string;
  how_it_works: string;
  example_code: string;
  detailed_explanation: string;
  common_mistakes: string;
  related_terms_json: string;
  created_at: string;
  updated_at: string;
}

function mapRowToSyntaxTerm(row: SyntaxTermRow): SyntaxTerm {
  let relatedTerms: string[] = [];
  try {
    if (row.related_terms_json) {
      relatedTerms = JSON.parse(row.related_terms_json);
    }
  } catch {
    relatedTerms = [];
  }

  return {
    id: row.id,
    language: row.language,
    canonicalKey: row.canonical_key,
    term: row.term,
    displayToken: row.display_token,
    termType: row.term_type,
    shortDescription: row.short_description,
    syntaxPattern: row.syntax_pattern,
    howItWorks: row.how_it_works,
    exampleCode: row.example_code,
    detailedExplanation: row.detailed_explanation,
    commonMistakes: row.common_mistakes,
    relatedTerms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SyntaxTermRepository {
  private db: Database;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
  }

  public findByCanonicalKey(canonicalKey: string): SyntaxTerm | null {
    const row = this.db
      .prepare("SELECT * FROM syntax_terms WHERE canonical_key = ?")
      .get(canonicalKey) as SyntaxTermRow | undefined;
    return row ? mapRowToSyntaxTerm(row) : null;
  }

  public findByLanguage(language: string): SyntaxTerm[] {
    const normalizedLang = language.toUpperCase();
    const rows = this.db
      .prepare(
        "SELECT * FROM syntax_terms WHERE UPPER(language) = ? OR language = 'COMMON' ORDER BY term_type, term ASC"
      )
      .all(normalizedLang) as SyntaxTermRow[];
    return rows.map(mapRowToSyntaxTerm);
  }

  public findAll(): SyntaxTerm[] {
    const rows = this.db
      .prepare("SELECT * FROM syntax_terms ORDER BY language, term_type, term ASC")
      .all() as SyntaxTermRow[];
    return rows.map(mapRowToSyntaxTerm);
  }

  public upsert(term: SyntaxTerm): void {
    const stmt = this.db.prepare(`
      INSERT INTO syntax_terms (
        id, language, canonical_key, term, display_token, term_type,
        short_description, syntax_pattern, how_it_works, example_code,
        detailed_explanation, common_mistakes, related_terms_json, created_at, updated_at
      ) VALUES (
        @id, @language, @canonical_key, @term, @display_token, @term_type,
        @short_description, @syntax_pattern, @how_it_works, @example_code,
        @detailed_explanation, @common_mistakes, @related_terms_json, @created_at, @updated_at
      )
      ON CONFLICT(canonical_key) DO UPDATE SET
        term = excluded.term,
        display_token = excluded.display_token,
        term_type = excluded.term_type,
        short_description = excluded.short_description,
        syntax_pattern = excluded.syntax_pattern,
        how_it_works = excluded.how_it_works,
        example_code = excluded.example_code,
        detailed_explanation = excluded.detailed_explanation,
        common_mistakes = excluded.common_mistakes,
        related_terms_json = excluded.related_terms_json,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      id: term.id,
      language: term.language,
      canonical_key: term.canonicalKey,
      term: term.term,
      display_token: term.displayToken,
      term_type: term.termType,
      short_description: term.shortDescription,
      syntax_pattern: term.syntaxPattern,
      how_it_works: term.howItWorks,
      example_code: term.exampleCode,
      detailed_explanation: term.detailedExplanation,
      common_mistakes: term.commonMistakes,
      related_terms_json: JSON.stringify(term.relatedTerms || []),
      created_at: term.createdAt || new Date().toISOString(),
      updated_at: term.updatedAt || new Date().toISOString(),
    });
  }

  public seedInitialSyntaxTerms(): number {
    let seeded = 0;
    const insertTransaction = this.db.transaction((terms: SyntaxTerm[]) => {
      for (const t of terms) {
        this.upsert(t);
        seeded++;
      }
    });
    insertTransaction(SEED_SYNTAX_TERMS);
    return seeded;
  }
}

