type ToggleProps = {
  label: string;
  onToggle: () => void;
  value: boolean;
};

export function Toggle({ label, onToggle, value }: ToggleProps) {
  return (
    <button className="toggle" onClick={onToggle}>
      <b>{label}</b>
      <span className={value ? "on" : ""}>
        <i />
      </span>
    </button>
  );
}
