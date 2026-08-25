import json, re

file_path = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\Hub de Operações - Landing.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Extract script type="__bundler/template"
match = re.search(r'<script type="__bundler/template">(.*?)</script>', content, re.DOTALL)
if match:
    raw_template = match.group(1)
    template_str = json.loads(raw_template)
    print("Template length:", len(template_str))
    
    # Save the unbundled single-file HTML to a scratch file so we can view/edit it directly if needed!
    with open(r"c:\Users\bruno\Documents\Projetos\Huboperacoes\scratch\unbundled_landing.html", "w", encoding="utf-8") as out:
        out.write(template_str)
    print("Saved unbundled HTML to scratch/unbundled_landing.html")
else:
    print("Could not find template tag")
