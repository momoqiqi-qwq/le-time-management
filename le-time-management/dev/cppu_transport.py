"""Development-only CPPU HTTP transport. Cookie jars stay in process memory."""
import sys,json,urllib.request,urllib.error,urllib.parse,http.cookiejar,secrets,base64
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
HOSTS={'sso.cppu.edu.cn','sso-jw.cppu.edu.cn','portal-jw.cppu.edu.cn'}
def allowed(url):
 p=urllib.parse.urlsplit(url)
 if p.scheme!='https' or p.hostname not in HOSTS or p.port not in (None,443) or p.username or p.password: raise ValueError('Only official CPPU HTTPS endpoints are allowed')
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  allowed(newurl)
  return super().redirect_request(req,fp,code,msg,headers,newurl)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl): return None
sessions={}
for line in sys.stdin:
 try:
  q=json.loads(line);args=q['args']
  if q['op']=='session':
   if len(sessions)>=64: sessions.pop(next(iter(sessions)))
   sid=secrets.token_urlsafe(24);sessions[sid]=http.cookiejar.CookieJar();result=sid
  else:
   allowed(args['url']);jar=sessions.get(args['sid'])
   if jar is None: raise ValueError('Session expired; log in again')
   redirect=Redirect() if args.get('followRedirects') is not False else NoRedirect()
   opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),redirect)
   headers={k:v for k,v in args.get('headers',{}).items() if k.lower() in {'content-type','referer','cookie'}}
   headers['User-Agent']='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
   req=urllib.request.Request(args['url'],data=args['body'].encode() if args.get('body') else None,headers=headers,method=args.get('method','GET'))
   try: response=opener.open(req,timeout=25)
   except urllib.error.HTTPError as e: response=e
   with response as r:
    raw=r.read(4*1024*1024)
    result={'status':r.status,'body':base64.b64encode(raw).decode() if args.get('binary') else raw.decode('utf-8','replace'),'finalUrl':r.url,'contentType':r.headers.get('content-type',''),'location':r.headers.get('location',''),'cookies':r.headers.get_all('set-cookie') or []}
  print(json.dumps({'id':q['id'],'result':result},ensure_ascii=False),flush=True)
 except Exception as e:
  print(json.dumps({'id':q.get('id'),'error':type(e).__name__+': request failed'}),flush=True)
