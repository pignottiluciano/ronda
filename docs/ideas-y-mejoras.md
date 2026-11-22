# Ideas y mejoras · Ronda

Registro de la revisión de diseño y producto. Todo lo de abajo está en local, sin commit ni deploy, salvo que se diga otra cosa.
Mocks: [`mejoras-diseno.html`](mejoras-diseno.html) (diseño) y [`orden-sorteado.html`](orden-sorteado.html) (mover el orden sorteado).

## 1. Mejoras de diseño

Observadas en producción a 375 px (oscuro) y 1280 px (claro) con 6 personas y un día completo.

| # | Problema | Cambio | Estado |
|---|---|---|---|
| 1 | Con 6 personas el reloj queda debajo de la primera pantalla del teléfono | Con un día en curso, la caja de participantes se pliega a "5 participantes · 1 no está · Editar" (solo teléfono) | Hecho en local |
| 2 | La bajada habla de sorteo y grupos en listas que solo usan turnos; la marca dice "Sorteos y grupos" | Bajada según el modo; marca y título "Turnos, sorteos y grupos" (es y en) | Hecho en local |
| 3 | En pausa la tarjeta dice "Habla ahora" y hay dos botones rellenos juntos | Rótulo "En pausa"; Siguiente queda con borde, Reanudar es el único relleno | Hecho en local |
| 4 | La tarjeta cuenta lo que queda y el anillo lo usado | Un solo sentido: lo que le queda a quien habla o espera, lo usado a quien terminó ("Listo · usó") | Hecho en local |
| 5 | Baldosas de ~190 px que repiten "No está", también en quien ya habló | En teléfono, filas de 56 px con "No está" como ícono; sin "No está" en quien terminó | Hecho en local |
| 6 | Cabecera de tres filas a 375 px | Por debajo de 640 px: marca y un menú "⋯" con ayuda, idioma y tema | Hecho en local |
| 7 | El redondeo muestra "42%" y "42%" en puestos distintos | Un decimal solo donde el redondeo igualaría puestos distintos (`rankPercents`) | Hecho en local |
| 8 | Con un día guardado el podio se ve definitivo | Podio desde el tercer día (`PODIUM_MIN_DAYS`); antes, aviso y tabla | Hecho en local |
| 9 | La fila de hoy mide ~650 px en desktop | Tope de 32 rem | Hecho en local |
| — | El badge de persona (editar, no está, quitar) | Se queda como está, por decisión | — |

Pendiente de diseño:
- **Copia de seguridad dentro del menú "⋯".** Estaba en el mock; quedó al pie porque el menú es compartido con la página de ayuda, que no tiene esos botones.
- **El toast tapa contenido** (vimos "Turnos" e "Historial" tapados). Moverlo arriba de la zona de botones o acortar su duración.
- **La imagen para compartir** sigue dibujando el podio con menos de tres días.

## 2. Propuestas de producto

| # | Qué | Por qué | Para qué | Fundamento |
|---|---|---|---|---|
| 1 | **Mover el orden sorteado antes de empezar** | Hoy "Sorteado" arranca el día al instante; si alguien se tiene que ir antes, no hay cómo ponerlo primero | Ajustar el orden a la realidad de la reunión sin perder el sorteo | Ver sección 3 y el mock |
| 2 | **Deshacer** en el toast tras Siguiente o tocar a otra persona | Tocar una fila da la palabra y arranca el reloj al instante; un toque errado ensucia el día | Corregir sin descartar el día | Uso en vivo, teléfono sobre la mesa: el error es barato de cometer y hoy caro de arreglar |
| 3 | **Calculadora inversa**: "tenemos 30 min" → tiempo por persona | Quien facilita piensa en la duración de la reunión, no en minutos por persona | Configurar en un paso | Ya existen presentes y presupuesto; es una división |
| 4 | **Aviso de último minuto** (ámbar al 20% restante) | Hoy la única señal es el rojo, cuando ya se pasó | Que quien habla cierre solo | Respeta "sin sonido" y "no castigar": avisa antes, no después |
| 5 | **Pantalla completa** de la tarjeta | Flotar solo existe en Chrome y Edge de escritorio | Proyectar o compartir pantalla en Safari, Firefox y móvil | La Fullscreen API está en casi todos; reutiliza la misma tarjeta |
| 6 | **Resumen al terminar el día** | Terminar salta al ranking, sin cierre | Ver duración total y quién se pasó; compartirlo | Cierra el ciclo diario; el ranking es acumulado, no del día |
| 7 | **Orden "rotación justa"**: quien abrió ayer, cierra hoy | El sorteo puede repetir a la misma persona primera | Equidad sin gestión manual | Coherente con el valor del producto. Hay que verificar si los días guardados conservan el orden |
| 8 | **Lista de ejemplo** en el primer uso | Navegador nuevo: caja vacía y un botón que no hace nada útil | Llegar al primer reloj en un clic | El valor se entiende viendo el reloj, no leyendo |
| 9 | **Compartir lista por enlace** (nombres en el `#` de la URL) | Pasar la lista exige exportar e importar un JSON | Segundo facilitador, otro dispositivo | Sin backend; el `#` no viaja al servidor. Avisar que el enlace lleva los nombres |

