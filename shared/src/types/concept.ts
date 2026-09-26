import { Subject } from './question.js';

export interface MnemonicCard {
  acronym: string;
  catchphrase: string;
  items: Array<{ letter: string; name: string; desc: string }>;
  trapPoint?: string;
}

export interface Concept {
  id: string;
  subject: Subject;
  category: string;
  title: string;
  definition: string;
  coreAnalogy?: string;
  keyFacts?: string[];
  importance: 1 | 2 | 3;
  mnemonic?: MnemonicCard;
  relatedKeywords: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WeakConceptSummary {
  conceptId: string;
  conceptTitle: string;
  subject: Subject;
  category: string;
  totalAttempts: number;
  wrongCount: number;
  unknownCount: number;
  hintCount: number;
  avgScore: number;
  weaknessScore: number; // 0.0 ~ 1.0 (높을수록 더 취약)
  relatedQuestionIds: string[];
}
