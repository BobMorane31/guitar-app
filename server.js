const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// En-têtes HTTP simulant un navigateur standard pour éviter les blocages
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HTTP_HEADERS }, (res) => {
      // Gestion des redirections éventuelles
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Erreur HTTP: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

const HTML_ENTITIES = {
  '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã', '&Auml;': 'Ä', '&Aring;': 'Å', '&AElig;': 'Æ',
  '&Ccedil;': 'Ç',
  '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
  '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
  '&Ntilde;': 'Ñ',
  '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ', '&Ouml;': 'Ö', '&Oslash;': 'Ø', '&OElig;': 'Œ',
  '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
  '&Yacute;': 'Ý', '&Yuml;': 'Ÿ',
  '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä', '&aring;': 'å', '&aelig;': 'æ',
  '&ccedil;': 'ç',
  '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
  '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
  '&ntilde;': 'ñ',
  '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö', '&oslash;': 'ø', '&oelig;': 'œ',
  '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
  '&yacute;': 'ý', '&yuml;': 'ÿ',
  '&rsquo;': "'", '&lsquo;': "'", '&sbquo;': "'",
  '&rdquo;': '"', '&ldquo;': '"', '&bdquo;': '"',
  '&bull;': '•', '&hellip;': '…', '&prime;': '′', '&Prime;': '″',
  '&ndash;': '–', '&mdash;': '—',
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' '
};

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-zA-Z]+;/g, match => HTML_ENTITIES[match] || match);
}

// Extraction des données stockées dans la balise .js-store d'Ultimate Guitar
function extractStoreData(html) {
  const marker = 'class="js-store" data-content="';
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) return null;

  const contentStart = startIndex + marker.length;
  const contentEnd = html.indexOf('">', contentStart);
  if (contentEnd === -1) return null;

  const rawJson = html.substring(contentStart, contentEnd)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  try {
    return JSON.parse(rawJson);
  } catch (e) {
    return null;
  }
}

// Endpoint de recherche sur Internet (Ultimate Guitar)
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: "Le paramètre de recherche 'q' est requis." });
  }

  try {
    const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`;
    const html = await fetchUrl(searchUrl);
    const store = extractStoreData(html);

    if (!store || !store.store || !store.store.page || !store.store.page.data) {
      return res.json({ results: [] });
    }

    const data = store.store.page.data;
    const rawResults = data.results || (data.data && data.data.results) || [];

    const results = rawResults
      .filter(item => item.tab_url && item.song_name && (item.type === 'Chords' || item.type === 'Tabs'))
      .map(item => ({
        //id: Buffer.from(item.tab_url).toString('base64url'),
        id: Buffer.from(item.tab_url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
        title: decodeHtmlEntities(item.song_name),
        artist: decodeHtmlEntities(item.artist_name || 'Artiste inconnu'),
        type: item.type,
        rating: item.rating ? item.rating.toFixed(1) : null,
        votes: item.votes || 0,
        version: item.version || 1
      }))
      .slice(0, 30);

    res.json({ results });
  } catch (error) {
    console.error("Erreur lors de la recherche en ligne :", error.message);
    res.status(500).json({ error: "Impossible de récupérer les résultats de recherche en ligne." });
  }
});

// Endpoint de récupération d'un morceau sur Internet
app.get('/api/song/:id', async (req, res) => {
  const encodedId = req.params.id;

  try {
//    const tabUrl = Buffer.from(encodedId, 'base64url').toString('utf8');
    const base64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
    const tabUrl = Buffer.from(base64, 'base64').toString('utf8');
    if (!tabUrl.startsWith('https://tabs.ultimate-guitar.com/')) {
      return res.status(400).json({ error: "Identifiant de morceau invalide." });
    }

    const html = await fetchUrl(tabUrl);
    const store = extractStoreData(html);

    if (!store || !store.store || !store.store.page || !store.store.page.data) {
      return res.status(404).json({ error: "Données du morceau introuvables." });
    }

    const tabData = store.store.page.data.tab_view || {};
    const tabInfo = store.store.page.data.tab || {};

    let content = (tabData.wiki_tab && tabData.wiki_tab.content) ? tabData.wiki_tab.content : '';

    if (!content) {
      return res.status(404).json({ error: "Contenu de la partition non disponible." });
    }

    // Nettoyage des balises spécifiques d'Ultimate Guitar tout en préservant le texte des accords
    content = content
      .replace(/\[ch\]/g, '')
      .replace(/\[\/ch\]/g, '')
      .replace(/\[tab\]/g, '')
      .replace(/\[\/tab\]/g, '')
      .replace(/\r\n/g, '\n');

    const song = {
      id: encodedId,
      title: decodeHtmlEntities(tabInfo.song_name || 'Sans titre'),
      artist: decodeHtmlEntities(tabInfo.artist_name || 'Artiste inconnu'),
      key: tabData.meta ? (tabData.meta.tonality || '') : '',
      content: content
    };

    res.json(song);
  } catch (error) {
    console.error("Erreur lors du chargement du morceau :", error.message);
    res.status(500).json({ error: "Impossible de récupérer la partition demandée." });
  }
});

// Lancement du serveur si exécuté directement
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
