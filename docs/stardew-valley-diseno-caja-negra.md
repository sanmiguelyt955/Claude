# Stardew Valley: diseño funcional de caja negra

## 1. Alcance y procedencia

Este documento describe el comportamiento observable de Stardew Valley como un sistema de caja negra: entradas del jugador, estados del mundo, reglas de transición y salidas visibles.

**Procedencia de la información.** Está basado en la mecánica documentada públicamente del juego (wiki de la comunidad, guías y conocimiento general de su diseño). **No** se obtuvo con REA, **no** se derivó de los binarios del juego y **no** se verificó con observación directa en una partida. Los valores numéricos concretos se marcan como *(aprox.)* o se omiten cuando no hay certeza suficiente. Antes de usarlo como especificación, debe contrastarse con el juego real.

**Fuera de alcance:** multijugador, mods, detalles de implementación interna (lenguaje, motor, formato de guardado) y contenido de versiones posteriores a la de referencia.

---

## 2. Modelo conceptual

### 2.1 Entidades principales

| Entidad | Descripción observable |
|---|---|
| Jugador | Personaje con nombre, granja, dinero, energía, salud, habilidades, inventario y herramientas. |
| Granja | Mapa donde se cultiva, se construye y se cría. Contiene parcelas, cultivos, animales, edificios y objetos. |
| Mundo | Conjunto de zonas (pueblo, playa, montaña, bosque, desierto, minas, etc.) con sus propios horarios y reglas de acceso. |
| PNJ | Personajes no jugables con horario, ubicación, preferencias de regalo y estado de amistad. |
| Calendario | Día, estación, año, hora del día y clima. |
| Inventario | Ranura de objetos del jugador (12 ranuras base, ampliable). |
| Partida guardada | Un archivo por granja que captura el estado completo al terminar el día. |

### 2.2 Estado del mundo (resumen)

- **Tiempo:** año, estación (primavera, verano, otoño, invierno), día del mes (28 por estación), hora del día.
- **Jugador:** energía actual y máxima, salud actual y máxima, dinero, nivel y experiencia de cada habilidad, herramientas con su nivel de mejora, inventario, amistad con cada PNJ.
- **Granja:** estado de cada parcela (tierra sin labrar, labrada, regada, con semilla, con cultivo y su etapa), animales y su estado, edificios construidos, progreso del Centro Comunitario o de JojaMart.
- **Mundo:** nodos recolectables, enemigos, cofres y estado de las minas.

---

## 3. Modelo de tiempo

### 3.1 Calendario

- Un año tiene cuatro estaciones de **28 días** cada una.
- Cada estación tiene festivales en días fijos y eventos específicos del pueblo.
- La partida comienza en **primavera, día 1, año 1**.

### 3.2 Reloj del día

- El día empieza a las **6:00** y avanza en el tiempo del juego mientras el jugador actúa.
- Las acciones consumen tiempo: caminar, cultivar, pescar, minar, hablar.
- El día termina de forma **forzada a las 2:00** del día siguiente.
- Algunos lugares cierran a horas concretas, y algunos PNJ cambian de sitio según la hora.

### 3.3 Transición de día (regla central)

Al cerrar el día, en cualquiera de estos casos:

| Causa | Resultado observable |
|---|---|
| El jugador duerme en su cama antes de las 2:00 | Se guarda la partida, se aplica el resumen del día y se inicia el día siguiente con energía y salud restauradas. |
| Llega a las 2:00 sin dormir | El jugador se desmaya, regresa a casa y pierde una parte del dinero (penalización). Se aplica el mismo resumen y se inicia el día siguiente. |
| Se agota la energía y no puede seguir actuando | Equivale a un desmayo: se aplica la penalización del caso anterior. |

**Resumen de fin de día:** crecimiento de cultivos regados, reproducción y crecimiento de animales, actualización de clima del día siguiente, actualización de horarios de PNJ, cambios de festivales, guardado automático.

### 3.4 Clima

- Cada día tiene un clima (soleado, lluvia, tormenta, nieve, viento, etc.) según la estación y reglas del juego.
- El clima afecta al riego automático de las parcelas (la lluvia riega todo) y a los eventos del día.
- Algunos eventos (p. ej., lluvia verde) dependen de condiciones específicas y son poco frecuentes.

---

## 4. Entradas y salidas

### 4.1 Entradas del jugador

| Categoría | Ejemplos |
|---|---|
| Movimiento | Caminar, correr, cambiar de zona por bordes del mapa o puertas. |
| Herramientas | Usar azada, regadera, hacha, pico, guadaña, caña de pescar, espada. |
| Interacción | Hablar con PNJ, abrir cofres, usar máquinas, cosechar, recoger objetos. |
| Inventario | Mover, equipar, usar, vender, comprar, dar regalos. |
| Menús | Opciones, mapa, habilidades, comunidad, ajustes, guardar. |

