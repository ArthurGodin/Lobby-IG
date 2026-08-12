import type {
  PlayerColor,
  PlayerSnapshot,
  ProximityPeerSnapshot,
  ProximitySnapshot,
} from "@ig-campus/contracts";
import { isPlayerColor, pickPlayerColor, sanitizeDisplayName } from "@ig-campus/contracts";
import { MAP_HEIGHT, MAP_WIDTH, PROXIMITY_RADIUS } from "@ig-campus/game-core";
import { AudioLines, MicOff, RadioTower, RefreshCw, UsersRound } from "lucide-react";
import type Phaser from "phaser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusScene } from "../game/CampusScene";
import { createCampusGame } from "../game/createCampusGame";
import { bindMovementKeys } from "../game/input";
import { getCampusServerUrl, joinCampus, sendMovement } from "../lib/campusClient";

type ConnectionState = "connecting" | "connected" | "offline" | "error";

const STORAGE_KEY = "ig-campus-profile";
const PANEL_UPDATE_INTERVAL_MS = 250;

type LocalProfile = {
  name: string;
  color: PlayerColor;
};

export function CampusApp() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof joinCampus>> | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const lastPanelUpdateAtRef = useRef(0);

  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [nameDraft, setNameDraft] = useState(profile.name);
  const profileRef = useRef(profile);
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [proximity, setProximity] = useState<ProximitySnapshot>({
    radius: PROXIMITY_RADIUS,
    peers: [],
  });
  const [selfSessionId, setSelfSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const self = useMemo(
    () => players.find((player) => player.sessionId === selfSessionId) ?? null,
    [players, selfSessionId],
  );
  const proximityBySessionId = useMemo(
    () => new Map(proximity.peers.map((peer) => [peer.sessionId, peer])),
    [proximity.peers],
  );

  const connect = useCallback(async () => {
    connectAbortRef.current?.abort();
    roomRef.current?.leave();
    roomRef.current = null;

    const abortController = new AbortController();
    connectAbortRef.current = abortController;
    setConnectionState("connecting");
    lastPanelUpdateAtRef.current = 0;

    try {
      const room = await joinCampus(profileRef.current, abortController.signal);

      if (abortController.signal.aborted) {
        room.leave();
        return;
      }

      roomRef.current = room;
      setSelfSessionId(room.sessionId);
      setConnectionState("connected");
      getCampusScene(gameRef.current)?.setSelfSessionId(room.sessionId);

      room.onStateChange((state) => {
        const nextPlayers = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
        getCampusScene(gameRef.current)?.syncPlayers(nextPlayers, state.proximity);

        const now = performance.now();

        if (now - lastPanelUpdateAtRef.current >= PANEL_UPDATE_INTERVAL_MS) {
          lastPanelUpdateAtRef.current = now;
          setPlayers(nextPlayers);
          setProximity(state.proximity);
        }
      });

      room.onLeave(() => {
        if (roomRef.current !== room) {
          return;
        }

        roomRef.current = null;
        setConnectionState("offline");
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

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
      connectAbortRef.current?.abort();
      connectAbortRef.current = null;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    return bindMovementKeys((input) => {
      sendMovement(roomRef.current, input);
    });
  }, []);

  const handleNameCommit = () => {
    const name = sanitizeDisplayName(nameDraft);
    const nextProfile = {
      ...profile,
      name,
    };

    persistProfile(nextProfile);
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    setNameDraft(name);
    roomRef.current?.updateProfile(nextProfile);
  };

  const handleReconnect = () => {
    setPlayers([]);
    setProximity({ radius: PROXIMITY_RADIUS, peers: [] });
    void connect();
  };

  return (
    <main className="campus-shell">
      <header className="campus-topbar">
        <div>
          <p className="eyebrow">Inforgeneses</p>
          <h1>Campus</h1>
        </div>

        <div
          aria-live="polite"
          className={`connection-pill connection-pill--${connectionState}`}
          role="status"
        >
          <RadioTower aria-hidden="true" size={16} />
          <span>{connectionLabel(connectionState)}</span>
        </div>
      </header>

      <section className="campus-workspace">
        <div
          aria-label={getMapDescription(self, proximity)}
          className="map-frame"
          role="img"
          style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
        >
          <div ref={gameHostRef} className="game-host" />
        </div>

        <aside className="campus-panel" aria-label="Painel do campus">
          <section className="identity-box">
            <div>
              <label className="section-kicker" htmlFor="display-name">
                Sua presença
              </label>
              <input
                autoComplete="off"
                className="name-input"
                id="display-name"
                maxLength={24}
                name="displayName"
                spellCheck={false}
                value={nameDraft}
                onBlur={handleNameCommit}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }

                  if (event.key === "Escape") {
                    setNameDraft(profile.name);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>

            <button
              aria-label="Microfone ainda indisponível neste protótipo"
              className="icon-button"
              disabled
              title="O áudio real entra no próximo corte"
              type="button"
            >
              <MicOff aria-hidden="true" size={18} />
            </button>
          </section>

          <section className="status-card">
            <h2 className="section-kicker">Posição no mapa</h2>
            <strong>{self ? `${Math.round(self.x)}, ${Math.round(self.y)}` : "aguardando"}</strong>
            <span>{getCampusServerUrl()}</span>
          </section>

          <section className="proximity-card" aria-live="polite">
            <div className="proximity-card__icon">
              <AudioLines aria-hidden="true" size={18} />
            </div>
            <div>
              <h2 className="section-kicker">Proximidade visual</h2>
              <strong>{proximityLabel(proximity.peers)}</strong>
              <span>O áudio real ainda não está ativo.</span>
            </div>
          </section>

          <section className="people-list">
            <div className="people-list__header">
              <h2 className="section-kicker">Pessoas</h2>
              <span>
                <UsersRound aria-hidden="true" size={14} />
                {players.length}
              </span>
            </div>

            {players.length === 0 ? (
              <p className="empty-state">Conectando ao campus local.</p>
            ) : (
              players.map((player) => {
                const peer = proximityBySessionId.get(player.sessionId);
                return (
                  <article
                    className={getPersonClassName(player.sessionId, selfSessionId, peer)}
                    key={player.sessionId}
                  >
                    <span className="avatar-dot" style={{ backgroundColor: player.color }} />
                    <div>
                      <strong>{player.name}</strong>
                      <span>{getPersonStatus(player, selfSessionId, peer)}</span>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <button
            className="reconnect-button"
            disabled={connectionState === "connecting"}
            type="button"
            onClick={handleReconnect}
          >
            <RefreshCw aria-hidden="true" size={16} />
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
      color: isPlayerColor(parsed.color) ? parsed.color : pickPlayerColor(name),
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

function proximityLabel(peers: ProximityPeerSnapshot[]): string {
  if (peers.length === 0) {
    return "Ninguém no alcance";
  }

  if (peers.length === 1) {
    return "1 pessoa no alcance";
  }

  return `${peers.length} pessoas no alcance`;
}

function getPersonClassName(
  sessionId: string,
  selfSessionId: string | null,
  peer?: ProximityPeerSnapshot,
): string {
  if (sessionId === selfSessionId) {
    return "person person--self";
  }

  return peer ? `person person--${peer.band}` : "person";
}

function getPersonStatus(
  player: PlayerSnapshot,
  selfSessionId: string | null,
  peer?: ProximityPeerSnapshot,
): string {
  if (player.sessionId === selfSessionId) {
    return player.moving ? "você · andando" : "você";
  }

  if (!peer) {
    return "fora do alcance";
  }

  const meters = Math.max(1, Math.round(peer.distance / 32));
  return `${peer.band === "close" ? "perto" : "no alcance"} · ${meters} m`;
}

function getMapDescription(self: PlayerSnapshot | null, proximity: ProximitySnapshot): string {
  if (!self) {
    return "Mapa do Campus Inforgeneses carregando.";
  }

  return `Mapa do Campus. Você está na posição ${Math.round(self.x)}, ${Math.round(self.y)}. ${proximityLabel(proximity.peers)}.`;
}
