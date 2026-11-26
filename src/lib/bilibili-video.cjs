const VIDEO_LINE = /^(?:【[^】\r\n]+】[ \t\u00a0]*)?(?:\[[^\]\r\n]+\]\((<?https?:\/\/[^\s<>()]+>?)\)|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>()]+))[ \t]*$/i;

// Both renderers recognize a standalone video link, optionally with a pasted
// Bilibili caption. Construct player URLs from the video ID and supported
// parameters only, so sharing/tracking parameters stay out of the iframe.
function playerForLine(line) {
  if (/[\r\n]/.test(line)) return null;
  const match = VIDEO_LINE.exec(line.trim());
  if (!match) return null;

  let link;
  try {
    const destination = (match[1] || match[2] || match[3])
      .replace(/^<|>$/g, '').replace(/\\&|&amp;/g, '&');
    link = new URL(destination);
  } catch {
    return null;
  }
  if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(link.hostname) ||
      link.port || link.username || link.password) return null;

  const id = /^\/video\/(BV[A-Za-z0-9]{10}|av[1-9]\d*)\/?$/i.exec(link.pathname)?.[1];
  if (!id) return null;

  const player = new URL('https://player.bilibili.com/player.html');
  if (/^BV/i.test(id)) player.searchParams.set('bvid', 'BV' + id.slice(2));
  else player.searchParams.set('aid', id.slice(2));
  for (const [param, valid] of [['p', /^[1-9]\d*$/], ['t', /^\d+(?:\.\d+)?$/]]) {
    const value = link.searchParams.get(param);
    if (value && valid.test(value)) player.searchParams.set(param, value);
  }
  player.searchParams.set('autoplay', '0');
  player.searchParams.set('danmaku', '0');
  return player.href;
}

module.exports = { playerForLine };
