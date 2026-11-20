'use strict';
// Slovenské názvy Vinted hodnôt (ID = Vinted) + slová, podľa ktorých appka hodnotu spozná v diktáte.
// Vzory sú regulárne výrazy nad textom bez diakritiky a malými písmenami; začínajú na hranici slova.
// Poradie je dôležité: dlhšie/presnejšie vzory sú skôr a ich nájdený text sa „vymaže“,
// aby napr. „svetlo modrá“ nespustila aj „modrá“.

const STAVY = [
  { id: 6, nazov: 'Nové so štítkom', vzory: ['(so|s) (stitk|visack)\\w*', 'nove so \\w*'] },
  { id: 2, nazov: 'Veľmi dobrý', vzory: ['velmi dobr\\w*', 'par ?krat (nosen|pouzit|obut)\\w*', 'malo (nosen|pouzit)\\w*', '(skoro|takmer|ako) nov\\w*'] },
  { id: 4, nazov: 'Uspokojivý', vzory: ['uspokojiv\\w*', 'opotrebovan\\w*', 'znicen\\w*'] },
  { id: 1, nazov: 'Nové bez štítku', vzory: ['bez (stitk|visack)\\w*', 'nenosen\\w*', 'nepouzit\\w*', 'neobut\\w*', 'nov(a|y|e|u|ucicka|ucicky)\\b'] },
  { id: 3, nazov: 'Dobrý', vzory: ['dobr(y|a|e|om|ych)\\b', '(nosen|pouzit)\\w*'] },
];

const FARBY = [
  { id: 27, nazov: 'Tmavomodrá', hex: '35358D', vzory: ['tmavo ?modr\\w*', 'namornick\\w*', 'navy'] },
  { id: 26, nazov: 'Svetlomodrá', hex: '89CFF0', vzory: ['(svetlo|bledo) ?modr\\w*', 'blankit\\w*'] },
  { id: 28, nazov: 'Tmavozelená', hex: '356639', vzory: ['tmavo ?zelen\\w*', 'flaskov\\w*'] },
  { id: 24, nazov: 'Staroružová', hex: 'FFCCCA', vzory: ['(svetlo|staro|bledo) ?ruzov\\w*', 'pudrov\\w*'] },
  { id: 1, nazov: 'Čierna', hex: '000000', vzory: ['ciern\\w*'] },
  { id: 3, nazov: 'Sivá', hex: '919191', vzory: ['siv\\w*', 'sed(a|y|e|ej|u|ou|ych|ym)\\b', 'antracit\\w*'] },
  { id: 12, nazov: 'Biela', hex: 'FFFFFF', vzory: ['biel(a|y|e|ej|u|ou|ych|ym|ymi)\\b', 'snehobiel\\w*'] },
  { id: 20, nazov: 'Krémová', hex: 'F8F8E1', vzory: ['kremov\\w*', 'smotanov\\w*', 'ecru'] },
  { id: 4, nazov: 'Béžová', hex: 'F4E0C8', vzory: ['bezov\\w*', 'telov\\w*', 'pieskov\\w*'] },
  { id: 21, nazov: 'Marhuľová', hex: 'FFCC98', vzory: ['marhulov\\w*'] },
  { id: 11, nazov: 'Oranžová', hex: 'FFA500', vzory: ['oranzov\\w*'] },
  { id: 22, nazov: 'Koralová', hex: 'FE7F5D', vzory: ['koralov\\w*'] },
  { id: 23, nazov: 'Bordová', hex: 'AE2E3D', vzory: ['bordov\\w*', 'vinov\\w*'] },
  { id: 7, nazov: 'Červená', hex: 'CC3300', vzory: ['cerven\\w*'] },
  { id: 5, nazov: 'Ružová', hex: 'FF0080', vzory: ['ruzov\\w*', 'cyklamen\\w*', 'fuksi\\w*'] },
  { id: 25, nazov: 'Levanduľová', hex: 'D297D2', vzory: ['levandulov\\w*', 'lila\\b', 'orgovan\\w*'] },
  { id: 6, nazov: 'Fialová', hex: '800080', vzory: ['fialov\\w*'] },
  { id: 17, nazov: 'Tyrkysová', hex: 'B7DEE8', vzory: ['tyrkys\\w*'] },
  { id: 9, nazov: 'Modrá', hex: '007BC4', vzory: ['modr\\w*'] },
  { id: 30, nazov: 'Mentolová', hex: 'A2FFBC', vzory: ['mentolov\\w*', 'mint\\w*'] },
  { id: 16, nazov: 'Khaki', hex: '86814A', vzory: ['k?haki', 'olivov\\w*'] },
  { id: 10, nazov: 'Zelená', hex: '369A3D', vzory: ['zelen\\w*'] },
  { id: 2, nazov: 'Hnedá', hex: '663300', vzory: ['hned\\w*', 'cokoladov\\w*', 'kavov\\w*', 'konakov\\w*'] },
  { id: 29, nazov: 'Horčicová', hex: 'E5B539', vzory: ['horcicov\\w*'] },
  { id: 8, nazov: 'Žltá', hex: 'FFF200', vzory: ['zlt\\w*'] },
  { id: 13, nazov: 'Strieborná', hex: 'DDDDDD', vzory: ['strieborn\\w*'] },
  { id: 14, nazov: 'Zlatá', hex: 'BE9927', vzory: ['zlat(a|y|e|ej|u|ou|ych|ym)\\b'] },
  { id: 15, nazov: 'Viacfarebná', hex: '', vzory: ['viac ?farebn\\w*', 'pestro ?farebn\\w*', 'farebn(a|y|e|ych)\\b', 'kvetovan\\w*', 'pruhovan\\w*', 'kockovan\\w*'] },
  { id: 32, nazov: 'Priehľadná', hex: 'F8FDFD', vzory: ['priehladn\\w*', 'cir(a|y|e|u|ou|ej)\\b'] },
];

