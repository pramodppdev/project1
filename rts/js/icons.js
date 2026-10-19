'use strict';

// ---------- Vector icons (drawn here so they look the same on every device) ----------

const ICON_PATHS = {
    food: '<path d="M12 21V8" stroke="#8a6a2a" stroke-width="1.6"/><g fill="#e8b23a" stroke="#9a6a1a" stroke-width=".6"><ellipse cx="12" cy="5" rx="1.8" ry="3"/><ellipse cx="9.2" cy="8.5" rx="1.6" ry="2.8" transform="rotate(-30 9.2 8.5)"/><ellipse cx="14.8" cy="8.5" rx="1.6" ry="2.8" transform="rotate(30 14.8 8.5)"/><ellipse cx="9" cy="13" rx="1.6" ry="2.8" transform="rotate(-35 9 13)"/><ellipse cx="15" cy="13" rx="1.6" ry="2.8" transform="rotate(35 15 13)"/></g><path d="M8 19c2-1 6-1 8 0" stroke="#c0392b" stroke-width="2" fill="none"/>',
    wood: '<rect x="3" y="8" width="15" height="9" rx="2" fill="#9a6a3a" stroke="#5a3a1a"/><ellipse cx="18" cy="12.5" rx="3.2" ry="4.5" fill="#e0b880" stroke="#5a3a1a"/><ellipse cx="18" cy="12.5" rx="1.6" ry="2.4" fill="none" stroke="#a0703a"/><path d="M5 11h9M6 14h7" stroke="#6a4420" stroke-width="1"/>',
    stone: '<path d="M3 18l3-7 5-2 3 3 4-1 3 7z" fill="#a8a49c" stroke="#5a5650"/><path d="M8 18l2-5 4 2" fill="none" stroke="#7a766e"/><path d="M6 11l5-2" stroke="#d8d4cc"/>',
    gold: '<circle cx="12" cy="12" r="8.5" fill="#f2c040" stroke="#9a6a10" stroke-width="1.2"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="#c08a18"/><path d="M9.5 9.5h5M9.5 11.5h5M11 9.5c2.5 0 2.5 4-0.5 4l3 3" fill="none" stroke="#8a5a08" stroke-width="1.2"/>',
    pop: '<circle cx="9" cy="8" r="3" fill="#e8d0b0"/><path d="M3.5 19c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#d9772e"/><circle cx="16.5" cy="9" r="2.6" fill="#d8b890"/><path d="M12.5 19c.3-3.4 2-5.4 4-5.4s4 2 4 5.4z" fill="#c2185b"/>',
    people: '<circle cx="7" cy="8" r="2.5" fill="#e8d0b0"/><circle cx="17" cy="8" r="2.5" fill="#e8d0b0"/><circle cx="12" cy="12" r="2" fill="#e8d0b0"/><path d="M2.5 19c0-4 2-6 4.5-6s4.5 2 4.5 6zM12.5 19c0-4 2-6 4.5-6s4.5 2 4.5 6z" fill="#d9772e"/><path d="M9 20c0-3 1.3-4.5 3-4.5s3 1.5 3 4.5z" fill="#2a9d9a"/>',
    chronicle: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" fill="#e8d8b0" stroke="#8a6a3a"/><path d="M8 8h8M8 11h8M8 14h5" stroke="#8a6a3a"/>',
    stop: '<path d="M8 21v-8l-2-3V7m2 6V5a1.2 1.2 0 012.4 0v6m0-6.5a1.2 1.2 0 012.4 0V11m0-5.5a1.2 1.2 0 012.4 0V12m0-4a1.2 1.2 0 012.4 0v7c0 3-2 6-5 6z" fill="#f0c8a0" stroke="#7a4a2a" stroke-width="1"/>',
    dismiss: '<circle cx="12" cy="12" r="8.5" fill="#5a2a2a" stroke="#d9442b" stroke-width="1.4"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#ffd0c8" stroke-width="2"/>',
    demolish: '<path d="M4 20l7-7" stroke="#6a4a2a" stroke-width="2.4"/><path d="M9 6l6-3 5 5-3 6z" fill="#9aa0a8" stroke="#4a4e54"/><path d="M14 20h7M15 17h5" stroke="#b86a48" stroke-width="2"/>',
    age: '<path d="M4 20h16M6 20V11M10 20V11M14 20V11M18 20V11M3 11l9-6 9 6z" fill="#e0b43c" stroke="#8a5a08" stroke-width="1.2"/>',
    buy: '<circle cx="12" cy="12" r="8.5" fill="#2e7d32" stroke="#a5d6a7"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2.2"/>',
    sell: '<circle cx="12" cy="12" r="8.5" fill="#8a3a1a" stroke="#ffab91"/><path d="M7 12h10" stroke="#fff" stroke-width="2.2"/>',
    idle: '<circle cx="12" cy="7" r="3" fill="#e8d0b0"/><path d="M7 21c0-6 2-9 5-9s5 3 5 9z" fill="#e9dcc0"/><text x="18" y="9" font-size="7" font-weight="700" fill="#f29a2e" font-family="sans-serif">z</text>',
    army: '<path d="M5 19L17 7M17 7l2-2 1 1-2 2M7 17l-2 2" stroke="#cfd4da" stroke-width="2"/><path d="M19 19L7 7M7 7L5 5 4 6l2 2M17 17l2 2" stroke="#cfd4da" stroke-width="2"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="#f6ead2"/><rect x="14" y="5" width="4" height="14" rx="1" fill="#f6ead2"/>',
    play: '<path d="M7 5l12 7-12 7z" fill="#f6ead2"/>',
    crown: '<path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z" fill="#f2c040" stroke="#8a5a08"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="#f2c040" stroke="#8a5a08" stroke-width=".8"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" fill="#d9442b"/>',
    sword: '<path d="M18 3l3 0 0 3-10 10-3-3z" fill="#cfd4da" stroke="#5a5e64"/><path d="M6 13l5 5M4 20l3-3" stroke="#8a6a2a" stroke-width="2"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" fill="#5a7ab0" stroke="#2a3a60"/><path d="M12 6v12" stroke="#a8c0e8"/>',
    range: '<circle cx="12" cy="12" r="8" fill="none" stroke="#e8dcc0" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="none" stroke="#e8dcc0" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="#d9442b"/>',
    police: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" fill="#2a3a8a" stroke="#c8a040"/><path d="M12 7l1.3 2.7 3 .4-2.2 2 .5 3L12 13.7 9.4 15.1l.5-3-2.2-2 3-.4z" fill="#f2c040"/>',
    bell: '<path d="M6 17V11a6 6 0 0112 0v6l2 2H4z" fill="#e0b43c" stroke="#8a5a08"/><circle cx="12" cy="20.5" r="1.8" fill="#8a5a08"/><path d="M12 3v2" stroke="#8a5a08" stroke-width="2"/>',
    ally: '<path d="M2 12l5-4 4 2 3-2 4 1 4 3-6 5-3-2-2 2-3-1z" fill="#e8c090" stroke="#7a4a2a" stroke-width=".8"/><path d="M11 10l4 4M9 12l3 3" stroke="#7a4a2a" stroke-width=".8"/>',
    war: '<path d="M4 4l10 10M4 4h3M4 4v3M20 4L10 14M20 4h-3M20 4v3" stroke="#e8e0d0" stroke-width="2"/><path d="M12 16l-4 4M12 16l4 4M8 14l-2 2M16 14l2 2" stroke="#d9442b" stroke-width="2"/>',
    peace: '<path d="M4 14c3-6 9-8 14-6-2 1-3 3-3 5 2 0 4-1 5-3-1 6-7 9-12 8l-3 3-1-2 2-2c-1 0-2-1-2-3z" fill="#f2f2ec" stroke="#8a8a80" stroke-width=".8"/><path d="M14 9l3-4" stroke="#5a8a2a" stroke-width="1.5"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1" fill="#c2185b"/><path d="M12 9v11M4 13h16" stroke="#f2c040" stroke-width="2"/><path d="M12 9c-3-4-6-2-4 0zM12 9c3-4 6-2 4 0z" fill="none" stroke="#f2c040" stroke-width="1.6"/>',
    office: '<path d="M3 9l9-5 9 5z" fill="#b86a48"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8" stroke="#f2ead8" stroke-width="1.8"/><path d="M3 19h18" stroke="#c8b498" stroke-width="2"/>',
    vote: '<rect x="4" y="10" width="16" height="10" rx="1" fill="#8a6a3a"/><path d="M8 10V4h8v6" fill="#f2ead8" stroke="#8a6a3a"/><path d="M10 7l1.5 1.5L14 5.5" stroke="#2e7d32" stroke-width="1.6" fill="none"/><rect x="9" y="12" width="6" height="1.6" fill="#3a2a1a"/>',
    // Technologies
    plough: '<path d="M3 17h10l6-9" stroke="#6a4a2a" stroke-width="2" fill="none"/><path d="M13 17l3 3h-5z" fill="#9aa0a8"/><path d="M3 20h18" stroke="#8a6a3a"/>',
    bowsaw: '<path d="M4 16q8-12 16 0" fill="none" stroke="#8a5a2a" stroke-width="2"/><path d="M4 16h16" stroke="#cfd4da" stroke-width="1.5"/><path d="M6 16l1 2 1-2 1 2 1-2 1 2 1-2 1 2 1-2 1 2 1-2 1 2 1-2" stroke="#9aa0a8" fill="none" stroke-width=".8"/>',
    mining: '<path d="M5 20L15 10" stroke="#8a5a2a" stroke-width="2.2"/><path d="M8 6q6-3 12 4q-6-2-9 1z" fill="#9aa0a8" stroke="#4a4e54"/>',
    wootz: '<path d="M17 3l4 0 0 4-11 11-4-4z" fill="#8aa4c8" stroke="#2a3a60"/><path d="M8 13l3 3" stroke="#e0b43c" stroke-width="2"/><path d="M4 20l3-3" stroke="#6a4a2a" stroke-width="2.4"/><path d="M13 9l3-3" stroke="#e8f0ff" stroke-width=".8"/>',
    dhanurveda: '<path d="M6 3q12 9 0 18" fill="none" stroke="#8a5a2a" stroke-width="2"/><path d="M6 3v18" stroke="#e8dcc0" stroke-width=".8"/><path d="M4 12h16M17 9l3 3-3 3" stroke="#cfd4da" stroke-width="1.6" fill="none"/>',
    ayurveda: '<path d="M12 21C5 17 4 9 12 3c8 6 7 14 0 18z" fill="#4a9a3a" stroke="#2a5a1a"/><path d="M12 6v14M12 11l-3-2M12 14l3-2" stroke="#c8e8a8"/>',
    ironarmour: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" fill="#7a7e84" stroke="#3a3e44"/><circle cx="12" cy="11" r="2.5" fill="#cfd4da"/>',
    stepwell: '<path d="M3 6h18v14H3z" fill="#c8a87a"/><path d="M5 8h14v3H5zM7 11h10v3H7zM9 14h6v3H9z" fill="#a8885a" stroke="#7a5a3a" stroke-width=".6"/><rect x="10" y="17" width="4" height="3" fill="#3a7aa0"/>',
    ganita: '<circle cx="9" cy="12" r="5" fill="none" stroke="#f2c040" stroke-width="2.2"/><path d="M15 8h6M18 5v6M15 16h6" stroke="#e8dcc0" stroke-width="1.8"/>',
    jyotisha: '<circle cx="12" cy="12" r="3" fill="#f2c040"/><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="#8ab0e8" transform="rotate(-25 12 12)"/><circle cx="19" cy="8" r="1.3" fill="#e8f0ff"/><circle cx="4" cy="17" r="1" fill="#e8f0ff"/>',
    rockets: '<path d="M14 4l6 0 0 6-8 8-6-6z" fill="#8a5a2a" stroke="#3a2a1a"/><path d="M6 12l-3 1 3 3 3 3 1-3" fill="#ff8a20"/><circle cx="16" cy="8" r="1.5" fill="#e8dcc0"/>',
    nalanda: '<path d="M3 9l9-5 9 5z" fill="#b86a48"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9M3 19h18" stroke="#e8d8b0" stroke-width="1.8"/>',
    pucca: '<g fill="#b8583a" stroke="#6a2a1a" stroke-width=".7"><rect x="3" y="15" width="8" height="4"/><rect x="11" y="15" width="8" height="4"/><rect x="7" y="11" width="8" height="4"/><rect x="15" y="11" width="6" height="4"/><rect x="3" y="11" width="4" height="4"/><rect x="5" y="7" width="8" height="4"/><rect x="13" y="7" width="6" height="4"/></g>',
    roads: '<path d="M8 21L10 3h4l2 18z" fill="#a89c8a"/><path d="M12 5v3M12 11v3M12 17v3" stroke="#f2ead8" stroke-width="1.5"/>',
    utsav: '<path d="M6 16q6 5 12 0z" fill="#b8732a" stroke="#6a3a10"/><path d="M12 15c-2-2-1-5 0-8 1 3 2 6 0 8z" fill="#ffc040"/><circle cx="12" cy="12" r="5" fill="#ffd060" opacity=".25"/>',
    arthashastra: '<path d="M12 4v15M6 19h12" stroke="#e0b43c" stroke-width="1.8"/><path d="M4 8h16" stroke="#e0b43c" stroke-width="1.5"/><path d="M4 8l-2 5h4zM20 8l-2 5h4z" fill="#e0b43c"/>',
    fortified: '<path d="M3 20V9h3V6h3v3h2V6h2v3h2V6h3v3h3v11z" fill="#a8a49c" stroke="#5a5650"/><rect x="10" y="14" width="4" height="6" rx="2" fill="#3a2a1a"/>',
};

function icon(name, size = 18, cls = '') {
    const body = ICON_PATHS[name];
    if (!body) return '';
    return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

function moodIcon(mood, size = 18) {
    const face = mood >= 70 ? '#7ad37a' : mood >= 45 ? '#e8c93a' : '#e5533a';
    const mouth = mood >= 70 ? 'M8 14q4 4 8 0' : mood >= 45 ? 'M8.5 15h7' : 'M8 16q4-4 8 0';
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="${face}"/><circle cx="9" cy="10" r="1.3" fill="#2a1a10"/><circle cx="15" cy="10" r="1.3" fill="#2a1a10"/><path d="${mouth}" stroke="#2a1a10" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
}