No haría: cuentas, sincronización ni sonido. Rompen "sin backend" y decisiones ya tomadas en `DESIGN.md`.

Orden sugerido: 1 (mover el orden sorteado, opción A elegida), 2 y 4 (baratos y sobre el uso en vivo), después 3 y 5.

## 3. Mover el orden sorteado antes de empezar

**Problema.** Con el orden "Sorteado", tocar "Empezar turnos" sortea y arranca el día en el mismo paso. El orden no se ve hasta que ya empezó. Casos reales:
- Alguien se tiene que ir antes: necesita hablar primero.
- Alguien llega tarde o está en otra llamada: mejor que hable al final.
- Quien facilita quiere abrir o cerrar la ronda.

Hoy la única salida es pasar a "Como la lista", reordenar a mano y perder el sorteo, o tocar a esa persona durante el día (le da la palabra fuera de orden y arranca su reloj).

**Opciones** (en el mock):

| | Cómo funciona | A favor | En contra |
|---|---|---|---|
| A · Revisar antes de empezar | "Sortear orden" muestra la fila sorteada con el mismo editor de la Fila de hoy (arrastrar, flechas, no está). Debajo, "Volver a sortear" y "Empezar" | Cero patrones nuevos: reutiliza el editor de la fila. Se ve el orden antes de arrancar | Un toque más para empezar |
| B · Fijar antes del sorteo | Cada persona puede marcarse "Primero" o "Al final"; el sorteo mezcla al resto | Expresa la intención ("se va temprano") y sobrevive a volver a sortear | Concepto nuevo; no sirve para orden fino |
| C · "Que siga" durante el día | En la fila de alguien que espera, una acción lo pone como próximo | Cubre lo que pasa a mitad de la reunión | No resuelve el arranque |

**Decisión: A.** B y C quedan como no elegidas. C se puede retomar si aparece el caso "se tiene que ir ya" con el día empezado; B si la misma persona siempre se va temprano.

**Desktop** (mock, sección A): la fila sorteada va en la columna derecha, con Tiempo y Orden arriba; los badges de la izquierda siguen en el orden de la lista. Todo el bloque de la derecha (selectores, fila, ayuda y botones) toma el tope de 32 rem de la fila. Hoy el selector de orden y "Empezar" ocupan 624 px y la fila 512 px.

**Reglas para A** (teléfono y desktop):
- Mover filas en el orden sorteado cambia **solo el orden de hoy**, no el de la lista. En "Como la lista" mover sí cambia la lista, como hoy. El texto de ayuda lo dice en cada caso.
- El borrador se guarda (por ejemplo, `ListTurns.draft: string[] | null`), así una recarga no vuelve a sortear. Se borra al empezar, al cambiar a "Como la lista" o con "Volver a sortear".
- "Volver a sortear" descarta los movimientos; si hubo alguno, se confirma antes.
- Personas nuevas o que vuelven van al final del borrador; las que no están se muestran tachadas, sin número.
- Tiempo y Orden siguen visibles con el orden sorteado: cambiar el tiempo lo conserva; pasar a "Como la lista" lo descarta (con confirmación si hubo movimientos).
- `startSession` ya acepta un orden: recibe el borrador en vez de un `shuffle` nuevo.
- Lector de pantalla: "Diego, posición 1 de 5", igual que la Fila de hoy.

## 4. Métricas para PMs

**Restricción.** La app promete que no envía tus datos a ningún lado. Se puede medir sin romper eso si nunca sale un nombre ni el contenido de una lista, pero hay que reescribir la frase y decidir si la medición se puede apagar.

| Evento | Propiedades (en rangos, sin nombres) | Responde |
|---|---|---|
| `day_started` | personas, minutos, orden (sorteado / lista), si se movió el orden sorteado | ¿Se usa turnos? ¿Con qué tamaño de grupo? ¿Se usa la opción 3A? |
| `day_finished` / `day_discarded` | duración, cuántos se pasaron, días guardados (1, 2–5, 6–20, 20+) | Activación, abandono y retención sin identificar a nadie |
| `draw_done` | cantidad de grupos | ¿Sigue vivo el sorteo o es todo turnos? |
| `ranking_viewed`, `ranking_shared` | copiar / descargar / compartir | ¿Importa el ranking? |
| `float_opened`, `backup_exported`, `help_opened`, `menu_opened` | — | Qué funciones menores valen el mantenimiento |

**Herramienta:**
- **Vercel Web Analytics:** sin cookies, una etiqueta y ya está en Vercel. Creo que los eventos propios piden plan Pro; hay que verificarlo. Sin embudos.
- **PostHog sin cookies:** embudos y tendencias, pero es un tercero más y un script más pesado.

Recomendado: Vercel, si el plan permite eventos propios. PostHog solo si hacen falta embudos.

**Pendiente de decidir:** herramienta, si la medición es siempre activa o con un interruptor, y el texto nuevo de privacidad.
