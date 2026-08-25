import json, re

email_file = r"c:\Users\bruno\Documents\Projetos\Huboperacoes\saas-admin\Hub de Operações - Emails (standalone).html"

with open(email_file, "r", encoding="utf-8") as f:
    content = f.read()

match = re.search(r'<script type="__bundler/template">(.*?)</script>', content, re.DOTALL)
if match:
    raw_template = match.group(1)
    template_str = json.loads(raw_template)
    print("Email template HTML length:", len(template_str))
    
    with open(r"c:\Users\bruno\Documents\Projetos\Huboperacoes\scratch\unbundled_emails.html", "w", encoding="utf-8") as out:
        out.write(template_str)
    print("Saved unbundled email template to scratch/unbundled_emails.html")
else:
    print("Could not find template tag in email file")
