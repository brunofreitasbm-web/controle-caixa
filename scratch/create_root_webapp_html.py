import shutil, os

base_dir = r"c:\Users\bruno\Documents\Projetos\Huboperacoes"
webapp_index = os.path.join(base_dir, "webapp", "index.html")
root_webapp = os.path.join(base_dir, "webapp.html")
root_login = os.path.join(base_dir, "login.html")

shutil.copyfile(webapp_index, root_webapp)
shutil.copyfile(webapp_index, root_login)
print("Copied webapp/index.html to root webapp.html and login.html")
