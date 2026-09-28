// 텍스트가 maxWidth 안에 들어가도록 후보 문자열을 차례로 넣고, 각 후보마다 글자 크기를 줄여 본다.
import type Phaser from 'phaser';

export function fitText(t: Phaser.GameObjects.Text, texts: readonly string[], maxWidth: number, baseFontPx: number, minFontPx = baseFontPx - 8): void {
  for (const s of texts) {
    for (let size = baseFontPx; size >= minFontPx; size -= 2) {
      t.setFontSize(size).setText(s);
      if (t.width <= maxWidth) return;
    }
  }
  // 끝까지 안 맞으면 마지막 후보를 최소 크기로 둔다 (위 루프의 마지막 상태)
}
