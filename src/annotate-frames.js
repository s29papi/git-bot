import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function wrapText(value, limit) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [''];
  for (const word of words) {
    const lineIndex = lines.length - 1;
    const candidate = lines[lineIndex] ? `${lines[lineIndex]} ${word}` : word;
    if (candidate.length <= limit || lines.length === 2) {
      lines[lineIndex] = candidate;
    } else {
      lines.push(word);
    }
  }
  const last = lines.at(-1);
  if (last.length > limit) lines[1] = `${last.slice(0, limit - 1)}…`;
  return lines.slice(0, 2);
}

function frameCaption({ objective, events, time }) {
  const event = events.filter((item) => item.at <= time).at(-1);
  if (!event) return { tag: 'Kane objective', message: objective, status: 'objective' };
  return event;
}

function targetCallout(width, height, targetBox, targetText) {
  if (!targetBox || !targetText || targetBox.width <= 0 || targetBox.height <= 0) return '';
  const scaleX = width / (targetBox.viewportWidth || width);
  const scaleY = height / (targetBox.viewportHeight || height);
  const x = targetBox.x * scaleX;
  const y = targetBox.y * scaleY;
  const boxWidth = targetBox.width * scaleX;
  const boxHeight = targetBox.height * scaleY;
  const margin = Math.max(18, Math.round(width * 0.025));
  const label = `CLICK TARGET · ${targetText}`;
  const labelWidth = Math.min(width - margin * 2, Math.max(220, label.length * 10 + 26));
  const labelHeight = 38;
  const labelX = Math.max(margin, Math.min(width - margin - labelWidth, x));
  const labelY = y > labelHeight + 18 ? y - labelHeight - 12 : y + boxHeight + 12;
  const anchorX = Math.max(labelX + 14, Math.min(labelX + labelWidth - 14, x + boxWidth / 2));
  const anchorY = labelY < y ? labelY + labelHeight : labelY;
  return `<line x1="${anchorX}" y1="${anchorY}" x2="${x + boxWidth / 2}" y2="${y + boxHeight / 2}" stroke="#b42318" stroke-width="3" marker-end="url(#arrow)"/>
    <rect x="${x - 5}" y="${y - 5}" width="${boxWidth + 10}" height="${boxHeight + 10}" rx="8" fill="none" stroke="#b42318" stroke-width="4"/>
    <rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="7" fill="#fff7f5" stroke="#b42318" stroke-width="2"/>
    <text x="${labelX + 12}" y="${labelY + 25}" fill="#8f1d16" font-family="Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(label)}</text>`;
}

function overlaySvg(width, height, caption, callout = '', label = '') {
  const margin = Math.max(18, Math.round(width * 0.025));
  const cardHeight = Math.max(100, Math.min(130, Math.round(height * 0.28)));
  const cardWidth = width - margin * 2;
  const cardY = height - cardHeight - margin;
  const accent = caption.status === 'passed' ? '#2dd4a7'
    : caption.status === 'failed' ? '#ff6b6b' : '#f6bd60';
  const messageLines = wrapText(caption.message, width < 1000 ? 58 : 90);
  const fontSize = Math.max(16, Math.min(25, Math.round(width * 0.022)));
  const tagSize = Math.max(11, Math.min(15, Math.round(width * 0.012)));
  const messageText = messageLines.map((line, index) =>
    `<tspan x="${margin + 24}" dy="${index === 0 ? 0 : Math.round(fontSize * 1.25)}">${escapeXml(line)}</tspan>`
  ).join('');
  const labelText = label ? String(label).replace(/\s+/g, ' ').trim() : '';
  const labelWidth = labelText ? Math.min(width - margin * 2, Math.max(180, labelText.length * 11 + 36)) : 0;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><filter id="shadow" x="-20%" y="-30%" width="140%" height="170%"><feGaussianBlur stdDeviation="7"/></filter><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#b42318"/></marker></defs>
    ${callout}
    ${labelText ? `<rect x="${margin}" y="${margin}" width="${labelWidth}" height="38" rx="8" fill="#101820" opacity=".94"/><text x="${margin + 14}" y="${margin + 25}" fill="#fff" font-family="Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(labelText.length > 100 ? `${labelText.slice(0, 97)}…` : labelText)}</text>` : ''}
    <rect x="${margin}" y="${cardY + 4}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#000" opacity=".22" filter="url(#shadow)"/>
    <rect x="${margin}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#101820" opacity=".94"/>
    <rect x="${margin}" y="${cardY}" width="6" height="${cardHeight}" rx="3" fill="${accent}"/>
    <text x="${margin + 24}" y="${cardY + Math.round(cardHeight * 0.37)}" fill="${accent}" font-family="Arial, sans-serif" font-size="${tagSize}" font-weight="700" letter-spacing="1.2">${escapeXml(caption.tag.toUpperCase())}</text>
    <text x="${margin + 24}" y="${cardY + Math.round(cardHeight * (messageLines.length > 1 ? 0.52 : 0.72))}" fill="#fff" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="600">${messageText}</text>
  </svg>`);
}

export async function annotateFrames({ framesDir, frameTimes, targetBoxes, targetText, objective, events, label }) {
  const firstClickAt = events.find((event) => event.status === 'step' && /^Clicked\b/i.test(event.message))?.at;
  for (let index = 0; index < frameTimes.length; index += 1) {
    const filename = `${String(index + 1).padStart(6, '0')}.jpg`;
    const framePath = path.join(framesDir, filename);
    const temporaryPath = `${framePath}.annotated.jpg`;
    const image = sharp(framePath);
    const { width, height } = await image.metadata();
    const time = frameTimes[index];
    const caption = frameCaption({ objective, events, time });
    const hasNotClickedYet = firstClickAt === undefined || time <= firstClickAt;
    const callout = hasNotClickedYet
      ? targetCallout(width, height, targetBoxes[index], targetText)
      : '';
    await image
      .composite([{ input: overlaySvg(width, height, caption, callout, label) }])
      .jpeg({ quality: 90 })
      .toFile(temporaryPath);
    await fs.rename(temporaryPath, framePath);
  }
}
