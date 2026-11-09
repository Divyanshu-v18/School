@echo off
cd /d "D:\school\admin\backend"
set "DB_SSL_CA=%USERPROFILE%\mysql-certs\ca.pem"
"D:\school\venv\Scripts\python.exe" -c "import ssl; old=ssl.create_default_context; ssl.create_default_context=lambda *a,**k: (lambda c: (setattr(c,'verify_flags',c.verify_flags & ~ssl.VERIFY_X509_STRICT) or c))(old(*a,**k)); import mysql.connector; original=mysql.connector.connect; mysql.connector.connect=lambda *a,**kw: original(*a,**(kw | {'use_pure':True,'ssl_verify_identity':False})); import uvicorn; uvicorn.run('main:app',host='127.0.0.1',port=8000)"
pause
