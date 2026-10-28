# Ronda

Pegá una lista, elegí cuántos grupos querés y sorteá. Con un solo grupo obtenés un orden al azar; con dos o más, grupos del tamaño más parejo posible (10 personas en 3 grupos dan 4, 3 y 3).

Sirve para ordenar turnos en una reunión, armar equipos en una clase, hacer parejas o repartir tareas. Es mobile first, no tiene backend y no envía tus datos a ningún lado.

## Qué hace

- Un participante por línea, con contador en vivo. Ignora líneas vacías y espacios sobrantes; los nombres repetidos se permiten.
- Orden numerado (1 grupo) o tarjetas por grupo con la cantidad de integrantes.
- **Sortear de nuevo** y **Compartir** (menú de compartir del sistema o copia al portapapeles).
- Guarda la lista y la cantidad de grupos en el navegador (`localStorage`) y los recupera al volver. **Limpiar lista** la vacía.
- Tema Sistema, Claro u Oscuro desde el menú de arriba a la derecha; se recuerda.
- Español (`/`) e inglés (`/en/`) con un selector ES/EN junto al tema. Se recuerda la elección; por defecto arranca en español.
- Accesible: etiquetas visibles, teclado, foco visible, anuncios para lectores de pantalla y respeto por `prefers-reduced-motion`.

## Desarrollo

Requiere Node 22.23.4 o superior.

```sh
npm install
npm run dev      # servidor en http://localhost:4321
npm run build    # sitio estático en dist/
npm run preview  # sirve dist/
npm test         # tests de la lógica del sorteo
```

## Estructura

```text
src/
  pages/index.astro   Versión en español (/); pages/en/index.astro es la inglesa
  components/Home.astro  La página, recibe el idioma
  i18n/messages.ts    Todos los textos en es y en
  lib/draw.ts         Lógica del sorteo, sin DOM (parsear, validar, mezclar, repartir)
  scripts/
    app.ts            Eventos y actualización de la interfaz
    storage.ts        Lectura y escritura segura de localStorage
    share.ts          Compartir o copiar
    theme.ts          Menú de tema y su persistencia
  styles/global.css   Tokens de color, espacio y tipografía, y estilos
tests/draw.test.mjs   Tests con node:test
docs/                 Mocks de diseño (propuestas, paletas, fuentes)
```

La lógica del sorteo no toca el DOM ni el almacenamiento, así que se prueba sola. El único JavaScript del cliente es el de `src/scripts/`, sin ningún framework de UI.

## Decisiones de diseño

- **Estética:** propuesta "Sereno" (superficies con borde, sin sombras) con la paleta "Tinta y coral": neutros cálidos casi grises y color solo en el acento.
- **Tipografía:** Fraunces para títulos y nombres de grupo, Figtree para el resto. Se descargan al compilar y se sirven desde el propio sitio (API de fuentes de Astro), sin pedir nada a Google.
- **Colores:** cada token tiene su versión clara y oscura con `light-dark()`.

## Imagen para compartir

`public/og-es.png` y `public/og-en.png` (1200×630) se generan desde `docs/og.html`. Para regenerarlas con Chrome:

```sh
for l in es en; do "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=8000 --screenshot=public/og-$l.png "file://$PWD/docs/og.html?lang=$l"; done
```

## Privacidad y límites

- La lista queda solo en tu navegador y dispositivo. No se sincroniza, y se pierde si borrás los datos del sitio o usás navegación privada. No guardes información sensible en ella.
- El resultado no se guarda: al reabrir recuperás la lista y generás un sorteo nuevo.
- La mezcla usa `Math.random()` (Fisher–Yates). Sirve para sorteos casuales; no es apta para premios ni para auditorías de imparcialidad.
