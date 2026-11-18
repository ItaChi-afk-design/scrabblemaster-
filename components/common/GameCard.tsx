import { ChevronRight, Clock3, Trophy } from "lucide-react";
import type { Game } from "@/types/game";

type GameCardProps = {
  game: Game;
  onOpen: () => void;
  resume?: boolean;
};

export function GameCard({ game, onOpen, resume = false }: GameCardProps) {
  const label = resume ? "Resume" : game.status === "active" ? "In progress" : "Finished";

  return (
    <button className={`gameCard ${resume ? "resume" : ""}`} onClick={onOpen}>
      <i>{game.status === "finished" ? <Trophy /> : <Clock3 />}</i>
      <span>
        <b>{game.title}</b>
        <small>
          {game.players.length} players · {game.mode} mode
        </small>
      </span>
      <em>
        {label}
        <ChevronRight />
      </em>
    </button>
  );
}
