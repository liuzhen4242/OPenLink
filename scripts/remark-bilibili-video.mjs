import { playerForLine } from '../src/lib/bilibili-video.cjs';

export function remarkBilibiliVideo() {
  return (tree, file) => {
    const source = String(file);
    tree.children = tree.children.map((node) => {
      if (node.type !== 'paragraph' || !node.position) return node;
      const { start, end } = node.position;
      const src = playerForLine(source.slice(start.offset, end.offset));
      if (!src) return node;
      return {
        type: 'html',
        value: '<iframe class="bilibili-video-player" title="哔哩哔哩视频播放器" ' +
          'loading="lazy" referrerpolicy="no-referrer" allowfullscreen ' +
          'src="' + src.replaceAll('&', '&amp;') + '"></iframe>',
      };
    });
  };
}
