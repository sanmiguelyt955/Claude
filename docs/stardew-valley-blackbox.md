# Stardew Valley: diseño funcional de caja negra

## 1. Alcance y método

**Objetivo.** Describir qué hace Stardew Valley desde el punto de vista del jugador: entradas, salidas, reglas observables y estados, sin describir cómo está implementado.

**Método.**
- Se parte del comportamiento observable conocido del juego (mecánicas, calendario, tiendas, relaciones, minas, guardado).
- No se analizó código, binarios ni datos internos del juego. No se usó ingeniería inversa del ejecutable.
- No se jugó una partida en esta sesión. Cada regla lleva un nivel de confianza:
  - **[A]** alta: visible y documentada de forma consistente.
  - **[M]** media: observable, pero los valores exactos pueden variar según versión o modificaciones.
  - **[V]** verificar: depende de valores numéricos o casos límite que hay que confirmar jugando.

**Versión de referencia.** Versión 1.6 o posterior. Las reglas de la versión 1.5 pueden diferir en algunos puntos.

**Fuera de alcance.** Multijugador, mods, y la versión para Switch/móvil (solo se mencionan diferencias de interfaz si aplica).

---

## 2. Contexto del sistema

| Elemento | Descripción |
|---|---|
| Actor principal | Jugador (un solo personaje, con nombre, apariencia y género elegidos al crear partida). |
| Entorno | Granja asignada al jugador, pueblo Pelican Town, mundo de cuevas (minas), playa, montaña, bosque, desierto (Calico) e isla (Ginger). |
| Actores no jugadores | Aldeanos (NPC con horario, relaciones y diálogos), tiendas (Pierre, Joja, Clint, Saloon), animales, enemigos de las minas. |
| Entradas del jugador | Movimiento, uso de herramienta sobre tile, interacción con NPC/objeto, menús (inventario, mapa, habilidades, social), compra/venta, pesca, regalos, dormir. |
| Salidas del sistema | Estado del mundo (tiles, cultivos, animales), inventario, oro, energía, salud, corazones de relación, habilidades, diálogos, notificaciones. |
| Almacenamiento | Partida guardada en disco. Se guarda automáticamente al dormir y al salir a menú. |

---

## 3. Modelo de tiempo y calendario

### 3.1 Calendario
- Un año tiene 4 estaciones: Primavera, Verano, Otoño e Invierno. Cada estación tiene **28 días** [A].
- Día 1 de Primavera, año 1, es el inicio de partida [A].
- Ciclo de días de la semana: Lun, Mar, Mié, Jue, Vie, Sáb, Dom. Dependen del día del mes [A].
- Los cultivos y animales están ligados a la estación. Algunos sobreviven fuera de temporada según la regla de cada uno (ver 6.2) [A].

### 3.2 Reloj
- Cada día comienza a las **6:00** [A].
- El reloj avanza en incrementos de 10 minutos de juego [A].
- Acciones y caminar consumen tiempo de juego; el reloj no se pausa cuando hay un menú de tienda abierto, pero sí durante diálogos y cutscenes [M].
- Un día termina cuando el jugador duerme, o a las **2:00** de la madrugada, cuando el jugador se desmaya [A].
- Velocidad aproximada: unos 7 segundos reales por cada 10 minutos de juego (depende de la configuración) [M].

### 3.3 Final de día
Hay dos formas de terminar el día:

1. **Dormir** en la cama de la casa, una vez cerrada la pantalla de acciones. Se guarda la partida y comienza el día siguiente a las 6:00 [A].
2. **Desmayo** (pasar de las 2:00 o quedarse sin energía). Se pierde una parte del oro, el día se trata como dormido, y comienza a las 6:00 [M].
   - **[V]** Porcentaje exacto de oro perdido en el desmayo.
   - **[V]** Si el jugador se queda sin energía antes de las 2:00, se desmaya antes; verificar hora exacta.

