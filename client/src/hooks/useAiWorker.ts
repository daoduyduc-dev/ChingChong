import { useCallback, useEffect, useRef, useState } from "react";
import { legal, outcome, play } from "../../../shared/chess";
import type { Actor } from "../../../shared/domain";
import { saveLocal, type LocalGame } from "../services/local";
import { notify } from "../services/notifications";
export function useAiWorker({
  enabled,
  game,
  actor,
  onGame,
  onSaved,
  onUnavailable,
  onError,
}: {
  enabled: boolean;
  game: LocalGame;
  actor: Actor | null;
  onGame: (game: LocalGame) => void;
  onSaved: (saved: boolean) => void;
  onUnavailable: (ready: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const [thinking, setThinking] = useState(false);
  const worker = useRef<Worker | null>(null),
    generation = useRef(0);
  const current = useRef({
    game,
    actor,
    onGame,
    onSaved,
    onUnavailable,
    onError,
  });
  current.current = { game, actor, onGame, onSaved, onUnavailable, onError };
  const cancel = useCallback(() => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setThinking(false);
  }, []);
  useEffect(() => {
    if (!enabled || game.position.turn === game.human || outcome(game.position))
      return;
    const id = ++generation.current;
    let w: Worker;
    try {
      w = new Worker(new URL("../workers/ai.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      current.current.onUnavailable(false);
      notify(
        "Trình duyệt không khởi chạy được AI. Hãy dùng trình duyệt hỗ trợ Web Worker.",
      );
      return;
    }
    worker.current = w;
    setThinking(true);
    const timer = setTimeout(() => {
      if (id !== generation.current) return;
      w.terminate();
      setThinking(false);
      notify("AI tính quá lâu. Hãy thử mức Dễ hoặc tiếp tục ván sau.");
    }, 5000);
    w.onmessage = (event) => {
      if (event.data.id !== generation.current) return;
      clearTimeout(timer);
      setThinking(false);
      if (event.data.error) {
        notify(event.data.error);
        return;
      }
      const state = current.current;
      if (event.data.move && legal(state.game.position, event.data.move)) {
        const next = {
          ...state.game,
          position: play(state.game.position, event.data.move),
        };
        state.onGame(next);
        void saveLocal(state.actor, next).catch(state.onError);
        state.onSaved(true);
      }
    };
    w.onerror = () => {
      if (id !== generation.current) return;
      clearTimeout(timer);
      setThinking(false);
      current.current.onUnavailable(false);
      notify("Không tải được Worker AI. Kiểm tra tài nguyên offline.");
    };
    w.postMessage({ id, position: game.position, level: game.level });
    return () => {
      clearTimeout(timer);
      w.terminate();
      worker.current = null;
      generation.current++;
    };
  }, [enabled, game.position, game.human, game.level]);
  return { thinking, cancel };
}
