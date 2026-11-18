type EmptyStateProps = { title: string; text: string };

export function EmptyState({ title, text }: EmptyStateProps) {
  return (
    <div className="empty">
      <i>✦</i>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
