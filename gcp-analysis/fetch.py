import json, urllib.request, concurrent.futures as cf, os
apis=json.load(open('apis.json'))['items']
cloud_names={'compute','container','run','cloudfunctions','bigquery','bigtableadmin','spanner','sqladmin','alloydb','firestore','pubsub','storage','cloudkms','iam','cloudresourcemanager','dns','logging','monitoring','aiplatform','dataproc','dataflow','composer','workflows','cloudbuild','artifactregistry','secretmanager','redis','memcache','networkconnectivity','networksecurity','networkservices','apigateway','apigee','securitycenter','cloudasset','servicemanagement','serviceusage','cloudscheduler','cloudtasks','eventarc','datastream','dataplex','discoveryengine','dialogflow','vision','speech','translate','language','workstations','gkehub','gkebackup','vmmigration','baremetalsolution','bigqueryreservation','cloudtrace','clouddeploy','certificatemanager','privateca','binaryauthorization','ids','accesscontextmanager','beyondcorp','iap','oslogin','osconfig','batch','tpu','notebooks','healthcare','looker','tpu','firebasehosting','appengine','apphub','orgpolicy','recommender','memcache','datacatalog','bigquerydatatransfer','dataform','datalabeling','documentai','videointelligence','recaptchaenterprise','websecurityscanner','cloudbilling','billingbudgets','compute'}
want=[a for a in apis if a['name'] in cloud_names and a.get('preferred')]
seen=set(); sel=[]
for a in want:
    if a['name'] in seen: continue
    seen.add(a['name']); sel.append(a)
def get(a):
    try:
        with urllib.request.urlopen(a['discoveryRestUrl'], timeout=60) as r:
            d=json.loads(r.read())
    except Exception as e:
        return a['name'], None, str(e)
    def walk(res, acc):
        for k,v in res.items():
            acc['methods']+=len(v.get('methods',{}))
            acc['resources']+=1
            walk(v.get('resources',{}), acc)
    acc={'methods':len(d.get('methods',{})),'resources':0}
    for rn,rv in d.get('resources',{}).items():
        acc['resources']+=1
        acc['methods']+=len(rv.get('methods',{}))
        walk(rv.get('resources',{}), acc)
    return a['name'], {'title':d.get('title'),'version':d.get('version'),'rootUrl':d.get('rootUrl'),'servicePath':d.get('servicePath'),'auth_scopes':len(d.get('auth',{}).get('oauth2',{}).get('scopes',{})),'methods':acc['methods'],'resources':acc['resources'],'schemas':len(d.get('schemas',{}))}, None
out={}
with cf.ThreadPoolExecutor(12) as ex:
    for name,info,err in ex.map(get, sel):
        out[name]=info or {'error':err}
json.dump(out,open('cloud_stats.json','w'),indent=1)
print('fetched',len(out),'errors',sum(1 for v in out.values() if 'error' in v))