### 3.4 Clima
- Cada día tiene un clima aleatorio determinado por la estación, con probabilidades fijas: soleado, lluvioso, ventoso, nevando (invierno), tormenta (verano) [M].
- La lluvia riega automáticamente los cultivos [A].
- El clima del día siguiente puede consultarse en la TV de la casa [A].

---

## 4. Estado del jugador

| Atributo | Rango | Notas |
|---|---|---|
| Energía | 0 a máximo (inicio 270) | Se consume por acción. Al llegar a 0 el jugador se desmaya [M]. Aumenta con comida, sueño y medicina [A]. |
| Salud | 0 a máximo | Baja con enemigos en las minas. Llegar a 0 provoca desmayo y pérdida de oro [A]. |
| Oro | Entero positivo | Se pierde al desmayarse y se gasta en tiendas [A]. |
| Inventario | 12 espacios base, ampliable a 36 | Se puede ampliar con mochilas en la tienda de Pierre (u otras fuentes) [M]. |
| Habilidades | Granjería, Pesca, Minería, Combate, Forrajeo | Nivel 0 a 10. Desbloquean profesiones al llegar a niveles concretos [A]. |
| Herramientas | Azada, regadera, hacha, pico, guadaña, caña | Cada una tiene niveles de mejora (Cobre, Acero, Oro, Iridio) [A]. |
| Corazones (relaciones) | 0 a 10 por aldeano | Suben por regalos, conversaciones y eventos [A]. |

**Regla de energía.** Cada acción consume energía. El consumo depende de la herramienta y de la habilidad relacionada [M].
- **[V]** Valores exactos por herramienta.

---

## 5. Mapa de módulos funcionales

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Stardew Valley                              │
│                                                                     │
│  Calendario/Reloj ──► Clima ──► Crecimiento de cultivos y animales   │
│         │                             ▲                              │
│         ▼                             │                              │
│  Granja (tiles, edificios) ◄──── Acciones con herramientas           │
│         │                             │                              │
│         ▼                             ▼                              │
│  Inventario ◄──► Tiendas ◄──► Oro     Habilidades + Energía          │
│         │                                                           │
│         ▼                                                           │
│  Relaciones (NPC, regalos, eventos) ──► Matrimonio/Hijos            │
│         │                                                           │
│         ▼                                                           │
│  Minas / Cueva / Combate ──► Ítems raros y objetivos                │
│         │                                                           │
│         ▼                                                           │
│  Guardado y carga                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Especificación funcional por módulo

### 6.1 Granja y tiles

**Entrada:** jugador usa una herramienta sobre un tile.

**Reglas:**
- La azada convierte el tile en tierra cultivable. Solo tierra sin construcciones [A].
- La regadera moja la tierra. La tierra mojada se seca al día siguiente salvo que haya lluvia [A].
- El hacha tala árboles y convierte tocones en espacio libre [A].
- El pico rompe rocas y deja mineral o piedra [A].
- La guadaña corta hierba y cosecha cultivos maduros [A].
- La caña pesca en agua; el minijuego depende de la habilidad de Pesca [A].

**Salida:** tile actualizado, objeto recogido en inventario o suelo, energía consumida.

**Casos límite:**
- Herramienta sin energía: no se ejecuta y se muestra aviso [A].
- Inventario lleno: el objeto cae al suelo y puede recogerse después [M].

### 6.2 Cultivos

**Entrada:** jugador planta semilla en tierra cultivable de la estación correcta.

**Reglas:**
- Cada cultivo tiene días de crecimiento fijos y temporadas válidas [A].
- Un cultivo fuera de temporada muere al final del día, salvo los que tienen regla especial (por ejemplo, los de invernadero) [A].
- Un cultivo necesita riego cada día para crecer. Si no se riega, no avanza ese día. Algunos cultivos mueren si no se riegan varios días [M].
- Un cultivo maduro se cosecha; algunos son de cosecha repetida (ej. tomates, bayas) y vuelven a crecer [A].
- La calidad de la cosecha (normal, plata, oro, iridio) depende de la habilidad de Granjería y de fertilizante [A].
  - **[V]** Probabilidades exactas por nivel de Granjería.

