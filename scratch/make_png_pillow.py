import os
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, out_path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Cantos arredondados (squircle)
    radius = int(size * 0.22)
    
    # Criar mascara para o fundo gradiente
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)

    # Gradiente de fundo: Vinho escuro luxuoso (#4a121a -> #1f0508)
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        r = int(74 - (74 - 31) * (y / size))
        g = int(18 - (18 - 5) * (y / size))
        b = int(26 - (26 - 8) * (y / size))
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    
    img.paste(bg, (0, 0), mask)

    # Borda Dourada (#bd954b)
    border_w = max(2, int(size * 0.025))
    gold_color = (189, 149, 75, 255)
    gold_light = (223, 203, 165, 255)
    
    draw.rounded_rectangle(
        [border_w, border_w, size - border_w, size - border_w],
        radius=radius - border_w,
        outline=gold_color,
        width=border_w
    )

    # Desenhar Cofre / Caixa Registradora
    box_x1 = int(size * 0.22)
    box_y1 = int(size * 0.27)
    box_x2 = int(size * 0.78)
    box_y2 = int(size * 0.71)
    box_radius = int(size * 0.05)

    # Corpo do Cofre
    draw.rounded_rectangle([box_x1, box_y1, box_x2, box_y2], radius=box_radius, fill=(55, 12, 18, 255), outline=gold_color, width=max(1, int(size*0.02)))

    # Display Trapézio Topo
    p1 = (int(size * 0.36), box_y1)
    p2 = (int(size * 0.40), int(size * 0.17))
    p3 = (int(size * 0.60), int(size * 0.17))
    p4 = (int(size * 0.64), box_y1)
    draw.polygon([p1, p2, p3, p4], fill=gold_light)

    # Linha da Gaveta
    drawer_y = int(size * 0.53)
    draw.line([(int(size * 0.26), drawer_y), (int(size * 0.74), drawer_y)], fill=gold_color, width=max(1, int(size*0.02)))

    # Puxador da Gaveta
    draw.rounded_rectangle([int(size * 0.42), int(size * 0.59), int(size * 0.58), int(size * 0.64)], radius=2, fill=gold_light)

    # Cifrão ($)
    try:
        font_dollar = ImageFont.truetype("arialbd.ttf", int(size * 0.18))
    except:
        font_dollar = ImageFont.load_default()
        
    draw.text((size // 2, int(size * 0.40)), "$", font=font_dollar, fill=gold_light, anchor="mm")

    # Texto CONTROLE DE CAIXA
    try:
        font_text = ImageFont.truetype("arialbd.ttf", int(size * 0.065))
    except:
        font_text = ImageFont.load_default()

    draw.text((size // 2, int(size * 0.82)), "CONTROLE DE CAIXA", font=font_text, fill=gold_light, anchor="mm")

    img.save(out_path)

os.makedirs('webapp/icons', exist_ok=True)
create_icon(192, 'webapp/icons/icon-192.png')
create_icon(512, 'webapp/icons/icon-512.png')
create_icon(64, 'webapp/favicon.ico')
print("Icons created with Pillow successfully!")
