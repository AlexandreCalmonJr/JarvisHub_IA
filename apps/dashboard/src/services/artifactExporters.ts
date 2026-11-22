import PptxGenJS from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import type { StructuredArtifactPayload } from '../../server/artifactEngine';

function slugifyFilename(title: string, ext: string): string {
  const base = (title || 'artefato-jarvis')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'artefato-jarvis'}.${ext}`;
}

export async function exportArtifactToPptx(artifact: StructuredArtifactPayload): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = artifact.author || 'JARVIS AI Hub';
  pptx.title = artifact.title;

  const slides = artifact.slides && artifact.slides.length > 0
    ? artifact.slides
    : [
        {
          title: artifact.title,
          subtitle: artifact.subtitle,
          bullets: ['Conteúdo estruturado pronto para edição no PowerPoint.'],
        },
      ];

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: '0B0D12' };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y: 1.1,
    w: 1.1,
    h: 0.08,
    fill: { color: 'F97316' },
  });
  cover.addText(artifact.title, {
    x: 0.7,
    y: 1.45,
    w: 8.6,
    h: 1.4,
    fontSize: 34,
    bold: true,
    color: 'F3F4F6',
    fontFace: 'Calibri',
  });
  cover.addText(artifact.subtitle || `Criado com ${artifact.author}`, {
    x: 0.7,
    y: 3.0,
    w: 8.4,
    h: 0.8,
    fontSize: 16,
    color: '9CA3AF',
    fontFace: 'Calibri',
  });
  cover.addText(`${artifact.author} · ${new Date(artifact.created_at).toLocaleDateString('pt-BR')}`, {
    x: 0.7,
    y: 4.85,
    w: 8.0,
    h: 0.4,
    fontSize: 11,
    color: 'FB923C',
    fontFace: 'Calibri',
  });

  // Content slides
  slides.forEach((s, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: '12161F' };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.08,
      fill: { color: 'F97316' },
    });
    slide.addText(`${String(idx + 1).padStart(2, '0')} · ${s.title}`, {
      x: 0.65,
      y: 0.45,
      w: 8.7,
      h: 0.65,
      fontSize: 24,
      bold: true,
      color: 'F3F4F6',
      fontFace: 'Calibri',
    });
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.65,
        y: 1.1,
        w: 8.7,
        h: 0.45,
        fontSize: 13,
        color: 'FB923C',
        fontFace: 'Calibri',
      });
    }
    const bulletItems = (s.bullets || []).map((b) => ({
      text: b,
      options: { bullet: true, breakLine: true, paraSpaceAfter: 10 },
    }));
    if (bulletItems.length > 0) {
      slide.addText(bulletItems, {
        x: 0.75,
        y: 1.75,
        w: 8.5,
        h: 3.2,
        fontSize: 15,
        color: 'E5E7EB',
        fontFace: 'Calibri',
        valign: 'top',
      });
    }
    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes);
    }
  });

  const filename = slugifyFilename(artifact.title, 'pptx');
  await pptx.writeFile({ fileName: filename });
  return filename;
}

export function exportArtifactToPdf(artifact: StructuredArtifactPayload): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;

  // Dark Obsidian header band
  doc.setFillColor(11, 13, 18);
  doc.rect(0, 0, pageWidth, 128, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(margin, 32, 48, 4, 'F');

  doc.setTextColor(243, 244, 246);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(artifact.title, maxWidth);
  doc.text(titleLines, margin, 62);

  doc.setTextColor(209, 213, 219);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(
    `${artifact.subtitle || 'Documento Gerado'}  ·  ${artifact.author}  ·  ${new Date(artifact.created_at).toLocaleDateString('pt-BR')}`,
    margin,
    104
  );

  let y = 162;
  const sections = artifact.sections && artifact.sections.length > 0
    ? artifact.sections
    : [{ heading: 'Conteúdo', body: artifact.subtitle || artifact.title, highlights: [] }];

  for (const sec of sections) {
    if (y > pageHeight - 130) {
      doc.addPage();
      y = 56;
    }
    doc.setTextColor(234, 88, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(sec.heading, margin, y);
    y += 18;

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const bodyLines = doc.splitTextToSize(sec.body || '', maxWidth);
    doc.text(bodyLines, margin, y);
    y += bodyLines.length * 14 + 8;

    if (sec.highlights && sec.highlights.length > 0) {
      for (const h of sec.highlights) {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 56;
        }
        const hLines = doc.splitTextToSize(`•  ${h}`, maxWidth - 14);
        doc.setTextColor(55, 65, 81);
        doc.text(hLines, margin + 10, y);
        y += hLines.length * 13.5 + 4;
      }
    }
    y += 14;
  }

  const filename = slugifyFilename(artifact.title, 'pdf');
  doc.save(filename);
  return filename;
}

export async function exportSvgArtifactToPng(artifact: StructuredArtifactPayload): Promise<string> {
  const svgMarkup = artifact.svg_markup || '';
  if (!svgMarkup) {
    throw new Error('Artefato sem conteúdo visual para exportar em PNG.');
  }
  const filename = slugifyFilename(artifact.title, 'png');
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao rasterizar imagem PNG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexto 2D indisponível.');
    ctx.drawImage(img, 0, 0, 1200, 675);

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return filename;
  } finally {
    URL.revokeObjectURL(url);
  }
}