**Salida:** objeto cosechado con calidad, o cultivo que muere.

### 6.3 Animales

**Entrada:** jugador compra animal, construye edificio y lo alimenta/acaricia.

**Reglas:**
- Los animales necesitan comida (heno) y agua en el establo/corral [A].
- Acariciar al animal cada día aumenta su felicidad. La felicidad determina la calidad del producto [A].
- Los productos (huevos, leche, lana, trufas) se recogen y se venden o se usan como ingredientes [A].
- Los animales pueden tener crías si hay pareja del mismo tipo y son adultos [A].
- **[V]** Umbrales exactos de felicidad para calidad alta.

### 6.4 Tiendas

| Tienda | Vende | Compra | Horario observado |
|---|---|---|---|
| Pierre (General Store) | Semillas, herramientas básicas, fertilizante | Casi todo | Diurno; cierra cerca de las 17:00 [M] |
| JojaMart (opcional) | Equivalente a Pierre, con costo distinto | Casi todo | Diurno [M] |
| Clint (herrero) | Mejora de herramientas | No compra | Diurno [A] |
| Saloon | Comida y bebida | No compra | Abierto la tarde/noche [M] |
| Otras (Sebastian, Marnie, etc.) | Según cada personaje | Según cada personaje | Según horario de la persona [M] |

**Reglas generales:**
- Los precios de compra son fijos. Los de venta dependen del objeto y la calidad [A].
- Los objetos de calidad alta se venden a precio mayor [A].
- **[V]** Multiplicadores exactos por calidad.

**Salida:** oro actualizado, inventario actualizado.

**Caso límite:** sin oro suficiente, la compra no se realiza y se muestra mensaje [A].

### 6.5 Habilidades y profesiones

**Reglas:**
- Cada habilidad sube al realizar acciones relacionadas (cosechar, pescar, minar, combatir, forrajear) [A].
- Al llegar a ciertos niveles (5 y 10) el jugador elige una profesión. Las profesiones modifican precios, velocidad o efectos [A].
- **[V]** Lista exacta de profesiones y su efecto.

### 6.6 Relaciones

**Reglas:**
- Cada aldeano tiene un nivel de amistad (0 a 10 corazones) [A].
- Hablar a diario sube corazones de forma limitada; regalar sube según la preferencia del aldeano (amado, gustado, neutral, odiado) [A].
- Regalar el mismo tipo de objeto varias veces tiene rendimientos decrecientes [M].
- Algunos aldeanos solo se pueden cortejar a partir de cierto nivel; cortejar y casarse requiere corazones altos y un objeto de boda [A].
- Los hijos aparecen tras el matrimonio y crecen con el tiempo [A].
- **[V]** Umbrales exactos para cada evento de relación.

### 6.7 Eventos y festivales

**Reglas:**
- Los festivales ocurren en fechas fijas de cada estación [A].
- Durante un festival, las tiendas suelen cerrar y los NPC tienen eventos especiales [A].
- Algunos eventos de historia se activan por corazones, objetos o fechas [A].

### 6.8 Minas y combate

**Reglas:**
- La cueva tiene pisos, con enemigos que aumentan de dificultad [A].
- Cada 5 pisos aproximadamente aparece un piso con cofre o escalera especial [M].
- El combate reduce la salud del jugador. Llegar a 0 causa desmayo y pérdida de oro, y el jugador vuelve a la entrada [A].
- Los minerales se obtienen con el pico y se procesan en la fundición de la granja (u horno) [A].
- **[V]** Número exacto de pisos y progresión por tramos.

### 6.9 Guardado y carga

**Reglas:**
- El juego se guarda al dormir, y también al salir a la pantalla de título [A].
- Al cargar, el estado vuelve al último guardado: clima del día, hora 6:00 y estado de cultivos y animales [A].
- No hay guardado manual durante el día [A].
- **[V]** Si el guardado conserva el estado de la mina en curso.

