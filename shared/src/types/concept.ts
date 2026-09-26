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
  coreAnalogy: string;
  keyFacts: string[];
  importance: 1 | 2 | 3;
  mnemonic?: MnemonicCard;
  relatedKeywords: string[];
}
