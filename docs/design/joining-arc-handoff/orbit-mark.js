// Finished Orbit mark for the walkthrough screens — M4:
// lime planet, open smile with coral tongue, eyes + highlights, blue cheek,
// blue moon on a thin orbit path. The sphere is centred at the viewBox centre
// (120,120) so it can be scaled to fill any avatar slot while the moon + orbit
// path overflow uncropped. Exposes window.OrbitMark.svg(size).
(function () {
  const LIME = '#a4ef4e';
  const LIME_HI = '#c2f878';
  const LIME_SH = '#8ad53b';
  const INK = '#181c12';
  const BLUE = '#45a6ff';
  const EYE = '#1c2218';
  const CORAL = '#ff8f7a';
  const PATH = '#8b99ad';

  const CX = 120, LX = 96, RX = 144, EY = 116, ER = 16, MT = 136;
  let uid = 0;

  function build() {
    const u = uid++;
    const gid = 'osph' + u, cid = 'omc' + u;
    // orbit geometry (B2, bolder so it survives small)
    const cx = 120, cy = 120, rx = 106, ry = 42, rot = -18, theta = -52;
    const t = theta * Math.PI / 180;
    const mx = cx + rx * Math.cos(t), my = cy + ry * Math.sin(t);
    return `
      <defs>
        <radialGradient id="${gid}" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stop-color="${LIME_HI}"/>
          <stop offset="55%" stop-color="${LIME}"/>
          <stop offset="100%" stop-color="${LIME_SH}"/>
        </radialGradient>
      </defs>
      <g transform="rotate(${rot} ${cx} ${cy})">
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${PATH}" stroke-width="4.5"/>
      </g>
      <circle cx="120" cy="120" r="74" fill="url(#${gid})" stroke="${INK}" stroke-width="9"/>
      <circle cx="92" cy="86" r="7" fill="#eaffc9" opacity="0.85"/>
      <circle cx="${LX}" cy="${EY}" r="${ER}" fill="${EYE}"/>
      <circle cx="${RX}" cy="${EY}" r="${ER}" fill="${EYE}"/>
      <circle cx="${LX + 5.5}" cy="${EY - 6.5}" r="5.5" fill="#fff"/>
      <circle cx="${RX + 5.5}" cy="${EY - 6.5}" r="5.5" fill="#fff"/>
      <circle cx="${LX - 13}" cy="${EY + 13}" r="5" fill="${BLUE}"/>
      <clipPath id="${cid}"><path d="M${CX - 20} ${MT} L${CX + 20} ${MT} A 20 22 0 0 1 ${CX - 20} ${MT} Z"/></clipPath>
      <path d="M${CX - 20} ${MT} L${CX + 20} ${MT} A 20 22 0 0 1 ${CX - 20} ${MT} Z" fill="${EYE}"/>
      <g clip-path="url(#${cid})"><ellipse cx="${CX}" cy="${MT + 22}" rx="14" ry="11" fill="${CORAL}"/></g>
      <path d="M${CX - 20} ${MT} L${CX + 20} ${MT} A 20 22 0 0 1 ${CX - 20} ${MT} Z" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <g transform="rotate(${rot} ${cx} ${cy})">
        <circle cx="${mx}" cy="${my}" r="13.5" fill="${BLUE}" stroke="${INK}" stroke-width="6"/>
      </g>`;
  }

  function svg(size) {
    const s = size || 36;
    return `<svg class="orbit-mark-svg" viewBox="0 0 240 240" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg" aria-label="Orbit">${build()}</svg>`;
  }

  window.OrbitMark = { svg, build };
})();