---

## 7. Casos de uso observables

Formato Dado / Cuando / Entonces.

**CU-01 Sembrar y cosechar**
- Dado: tierra cultivable en Primavera, semilla de Coliflor en inventario.
- Cuando: el jugador planta la semilla y la riega cada día durante el tiempo de crecimiento.
- Entonces: al madurar, la cosecha aparece en el suelo y puede recogerse con la guadaña.

**CU-02 Cultivo fuera de temporada**
- Dado: cultivo de Primavera plantado en Verano.
- Cuando: termina el día.
- Entonces: el cultivo muere.

**CU-03 Desmayo por energía**
- Dado: energía en 0 a las 23:00.
- Cuando: el jugador intenta usar otra herramienta.
- Entonces: el jugador se desmaya, pierde oro y despierta a las 6:00 del día siguiente.

**CU-04 Compra con oro insuficiente**
- Dado: oro menor que el precio de una semilla.
- Cuando: el jugador intenta comprar la semilla en Pierre.
- Entonces: la compra no ocurre y el inventario y el oro quedan igual.

**CU-05 Regalo de relación**
- Dado: aldeano con preferencia por las esmeraldas, relación en 3 corazones.
- Cuando: el jugador regala una esmeralda.
- Entonces: la relación sube más que con un regalo neutral, y el aldeano reacciona según su preferencia.

**CU-06 Mejora de herramienta**
- Dado: azada básica, materiales requeridos en inventario, oro suficiente.
- Cuando: el jugador lleva la herramienta a Clint.
- Entonces: la herramienta se mejora al siguiente nivel tras uno o más días (o al momento, según versión) [V].

---

## 8. Reglas de negocio consolidadas

| ID | Regla | Confianza |
|---|---|---|
| RN-01 | Un año = 4 estaciones × 28 días. | A |
| RN-02 | El día empieza a las 6:00 y termina a más tardar a las 2:00. | A |
| RN-03 | El jugador puede dormir solo en su cama. | A |
| RN-04 | Desmayarse hace perder parte del oro. | M |
| RN-05 | Los cultivos fuera de temporada mueren al final del día. | A |
| RN-06 | El clima es aleatorio por día, con probabilidades por estación. | M |
| RN-07 | La lluvia riega los cultivos. | A |
| RN-08 | Las tiendas tienen precios fijos de compra y de venta por calidad. | A |
| RN-09 | La relación sube según el tipo de regalo. | A |
| RN-10 | Los festivales ocurren en fechas fijas. | A |
| RN-11 | El juego guarda al dormir y al salir a título. | A |
| RN-12 | El desmayo en las minas devuelve al jugador a la entrada. | A |

---

## 9. Preguntas abiertas para validar jugando

1. Porcentaje exacto de oro perdido al desmayarse.
2. Consumo de energía por herramienta y por nivel de habilidad.
3. Probabilidades exactas de calidad por nivel de Granjería y por fertilizante.
4. Umbrales de felicidad para calidad alta de producto animal.
5. Multiplicadores de precio por calidad.
6. Progresión exacta de pisos de las minas y de los cofres especiales.
7. Si el estado de la mina en curso se conserva al guardar.
8. Efecto exacto de la mejora de herramienta (inmediato o al día siguiente).

Para cerrar cada punto se puede jugar una partida de prueba registrando el valor observado y actualizando la columna de confianza de este documento.

---

## 10. Limitaciones del documento

- No se verificó jugando en esta sesión; las reglas vienen del comportamiento conocido del juego.
- No se usó el repositorio `rea` porque no está disponible para esta sesión (ni `sanmiguelyt955/rea` ni en la lista de repositorios accesibles).
- Los valores marcados como **[M]** y **[V]** pueden cambiar según la versión y no deben tomarse como especificación cerrada.
