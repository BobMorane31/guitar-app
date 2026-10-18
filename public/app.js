// Définition de l'échelle chromatique
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

let currentSong = null;
let currentOffset = 0;
let isScrolling = false;
let scrollSpeed = 3;
let scrollAnimationFrame = null;
let lastScrollTimestamp = null;
let scrollSubpixelRemainder = 0;
let currentTypeFilter = 'Chords';
let lastSearchResults = [];

// Éléments du DOM
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsSection = document.getElementById('search-results-section');
const resultsList = document.getElementById('results-list');
const playerSection = document.getElementById('player-section');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const chordDisplay = document.getElementById('chord-display');
const transposeUpBtn = document.getElementById('transpose-up');
const transposeDownBtn = document.getElementById('transpose-down');
const transposeResetBtn = document.getElementById('transpose-reset');
const transposeOffsetDisplay = document.getElementById('transpose-offset');
const scrollToggleBtn = document.getElementById('scroll-toggle');
const scrollSpeedSlider = document.getElementById('scroll-speed');
const speedDisplay = document.getElementById('speed-display');
const toggleFilterButtons = document.querySelectorAll('.toggle-filter .toggle-btn');

// Fonction pour transposer un nom d'accord donné d'un demi-ton
function transposeChord(chord, semitones) {
  return chord.replace(/([A-G][#b]?)/g, (match) => {
    let index = SHARPS.indexOf(match);
    if (index === -1) {
      index = FLATS.indexOf(match);
    }
    if (index === -1) return match;

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Privilégier les dièses par défaut
    return SHARPS[newIndex];
  });
}

// Fonction de formatage et transposition du texte de la partition
function renderSheet(content, semitones) {
  // Regex détectant des accords standards isolés ou en enfilade
  const chordRegex = /\b([A-G](?:#|b)?(?:m|maj|min|dim|aug|sus[24]?)?(?:7|9|11|13)?(?:\/[A-G](?:#|b)?)?)\b/g;

  const lines = content.split('\n');
  const renderedLines = lines.map(line => {
    // Ne pas modifier les titres de sections (ex: [Verse 1])
    if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
      return `<span style="color: #888;">${escapeHtml(line)}</span>`;
    }

    // Détecte si la ligne ressemble à une ligne d'accords
    const transposedLine = line.replace(chordRegex, (match) => {
      const transposed = transposeChord(match, semitones);
      return `<span class="chord">${escapeHtml(transposed)}</span>`;
    });

    return transposedLine;
  });

  return renderedLines.join('\n');
}

function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

function renderRatingStars(rating, votes) {
  if (!rating || parseFloat(rating) === 0) {
    return '<span style="color: #777;">Aucune note</span>';
  }

  const numericRating = parseFloat(rating);
  const roundedStars = Math.round(numericRating);
  const fullStars = '★'.repeat(Math.min(5, Math.max(0, roundedStars)));
  const emptyStars = '☆'.repeat(Math.max(0, 5 - roundedStars));
  const votesText = votes ? ` (${votes})` : '';

  return `<span style="color: #ffb703;" title="${escapeHtml(rating)}/5">${fullStars}${emptyStars}</span> <span style="font-size: 0.85em; color: #a0a0a0;">${escapeHtml(rating)}${votesText}</span>`;
}

function updateDisplay() {
  if (!currentSong) return;
  chordDisplay.innerHTML = renderSheet(currentSong.content, currentOffset);
  transposeOffsetDisplay.textContent = (currentOffset > 0 ? `+${currentOffset}` : currentOffset);
}

function renderSearchResults() {
  resultsList.innerHTML = '';
  const filtered = lastSearchResults.filter(song => song.type === currentTypeFilter);

  if (filtered.length > 0) {
    filtered.forEach(song => {
      const li = document.createElement('li');
      li.className = 'result-item';
      li.innerHTML = `
        <div>
          <div class="result-title">${escapeHtml(song.title)}</div>
          <div class="result-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div>${renderRatingStars(song.rating, song.votes)}</div>
      `;
      li.addEventListener('click', () => loadSong(song.id));
      resultsList.appendChild(li);
    });
    resultsSection.classList.remove('hidden');
  } else if (lastSearchResults.length > 0) {
    resultsList.innerHTML = `<li style="color: #a0a0a0;">Aucun résultat de type "${currentTypeFilter}" pour cette recherche.</li>`;
    resultsSection.classList.remove('hidden');
  } else {
    resultsList.innerHTML = '<li style="color: #a0a0a0;">Aucun morceau trouvé.</li>';
    resultsSection.classList.remove('hidden');
  }
}

// Gestion des boutons de filtre Chords / Tabs
toggleFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const selectedType = btn.dataset.type;
    if (selectedType === currentTypeFilter) return;

    currentTypeFilter = selectedType;
    toggleFilterButtons.forEach(b => b.classList.toggle('active', b.dataset.type === currentTypeFilter));
    renderSearchResults();
  });
});

