import json, csv, networkx as nx, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
m=json.load(open('mentions.json'))
CAT={
 'Cómputo y runtime':['compute','container','run','cloudfunctions','appengine','batch','workstations','tpu','vmmigration','baremetalsolution','cloudtasks','cloudscheduler','workflows','eventarc','clouddeploy','cloudbuild','artifactregistry','composer','dataproc','dataflow','notebooks'],
 'Datos y analítica':['bigquery','bigqueryreservation','bigquerydatatransfer','dataplex','datacatalog','dataform','datastream','dataproc','dataflow','spanner','bigtableadmin','alloydb','sqladmin','firestore','redis','memcache','pubsub','storage','filestore'],
 'IA y ML':['aiplatform','discoveryengine','dialogflow','vision','translate','speech','language','documentai','healthcare','recaptchaenterprise','videointelligence'],
 'Red y seguridad':['networkconnectivity','networkservices','networksecurity','dns','apigateway','apigee','accesscontextmanager','beyondcorp','iap','binaryauthorization','certificatemanager','privateca','cloudkms','secretmanager','securitycenter','ids','servicenetworking'],
 'Observabilidad y gobierno':['logging','monitoring','cloudtrace','cloudasset','cloudbilling','serviceusage','servicemanagement','orgpolicy','osconfig','oslogin'],
 'Control plane':['iam','cloudresourcemanager'],
}
cat_of={s:c for c,l in CAT.items() for s in l}
COL={'Cómputo y runtime':'#4E79A7','Datos y analítica':'#F28E2B','IA y ML':'#E15759','Red y seguridad':'#76B7B2','Observabilidad y gobierno':'#59A14F','Control plane':'#999999','Otros':'#BAB0AC'}
TH=10
G=nx.DiGraph()
rows=[]
for s,d in m.items():
    if not d: continue
    for t,c in d.items():
        rows.append((s,t,c))
        if c>=TH and s!=t:
            G.add_edge(s,t,weight=c)
for n in G.nodes: G.nodes[n]['cat']=cat_of.get(n,'Otros')
# drop isolated
G.remove_nodes_from([n for n in list(G) if G.degree(n)==0])
with open('edges_all.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['source','target','mentions','target_is_control_plane'])
    for s,t,c in sorted(rows,key=lambda r:-r[2]):
        w.writerow([s,t,c,t in ('iam','cloudresourcemanager')])
print('nodes',G.number_of_nodes(),'edges',G.number_of_edges())
pos=nx.spring_layout(G.to_undirected(),seed=7,k=1.4,iterations=300)
fig,ax=plt.subplots(figsize=(18,13),dpi=130)
ctrl=[e for e in G.edges if e[1] in ('iam','cloudresourcemanager')]
data=[e for e in G.edges if e not in ctrl]
nx.draw_networkx_edges(G,pos,edgelist=data,width=[0.4+G[u][v]['weight']/25 for u,v in data],alpha=0.35,edge_color='#555',arrows=True,arrowsize=8,connectionstyle='arc3,rad=0.08',ax=ax,min_source_margin=12,min_target_margin=12)
nx.draw_networkx_edges(G,pos,edgelist=ctrl,width=0.5,alpha=0.12,edge_color='#999',arrows=False,ax=ax)
for c,col in COL.items():
    ns=[n for n in G if G.nodes[n]['cat']==c]
    size=[300+ G.degree(n,weight='weight')*2.2 for n in ns]
    nx.draw_networkx_nodes(G,pos,nodelist=ns,node_color=col,node_size=size,alpha=0.9,ax=ax,label=c)
nx.draw_networkx_labels(G,pos,font_size=7.5,font_color='black',ax=ax)
ax.legend(loc='lower left',fontsize=10,frameon=False,markerscale=1.2)
ax.set_title('Grafo de menciones entre servicios de Google Cloud (≥10 menciones en discovery docs)\nArista A→B: la API de A nombra a B en sus descripciones · tamaño = grado ponderado · aristas grises = capa IAM/Resource Manager',fontsize=12)
ax.axis('off')
plt.tight_layout()
plt.savefig('grafo_dependencias_gcp.png',bbox_inches='tight')
# degree stats
ind=sorted(G.in_degree(weight='weight'),key=lambda x:-x[1])[:12]
outd=sorted(G.out_degree(weight='weight'),key=lambda x:-x[1])[:12]
print('most depended-on (in):',ind)
print('most dependent (out):',outd)
