// Ajustes de la app de iPhone. Se carga después de app.js.
// La biblioteca local funciona igual que en la web, sin conexión. La parte de SoundCloud
// necesita el servidor de Eco (OAuth y streaming), así que la app la abre en Safari.
(() => {
  'use strict';
  document.body.classList.add('native');

  const view = document.getElementById('view-soundcloud');
  const server = window.ECO_SERVER_URL || '';
  const box = document.createElement('div');
  box.className = 'native-sc';

  const p = document.createElement('p');
  p.className = 'notice';
  if (server) {
    p.textContent = 'Tu biblioteca de SoundCloud se escucha en streaming desde tu servidor de Eco. Se abre en Safari; puedes añadirla también a la pantalla de inicio.';
    const a = document.createElement('a');
    a.className = 'button primary';
    a.href = `${server}/#soundcloud`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Abrir SoundCloud en Eco web';
    box.append(p, a);
  } else {
    p.textContent = 'La parte de SoundCloud necesita tu servidor de Eco publicado (mira el README de eco-player). Tus canciones de «En mi dispositivo» funcionan sin internet.';
    box.append(p);
  }
  const note = document.createElement('p');
  note.className = 'attribution';
  note.textContent = 'Las condiciones de la API de SoundCloud no permiten guardar sus pistas para escucharlas sin conexión.';
  box.append(note);
  view.prepend(box);
})();
