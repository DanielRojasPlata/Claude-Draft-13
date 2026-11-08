(function () {
  const $ = (id) => document.getElementById(id);
  let msgTimer;
  const flash = (t) => { document.title = t; };
  document.querySelectorAll('#prov button').forEach((b) => b.addEventListener('click', () => window.ai.select(b.dataset.p)));
  $('back').onclick = () => window.ai.nav('back');
  $('fwd').onclick = () => window.ai.nav('forward');
  $('reload').onclick = () => window.ai.nav('reload');
  $('ext').onclick = () => window.ai.external();
  $('pin').onclick = () => window.ai.pin();
  $('send').onclick = async () => {
    const scope = $('tpl').value === 'free' && false ? 'none' : $('scope').value;
    const r = await window.ai.send({ template: $('tpl').value, scope });
    flash(r && r.ok ? 'Asistente IA — texto pegado en el chat' : 'Asistente IA — ' + ((r && r.reason) || 'no se pudo enviar'));
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => flash('Asistente IA'), 3500);
  };
  $('note').onclick = async () => {
    const r = await window.ai.insertNote();
    flash(r && r.ok ? 'Asistente IA — nota insertada en el guion' : 'Asistente IA — ' + ((r && r.reason) || 'no se pudo insertar'));
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => flash('Asistente IA'), 3500);
  };
  window.ai.onState((s) => {
    document.querySelectorAll('#prov button').forEach((b) => b.classList.toggle('on', b.dataset.p === s.provider));
    $('back').disabled = !s.canBack; $('fwd').disabled = !s.canForward;
    $('pin').classList.toggle('on', s.pinned);
  });
})();
