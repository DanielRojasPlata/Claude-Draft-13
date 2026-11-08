/* Términos de guion por idioma (ES/EN) */
(function (root) {
  const LANGS = {
    es: {
      name: 'Español',
      prefixes: ['INT.', 'EXT.', 'INT./EXT.'],
      times: ['DÍA', 'NOCHE', 'AMANECER', 'ATARDECER', 'CONTINUO', 'MÁS TARDE', 'MOMENTOS DESPUÉS', 'ANOCHECER'],
      transitions: ['CORTE A:', 'FUNDE A:', 'DISUELVE A:', 'FUNDIDO A NEGRO.', 'CORTE SECO A:', 'FUNDE DE NEGRO.', 'FIN.'],
      extensions: ['V.O.', 'O.S.', "CONT'D", 'EN OFF', 'AL TELÉFONO'],
      more: '(MÁS)', contd: "(CONT'D)", shots: ['PRIMER PLANO', 'PLANO GENERAL', 'PLANO DETALLE', 'TRAVELLING', 'PANORÁMICA', 'PLANO SUBJETIVO'],
      sceneRegex: /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E|INTERIOR|EXTERIOR)(\.|\s)/i,
      elementNames: { scene: 'Escena', action: 'Acción', character: 'Personaje', parenthetical: 'Paréntesis', dialogue: 'Diálogo', transition: 'Transición', shot: 'Toma', general: 'General', note: 'Nota' }
    },
    en: {
      name: 'English',
      prefixes: ['INT.', 'EXT.', 'INT./EXT.'],
      times: ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'EVENING'],
      transitions: ['CUT TO:', 'FADE TO:', 'DISSOLVE TO:', 'FADE OUT.', 'SMASH CUT TO:', 'FADE IN:', 'MATCH CUT TO:', 'THE END.'],
      extensions: ['V.O.', 'O.S.', "CONT'D", 'ON RADIO', 'ON PHONE'],
      more: '(MORE)', contd: "(CONT'D)", shots: ['CLOSE ON', 'WIDE ANGLE', 'INSERT', 'TRACKING SHOT', 'POV', 'ANGLE ON'],
      sceneRegex: /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)(\.|\s)/i,
      elementNames: { scene: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'General', note: 'Note' }
    }
  };
  const get = (l) => LANGS[l] || LANGS.es;
  const api = { LANGS, get };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.lang = api; }
})(typeof self !== 'undefined' ? self : globalThis);
