// Mood hints for diary entries, with no AI and nothing sent anywhere: a small Portuguese emotion lexicon plus the
// tricks that make word lists behave less dumbly (the VADER idea): negation ("não estou feliz"), intensifiers
// ("muito cansada"), diminishers ("meio ansioso"), slang and fixed phrases ("de boa", "tô mal", "não sei"),
// emoji, and question marks. Everything is matched on accent-free lowercase text.
//
//   IgnisMood.analyze(text) -> [{ key, label, score, tone, hits: ['cansada', 'não sei', ...] }]   (strongest first, at most 2)
//   IgnisMood.LABELS / IgnisMood.TONE        label and tone (+ / - / ?) per mood key
(() => {
  'use strict';

  const LABELS = {
    alegria: 'Alegria', calma: 'Calma', gratidao: 'Gratidão', esperanca: 'Esperança',
    tristeza: 'Tristeza', ansiedade: 'Ansiedade', estresse: 'Estresse', raiva: 'Raiva', cansaco: 'Cansaço', duvida: 'Dúvida',
  };
  const TONE = { alegria: '+', calma: '+', gratidao: '+', esperanca: '+', tristeza: '-', ansiedade: '-', estresse: '-', raiva: '-', cansaco: '-', duvida: '?' };

  // single words, matched as a stem followed by a short ending (felizes, ansiosa, cansadíssimo...). [stem, weight]
  const WORDS = {
    alegria: [['feliz', 1.2], ['felicidade', 1.2], ['alegr', 1.2], ['content', 1], ['animad', 1], ['empolg', 1.1], ['otim', 1], ['maravilh', 1.4],
      ['incrivel', 1.2], ['adorei$', 1.2], ['amei$', 1.2], ['gostei$', 0.9], ['curti', 0.9], ['diverti', 1], ['risada$', 1], ['rindo$', 1], ['sorri', 1],
      ['orgulh', 1.2], ['realizad', 1.2], ['satisfeit', 1], ['vitoria$', 1], ['comemor', 1], ['festa$', 0.6], ['animo', 0.8], ['gostoso', 0.8], ['lindo$', 0.7], ['linda$', 0.7]],
    calma: [['calm$', 1.2], ['tranquil', 1.2], ['seren', 1.2], ['paz$', 1.1], ['relax', 1.1], ['aliviad', 1.2], ['alivio', 1.2], ['leveza', 1.2], ['descansad', 1], ['sossego', 1.2], ['estavel', 0.8], ['equilibr', 1]],
    gratidao: [['gratid', 1.2], ['grato', 1.2], ['grata', 1.2], ['agradec', 1.3], ['abencoad', 1.3], ['obrigad', 0.9], ['sorte$', 0.7], ['privilegi', 1]],
    esperanca: [['esperanc', 1.2], ['confiante', 1.2], ['confio$', 1.1], ['motivad', 1.2], ['determinad', 1.1], ['coragem', 1.1], ['otimista', 1.2], ['focad', 0.8], ['recome', 0.8], ['melhor', 0.4], ['progress', 0.8], ['evolu', 0.8]],
    tristeza: [['trist', 1.3], ['chor', 1.2], ['deprimid', 1.5], ['depress', 1.5], ['desanim', 1.3], ['vazi', 1.1], ['solidao', 1.3], ['sozinh', 1.1], ['saudad', 0.8],
      ['decepcion', 1.2], ['magoad', 1.2], ['desolad', 1.4], ['culpa$', 0.9], ['culpad', 0.9], ['infeliz', 1.3], ['mal-estar', 1], ['sofr', 1.1], ['perdi', 0.5], ['frustrad', 1.1], ['frustrac', 1.1], ['arrependid', 1]],
    ansiedade: [['ansios', 1.4], ['ansied', 1.4], ['nervos', 1.2], ['preocup', 1.2], ['medo$', 1.2], ['receio', 1], ['tens', 0.9], ['panico', 1.5], ['agonia', 1.3], ['aflit', 1.3], ['inquiet', 1.2], ['apreensiv', 1.2], ['sobrecarreg', 1], ['overthinking', 1.2], ['paranoi', 1.1], ['angusti', 1.3]],
    estresse: [['estress', 1.3], ['pressao', 1.1], ['correria', 1.1], ['atarefad', 1], ['sufoc', 1.1], ['pilha$', 0.8], ['sem tempo', 1], ['atrasad', 0.7], ['prazo$', 0.6]],
    raiva: [['raiva', 1.4], ['irrit', 1.3], ['brav', 1.2], ['furios', 1.5], ['odio$', 1.5], ['ressent', 1.1], ['revolt', 1.3], ['indignad', 1.2], ['injusti', 1], ['saco cheio', 1.3], ['de saco', 1.1], ['puto$', 1.2], ['puta$', 0.8]],
    cansaco: [['cansad', 1.3], ['cansac', 1.3], ['exaust', 1.5], ['esgotad', 1.4], ['sonolent', 1.1], ['sono$', 0.8], ['preguic', 1], ['moid', 1.2], ['insonia', 1.3], ['fadiga', 1.3], ['bocej', 0.8], ['letargi', 1.2], ['drenad', 1.2]],
    duvida: [['duvid', 1.3], ['indecis', 1.3], ['confus', 1.2], ['perdid', 0.8], ['insegur', 1.2], ['hesit', 1.1], ['incert', 1.3], ['talvez', 0.7], ['sei la', 0.9], ['questiona', 1]],
  };

  // fixed phrases: [regex on normalized text, { mood: weight }, label shown as the reason]
  const PHRASES = [
    [/\bde boa\b/g, { calma: 1 }, 'de boa'],
    [/\b(?:em|de) luto\b/g, { tristeza: 1.4 }, 'luto'],
    [/\bem paz\b/g, { calma: 1.2 }, 'em paz'],
    [/\bnao sei\b/g, { duvida: 1.3 }, 'não sei'],
    [/\bsera que\b/g, { duvida: 1.1 }, 'será que'],
    [/\bnao tenho certeza\b|\bnao faco ideia\b|\bnao entendo\b/g, { duvida: 1.3 }, 'sem certeza'],
    [/\b(?:to|tou|estou|ta|tava|estava|me sinto|me senti|fico|fiquei) (?:muito |bem |meio |um pouco )?mal\b|\bpra baixo\b|\bpra baixo\b/g, { tristeza: 1.3 }, 'mal / pra baixo'],
    [/\b(?:to|tou|estou|tava|estava|me sinto|me senti) (?:muito |super |bem )?bem\b|\bque bom\b|\bque otimo\b/g, { alegria: 0.9, calma: 0.3 }, 'bem'],
    [/\bdeu certo\b|\bvai dar certo\b/g, { esperanca: 1, alegria: 0.4 }, 'deu certo'],
    [/\bnao (?:\w+ )?consegui\b|\bnao consigo\b/g, { estresse: 0.4 }, 'não consegui'],
    [/\bconsegui\b/g, { esperanca: 0.9, alegria: 0.4 }, 'consegui'],
    [/\bnao aguento\b|\bnao da mais\b|\bno limite\b/g, { estresse: 1.2, cansaco: 0.7 }, 'no limite'],
    [/\bsem (?:energia|forca|pique)\b/g, { cansaco: 1.3 }, 'sem energia'],
    [/\bsem (?:animo|vontade)\b/g, { tristeza: 0.8, cansaco: 0.5 }, 'sem ânimo'],
    [/\bcoracao acelerad\w*|\bnao consigo parar de pensar\b|\bmeu peito aperta\w*|\baperto no peito\b/g, { ansiedade: 1.3 }, 'corpo em alerta'],
    [/\bdormi (?:mal|pouco)\b|\bnoite mal dormida\b/g, { cansaco: 1.1 }, 'dormi mal'],
    [/\bmuito obrigad[oa]\b|\bagradeco\b/g, { gratidao: 1.2 }, 'agradeço'],
    [/\btentar novamente\b|\bcomecar de novo\b|\btentar de novo\b/g, { esperanca: 1 }, 'tentar de novo'],
    [/\bnao vejo a hora\b/g, { esperanca: 0.9 }, 'mal posso esperar'],
  ];

  const EMOJI = [
    [/[\u{1F600}-\u{1F606}\u{1F60A}\u{1F60D}\u{1F973}\u{1F970}\u{2764}\u{1F44D}\u{1F389}]/gu, { alegria: 1 }],
    [/[\u{1F622}\u{1F62D}\u{1F614}\u{1F61E}\u{1F494}]/gu, { tristeza: 1.2 }],
    [/[\u{1F620}\u{1F621}\u{1F92C}]/gu, { raiva: 1.2 }],
    [/[\u{1F634}\u{1F971}]/gu, { cansaco: 1.2 }],
    [/[\u{1F630}\u{1F628}\u{1F61F}\u{1F62C}]/gu, { ansiedade: 1.2 }],
    [/[\u{1F914}]/gu, { duvida: 1.1 }],
    [/(?::-?\)|:-?D|<3|\^\^|:3)/g, { alegria: 1 }],
    [/(?::-?\(|:'\()/g, { tristeza: 1 }],
    [/[\u{1F64F}]/gu, { gratidao: 1 }],
    [/[\u{1F60C}\u{1F60E}]/gu, { calma: 1 }],
  ];

  const NEGATORS = new Set(['nao', 'nunca', 'jamais', 'nem', 'sem', 'nada', 'ninguem', 'tampouco']);
  const BOOSTERS = new Set(['muito', 'muita', 'muitissimo', 'super', 'bastante', 'extremamente', 'completamente', 'tao', 'mega', 'tanto', 'tanta', 'totalmente', 'demais']);
  const SOFTENERS = new Set(['pouco', 'pouca', 'meio', 'meia', 'levemente', 'ligeiramente', 'quase']);
  // a negated bad feeling reads as relief; a negated good one reads as sadness
  const FLIP = { alegria: 'tristeza', calma: 'ansiedade', gratidao: 'tristeza', esperanca: 'tristeza', tristeza: 'calma', ansiedade: 'calma', estresse: 'calma', raiva: 'calma', cansaco: 'alegria', duvida: null };

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(.)\1{2,}/g, '$1$1');

  const STEMS = [];
  for (const [mood, list] of Object.entries(WORDS)) for (const [raw, w] of list) {
    const exact = raw.endsWith('$');
    const stem = exact ? raw.slice(0, -1) : raw;
    STEMS.push({ mood, stem, w, exact, multi: stem.includes(' ') || stem.includes('-') });
  }

  function lookup(token) {
    let best = null;
    for (const s of STEMS) {
      if (s.multi) continue;
      if (!token.startsWith(s.stem)) continue;
      const extra = token.length - s.stem.length;
      const maxExtra = s.exact ? 1 : 5;
      if (extra > maxExtra) continue;
      if (!best || s.stem.length > best.stem.length) best = s;
    }
    return best;
  }

  function analyze(text) {
    const raw = String(text || '');
    if (!raw.trim()) return [];
    const score = {}; const hits = {};
    const add = (mood, w, why) => { if (!mood) return; score[mood] = (score[mood] || 0) + w; (hits[mood] = hits[mood] || new Set()).add(why); };

    let s = norm(raw);

    // 1) emoji
    for (const [re, m] of EMOJI) {
      const found = raw.match(re);
      if (found) for (const [mood, w] of Object.entries(m)) add(mood, Math.min(found.length, 2) * w, found[0]);
    }

    // 2) fixed phrases, then blank them out so the word pass does not count them twice
    for (const [re, m, why] of PHRASES) {
      s = s.replace(re, (hit) => { for (const [mood, w] of Object.entries(m)) add(mood, w, why); return ' '.repeat(hit.length); });
    }
    // multi-word lexicon entries
    for (const e of STEMS) {
      if (!e.multi) continue;
      const i = s.indexOf(e.stem);
      if (i >= 0) { add(e.mood, e.w, e.stem); s = s.slice(0, i) + ' '.repeat(e.stem.length) + s.slice(i + e.stem.length); }
    }

    // 3) words, with negation / intensity in a small window inside the same clause
    const tokens = s.split(/(\s+|[.,;:!?\n]+)/).filter((x) => x && !/^\s+$/.test(x)).map((x) => (/^[.,;:!?\n]+$/.test(x) ? '|' : x));
    tokens.forEach((tok, i) => {
      if (tok === '|') return;
      const hit = lookup(tok);
      if (!hit) return;
      let w = hit.w, mood = hit.mood, negated = false;
      for (let k = Math.max(0, i - 3); k < i; k++) {
        if (tokens[k] === '|') { negated = false; continue; }
        if (NEGATORS.has(tokens[k])) negated = true;
      }
      const prev = tokens[i - 1], next = tokens[i + 1];
      if (BOOSTERS.has(prev) || BOOSTERS.has(next)) w *= 1.5;
      else if (SOFTENERS.has(prev)) w *= 0.6;
      if (negated) { mood = FLIP[mood]; w *= 0.85; }
      add(mood, w, (negated ? 'não ' : '') + tok);
    });

    // 4) question marks hint at doubt
    const q = (raw.match(/\?/g) || []).length;
    if (q) add('duvida', Math.min(q, 3) * 0.3, '?');

    const ranked = Object.entries(score).filter(([, v]) => v >= 0.9).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return [];
    const top = ranked[0][1];
    return ranked.filter(([, v], i) => i === 0 || (i < 2 && v >= top * 0.6))
      .map(([key, v]) => ({ key, label: LABELS[key], score: Math.round(v * 100) / 100, tone: TONE[key], hits: [...hits[key]] }));
  }


  // ---------- topics (what the entry is about) ----------
  const TOPIC_LABELS = {
    alimentacao: 'Alimentação', sono: 'Sono', trabalho: 'Trabalho', estudos: 'Estudos', casa: 'Casa', saude: 'Saúde', mente: 'Mente',
    foco: 'Foco', lazer: 'Lazer', relacoes: 'Relações', dinheiro: 'Dinheiro', pets: 'Pets', exercicio: 'Exercício',
  };
  // stems; a trailing $ means "this word (or one letter more)", otherwise the stem plus a short ending
  const TOPIC_WORDS = {
    alimentacao: ['comi', 'comer', 'comend', 'comida', 'cafe', 'almoc', 'jantar', 'janta$', 'lanch', 'pao$', 'paes', 'nescau', 'whey', 'proteina', 'fome$', 'refeic', 'cozinh', 'receita', 'arroz', 'feijao', 'frango', 'ovo$', 'ovos', 'fruta', 'salada', 'doce$', 'chocolate', 'pizza', 'sorvete', 'hidrat', 'beber', 'suco', 'leite', 'iogurte', 'hipoglicemia', 'glicose', 'dieta', 'caloria', 'sobremesa', 'cardapio', 'gostoso', 'bolacha', 'biscoito', 'sanduiche', 'macarrao', 'carne$'],
    sono: ['dormi', 'dormir', 'dormind', 'sono$', 'acordei', 'acordar', 'insonia', 'cochil', 'soneca', 'travesseiro', 'madrugada', 'pesadelo', 'sonhei', 'sonho$'],
    trabalho: ['trabalh', 'reuniao', 'chefe', 'cliente', 'projeto', 'entrega', 'email', 'linkedin', 'curriculo', 'emprego', 'vaga$', 'entrevista', 'empresa', 'ryze', 'expediente', 'escritorio'],
    estudos: ['estud', 'pesquis', 'livro', 'leitura', 'curso$', 'aula$', 'artigo', 'aprend', 'faculdade', 'prova$', 'tese$', 'apostila', 'resumo', 'anotac'],
    casa: ['limp', 'arrum', 'organiz', 'bagunc', 'lixo$', 'roupa', 'lavar', 'lavei', 'banheiro', 'quarto$', 'faxina', 'varrer', 'louca', 'lencol', 'faxineir', 'aspirador'],
    saude: ['dor$', 'dores', 'remedio', 'venvanse', 'ritalina', 'litio', 'mounjaro', 'roacutan', 'consulta', 'medic', 'exame', 'sintoma', 'enjoo', 'febre', 'gripe', 'hospital', 'dentista', 'hipoglicemia', 'pressao arterial', 'enxaqueca', 'tontura', 'receita medica'],
    mente: ['terapia', 'terapeuta', 'psicolog', 'psiquiatr', 'tdah', 'meditac', 'journaling', 'mindful', 'autocuidado', 'ativacao comportamental', 'sentimento', 'emocion', 'crise$'],
    foco: ['foco$', 'focar', 'focad', 'concentr', 'distra', 'procrastin', 'produtiv', 'rotina', 'habito', 'atencao', 'pomodoro', 'tarefa', 'consigo fazer'],
    lazer: ['serie$', 'series', 'filme', 'youtube', 'netflix', 'jogo$', 'jogos', 'jogar', 'musica', 'show$', 'passeio', 'viagem', 'televisao', 'tv$', 'ipad', 'instagram', 'tiktok', 'podcast', 'video$', 'videos', 'cinema'],
    relacoes: ['amig', 'familia', 'mae$', 'pai$', 'irma', 'irmao', 'namorad', 'marido', 'esposa', 'filho', 'filha', 'encontro', 'conversei', 'ligacao', 'tia$', 'tio$', 'vo$', 'avo$'],
    dinheiro: ['dinheiro', 'pagar', 'paguei', 'contas$', 'fatura', 'boleto', 'salario', 'gasto', 'gastei', 'comprei', 'compra$', 'compras', 'cartao', 'banco$', 'pix$', 'orcamento', 'preco'],
    pets: ['cachorr', 'gato$', 'gata$', 'gatos', 'pet$', 'pets', 'doguinho', 'bichinho'],
    exercicio: ['treino', 'treinar', 'treinei', 'academia', 'corrida', 'corri$', 'caminhada', 'caminhei', 'yoga', 'alongar', 'alongamento', 'exercicio', 'pilates', 'natacao', 'bicicleta'],
  };
  const TOPIC_STEMS = [];
  for (const [topic, list] of Object.entries(TOPIC_WORDS)) {
    for (const raw of list) {
      const exact = raw.endsWith('$');
      const stem = exact ? raw.slice(0, -1) : raw;
      TOPIC_STEMS.push({ topic, stem, exact, multi: stem.includes(' ') });
    }
  }
  function topicLookup(token) {
    let best = null;
    for (const e of TOPIC_STEMS) {
      if (e.multi || !token.startsWith(e.stem)) continue;
      const extra = token.length - e.stem.length;
      if (extra > (e.exact ? 1 : 5)) continue;
      if (!best || e.stem.length > best.stem.length) best = e;
    }
    return best;
  }
  function topics(text) {
    let s = norm(text);
    if (!s.trim()) return [];
    const score = {}, hits = {};
    const add = (t, why) => { score[t] = (score[t] || 0) + 1; (hits[t] = hits[t] || new Set()).add(why); };
    for (const e of TOPIC_STEMS) {
      if (!e.multi) continue;
      const i = s.indexOf(e.stem);
      if (i >= 0) { add(e.topic, e.stem); s = s.slice(0, i) + ' '.repeat(e.stem.length) + s.slice(i + e.stem.length); }
    }
    for (const tok of s.split(/[^a-z0-9]+/)) {
      if (tok.length < 2) continue;
      const hit = topicLookup(tok);
      if (hit) add(hit.topic, tok);
    }
    const ranked = Object.entries(score).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return [];
    const top = ranked[0][1];
    return ranked.filter(([, v], i) => i === 0 || (i < 2 && v >= top * 0.5 && (v >= 2 || top <= 1)))
      .map(([key, v]) => ({ key, label: TOPIC_LABELS[key], score: v, hits: [...hits[key]] }));
  }

  window.IgnisMood = { analyze, topics, LABELS, TONE, TOPIC_LABELS };
})();
