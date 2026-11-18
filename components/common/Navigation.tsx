import { BarChart3, History, Home } from "lucide-react";
import type { View } from "@/types/game";
import type { AppNavigation } from "./AppHeader";

type NavigationProps = Pick<AppNavigation, "onGoHome" | "onGoHistory" | "onGoStats"> & {
  view: Extract<View, "home" | "history" | "stats">;
};

export function Navigation({ view, onGoHome, onGoHistory, onGoStats }: NavigationProps) {
  return (
    <nav>
      <button className={view === "home" ? "active" : ""} onClick={onGoHome}>
        <Home />
        Home
      </button>
      <button className={view === "history" ? "active" : ""} onClick={onGoHistory}>
        <History />
        History
      </button>
      <button className={view === "stats" ? "active" : ""} onClick={onGoStats}>
        <BarChart3 />
        Stats
      </button>
    </nav>
  );
}
