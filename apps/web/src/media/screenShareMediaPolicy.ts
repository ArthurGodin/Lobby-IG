import type { ScreenShareSnapshot } from "@ig-campus/contracts";

export type ScreenShareMediaPlan = {
  revision: number | null;
  failClosed: boolean;
  allowedPresenterIdentities: string[];
  audienceIdentities: string[];
  immediatelyBlockedPresenterIdentities: string[];
};

export function buildScreenShareMediaPlan(
  snapshot: ScreenShareSnapshot | null,
  lastRevision: number,
  previousAllowedPresenterIdentities: ReadonlySet<string>,
): ScreenShareMediaPlan | null {
  if (!snapshot) {
    return {
      revision: null,
      failClosed: true,
      allowedPresenterIdentities: [],
      audienceIdentities: [],
      immediatelyBlockedPresenterIdentities: [...previousAllowedPresenterIdentities].sort(),
    };
  }

  if (snapshot.revision <= lastRevision) {
    return null;
  }

  const allowedPresenterIdentities = snapshot.presentations
    .map((presentation) => presentation.presenterSessionId)
    .sort();
  const allowedSet = new Set(allowedPresenterIdentities);

  return {
    revision: snapshot.revision,
    failClosed: false,
    allowedPresenterIdentities,
    audienceIdentities: [...snapshot.audienceSessionIds].sort(),
    immediatelyBlockedPresenterIdentities: [...previousAllowedPresenterIdentities]
      .filter((identity) => !allowedSet.has(identity))
      .sort(),
  };
}
