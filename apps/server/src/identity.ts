export type IdentityService = {
  validateAdminKey: (key: string) => boolean;
};

export function createIdentityService(
  environment: NodeJS.ProcessEnv = process.env,
): IdentityService {
  const adminKey = environment.CAMPUS_ADMIN_KEY?.trim();

  return {
    validateAdminKey(key) {
      if (!adminKey) {
        return false;
      }

      const trimmedKey = key.trim();
      return trimmedKey.length > 0 && trimmedKey === adminKey;
    },
  };
}
