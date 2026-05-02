export interface Card {
  id: string;
  front: string;
  back: string;
  hint: string;
  status: "new" | "learning" | "mastered";
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  cards: Card[];
  createdAt: string;
}

export interface DeckSummary extends Deck {
  masteredCount: number;
}

export interface CreateDeckOutput {
  deck: Deck;
  username: string;
}

export interface ListDecksOutput {
  decks: DeckSummary[];
  username: string;
}

export interface OpenDeckOutput {
  deck: Deck;
  username: string;
  deckId: string;
}

export interface MarkCardOutput {
  deck: Deck;
}

export interface ResetDeckOutput {
  deck: Deck;
}

export type ToolOutput =
  | CreateDeckOutput
  | ListDecksOutput
  | OpenDeckOutput
  | MarkCardOutput
  | ResetDeckOutput;
