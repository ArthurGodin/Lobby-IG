import type { AcousticSnapshot } from "@ig-campus/contracts";
import { calculateProximityGain } from "./proximityAudioPolicy";

export type AcousticMediaPlan = {
  revision: number | null;
  failClosed: boolean;
  allowedIdentities: string[];
  allowedFingerprint: string;
  immediatelyBlockedIdentities: string[];
  desiredGains: Map<string, number>;
};

export function buildAcousticMediaPlan(
  snapshot: AcousticSnapshot | null,
  lastRevision: number,
  previousAllowedIdentities: ReadonlySet<string>,
): AcousticMediaPlan | null {
  if (!snapshot) {
    return {
      revision: null,
      failClosed: true,
      allowedIdentities: [],
      allowedFingerprint: "[]",
      immediatelyBlockedIdentities: [...previousAllowedIdentities].sort(),
      desiredGains: new Map(),
    };
  }

  if (snapshot.revision <= lastRevision) {
    return null;
  }

  const allowedIdentities = [...snapshot.allowedPeerSessionIds].sort();
  const allowedSet = new Set(allowedIdentities);

  return {
    revision: snapshot.revision,
    failClosed: false,
    allowedIdentities,
    allowedFingerprint: JSON.stringify(allowedIdentities),
    immediatelyBlockedIdentities: [...previousAllowedIdentities]
      .filter((identity) => !allowedSet.has(identity))
      .sort(),
    desiredGains: new Map(
      snapshot.audiblePeers.map((peer) => [peer.sessionId, calculateProximityGain(peer.distance)]),
    ),
  };
}
