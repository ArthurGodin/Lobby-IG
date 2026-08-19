import type { PlayerColor } from "@ig-campus/contracts";
import { useState } from "react";
import { UI_PLAYER_COLORS } from "./CampusApp";

export type WelcomeScreenProps = {
  initialName: string;
  initialColor: PlayerColor;
  onJoin: (name: string, color: PlayerColor) => void;
};

export function WelcomeScreen({ initialName, initialColor, onJoin }: WelcomeScreenProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<PlayerColor>(initialColor);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isNameValid = name.trim().length > 0;
  const showError = hasAttemptedSubmit && !isNameValid;

  const selectedColorInfo = UI_PLAYER_COLORS.find((c) => c.id === color);

  const handleSubmit = () => {
    if (!isNameValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onJoin(name, color);
  };

  return (
    <div className="welcome-backdrop">
      <div className="welcome-card">
        <p className="welcome-brand">Inforgeneses</p>
        <h1 className="welcome-title">Campus</h1>
        <p className="welcome-subtitle">Seu escritório virtual. Colabore, crie e construa junto.</p>

        <div className="welcome-field">
          <label htmlFor="welcome-name" className="welcome-label">
            Seu Nome
          </label>
          <input
            id="welcome-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (hasAttemptedSubmit) setHasAttemptedSubmit(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Como quer ser chamado?"
            className={`welcome-input${showError ? " welcome-input--error" : ""}`}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
          />
          {showError ? <span className="welcome-error-text">O nome é obrigatório</span> : null}
        </div>

        <div className="welcome-field welcome-field--colors">
          <span className="welcome-label">Cor da Camisa</span>
          <div className="welcome-colors">
            {UI_PLAYER_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                title={c.label}
                aria-label={`Selecionar cor ${c.label}`}
                aria-pressed={color === c.id}
                className={`welcome-color-btn${color === c.id ? " welcome-color-btn--selected" : ""}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="welcome-avatar-preview">
          <span
            className="welcome-avatar-dot"
            style={{ backgroundColor: selectedColorInfo?.hex ?? color }}
          />
          <span className="welcome-avatar-name">{name.trim() || "Anônimo"}</span>
        </div>

        <button type="button" onClick={handleSubmit} disabled={false} className="welcome-submit">
          Entrar no Campus
        </button>
      </div>
    </div>
  );
}
