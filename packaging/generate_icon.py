from PIL import Image, ImageDraw


def create_jarvis_icon(output_path="packaging/jarvis.ico"):
    # Base em 256x256
    base_size = 256
    img = Image.new("RGBA", (base_size, base_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Borda externa arredondada estilo placa de titânio (Dark Slate)
    pad = 12
    draw.rounded_rectangle(
        [pad, pad, base_size - pad, base_size - pad],
        radius=54,
        fill=(11, 15, 25, 255),
        outline=(99, 102, 241, 255),
        width=8,
    )

    # 2. Círculo do Reator ARC (Azul Índigo vibrante)
    center = base_size // 2
    r_outer = 90
    draw.ellipse(
        [center - r_outer, center - r_outer, center + r_outer, center + r_outer],
        fill=(30, 27, 75, 255),
        outline=(129, 140, 248, 255),
        width=6,
    )

    # 3. Anel intermediário Neon Cyan
    r_mid = 62
    draw.ellipse(
        [center - r_mid, center - r_mid, center + r_mid, center + r_mid],
        fill=(14, 116, 144, 255),
        outline=(56, 189, 248, 255),
        width=5,
    )

    # 4. Núcleo central luminoso (Branco / Ciano brilhante)
    r_core = 32
    draw.ellipse(
        [center - r_core, center - r_core, center + r_core, center + r_core],
        fill=(224, 242, 254, 255),
        outline=(255, 255, 255, 255),
        width=4,
    )

    # 5. Feixes radiais do reator (8 linhas de energia)
    import math

    for i in range(8):
        angle = i * (math.pi / 4)
        x1 = center + int(r_mid * math.cos(angle))
        y1 = center + int(r_mid * math.sin(angle))
        x2 = center + int((r_outer - 8) * math.cos(angle))
        y2 = center + int((r_outer - 8) * math.sin(angle))
        draw.line([x1, y1, x2, y2], fill=(165, 180, 252, 255), width=4)

    # Salva com todos os tamanhos padrão Windows
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(
        output_path,
        format="ICO",
        sizes=sizes,
    )
    print(f"Ícone gerado com sucesso em alta definição: {output_path}")


if __name__ == "__main__":
    create_jarvis_icon()
