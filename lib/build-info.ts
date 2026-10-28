export function getBuildInfo(version: string, commitSha = '', builtAt = '') {
  const commit = /^[a-f0-9]{7,64}$/i.test(commitSha) ? commitSha.toLowerCase() : undefined;
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(builtAt)
    && Number.isFinite(Date.parse(builtAt)) ? new Date(builtAt).toISOString() : undefined;
  return {
    version: commit ? `${version}+${commit.slice(0, 7)}` : version,
    commit,
    builtAt: timestamp,
    builtAtLabel: timestamp ? new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    }).format(new Date(timestamp)) : undefined,
  };
}

export const appBuildInfo = getBuildInfo(
  process.env.NEXT_PUBLIC_APP_VERSION || 'development',
  process.env.NEXT_PUBLIC_APP_COMMIT_SHA,
  process.env.NEXT_PUBLIC_APP_BUILT_AT,
);