// prvých 12 sa zobrazuje vždy, ostatné po ťuknutí na „Viac…“
const MATERIALY = [
  { id: 44, nazov: 'Bavlna', vzory: ['bavln\\w*'] },
  { id: 45, nazov: 'Polyester', vzory: ['polyes\\w*', 'polyest\\w*'] },
  { id: 53, nazov: 'Elastan', vzory: ['elastan\\w*', 'spandex\\w*', 'ly[ck]r\\w*'] },
  { id: 48, nazov: 'Viskóza', vzory: ['viskoz\\w*'] },
  { id: 46, nazov: 'Vlna', vzory: ['vln(a|y|e|ou)\\b', 'vlnen\\w*'] },
  { id: 447, nazov: 'Umelá koža', vzory: ['umel\\w* koz\\w*', 'eko ?koz\\w*', 'kozenk\\w*', 'syntetick\\w* koz\\w*'] },
  { id: 43, nazov: 'Koža', vzory: ['prav\\w* koz\\w*', 'koz(a|e|ou|u)\\b', 'kozen(a|y|e|ou|ych|ej)\\b'] },
  { id: 303, nazov: 'Denim (rifľovina)', vzory: ['denim\\w*', 'riflovin\\w*'] },
  { id: 146, nazov: 'Ľan', vzory: ['lnen\\w*', 'lan(u|om)?\\b'] },
  { id: 49, nazov: 'Hodváb', vzory: ['hodvab\\w*'] },
  { id: 52, nazov: 'Nylon', vzory: ['nylon\\w*', 'silon\\w*'] },
  { id: 149, nazov: 'Akryl', vzory: ['akryl\\w*'] },
  { id: 122, nazov: 'Alpaka', vzory: ['alpak\\w*'] },
  { id: 440, nazov: 'Bambus', vzory: ['bambus\\w*'] },
  { id: 441, nazov: 'Plátno (canvas)', vzory: ['platen\\w*', 'platn(o|a)\\b', '[ck]anvas\\w*'] },
  { id: 442, nazov: 'Kartón', vzory: ['karton\\w*', 'lepenk\\w*'] },
  { id: 123, nazov: 'Kašmír', vzory: ['kasmir\\w*'] },
  { id: 443, nazov: 'Keramika', vzory: ['keramik\\w*', 'keramick\\w*'] },
  { id: 444, nazov: 'Šifón', vzory: ['sifon\\w*'] },
  { id: 299, nazov: 'Menčester', vzory: ['mencester\\w*', 'manzestr\\w*'] },
  { id: 445, nazov: 'Páperie', vzory: ['paperi\\w*', 'paperov\\w*', 'perov\\w*'] },
  { id: 446, nazov: 'Umelá kožušina', vzory: ['umel\\w* kozusin\\w*', 'eko ?kozusin\\w*'] },
  { id: 448, nazov: 'Plsť', vzory: ['plst\\w*'] },
  { id: 451, nazov: 'Flanel', vzory: ['flanel\\w*'] },
  { id: 120, nazov: 'Fleece', vzory: ['fleec\\w*', 'flis\\w*'] },
  { id: 449, nazov: 'Pena', vzory: ['penov\\w*', 'molitan\\w*'] },
  { id: 452, nazov: 'Sklo', vzory: ['skl(o|a|e|om)\\b', 'sklenen\\w*'] },
  { id: 453, nazov: 'Zlato', vzory: ['zlat(o|om)\\b', 'zo zlata', 'pozlat\\w*'] },
  { id: 454, nazov: 'Juta', vzory: ['jut(a|y|ou|ov\\w*)\\b'] },
  { id: 455, nazov: 'Čipka', vzory: ['cipk\\w*', 'cipkov\\w*'] },
  { id: 302, nazov: 'Latex', vzory: ['latex\\w*'] },
  { id: 121, nazov: 'Merino', vzory: ['merin\\w*'] },
  { id: 456, nazov: 'Sieťovina', vzory: ['sietovin\\w*', 'sietkov\\w*'] },
  { id: 457, nazov: 'Kov', vzory: ['kov(u|om)?\\b', 'kovov\\w*'] },
  { id: 152, nazov: 'Mohér', vzory: ['moher\\w*'] },
  { id: 178, nazov: 'Neoprén', vzory: ['neopren\\w*'] },
  { id: 458, nazov: 'Papier', vzory: ['papier\\w*'] },
  { id: 305, nazov: 'Lakovaná koža', vzory: ['lakovan\\w*'] },
  { id: 300, nazov: 'Plast', vzory: ['plast(u|om|ov\\w*)?\\b'] },
  { id: 459, nazov: 'Porcelán', vzory: ['porcelan\\w*'] },
  { id: 460, nazov: 'Ratan', vzory: ['ratan\\w*', 'prutie', 'prutov\\w*'] },
  { id: 301, nazov: 'Guma', vzory: ['gum(a|y|ou|ov\\w*)\\b', 'kaucuk\\w*'] },
  { id: 311, nazov: 'Satén', vzory: ['saten\\w*'] },
  { id: 226, nazov: 'Flitre', vzory: ['flitr\\w*', 'paiet\\w*'] },
  { id: 470, nazov: 'Silikón', vzory: ['silikon\\w*'] },
  { id: 461, nazov: 'Striebro', vzory: ['striebr(o|a|om)\\b', 'postriebr\\w*'] },
  { id: 468, nazov: 'Oceľ', vzory: ['ocel\\w*', 'nerez\\w*'] },
  { id: 462, nazov: 'Kameň', vzory: ['kamen\\w*'] },
  { id: 463, nazov: 'Slama', vzory: ['slam(a|y|ou|en\\w*)\\b'] },
  { id: 298, nazov: 'Semiš', vzory: ['semis\\w*', 'brusen\\w* koz\\w*'] },
  { id: 464, nazov: 'Tyl', vzory: ['tyl(u|ov\\w*)?\\b'] },
  { id: 465, nazov: 'Tvíd', vzory: ['tvid\\w*', 'tweed\\w*'] },
  { id: 177, nazov: 'Velúr', vzory: ['velur\\w*'] },
  { id: 466, nazov: 'Zamat', vzory: ['zamat\\w*'] },
  { id: 467, nazov: 'Drevo', vzory: ['drev(o|a|om)\\b', 'dreven\\w*'] },
];
const MATERIALY_HLAVNE = 12;