// Gestion de la recherche
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    lastSearchResults = data.results || [];
    renderSearchResults();
  } catch (err) {
    console.error("Erreur de recherche :", err);
  }
});

// Chargement d'un morceau
async function loadSong(id) {
  try {
    const res = await fetch(`/api/song/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Erreur de chargement");
    const song = await res.json();

    currentSong = song;
    currentOffset = 0;
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    updateDisplay();

    playerSection.classList.remove('hidden');
    playerSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error("Impossible de récupérer le morceau :", err);
  }
}

// Contrôles de transposition
transposeUpBtn.addEventListener('click', () => {
  currentOffset = (currentOffset + 1) % 12;
  updateDisplay();
});

transposeDownBtn.addEventListener('click', () => {
  currentOffset = (currentOffset - 1) % 12;
  updateDisplay();
});

transposeResetBtn.addEventListener('click', () => {
  currentOffset = 0;
  updateDisplay();
});

// Défilement automatique
// La vitesse maximale (10) correspond à l'ancienne vitesse 1 (0.5 px par trame à 60fps = 30 px/sec)
// La vitesse minimale (1) correspond à 0.05 px par trame (3 px/sec)
function scrollStep(timestamp) {
  if (!isScrolling) return;

  if (lastScrollTimestamp !== null) {
    const deltaMs = timestamp - lastScrollTimestamp;
    // Vitesse en pixels par seconde : 1 -> 3 px/s, ..., 10 -> 30 px/s
    const pixelsPerSecond = scrollSpeed * 3;
    const pixelsToScroll = (pixelsPerSecond * deltaMs) / 1000 + scrollSubpixelRemainder;

    const integerPixels = Math.floor(pixelsToScroll);
    scrollSubpixelRemainder = pixelsToScroll - integerPixels;

    if (integerPixels > 0) {
      window.scrollBy(0, integerPixels);
    }
  }

  lastScrollTimestamp = timestamp;

  if ((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 2)) {
    stopScroll();
    return;
  }

  scrollAnimationFrame = requestAnimationFrame(scrollStep);
}

function startScroll() {
  isScrolling = true;
  lastScrollTimestamp = null;
  scrollSubpixelRemainder = 0;
  scrollToggleBtn.textContent = 'Pause';
  scrollToggleBtn.style.backgroundColor = '#cf6679';
  scrollAnimationFrame = requestAnimationFrame(scrollStep);
}

function stopScroll() {
  isScrolling = false;
  lastScrollTimestamp = null;
  scrollSubpixelRemainder = 0;
  scrollToggleBtn.textContent = 'Défiler';
  scrollToggleBtn.style.backgroundColor = '';
  if (scrollAnimationFrame) {
    cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
  }
}

scrollToggleBtn.addEventListener('click', () => {
  if (isScrolling) {
    stopScroll();
  } else {
    startScroll();
  }
});

scrollSpeedSlider.addEventListener('input', (e) => {
  scrollSpeed = parseInt(e.target.value, 10);
  speedDisplay.textContent = scrollSpeed;
});
