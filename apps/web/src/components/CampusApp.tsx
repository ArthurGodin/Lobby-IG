import type { PlayerColor, PlayerSnapshot } from "@ig-campus/contracts";
import { pickPlayerColor, sanitizeDisplayName } from "@ig-campus/contracts";
import { MAP_HEIGHT, MAP_WIDTH } from "@ig-campus/game-core";
import { Mic, MicOff, RadioTower, RefreshCw, UsersRound } from "lucide-react";
import type Phaser from "phaser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusScene } from "../game/CampusScene";
import { createCampusGame } from "../game/createCampusGame";
import { bindMovementKeys } from "../game/input";
import { getCampusServerUrl, joinCampus, sendMovement } from "../lib/campusClient";

type ConnectionState = "connecting" | "connected" | "offline" | "error";

const STORAGE_KEY = "ig-campus-profile";

type LocalProfile = {
  name: string;
  color: PlayerColor;
};

export function CampusApp() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof joinCampus>> | null>(null);

  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const profileRef = useRef(profile);
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [selfSessionId, setSelfSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [micEnabled, setMicEnabled] = useState(false);

  const self = useMemo(
    () => players.find((player) => player.sessionId === selfSessionId) ?? null,
    [players, selfSessionId],
  );

  const connect = useCallback(async () => {
    setConnectionState("connecting");

    try {
      const room = await joinCampus(profileRef.current);
      roomRef.current = room;
      setSelfSessionId(room.sessionId);
      setConnectionState("connected");
      getCampusScene(gameRef.current)?.setSelfSessionId(room.sessionId);

      room.onStateChange((state) => {
        const nextPlayers = readPlayersFromState(state);
        setPlayers(nextPlayers);
        getCampusScene(gameRef.current)?.syncPlayers(nextPlayers);
      });

      room.onLeave(() => {
        roomRef.current = null;
        setConnectionState("offline");
      });
    } catch (error) {
      console.error(error);
      roomRef.current = null;
      setConnectionState("error");
    }
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!gameHostRef.current || gameRef.current) {
      return;
    }

    gameRef.current = createCampusGame(gameHostRef.current);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    void connect();

    return () => {
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    return bindMovementKeys((input) => {
      sendMovement(roomRef.current, input);
    });
  }, []);

  const handleNameChange = (name: string) => {
    const nextProfile = {
      ...profile,
      name: sanitizeDisplayName(name),
    };

    persistProfile(nextProfile);
    setProfile(nextProfile);
  };

  const handleReconnect = () => {
    roomRef.current?.leave();
    roomRef.current = null;
    setPlayers([]);
    void connect();
  };

  return (
    <main className="campus-shell">
      <header className="campus-topbar">
        <div>
          <p className="eyebrow">Inforgeneses</p>
          <h1>Campus</h1>
        </div>

        <div className={`connection-pill connection-pill--${connectionState}`}>
          <RadioTower size={16} />
          <span>{connectionLabel(connectionState)}</span>
        </div>
      </header>

      <section className="campus-workspace">
        <div className="map-frame" style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}>
          <div ref={gameHostRef} className="game-host" />
        </div>

        <aside className="campus-panel" aria-label="Painel do campus">
          <section className="identity-box">
            <div>
              <p className="section-kicker">Sua presenca</p>
              <input
                aria-label="Seu nome no campus"
                className="name-input"
                maxLength={24}
                value={profile.name}
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </div>

            <button
              className={`icon-button ${micEnabled ? "icon-button--active" : ""}`}
              title={
                micEnabled ? "Microfone marcado como ligado" : "Microfone marcado como desligado"
              }
              type="button"
              onClick={() => setMicEnabled((enabled) => !enabled)}
            >
              {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </section>

          <section className="status-card">
            <p className="section-kicker">Local</p>
            <strong>{self ? `${Math.round(self.x)}, ${Math.round(self.y)}` : "aguardando"}</strong>
            <span>{getCampusServerUrl()}</span>
          </section>

          <section className="people-list">
            <div className="people-list__header">
              <p className="section-kicker">Pessoas</p>
              <span>
                <UsersRound size={14} />
                {players.length}
              </span>
            </div>

            {players.length === 0 ? (
              <p className="empty-state">Conectando ao campus local.</p>
            ) : (
              players.map((player) => (
                <article
                  className={player.sessionId === selfSessionId ? "person person--self" : "person"}
                  key={player.sessionId}
                >
                  <span className="avatar-dot" style={{ backgroundColor: player.color }} />
                  <div>
                    <strong>{player.name}</strong>
                    <span>{player.moving ? "andando" : "parado"}</span>
                  </div>
                </article>
              ))
            )}
          </section>

          <button className="reconnect-button" type="button" onClick={handleReconnect}>
            <RefreshCw size={16} />
            Reconectar
          </button>
        </aside>
      </section>
    </main>
  );
}

function getCampusScene(game: Phaser.Game | null): CampusScene | null {
  if (!game) {
    return null;
  }

  const scene = game.scene.getScene("CampusScene");
  return scene instanceof CampusScene ? scene : null;
}

function readPlayersFromState(state: unknown): PlayerSnapshot[] {
  const maybeState = state as { players?: PlayerSnapshot[] };
  return [...(maybeState.players ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

function loadProfile(): LocalProfile {
  const fallbackName = `Dev ${Math.floor(1000 + Math.random() * 9000)}`;
  const fallback = {
    name: fallbackName,
    color: pickPlayerColor(fallbackName),
  };

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    persistProfile(fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const name = sanitizeDisplayName(parsed.name);
    return {
      name,
      color: parsed.color ?? pickPlayerColor(name),
    };
  } catch {
    persistProfile(fallback);
    return fallback;
  }
}

function persistProfile(profile: LocalProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function connectionLabel(state: ConnectionState): string {
  if (state === "connected") {
    return "conectado";
  }

  if (state === "connecting") {
    return "conectando";
  }

  if (state === "offline") {
    return "offline";
  }

  return "erro";
}
