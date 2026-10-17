import json, urllib.request, concurrent.futures as cf, re, collections
apis=json.load(open('apis.json'))['items']
ids=json.load(open('cloud_stats.json'))
names=[k for k,v in ids.items() if 'error' not in v]
pref={}
for a in apis:
    if a.get('preferred') and a['name'] in names and a['name'] not in pref: pref[a['name']]=a
# product name -> service id (curated; regex, case-insensitive)
KW={
 'compute':r'Compute Engine|\bGCE\b',
 'container':r'Google Kubernetes Engine|\bGKE\b|Kubernetes Engine',
 'run':r'Cloud Run\b',
 'cloudfunctions':r'Cloud Functions',
 'appengine':r'App Engine',
 'bigquery':r'BigQuery',
 'bigtableadmin':r'Cloud Bigtable|\bBigtable\b',
 'spanner':r'Cloud Spanner|\bSpanner\b',
 'sqladmin':r'Cloud SQL',
 'alloydb':r'AlloyDB',
 'firestore':r'Firestore|Cloud Datastore',
 'redis':r'Memorystore|\bRedis\b',
 'storage':r'Cloud Storage|\bGCS\b|gs://',
 'pubsub':r'Pub/Sub|PubSub',
 'cloudkms':r'Cloud KMS|Key Management Service',
 'secretmanager':r'Secret Manager',
 'iam':r'Identity and Access Management|\bIAM\b',
 'cloudresourcemanager':r'Resource Manager',
 'logging':r'Cloud Logging',
 'monitoring':r'Cloud Monitoring',
 'cloudtrace':r'Cloud Trace',
 'artifactregistry':r'Artifact Registry',
 'cloudbuild':r'Cloud Build',
 'clouddeploy':r'Cloud Deploy',
 'dataflow':r'Dataflow',
 'dataproc':r'Dataproc',
 'composer':r'Cloud Composer|\bComposer\b',
 'workflows':r'Workflows',
 'eventarc':r'Eventarc',
 'cloudscheduler':r'Cloud Scheduler',
 'cloudtasks':r'Cloud Tasks',
 'dns':r'Cloud DNS',
 'networkconnectivity':r'Network Connectivity Center|Cloud Interconnect|Private Service Connect',
 'servicenetworking':r'Service Networking',
 'apigateway':r'API Gateway',
 'apigee':r'Apigee',
 'aiplatform':r'Vertex AI',
 'discoveryengine':r'Vertex AI Search|Discovery Engine',
 'cloudasset':r'Cloud Asset Inventory',
 'securitycenter':r'Security Command Center',
 'cloudbilling':r'Cloud Billing',
 'serviceusage':r'Service Usage',
 'servicemanagement':r'Service Management',
 'accesscontextmanager':r'Access Context Manager|VPC Service Controls',
 'binaryauthorization':r'Binary Authorization',
 'datacatalog':r'Data Catalog',
 'dataplex':r'Dataplex',
 'datastream':r'Datastream',
 'dataform':r'Dataform',
 'healthcare':r'Cloud Healthcare|Healthcare API',
 'documentai':r'Document AI',
 'vision':r'Cloud Vision|Vision API',
 'translate':r'Cloud Translation|Translation API',
 'speech':r'Speech-to-Text|Cloud Speech',
 'language':r'Natural Language API',
 'recaptchaenterprise':r'reCAPTCHA Enterprise',
 'filestore':r'Filestore',
 'memcache':r'Memorystore for Memcached|Memcache',
 'batch':r'Batch API|Cloud Batch',
 'workstations':r'Cloud Workstations',
 'tpu':r'Cloud TPU|\bTPU\b',
 'notebooks':r'Vertex AI Workbench|Notebooks API',
 'certificatemanager':r'Certificate Manager',
 'privateca':r'Certificate Authority Service|Private CA',
 'beyondcorp':r'BeyondCorp',
 'iap':r'Identity-Aware Proxy|\bIAP\b',
 'osconfig':r'OS Config|VM Manager',
 'oslogin':r'OS Login',
 'cloudscheduler2':r'NEVER',
}
KW={k:v for k,v in KW.items() if k in names and k not in ('cloudscheduler2',)}
pat={k:re.compile(v) for k,v in KW.items()}
def texts(d):
    out=[]
    def walk(o):
        if isinstance(o,dict):
            for k,v in o.items():
                if k=='description' and isinstance(v,str): out.append(v)
                else: walk(v)
        elif isinstance(o,list):
            for x in o: walk(x)
    walk(d); return out
def get(name):
    try:
        d=json.loads(urllib.request.urlopen(pref[name]['discoveryRestUrl'],timeout=120).read())
    except Exception as e: return name,None
    cnt=collections.Counter()
    for t in texts(d):
        for tgt,p in pat.items():
            if tgt==name: continue
            if p.search(t): cnt[tgt]+=1
    return name,dict(cnt)
res={}
with cf.ThreadPoolExecutor(12) as ex:
    for n,c in ex.map(get, [n for n in names if n in pref]):
        res[n]=c
json.dump(res,open('mentions.json','w'),indent=1)
print('services with mention data:',sum(1 for v in res.values() if v is not None),'of',len(res))