### 4.2 Salidas visibles

- **HUD:** reloj con día, estación y hora; barra de energía; dinero; barra de salud; ranuras de herramientas.
- **Mensajes:** diálogos de PNJ, notificaciones de logros, mensajes de tiendas, avisos de falta de energía.
- **Animaciones y sonido:** cosecha, riego, golpes, pesca, cambios de clima.
- **Cambios en el mundo:** crecimiento visible de cultivos, cambios estacionales de mapa, nuevos objetos, PNJ en nuevas posiciones.

---

## 5. Módulos funcionales

### 5.1 Energía y salud

- **Energía base:** 270 *(aprox.)*. Cada acción activa consume una cantidad fija. Se recupera al dormir y con comidas o bebidas.
- **Salud base:** 100 *(aprox.)*. Baja por daño de enemigos y trampas. Se recupera con comida, descanso y ciertos objetos.
- **Regla:** cuando la energía llega a 0, el jugador no puede realizar acciones que la consuman. El día termina con penalización (ver 3.3).

### 5.2 Agricultura

**Flujo de cultivo:**

```
tierra sin labrar
  -> (azada) -> labrada
  -> (semilla, solo en su estación) -> sembrada
  -> (riego diario) -> crecimiento por etapas
  -> madura -> (cosecha) -> producto + semilla o regeneración
```

Reglas observables:

- Cada cultivo solo puede sembrarse en sus estaciones. Fuera de temporada muere o no se planta.
- Un cultivo regado crece un día por día de crecimiento; uno no regado puede no avanzar.
- La calidad del producto (normal, plata, oro, iridio) depende del nivel de agricultura y de los fertilizantes usados.
- Los cultivos de regeneración producen varias cosechas sin volver a sembrar.
- Los árboles frutales crecen en etapas y producen fruta en su estación.

### 5.3 Ganadería

- Los animales requieren comida, agua o cuidado diario según la especie.
- Un animal bien cuidado (acariciado y alimentado) produce con más frecuencia y mejor calidad.
- Los productos se recogen del corral o del establo y se venden o se usan en recetas.

### 5.4 Forrajeo, minería y pesca

- **Forrajeo:** recolectar objetos del mundo (hierba, flores, hongos, setas, leña). Da experiencia de forrajeo.
- **Minería:** las minas tienen plantas de 1 a 120 y luego la Cueva del Cráneo. Cada planta tiene enemigos, nodos de mineral y escaleras que avanzan de planta. Romper nodos da mineral y experiencia de minería.
- **Pesca:** lanzar el cebo, esperar una picada y completar el minijuego de reacción. La dificultad y el pez dependen de la zona, la estación, el clima y la hora. Da experiencia de pesca.

### 5.5 Combate

- Los enemigos tienen salud, daño y comportamientos (persecución, patrulla, ataque a distancia).
- Las armas tienen daño, velocidad y probabilidad de crítico. Los anillos y bonificaciones modifican estos valores.
- Matar enemigos da experiencia de combate.
- Si la salud llega a 0, el jugador cae inconsciente y se aplica la penalización de desmayo.

### 5.6 Habilidades

- Cinco habilidades: agricultura, forrajeo, pesca, minería y combate.
- Cada una tiene niveles con experiencia acumulada. Subir de nivel aumenta energía o salud máxima y puede desbloquear profesiones.
- Las profesiones se eligen al alcanzar ciertos niveles y modifican reglas concretas (p. ej., precio de venta, producción).

### 5.7 Economía

- **Dinero:** se gana vendiendo productos, con pedidos del pueblo y recompensas de misiones.
- **Precio de venta:** depende del producto, su calidad y los modificadores de profesión.
- **Tiendas:** cada tienda tiene un inventario que puede variar por estación o por progreso del jugador. La tienda de la granja de un PNJ (p. ej., Pierre o Clint) vende herramientas, semillas y materiales.
- **Mejora de herramientas:** en la herrería, mediante materiales y dinero. Cada nivel mejora el daño o la eficiencia de la herramienta.
- **Penalizaciones:** desmayarse o morir supone una pérdida parcial de dinero, no total.

### 5.8 Inventario

- 12 ranuras base, ampliable con mochilas hasta 36.
- Los objetos apilables comparten ranura hasta un límite de cantidad.
- Al llenarse el inventario, un objeto recogido no entra o se deja en el suelo, según la acción.

### 5.9 Relaciones con PNJ

