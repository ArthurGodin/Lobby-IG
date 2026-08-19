import { CAMPUS_MAP, type CampusTileId } from "@ig-campus/game-core";
import {
  Eraser,
  Grid3X3,
  Layers,
  Save,
  X,
  Pencil,
  Square,
  PaintBucket,
  Undo,
  Redo,
  Check,
  AlertTriangle,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ART_TILE_SIZE, TILE_FRAME_BY_ID } from "../game/assets";

type WorldBuilderLayer =
  | "ground"
  | "structures"
  | "decorations"
  | "zones"
  | "spawns"
  | "interactables";

type WorldBuilderPanelProps = {
  activeLayer: WorldBuilderLayer;
  setActiveLayer: (layer: WorldBuilderLayer) => void;
  activeTile: CampusTileId | null;
  setActiveTile: (tile: CampusTileId | null) => void;
  onPublish: () => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  activeTool: "pencil" | "rect" | "fill";
  setActiveTool: (tool: "pencil" | "rect" | "fill") => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
};

// ─── Dicionário de tiles legíveis ───

const TILE_LABELS: Record<CampusTileId, string> = {
  empty: "Vazio",
  grass: "Grama",
  "grass-flowers": "Grama Florida",
  path: "Caminho",
  "patio-floor": "Piso do Pátio",
  "development-floor": "Piso Dev",
  "library-floor": "Piso Biblioteca",
  "administration-floor": "Piso Admin",
  "wall-light": "Parede Clara",
  "wall-tech": "Parede Tech",
  "wall-library": "Parede Biblioteca",
  "wall-administration": "Parede Admin",
  door: "Porta",
  window: "Janela",
  roof: "Telhado",
  tree: "Árvore",
  shrub: "Arbusto",
  flowers: "Flores",
  bench: "Banco",
  fountain: "Fonte",
  desk: "Mesa",
  computer: "Computador",
  chair: "Cadeira",
  bookshelf: "Estante",
  "admin-desk": "Mesa Admin",
  sign: "Placa",
};

type TileCategory = {
  label: string;
  tiles: CampusTileId[];
};

const TILE_CATEGORIES: TileCategory[] = [
  {
    label: "Pisos",
    tiles: [
      "grass",
      "grass-flowers",
      "path",
      "patio-floor",
      "development-floor",
      "library-floor",
      "administration-floor",
    ],
  },
  {
    label: "Paredes",
    tiles: [
      "wall-light",
      "wall-tech",
      "wall-library",
      "wall-administration",
      "door",
      "window",
      "roof",
    ],
  },
  {
    label: "Mobiliário",
    tiles: ["desk", "computer", "chair", "bookshelf", "admin-desk", "bench", "sign"],
  },
  {
    label: "Natureza",
    tiles: ["tree", "shrub", "flowers", "fountain"],
  },
];

// ─── Tool descriptions ───

const TOOL_TIPS: Record<string, string> = {
  pencil: "Pinta um tile por vez. Arraste para pintar contínuo.",
  rect: "Clique e arraste para preencher uma área retangular.",
  fill: "Preenche todos os tiles adjacentes iguais (flood fill).",
};

