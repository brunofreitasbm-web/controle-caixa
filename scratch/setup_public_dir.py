import os, shutil

base_dir = r"c:\Users\bruno\Documents\Projetos\Huboperacoes"
public_dir = os.path.join(base_dir, "public")

if os.path.exists(public_dir):
    shutil.rmtree(public_dir)

os.makedirs(public_dir)

# Files to copy to public
files_to_copy = [
    "index.html",
    "Hub de Operações - Landing.html",
    "sucesso.html",
    "webapp.html",
    "login.html",
    "_redirects"
]

for f in files_to_copy:
    src = os.path.join(base_dir, f)
    dst = os.path.join(public_dir, f)
    if os.path.exists(src):
        shutil.copyfile(src, dst)
        print(f"Copied {f} to public/")

# Copy webapp directory into public/webapp
webapp_src = os.path.join(base_dir, "webapp")
webapp_dst = os.path.join(public_dir, "webapp")
shutil.copytree(webapp_src, webapp_dst)
print("Copied webapp/ directory to public/webapp/")

# Also update netlify.toml
netlify_toml = os.path.join(base_dir, "netlify.toml")
with open(netlify_toml, "w", encoding="utf-8") as f:
    f.write("""[build]
  publish = "public"

[[redirects]]
  from = "/webapp/*"
  to = "/webapp/:splat"
  status = 200

[[redirects]]
  from = "/app"
  to = "/webapp/index.html"
  status = 200

[[redirects]]
  from = "/login"
  to = "/webapp/index.html"
  status = 200
""")

print("Updated netlify.toml with publish = 'public'")
