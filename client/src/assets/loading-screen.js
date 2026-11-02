export function drawLoadingScreen(
  context,
  width,
  height,
  {
    loaded = 0,
    total = 1,
    percent = 0,
    current = null,
    status = 'Завантаження ресурсів...',
  } = {},
) {
  context.save();

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#080b18';
  context.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const barWidth = Math.min(420, width - 48);
  const barHeight = 12;
  const barX = centerX - barWidth / 2;
  const barY = centerY + 20;

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.fillStyle = '#eaf2ff';
  context.font = 'bold 32px Arial, sans-serif';
  context.fillText('SPACEFIGHT', centerX, centerY - 65);

  context.fillStyle = '#8fa6c9';
  context.font = '16px Arial, sans-serif';
  context.fillText(status, centerX, centerY - 25);

  context.fillStyle = '#1a2540';
  context.fillRect(barX, barY, barWidth, barHeight);

  context.fillStyle = '#54b9ff';
  context.fillRect(
    barX,
    barY,
    barWidth * Math.max(0, Math.min(100, percent)) / 100,
    barHeight,
  );

  context.fillStyle = '#eaf2ff';
  context.font = '14px Arial, sans-serif';
  context.fillText(
    `${percent}%  (${loaded}/${total})`,
    centerX,
    barY + 34,
  );

  if (current) {
    context.fillStyle = '#8fa6c9';
    context.font = '12px Arial, sans-serif';
    context.fillText(
      `Ресурс: ${current}`,
      centerX,
      barY + 60,
      Math.max(100, width - 32),
    );
  }

  context.restore();
}