export function WorldBuilderPanel({
  activeLayer,
  setActiveLayer,
  activeTile,
  setActiveTile,
  onPublish,
  onClose,
  onUndo,
  onRedo,
  activeTool,
  setActiveTool,
  showGrid,
  setShowGrid,
}: WorldBuilderPanelProps) {
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [, setTrigger] = useState(0);
  const [draftMap, setDraftMap] = useState<typeof CAMPUS_MAP | null>(null);
  const [tileSearch, setTileSearch] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);

  useEffect(() => {
    const loadDraft = () => {
      const saved = localStorage.getItem("campus_map_draft");
      if (saved) {
        try {
          setDraftMap(JSON.parse(saved));
        } catch (_e) {}
      } else {
        setDraftMap(CAMPUS_MAP);
      }
    };
    loadDraft();
    const handleMetadataChange = () => {
      loadDraft();
      setTrigger((t) => t + 1);
    };
    window.addEventListener("campus-metadata-changed", handleMetadataChange);
    return () => window.removeEventListener("campus-metadata-changed", handleMetadataChange);
  }, []);

  const mutateDraft = (mutator: (draft: typeof CAMPUS_MAP) => void) => {
    if (!draftMap) return;
    const newDraft = { ...draftMap };
    mutator(newDraft);
    setDraftMap(newDraft);
    localStorage.setItem("campus_map_draft", JSON.stringify(newDraft));
    window.dispatchEvent(new CustomEvent("campus-draft-mutated-by-ui"));
  };

  const [publishError, setPublishError] = useState<string | null>(null);

  // Detect dirty state by comparing draft to original
  const isDirty = useMemo(() => {
    if (!draftMap) return false;
    return JSON.stringify(draftMap) !== JSON.stringify(CAMPUS_MAP);
  }, [draftMap]);

  const handlePublish = () => {
    if (!draftMap) return;
    if (draftMap.spawns.length === 0) {
      setPublishError("O mapa deve ter pelo menos 1 Spawn Point.");
      setConfirmPublish(false);
      return;
    }

    if (!confirmPublish) {
      setConfirmPublish(true);
      setPublishError(null);
      return;
    }

    setPublishError(null);
    setConfirmPublish(false);
    setPublishing(true);
    onPublish();
    setTimeout(() => {
      setPublishing(false);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 2000);
    }, 800);
  };

  // Filter tiles by search query
  const filteredCategories = useMemo(() => {
    if (!tileSearch.trim()) return TILE_CATEGORIES;
    const query = tileSearch.toLowerCase();
    return TILE_CATEGORIES.map((cat) => ({
      ...cat,
      tiles: cat.tiles.filter(
        (tileId) =>
          TILE_LABELS[tileId].toLowerCase().includes(query) || tileId.toLowerCase().includes(query),
      ),
    })).filter((cat) => cat.tiles.length > 0);
  }, [tileSearch]);

  return (
    <aside className="world-builder-panel">
      <header className="wb-header">
        <div className="wb-header-title">
          <h2>Campus Builder</h2>
          <span className="wb-badge">Admin</span>
          {isDirty && <span className="wb-dirty-badge">Modificado</span>}
        </div>
        <button
          type="button"
          className="wb-icon-btn"
          onClick={onClose}
          aria-label="Fechar construtor"
        >
          <X size={18} />
        </button>
      </header>

      <section className="wb-section">
        <h3>Camada Ativa</h3>
        <div className="wb-layer-selector">
          {(["ground", "structures", "decorations"] as const).map((layer) => (
            <button
              type="button"
              key={layer}
              className={`wb-layer-btn ${activeLayer === layer ? "active" : ""}`}
              onClick={() => setActiveLayer(layer)}
            >
              <Layers size={14} />
              {layer === "ground" && "Chão"}
              {layer === "structures" && "Estruturas"}
              {layer === "decorations" && "Decoração"}
            </button>
          ))}
        </div>
        <div className="wb-layer-selector" style={{ marginTop: "4px" }}>
          {(["zones", "spawns", "interactables"] as const).map((layer) => (
            <button
              type="button"
              key={layer}
              className={`wb-layer-btn ${activeLayer === layer ? "active" : ""}`}
              onClick={() => setActiveLayer(layer)}
            >
              <Layers size={14} />
              {layer === "zones" && "Zonas"}
              {layer === "spawns" && "Spawns"}
              {layer === "interactables" && "Interativos"}
            </button>
          ))}
        </div>
      </section>

      {["ground", "structures", "decorations"].includes(activeLayer) ? (
        <section className="wb-section wb-palette-section">
          <h3>Biblioteca de Itens</h3>
          <div className="wb-search-wrapper">
            <Search size={14} />
            <input
              type="text"
              placeholder="Buscar tile..."
              value={tileSearch}
              onChange={(e) => setTileSearch(e.target.value)}
              className="wb-search-input"
            />
          </div>
          <div className="wb-palette-scroll">
            <button
              type="button"
              className={`wb-tile-btn ${activeTile === null ? "active" : ""}`}
              onClick={() => setActiveTile(null)}
              title="Borracha (Apagar)"
            >
              <Eraser size={20} />
            </button>

            {filteredCategories.map((category) => (
              <div key={category.label} className="wb-tile-category">
                <span className="wb-tile-category-label">{category.label}</span>
                <div className="wb-tile-category-grid">
                  {category.tiles.map((tileId) => {
                    const frameIndex = TILE_FRAME_BY_ID[tileId];
                    return (
                      <button
                        type="button"
                        key={tileId}
                        className={`wb-tile-btn ${activeTile === tileId ? "active" : ""}`}
                        onClick={() => setActiveTile(tileId)}
                        title={TILE_LABELS[tileId]}
                      >
                        <div
                          className="wb-tile-preview"
                          style={{
                            backgroundImage: "url(/assets/pixel/campus-tiles.png)",
                            backgroundPosition: `-${frameIndex * ART_TILE_SIZE}px 0px`,
                            width: ART_TILE_SIZE,
                            height: ART_TILE_SIZE,
                            transform: "scale(1.5)",
                            imageRendering: "pixelated",
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="wb-section">
          <h3>
            Edição de{" "}
            {activeLayer === "zones"
              ? "Zonas"
              : activeLayer === "spawns"
                ? "Spawns"
                : "Interativos"}
          </h3>
          <p className="wb-hint">
            {activeLayer === "spawns"
              ? "Clique no mapa para criar um spawn."
              : "Clique e arraste no mapa para criar."}
          </p>
          <div className="wb-metadata-list">
            {activeLayer === "zones" &&
              draftMap?.zones.map((zone, i) => (
                <div key={zone.id} className="wb-metadata-item">
                  <div className="wb-metadata-item-header">
                    <span className="wb-metadata-id">{zone.id}</span>
                    <button
                      type="button"
                      onClick={() => {
                        mutateDraft((d) => {
                          // biome-ignore lint/suspicious/noExplicitAny: typing
                          (d.zones as any) = d.zones.filter((_, idx) => idx !== i);
                        });
                      }}
                      className="wb-metadata-delete"
                      aria-label={`Remover zona ${zone.id}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    className="wb-metadata-input"
                    value={zone.label}
                    onChange={(e) => {
                      mutateDraft((d) => {
                        const targetZone = d.zones[i];
                        if (targetZone) {
                          targetZone.label = e.target.value;
                        }
                      });
                    }}
                    placeholder="Nome da Zona"
                  />
                  <select
                    className="wb-metadata-select"
                    value={zone.acousticMode}
                    onChange={(e) => {
                      mutateDraft((d) => {
                        const targetZone = d.zones[i];
                        if (targetZone) {
                          // biome-ignore lint/suspicious/noExplicitAny: typing
                          targetZone.acousticMode = e.target.value as any;
                        }
                      });
                    }}
                  >
                    <option value="open">Aberto (open)</option>
                    <option value="private">Privado (private)</option>
                  </select>
                </div>
              ))}
            {activeLayer === "spawns" &&
              draftMap?.spawns.map((spawn, i) => (
                <div
                  key={`${spawn.x},${spawn.y}`}
                  className="wb-metadata-item wb-metadata-item--row"
                >
                  <span className="wb-metadata-label">
                    Spawn {i + 1} ({spawn.x}, {spawn.y})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      mutateDraft((d) => {
                        // biome-ignore lint/suspicious/noExplicitAny: typing
                        (d.spawns as any) = d.spawns.filter((_, idx) => idx !== i);
                      });
                    }}
                    className="wb-metadata-delete"
                    aria-label={`Remover spawn ${i + 1}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            {activeLayer === "interactables" &&
              draftMap?.interactables.map((int, i) => (
                <div key={int.id} className="wb-metadata-item">
                  <div className="wb-metadata-item-header">
                    <span className="wb-metadata-id">{int.id}</span>
                    <button
                      type="button"
                      onClick={() => {
                        mutateDraft((d) => {
                          // biome-ignore lint/suspicious/noExplicitAny: typing
                          (d.interactables as any) = d.interactables.filter((_, idx) => idx !== i);
                        });
                      }}
                      className="wb-metadata-delete"
                      aria-label={`Remover interativo ${int.id}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <select
                    className="wb-metadata-select"
                    value={int.kind}
                    onChange={(e) => {
                      mutateDraft((d) => {
                        const target = d.interactables[i];
                        if (target) {
                          // biome-ignore lint/suspicious/noExplicitAny: typing
                          target.kind = e.target.value as any;
                        }
                      });
                    }}
                  >
                    <option value="focus_desk">Mesa de Foco</option>
                    <option value="screen_station">Telão / Apresentação</option>
                    <option value="whiteboard">Quadro Branco</option>
                  </select>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="wb-section">
        <h3>Ferramentas</h3>
        <div className="wb-tools">
          <button
            type="button"
            className={`wb-tool-btn ${activeTool === "pencil" ? "active" : ""}`}
            onClick={() => setActiveTool("pencil")}
            title={TOOL_TIPS.pencil}
          >
            <Pencil size={16} /> Lápis
          </button>
          <button
            type="button"
            className={`wb-tool-btn ${activeTool === "rect" ? "active" : ""}`}
            onClick={() => setActiveTool("rect")}
            title={TOOL_TIPS.rect}
          >
            <Square size={16} /> Retângulo
          </button>
          <button
            type="button"
            className={`wb-tool-btn ${activeTool === "fill" ? "active" : ""}`}
            onClick={() => setActiveTool("fill")}
            title={TOOL_TIPS.fill}
          >
            <PaintBucket size={16} /> Balde
          </button>
        </div>
        <div className="wb-tools" style={{ marginTop: "6px" }}>
          <button
            type="button"
            className={`wb-tool-btn ${showGrid ? "active" : ""}`}
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid3X3 size={16} /> Grade
          </button>
          <button type="button" className="wb-tool-btn" onClick={onUndo} title="Desfazer (Ctrl+Z)">
            <Undo size={16} /> Desfazer
          </button>
          <button type="button" className="wb-tool-btn" onClick={onRedo} title="Refazer (Ctrl+Y)">
            <Redo size={16} /> Refazer
          </button>
        </div>
      </section>

      <footer className="wb-footer">
        {publishError && (
          <div className="wb-publish-error">
            <AlertTriangle size={14} />
            {publishError}
          </div>
        )}
        {confirmPublish && !publishError && (
          <div className="wb-publish-confirm">Tem certeza? Clique novamente para confirmar.</div>
        )}
        <button
          type="button"
          className={`wb-publish-btn${publishSuccess ? " wb-publish-btn--success" : ""}`}
          onClick={handlePublish}
          disabled={publishing || !isDirty}
        >
          {publishSuccess ? (
            <>
              <Check size={16} /> Publicado!
            </>
          ) : publishing ? (
            "Publicando..."
          ) : (
            <>
              <Save size={16} /> {confirmPublish ? "Confirmar Publicação" : "Publicar Mapa"}
            </>
          )}
        </button>
      </footer>
    </aside>
  );
}
