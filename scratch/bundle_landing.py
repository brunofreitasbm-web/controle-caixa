import json

original_file = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\Hub de Operações - Landing.html"
unbundled_file = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\scratch\unbundled_landing.html"

with open(original_file, "r", encoding="utf-8") as f:
    full_content = f.read()

with open(unbundled_file, "r", encoding="utf-8") as f:
    unbundled_html = f.read()

json_template = json.dumps(unbundled_html)

tag_start = '<script type="__bundler/template">'
tag_end = '</script>'

idx_start = full_content.find(tag_start)
if idx_start != -1:
    idx_content_start = idx_start + len(tag_start)
    idx_end = full_content.find(tag_end, idx_content_start)
    if idx_end != -1:
        new_content = full_content[:idx_content_start] + json_template + full_content[idx_end:]
        with open(original_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Successfully updated Hub de Operações - Landing.html with unbundled_landing.html template!")
    else:
        print("Could not find closing script tag")
else:
    print("Could not find opening script tag")
