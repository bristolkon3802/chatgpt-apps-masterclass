import { useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps/react";
import type { Card, Deck } from "../types";

// 새로고침해도 작업상태가 유지되게 정의 , object 는  JSON으로 받아야 한다.
function saveState(viewUUID: string | null, state: object) {
  if (!viewUUID) return null;
  localStorage.setItem(viewUUID, JSON.stringify(state));
}

function loadState(viewUUID: string | null) {
  if (!viewUUID) return null;
  const state = localStorage.getItem(viewUUID);
  if (!state) {
    return null;
  }
  return JSON.parse(state);
}

export function useStudySession({
  deck,
  app,
  username,
  viewUUID,
}: {
  deck: Deck;
  app: App | null;
  username: string;
  viewUUID: string | null;
}) {
  const savedtate = loadState(viewUUID);

  // 유저가 현재 위치한 카드 번호
  const [currentIndex, setCurrentIndex] = useState(
    savedtate ? savedtate.currentIndex : 0
  );
  // cards는 tool의 결과값(사용자가 실시간으로 mastered 또는 learning 로 표시하면 상태를 실시간으로 수정해서 사용자에게 업데이트 내용을 보여줌)
  const [cards, setCards] = useState<Card[]>(
    savedtate ? savedtate.cards : deck.cards
  );
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const currentCard = cards[currentIndex];
  const masteredCount = cards.filter((c) => c.status === "mastered").length;

  function goNext() {
    if (currentIndex >= cards.length - 1) return;
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    saveState(viewUUID, { cards, currentIndex: nextIndex });
  }

  function goPrev() {
    if (currentIndex <= 0) return;
    const nextIndex = currentIndex - 1;
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    saveState(viewUUID, { cards, currentIndex: nextIndex });
  }

  function toggleFlip() {
    setIsFlipped((flipped) => !flipped);
  }

  const markCard = async (status: "learning" | "mastered") => {
    if (!currentCard || loading) return;

    setLoading(status);
    try {
      if (app) {
        await app.callServerTool({
          name: "mark-card",
          arguments: {
            username,
            deckId: deck.id,
            status,
            cardId: currentCard.id,
          },
        });
      }

      const updated = [...cards];
      updated[currentIndex] = { ...currentCard, status };
      saveState(viewUUID, { currentIndex, cards: updated });
      setCards(updated);

      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setIsFlipped(false);
      }
    } finally {
      setLoading(null);
    }
  };

  const explainCard = async () => {
    if (!currentCard || loading) return;

    setLoading("explaining");
    try {
      if (app) {
        // 호스트 채팅 인터페이스에 메시지를 보내는 함수
        await app.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: `이 플래시카드에 대해 더 자세히 설명해 주세요. 질문 ${currentCard.front}\n답변 ${currentCard.back}`,
            },
          ],
        });
      }
    } finally {
      setLoading(null);
    }
  };

  const resetProgress = async () => {
    if (loading) return;

    setLoading("resetting");
    try {
      if (app) {
        await app.callServerTool({
          name: "reset-deck",
          arguments: {
            username,
            deckId: deck.id,
          },
        });
      }
      const resetCards = cards.map((c) => ({ ...c, status: "new" as const }));
      setCards(resetCards);
      saveState(viewUUID, { currentIndex: 0, cards: resetCards });
      setCurrentIndex(0);
      setIsFlipped(false);
    } finally {
      setLoading(null);
    }
  };

  return {
    cards,
    currentCard,
    currentIndex,
    masteredCount,
    isFlipped,
    loading,
    goNext,
    goPrev,
    toggleFlip,
    markCard,
    explainCard,
    resetProgress,
  };
}
