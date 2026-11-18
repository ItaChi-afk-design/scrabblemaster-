import { ChevronLeft, Plus, Settings } from "lucide-react";

export type AppNavigation = {
  onGoHome: () => void;
  onGoHistory: () => void;
  onGoStats: () => void;
  onNewGame: () => void;
};

type AppHeaderProps = AppNavigation & {
  title: string;
  back?: boolean;
  onBack?: () => void;
  onOpenSettings?: () => void;
};

export function AppHeader({
  title,
  back = true,
  onBack,
  onOpenSettings,
  onGoHome,
  onGoHistory,
  onGoStats,
  onNewGame,
}: AppHeaderProps) {
  return (
    <header className={back ? "siteHeader" : "siteHeader dashboardHeader"}>
      <button
        className="icon"
        onClick={back ? (onBack ?? onGoHome) : onGoHome}
        aria-label={back ? "Back" : "Wordkeeper home"}
      >
        {back ? (
          <ChevronLeft />
        ) : (
          <span className="logo">
            S<sup>1</sup>
          </span>
        )}
      </button>

      <div className="brand">
        <small>WORDKEEPER</small>
        <h1>{title}</h1>
      </div>

      <div className="headerLinks">
        <button onClick={onGoHome}>Dashboard</button>
        <button onClick={onGoHistory}>History</button>
        <button onClick={onGoStats}>Statistics</button>
      </div>

      <button className="headerNew" onClick={onNewGame}>
        <Plus /> New game
      </button>

      {onOpenSettings ? (
        <button className="icon" onClick={onOpenSettings} aria-label="Settings">
          <Settings />
        </button>
      ) : (
        back && <span className="space" />
      )}
    </header>
  );
}
