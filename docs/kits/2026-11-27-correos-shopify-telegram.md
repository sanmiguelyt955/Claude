# Tu kit para: quiero que la IA responda automáticamente los correos de los clientes de mi tienda en Shopify y que me avise por Telegram cuando haya un problema
**Condiciones:** para monetizar (uso comercial), donde corre: cloud

## 🥇 Combinación recomendada (primer lugar)
| # | Paso | Kit | Puntos | Por qué |
|---|---|---|---|---|
| 1 | Leer los correos de clientes | 🔌 Gmail | 69 | El conector oficial de Gmail lee tu bandeja; ya lo tienes conectado. |
| 2 | Consultar el pedido en Shopify | 🔌 Shopify | 87 | El conector oficial de Shopify consulta pedidos (list-orders); ya lo tienes. |
| 3 | Escribir la respuesta | 🎓 composio-community/awesome-codex-skills/support-ticket-triage | 76 | Clasifica cada correo (urgente, devolución, envío…) y redacta la respuesta adecuada. |
| 4 | Enviar la respuesta | 🔌 Gmail | 60 | El mismo Gmail envía la respuesta al cliente. |
| 5 | Avisar por Telegram si hay un problema | 🔌 Telegram MCP by usefulapi | 80 | Un bot de Telegram te manda el aviso al instante cuando hay un problema. |

## 🎓 Skills
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 3 | Escribir la respuesta | **[composio-community/awesome-codex-skills/support-ticket-triage](https://github.com/composio-community/awesome-codex-skills)** (70) ✔ verificado | **[googleworkspace/cli/persona-customer-support](https://github.com/googleworkspace/cli)** (82) ✔ verificado | `npx skills add composio-community/awesome-codex-skills --skill support-ticket-triage` |

## 🔌 Conectores
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 1 | Leer los correos de clientes | **Gmail** (63) ✔ verificado ✅ ya lo tienes | **[Inbox Zero](https://github.com/elie222/inbox-zero)** (79) ✔ verificado | ✅ ya lo tienes |
| 2 | Consultar el pedido en Shopify | **Shopify** (81) ✔ verificado ✅ ya lo tienes | **[Shopify (Sprites)](https://github.com/sprites-ai/shopify-mcp-server)** (74) ✔ verificado · 💳 de paga (opcional): **[Shopify App Store 1-Star Churn & Dev Emails MCP](https://github.com/truonggiang0111/b2b-ai-mcp-skills)** (54) ✔ verificado | ✅ ya lo tienes |
| 4 | Enviar la respuesta | **Gmail** (54) ✔ verificado ✅ ya lo tienes | — | ✅ ya lo tienes |
| 5 | Avisar por Telegram si hay un problema | **[Telegram MCP by usefulapi](https://github.com/m190/usefulapi-mcp)** (74) ✔ verificado | **[SendSeven](https://github.com/SendSeven-GmbH/sendseven-mcp-server)** (74) ✔ verificado | `claude.ai → Conectores → https://telegram.usefulapi.io/mcp` |

_2 descartados porque no funcionan: sidetoolco/org-charts/customer-support, ChatPush: WhatsApp, Telegram, MAX & SMS_
