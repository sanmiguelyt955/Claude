# Tu kit para: quiero que la IA responda automáticamente los correos de los clientes de mi tienda en Shopify y que me avise por Telegram cuando haya un problema
**Condiciones:** para monetizar (uso comercial), donde corre: cloud

## 🥇 Combinación recomendada (primer lugar)
| # | Paso | Kit | Puntos | Por qué |
|---|---|---|---|---|
| 1 | Monitorear correos entrantes | 🔌 Gmail | 50 | Es necesario para que la IA pueda detectar y leer los nuevos mensajes de los clientes. |
| 2 | Consultar datos del pedido | 🔌 Shopify (Unofficial) | 85 | La IA necesita conocer el estado del pedido y el historial del cliente para responder con precisión. |
| 3 | Generar respuesta técnica | 🎓 wshobson/agents/paypal-integration | 88 | Aplica conocimientos específicos de atención al cliente para resolver dudas de envíos o devoluciones. |
| 4 | Enviar respuesta al cliente | 🔌 Gmail | 54 | Permite entregar la respuesta generada automáticamente a la dirección de correo del cliente. |
| 5 | Alertar incidencias en Telegram | 🔌 Telegram MCP by usefulapi | 66 | Notifica de forma inmediata si un correo es marcado como urgente o requiere intervención manual. |

## 🎓 Skills
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 3 | Generar respuesta técnica | **[wshobson/agents/paypal-integration](https://github.com/wshobson/agents)** (82) ⚠️ sin verificar | **[NousResearch/hermes-agent/shop](https://github.com/NousResearch/hermes-agent)** (74) ⚠️ sin verificar | `npx skills add wshobson/agents --skill paypal-integration` |

## 🔌 Conectores
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 1 | Monitorear correos entrantes | **Gmail** (44) ✔ verificado ✅ ya lo tienes | — | ✅ ya lo tienes |
| 2 | Consultar datos del pedido | **[Shopify (Unofficial)](https://github.com/pipeworx-io/mcp-shopify)** (79) ✔ verificado | **[DirectAPI Labs: Shopify Store Leads & Products](https://github.com/whthpnd/directapi-mcp-servers)** (61) ✔ verificado | `claude.ai → Conectores → https://gateway.pipeworx.io/shopify/mcp` |
| 4 | Enviar respuesta al cliente | **Gmail** (48) ✔ verificado ✅ ya lo tienes | — | ✅ ya lo tienes |
| 5 | Alertar incidencias en Telegram | **[Telegram MCP by usefulapi](https://github.com/m190/usefulapi-mcp)** (60) ✔ verificado | **[Limzo Telegram Group Stats](https://github.com/LimzoCom/limzo-mcp)** (58) ✔ verificado | `claude.ai → Conectores → https://telegram.usefulapi.io/mcp` |