- Cada PNJ tiene un nivel de amistad medido en **corazones**. Los PNJ solteros pueden llegar a 14 corazones; el resto, a 10.
- **Hablar** con un PNJ suma puntos de amistad una vez al día.
- **Regalos:** cada PNJ tiene preferencias. Un regalo que le gusta suma más que uno neutral, y uno que le disgusta resta. Los regalos en su cumpleaños suman mucho más.
- **Eventos de corazón:** al alcanzar ciertos niveles se desbloquean escenas o misiones.
- **Matrimonio:** requiere llegar al nivel de corazones máximo, cumplir un requisito de casa y ofrecer un regalo específico. Tras la boda, el PNJ se muda a la granja y participa en el día a día.

### 5.10 Comunidad y progreso

- **Centro Comunitario:** completar paquetes de recursos y salas de restauración. Desbloquea recompensas y mejoras de la comunidad.
- **Ruta alternativa (JojaMart):** un progreso paralelo que sustituye al Centro Comunitario. Tiene consecuencias visibles en el pueblo y en su tienda.
- **Misiones y pedidos:** tareas con plazos o condiciones (entregar objetos, cumplir requisitos de habilidad).

### 5.11 Construcción y personalización

- La granja tiene edificios (establo, gallinero, silo, casilla de perro, invernadero) que se desbloquean con progreso y dinero.
- Muebles y decoración se colocan en la casa del jugador.
- La apariencia del personaje (ropa, peinado, color) se cambia en tiendas y cabinas, sin afectar la mecánica.

### 5.12 Guardado y carga

- El guardado ocurre al dormir. Los cambios hechos durante el día se conservan al cargar la partida.
- Al cargar, el juego vuelve al último estado guardado, incluido el día en curso desde su inicio.
- Un archivo corrupto o incompleto impide cargar esa granja.

---

## 6. Reglas de transición clave

| Estado actual | Evento | Estado siguiente | Salida visible |
|---|---|---|---|
| Día en curso, energía > 0 | El jugador riega un cultivo | Parcela regada | Animación de riego, sin cambio de día |
| Día en curso, energía = 0 | El jugador intenta cosechar | Acción no ejecutada | Mensaje de falta de energía |
| Día en curso | El jugador duerme antes de las 2:00 | Día siguiente, energía y salud restauradas | Resumen de fin de día, guardado |
| Día en curso | Llega a las 2:00 | Día siguiente con penalización | Mensaje de desmayo, pérdida de dinero |
| Salud = 0 en minas | Derrota por enemigos | Regreso a casa con penalización | Mensaje de desmayo |
| Amistad a 0 de corazones | Regalo que le gusta al PNJ | Amistad sube | Reacción positiva del PNJ |
| Parcela con cultivo maduro | Cosecha | Cultivo retirado, producto obtenido | Producto en inventario |
| Día de cambio de estación | Fin de día | Nueva estación, cultivos de la anterior mueren si no son de temporada | Cambio de paleta del mapa |

---

## 7. Invariantes

1. El día siempre termina, como máximo, a las 2:00.
2. Dormir es la única forma de empezar el día sin penalización.
3. La energía nunca pasa de su máximo ni baja de 0.
4. El dinero nunca es negativo; las compras fallidas no se cobran.
5. Un cultivo solo crece si está regado en ese día (con excepciones por lluvia).
6. La estación actual determina qué semillas se pueden plantar.
7. La amistad de un PNJ solo sube una vez al día por hablar.
8. Cargar una partida reproduce el mismo estado guardado, incluido el reloj del día.

---

## 8. Casos límite a considerar

- **Llegar a las 2:00 con energía 0:** la penalización se aplica una sola vez.
- **Regalo en el cumpleaños:** cuenta como regalo preferido aunque el PNJ tenga otra preferencia.
- **Inventario lleno al recoger un objeto:** el objeto no se pierde, queda en el suelo o se rechaza según el contexto.
- **Cambio de estación con cultivos sembrados:** los cultivos fuera de temporada mueren al terminar el día.
- **Dinero insuficiente en una compra:** la compra se cancela sin efectos secundarios.
- **Lluvia y riego:** un día lluvioso riega las parcelas automáticamente, aunque el jugador no actúe.

---

## 9. Lo que este documento no cubre

- Valores exactos de experiencia, precios y probabilidades. Se han omitido o marcado como aproximados.
- Lógica de eventos especiales de festivales y su orden exacto.
- Diferencias entre plataformas y versiones.
- Comportamiento de partidas multijugador.

---

## 10. Próximo paso para convertirlo en ingeniería inversa real

Para pasar de este diseño de caja negra a una especificación verificada, haría falta:

1. Los archivos de instalación del juego, para analizarlos con REA (`rea analyze`, `rea decompile`).
2. Capturas de una partida en ejecución (`rea capture-process`, `rea capture-native-ui-scenario`) para comparar comportamientos y contrastar cada regla de la sección 6 y 7.
3. Una verificación manual con partidas de prueba para los valores marcados como *(aprox.)*.
