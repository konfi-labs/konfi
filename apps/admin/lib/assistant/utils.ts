export function verifyRemotePattern(thumbnail: string): boolean {
  if (!thumbnail) return false;

  const allowedRemotePatterns = [
    "imgs.search.brave.com",
    "avatars.mds.yandex.net",
    "s.yimg.com",
    "external-content.duckduckgo.com",
    "th.bing.com",
    "www.bing.com",
    "encrypted-tbn*.google.com",
    "www.google.com",
  ];

  const pattern = new RegExp(
    `^https?://(${allowedRemotePatterns.join("|").replace(/\*/g, ".*")})/`,
  );
  return pattern.test(thumbnail);
}
