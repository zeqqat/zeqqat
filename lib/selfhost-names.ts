// Names the one-button install gives things in the user's Dokploy, shared by
// the page (to show them first) and the install steps (to use them).

// Only a free address Dokploy could have made is taken from the page.
export function isFreeAddress(host: string | undefined | null): host is string {
  return !!host && /^[a-z0-9-]{1,120}\.(sslip\.io|traefik\.me)$/i.test(host) && !/(^|-)127-0-0-1\./.test(host);
}

// "Zeqqat | <where it runs>", shortened to the part that tells installs
// apart: zeqqat-ab12cd-13-53-192-23.sslip.io reads
// "Zeqqat | ....ab12cd-13-53-192-23.sslip.io".
export function projectNameFor(host: string | undefined | null) {
  return isFreeAddress(host) ? `Zeqqat | ${host.replace(/^zeqqat-/, "....")}` : "zeqqat";
}