// ---------- rozpoznávanie z diktátu ----------
function normText(s) {
  return ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') + ' ';
}

// Vráti ID položiek v poradí výskytu v texte (max `limit`).
function rozpoznaj(text, zoznam, limit) {
  let t = normText(text);
  const najdene = [];
  for (const pol of zoznam) {
    for (const v of pol.vzory) {
      const re = new RegExp('(?<=\\s)(?:' + v + ')', 'g');
      let m, pozicia = -1;
      while ((m = re.exec(t)) !== null) {
        if (pozicia < 0) pozicia = m.index;
        t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
        re.lastIndex = m.index + m[0].length;
      }
      if (pozicia >= 0) {
        const uz = najdene.find(n => n.id === pol.id);
        if (!uz) najdene.push({ id: pol.id, pozicia });
        else uz.pozicia = Math.min(uz.pozicia, pozicia);
      }
    }
  }
  return najdene.sort((a, b) => a.pozicia - b.pozicia).slice(0, limit).map(n => n.id);
}

function rozpoznajVsetko(text) {
  // stav: rozhoduje poradie v zozname STAVY (priorita), nie poradie v texte
  let stav = null;
  let t = text;
  for (const s of STAVY) {
    if (rozpoznaj(t, [s], 1).length) { stav = s.id; break; }
  }
  return {
    stav,
    farby: rozpoznaj(text, FARBY, 2),
    material: rozpoznaj(text, MATERIALY, 3),
  };
}

// Poradie zobrazenia (ako na Vinted) – rozpoznávanie používa poradie vyššie.
const zorad = (zoz, ids) => ids.map(id => zoz.find(x => x.id === id));
const STAVY_ZOBRAZ = zorad(STAVY, [6, 1, 2, 3, 4]);
const FARBY_ZOBRAZ = zorad(FARBY, [1, 3, 12, 20, 4, 21, 11, 22, 7, 23, 5, 24, 6, 25, 26, 9, 27, 17, 30, 10, 28, 16, 2, 29, 8, 13, 14, 15, 32]);

window.Ciselniky = { STAVY, FARBY, MATERIALY, STAVY_ZOBRAZ, FARBY_ZOBRAZ, MATERIALY_HLAVNE, rozpoznajVsetko, normText };
