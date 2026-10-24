import socket,subprocess,importlib.util
spec=importlib.util.spec_from_file_location('pp','audit-port-preflight.py');pp=importlib.util.module_from_spec(spec);spec.loader.exec_module(pp)
import sys
l=socket.socket()
if sys.argv[1:]==['reuse']: l.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
l.bind(('127.0.0.1',0));l.listen(1);port=l.getsockname()[1]
c=socket.create_connection(('127.0.0.1',port));s,_=l.accept()
print('live listener -> can_listen =',pp.can_listen(port))
s.close();c.recv(1);c.close();l.close()   # server closes first => TIME_WAIT on server port
print(subprocess.run(['ss','-tan',f'( sport = :{port} or dport = :{port} )'],capture_output=True,text=True).stdout)
print('TIME_WAIT -> can_listen (preflight) =',pp.can_listen(port))
n=socket.socket()
try: n.bind(('127.0.0.1',port)); print('naive bind w/o SO_REUSEADDR = OK')
except OSError as e: print('naive bind w/o SO_REUSEADDR =',e)
