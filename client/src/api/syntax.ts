import { SyntaxTerm } from "@jungcheogi/shared";
import { apiFetch } from "./http";

const syntaxTermsCache = new Map<string, SyntaxTerm>();

export async function fetchSyntaxTerm(canonicalKey: string): Promise<SyntaxTerm> {
  if (syntaxTermsCache.has(canonicalKey)) {
    return syntaxTermsCache.get(canonicalKey)!;
  }

  const res = await apiFetch(`/api/syntax-terms/${encodeURIComponent(canonicalKey)}`);
  if (!res.ok) {
    throw new Error(`문법 식별자 '${canonicalKey}' 정보를 불러오지 못했습니다.`);
  }

  const term: SyntaxTerm = await res.json();
  syntaxTermsCache.set(canonicalKey, term);
  return term;
}

export async function fetchSyntaxTerms(language?: string): Promise<SyntaxTerm[]> {
  const url = language
    ? `/api/syntax-terms?language=${encodeURIComponent(language)}`
    : "/api/syntax-terms";
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error("문법 지식 목록을 불러오지 못했습니다.");
  }

  const terms: SyntaxTerm[] = await res.json();
  for (const term of terms) {
    syntaxTermsCache.set(term.canonicalKey, term);
  }
  return terms;
}

