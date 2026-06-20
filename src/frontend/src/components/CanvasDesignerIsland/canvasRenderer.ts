import type { CanvasElement, Shadow } from './canvasReducer';

export function isValidDimension(w: number, h: number): boolean {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return false;
  if (w < 1 || h < 1) return false;

  const isLandscapeOrSquareValid = w <= 1920 && h <= 1080;
  const isPortraitValid = w <= 1080 && h <= 1920;

  return isLandscapeOrSquareValid || isPortraitValid;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function applyElementShadow(ctx: CanvasRenderingContext2D, shadow: Shadow): void {
  if (shadow.distance === 0 && shadow.blur === 0) return;
  const rad = (shadow.angle * Math.PI) / 180;
  const [r, g, b] = hexToRgb(shadow.color);
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${shadow.opacity / 100})`;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = Math.cos(rad) * shadow.distance;
  ctx.shadowOffsetY = Math.sin(rad) * shadow.distance;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoad: () => void,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity / 100;
  applyElementShadow(ctx, el.shadow);
  ctx.translate(el.x, el.y);
  ctx.rotate((el.rotation * Math.PI) / 180);

  switch (el.kind) {
    case 'text': {
      ctx.scale(el.scaleX, el.scaleY);
      ctx.font = `${el.fontSize}px "${el.font}", sans-serif`;
      ctx.fillStyle = el.fill;
      ctx.fillText(el.text, 0, el.fontSize);
      break;
    }
    case 'rect': {
      const w = el.width * el.scaleX;
      const h = el.height * el.scaleY;
      ctx.fillStyle = el.fill;
      ctx.fillRect(0, 0, w, h);
      if (el.strokeWidth > 0) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = el.stroke;

        if (el.strokeAlign === 'center') {
          ctx.lineWidth = el.strokeWidth;
          ctx.strokeRect(0, 0, w, h);
        } else if (el.strokeAlign === 'inside') {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.clip();
          ctx.lineWidth = el.strokeWidth * 2;
          ctx.strokeRect(0, 0, w, h);
          ctx.restore();
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            -el.strokeWidth, -el.strokeWidth,
            w + el.strokeWidth * 2, h + el.strokeWidth * 2,
          );
          ctx.rect(0, 0, w, h);
          ctx.clip('evenodd');
          ctx.lineWidth = el.strokeWidth * 2;
          ctx.strokeRect(0, 0, w, h);
          ctx.restore();
        }
      }
      break;
    }
    case 'image': {
      const w = el.width * el.scaleX;
      const h = el.height * el.scaleY;
      const cached = imageCache.get(el.src);
      if (cached?.complete) {
        ctx.drawImage(cached, 0, 0, w, h);
      } else if (!cached) {
        const img = new Image();
        img.addEventListener('load', onImageLoad, { once: true });
        img.src = el.src;
        imageCache.set(el.src, img);
      }
      break;
    }
  }

  ctx.restore();
}
