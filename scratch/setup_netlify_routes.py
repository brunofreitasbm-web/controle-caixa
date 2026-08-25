import shutil, os

base_dir = r"c:\Users\bruno\Documents\Projetos\Huboperacoes"

landing_file = os.path.join(base_dir, "Hub de Operações - Landing.html")
root_index = os.path.join(base_dir, "index.html")

# Copy landing page to index.html in root
shutil.copyfile(landing_file, root_index)
print("Copied landing page to root index.html")

# Create netlify.toml
netlify_toml = os.path.join(base_dir, "netlify.toml")
with open(netlify_toml, "w", encoding="utf-8") as f:
    f.write("""[build]
  publish = "."

[[redirects]]
  from = "/webapp"
  to = "/webapp/index.html"
  status = 200

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
print("Created netlify.toml")

# Create _redirects
redirects_file = os.path.join(base_dir, "_redirects")
with open(redirects_file, "w", encoding="utf-8") as f:
    f.write("""/webapp /webapp/index.html 200
/webapp/* /webapp/:splat 200
/app /webapp/index.html 200
/login /webapp/index.html 200
""")
print("Created _redirects")
