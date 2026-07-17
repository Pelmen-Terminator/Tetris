// ============================================================
// 1. ЛОГИКА ИГРЫ
// ============================================================

const COLS = 10;
const ROWS = 20;

const COLORS = {
    I: '#3ff0ff',
    O: '#ffe14d',
    T: '#c86bff',
    S: '#4dff8f',
    Z: '#ff4d6a',
    J: '#4d8bff',
    L: '#ff9d4d',
};

const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]],
    O: [[1, 0], [2, 0], [1, 1], [2, 1]],
    T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

const KEYS = Object.keys(SHAPES);

function newGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function makeBag() {
    const bag = [...KEYS];
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
}

function makePiece(type) {
    const cells = SHAPES[type].map(c => [...c]);
    let cx, cy;
    if (type === 'I') { cx = 1.5; cy = 1; }
    else if (type === 'O') { cx = 1.5; cy = 0.5; }
    else { cx = 1; cy = 1; }
    return { type, cells, cx, cy, x: 3, y: -1 };
}

function rotateCells(cells, cx, cy) {
    return cells.map(([x, y]) => {
        const rx = cx - (y - cy);
        const ry = cy + (x - cx);
        return [Math.round(rx), Math.round(ry)];
    });
}

function absCells(p) {
    return p.cells.map(([x, y]) => [x + p.x, y + p.y]);
}

function collides(grid, p, ox = 0, oy = 0, cells = null) {
    const c = cells || p.cells;
    for (const [x, y] of c) {
        const gx = x + p.x + ox;
        const gy = y + p.y + oy;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
    }
    return false;
}

function tryMove(grid, piece, dx, dy) {
    if (!collides(grid, piece, dx, dy)) {
        piece.x += dx;
        piece.y += dy;
        return true;
    }
    return false;
}

const KICKS = [[0, 0], [1, 0], [-1, 0], [0, -1], [2, 0], [-2, 0]];

function tryRotate(grid, piece) {
    const rotated = rotateCells(piece.cells, piece.cx, piece.cy);
    for (const [kx, ky] of KICKS) {
        if (!collides(grid, piece, kx, ky, rotated)) {
            piece.cells = rotated;
            piece.x += kx;
            piece.y += ky;
            return true;
        }
    }
    return false;
}

function ghostY(grid, piece) {
    let d = 0;
    while (!collides(grid, piece, 0, d + 1)) d++;
    return piece.y + d;
}

function hardDropDistance(grid, piece) {
    let d = 0;
    while (!collides(grid, piece, 0, d + 1)) d++;
    return d;
}

function lockPieceIntoGrid(grid, piece) {
    const next = grid.map(row => [...row]);
    for (const [x, y] of absCells(piece)) {
        if (y < 0) continue;
        next[y][x] = piece.type;
    }
    return next;
}

function clearLines(grid) {
    const remaining = grid.filter(row => !row.every(c => c !== null));
    const clearedCount = ROWS - remaining.length;
    const newRows = Array.from({ length: clearedCount }, () => Array(COLS).fill(null));
    return { grid: [...newRows, ...remaining], clearedCount };
}

function scoreForClear(clearedCount, level) {
    const points = [0, 100, 300, 500, 800];
    return (points[clearedCount] || 0) * level;
}

function dropIntervalForLevel(level) {
    return Math.max(90, 800 - (level - 1) * 65);
}

function levelForLines(lines) {
    return Math.floor(lines / 10) + 1;
}

function createInitialState() {
    const bag = makeBag();
    const firstType = bag.pop();
    const bag2 = bag.length ? bag : makeBag();
    const nextType = bag2.pop();
    return {
        grid: newGrid(),
        bag: bag2,
        current: makePiece(firstType),
        nextType,
        holdType: null,
        canHold: true,
        score: 0,
        lines: 0,
        level: 1,
        dropInterval: dropIntervalForLevel(1),
        paused: false,
        gameOver: false,
        lastCleared: 0,
    };
}

// ============================================================
// 2. РЕДЬЮСЕР
// ============================================================

function drawNextFromBag(state) {
    let bag = [...state.bag];
    if (bag.length === 0) bag = makeBag();
    const type = bag.pop();
    return { type, bag };
}

function spawnNext(state) {
    const piece = makePiece(state.nextType);
    const { type: newNext, bag: newBag } = drawNextFromBag(state);
    const spawned = { ...state, current: piece, nextType: newNext, bag: newBag, canHold: true };
    if (collides(spawned.grid, piece)) {
        return { ...spawned, gameOver: true };
    }
    return spawned;
}

function doLock(state) {
    const lockedGrid = lockPieceIntoGrid(state.grid, state.current);
    const { grid: clearedGrid, clearedCount } = clearLines(lockedGrid);
    let { score, lines, level, dropInterval } = state;
    if (clearedCount > 0) {
        score += scoreForClear(clearedCount, level);
        lines += clearedCount;
        const newLevel = levelForLines(lines);
        if (newLevel !== level) {
            level = newLevel;
            dropInterval = dropIntervalForLevel(level);
        }
    }
    const afterLock = { ...state, grid: clearedGrid, score, lines, level, dropInterval, lastCleared: clearedCount };
    return spawnNext(afterLock);
}

function gameReducer(state, action) {
    if (state.gameOver && action.type !== 'RESET') return state;
    if (state.paused && !['RESUME', 'PAUSE', 'RESET'].includes(action.type)) return state;

    switch (action.type) {
        case 'RESET':
            return createInitialState();

        case 'PAUSE':
            return { ...state, paused: true };

        case 'RESUME':
            return { ...state, paused: false };

        case 'MOVE_LEFT': {
            const piece = { ...state.current, cells: state.current.cells.map(c => [...c]) };
            const moved = tryMove(state.grid, piece, -1, 0);
            return moved ? { ...state, current: piece } : state;
        }

        case 'MOVE_RIGHT': {
            const piece = { ...state.current, cells: state.current.cells.map(c => [...c]) };
            const moved = tryMove(state.grid, piece, 1, 0);
            return moved ? { ...state, current: piece } : state;
        }

        case 'SOFT_DROP': {
            const piece = { ...state.current, cells: state.current.cells.map(c => [...c]) };
            const moved = tryMove(state.grid, piece, 0, 1);
            if (moved) return { ...state, current: piece };
            return doLock(state);
        }

        case 'ROTATE': {
            const piece = { ...state.current, cells: state.current.cells.map(c => [...c]) };
            tryRotate(state.grid, piece);
            return { ...state, current: piece };
        }

        case 'HARD_DROP': {
            const d = hardDropDistance(state.grid, state.current);
            const dropped = { ...state.current, y: state.current.y + d };
            const withScore = { ...state, current: dropped, score: state.score + d * 2 };
            return doLock(withScore);
        }

        case 'HOLD': {
            if (!state.canHold) return state;
            if (state.holdType === null) {
                const piece = makePiece(state.nextType);
                const { type: newNext, bag: newBag } = drawNextFromBag(state);
                return { ...state, holdType: state.current.type, current: piece, nextType: newNext, bag: newBag, canHold: false };
            }
            const piece = makePiece(state.holdType);
            return { ...state, holdType: state.current.type, current: piece, canHold: false };
        }

        case 'TICK': {
            const piece = { ...state.current, cells: state.current.cells.map(c => [...c]) };
            const moved = tryMove(state.grid, piece, 0, 1);
            if (moved) return { ...state, current: piece };
            return doLock(state);
        }

        default:
            return state;
    }
}

// ============================================================
// 3. ОТРИСОВКА
// ============================================================

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

let cellSize = 24;

function resizeBoard() {
    const maxWidth = Math.min(window.innerWidth * 0.6, 280);
    const maxHeight = window.innerHeight * 0.55;
    let size = Math.floor(Math.min(maxWidth / COLS, maxHeight / ROWS));
    size = Math.max(16, Math.min(size, 34));
    cellSize = size;
    boardCanvas.width = COLS * cellSize;
    boardCanvas.height = ROWS * cellSize;
    boardCanvas.style.width = boardCanvas.width + 'px';
    boardCanvas.style.height = boardCanvas.height + 'px';
    console.log('Board size:', boardCanvas.width, 'x', boardCanvas.height, 'cellSize:', cellSize);
}

function drawBoard(state) {
    const { grid, current } = state;
    const ctx = boardCtx;
    const w = boardCanvas.width;
    const h = boardCanvas.height;
    const cs = cellSize;

    if (w === 0 || h === 0) {
        console.warn('Canvas has zero size!');
        return;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070a16';
    ctx.fillRect(0, 0, w, h);

    // Сетка
    ctx.strokeStyle = '#1c2340';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cs, 0);
        ctx.lineTo(i * cs, h);
        ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * cs);
        ctx.lineTo(w, j * cs);
        ctx.stroke();
    }

    // Закреплённые блоки
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            if (grid[y][x]) {
                drawCell(ctx, x, y, COLORS[grid[y][x]], 1);
            }
        }
    }

    // Текущая фигура
    if (current && !state.gameOver) {
        // Ghost
        const gy = ghostY(grid, current);
        for (const [cx, cy] of current.cells) {
            const px = cx + current.x;
            const py = cy + gy;
            if (py >= 0) {
                drawCell(ctx, px, py, COLORS[current.type], 0.35, true);
            }
        }
        // Основная фигура
        for (const [cx, cy] of current.cells) {
            const px = cx + current.x;
            const py = cy + current.y;
            if (py >= 0) {
                drawCell(ctx, px, py, COLORS[current.type], 1);
            }
        }
    }
}

function drawCell(ctx, x, y, color, alpha, ghost = false) {
    const cs = cellSize;
    const pad = 1.5;
    const px = x * cs + pad;
    const py = y * cs + pad;
    const size = cs - pad * 2;

    if (ghost) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, size, size);
        ctx.globalAlpha = 1;
        return;
    }

    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(px, py, px + size, py + size);
    grad.addColorStop(0, color);
    grad.addColorStop(1, darkenColor(color, 30));
    ctx.fillStyle = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.roundRect(px, py, size, size, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(px + 1, py + 1, size - 2, Math.max(2, size * 0.18), 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function darkenColor(hex, amount) {
    let num = parseInt(hex.slice(1), 16);
    let r = Math.max(0, (num >> 16) + amount);
    let g = Math.max(0, ((num >> 8) & 0xff) + amount);
    let b = Math.max(0, (num & 0xff) + amount);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = [r];
        const radii = r.map(v => Math.min(v, Math.min(w, h) / 2));
        this.moveTo(x + radii[0], y);
        this.lineTo(x + w - radii[0], y);
        this.quadraticCurveTo(x + w, y, x + w, y + radii[0]);
        this.lineTo(x + w, y + h - radii[0]);
        this.quadraticCurveTo(x + w, y + h, x + w - radii[0], y + h);
        this.lineTo(x + radii[0], y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - radii[0]);
        this.lineTo(x, y + radii[0]);
        this.quadraticCurveTo(x, y, x + radii[0], y);
        return this;
    };
}

function drawMiniCanvas(ctx, type, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070a16';
    ctx.fillRect(0, 0, w, h);

    if (!type || !SHAPES[type]) return;

    const shape = SHAPES[type];
    const color = COLORS[type];
    const cs = 10;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of shape) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const offX = w / 2 - cx * cs - cs / 2;
    const offY = h / 2 - cy * cs - cs / 2 + 4;

    for (const [x, y] of shape) {
        const px = x * cs + offX;
        const py = y * cs + offY;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.roundRect(px, py, cs - 2, cs - 2, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function resizeMiniCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').scale(dpr, dpr);
}

// ============================================================
// 4. АУДИО
// ============================================================

class AudioManager {
    constructor() {
        this.soundOn = true;
        this.ctx = null;
        this.music = null;
        this.sounds = {};
        this.init();
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio не поддерживается');
            return;
        }

        try {
            this.music = new Audio('korobeiniki_loop.mp3');
            this.music.loop = true;
            this.music.volume = 0.5;
            this.music.onerror = () => {
                console.warn('Музыка не найдена (korobeiniki_loop.mp3)');
                this.music = null;
            };
        } catch (e) {
            this.music = null;
        }

        this.sounds = {
            move: this.createTone(900, 0.04, 'square'),
            rotate: this.createTone(1400, 0.06, 'sine'),
            drop: this.createDrop(),
            clear: this.createSweep(1000, 2000, 0.15),
            tetris: this.createTetris(),
            gameover: this.createGameOver(),
        };
        console.log('AudioManager инициализирован');
    }

    createTone(freq, duration, waveform) {
        return (ctx) => {
            const sampleRate = ctx.sampleRate;
            const numSamples = Math.floor(sampleRate * duration);
            const buffer = ctx.createBuffer(1, numSamples, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                let value = 0;
                switch (waveform) {
                    case 'sine':
                        value = Math.sin(2 * Math.PI * freq * t);
                        break;
                    case 'square':
                        value = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
                        break;
                }
                const env = Math.exp(-t * 6);
                data[i] = value * env * 0.4;
            }
            return buffer;
        };
    }

    createDrop() {
        return (ctx) => {
            const sampleRate = ctx.sampleRate;
            const numSamples = Math.floor(sampleRate * 0.15);
            const buffer = ctx.createBuffer(1, numSamples, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                const freq = 150 + 300 * Math.exp(-t * 20);
                const noise = Math.random() * 2 - 1;
                const tone = Math.sin(2 * Math.PI * freq * t);
                const value = (tone * 0.6 + noise * 0.4) * Math.exp(-t * 25) * 0.6;
                data[i] = value;
            }
            return buffer;
        };
    }

    createSweep(freqStart, freqEnd, duration) {
        return (ctx) => {
            const sampleRate = ctx.sampleRate;
            const numSamples = Math.floor(sampleRate * duration);
            const buffer = ctx.createBuffer(1, numSamples, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                const freq = freqStart + (freqEnd - freqStart) * (t / duration);
                const value = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 5) * 0.4;
                data[i] = value;
            }
            return buffer;
        };
    }

    createTetris() {
        return (ctx) => {
            const sampleRate = ctx.sampleRate;
            const notes = [[800, 0.08], [1000, 0.08], [1200, 0.12]];
            let totalSamples = 0;
            for (const [_, d] of notes) totalSamples += Math.floor(sampleRate * d);
            const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
            const data = buffer.getChannelData(0);
            let offset = 0;
            for (const [freq, duration] of notes) {
                const numSamples = Math.floor(sampleRate * duration);
                for (let i = 0; i < numSamples; i++) {
                    const t = i / sampleRate;
                    data[offset + i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8) * 0.4;
                }
                offset += numSamples;
            }
            return buffer;
        };
    }

    createGameOver() {
        return (ctx) => {
            const sampleRate = ctx.sampleRate;
            const notes = [[500, 0.3], [350, 0.4]];
            let totalSamples = 0;
            for (const [_, d] of notes) totalSamples += Math.floor(sampleRate * d);
            const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
            const data = buffer.getChannelData(0);
            let offset = 0;
            for (const [freq, duration] of notes) {
                const numSamples = Math.floor(sampleRate * duration);
                for (let i = 0; i < numSamples; i++) {
                    const t = i / sampleRate;
                    data[offset + i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3) * 0.3;
                }
                offset += numSamples;
            }
            return buffer;
        };
    }

    playSound(name) {
        if (!this.soundOn || !this.ctx) return;
        if (!this.sounds[name]) return;
        try {
            const buffer = this.sounds[name](this.ctx);
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            const gain = this.ctx.createGain();
            gain.gain.value = 0.6;
            source.connect(gain);
            gain.connect(this.ctx.destination);
            source.start();
        } catch (e) {}
    }

    toggleSound() {
        this.soundOn = !this.soundOn;
        if (!this.soundOn && this.music) this.music.pause();
        else if (this.soundOn && this.music) this.music.play().catch(() => {});
        return this.soundOn;
    }

    startMusic() {
        if (this.soundOn && this.music) this.music.play().catch(() => {});
    }

    stopMusic() {
        if (this.music) { this.music.pause(); this.music.currentTime = 0; }
    }

    resumeMusic() {
        if (this.soundOn && this.music) this.music.play().catch(() => {});
    }
}

// ============================================================
// 5. ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================

console.log('Загрузка игры...');

let state = createInitialState();
let dropTimer = 0;
let softDropping = false;
let lastTime = 0;
let animId = null;
const audio = new AudioManager();

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const overlayBtn = document.getElementById('overlay-btn');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const soundBtn = document.getElementById('sound-btn');
const pauseBtn = document.getElementById('pause-btn');

console.log('State создан:', state);

function init() {
    console.log('init() запущен');
    resizeBoard();
    
    // Принудительная установка размеров мини-канвасов
    setTimeout(() => {
        resizeMiniCanvas(nextCanvas);
        resizeMiniCanvas(holdCanvas);
        console.log('Мини-канвасы изменены');
    }, 50);
    
    setupControls();
    updateUI();
    audio.startMusic();
    
    // Первый кадр
    drawBoard(state);
    
    // Запуск цикла
    if (animId) cancelAnimationFrame(animId);
    lastTime = 0;
    loop(0);
    
    window.addEventListener('resize', () => {
        resizeBoard();
        drawBoard(state);
        drawMiniCanvas(nextCtx, state.nextType, nextCanvas);
        drawMiniCanvas(holdCtx, state.holdType, holdCanvas);
    });
    
    console.log('init() завершён');
}

function loop(time) {
    if (!lastTime) lastTime = time;
    const delta = time - lastTime;
    lastTime = time;

    if (!state.paused && !state.gameOver) {
        dropTimer += delta;
        const interval = softDropping ? Math.min(state.dropInterval, 45) : state.dropInterval;
        if (dropTimer > interval) {
            dropTimer = 0;
            const newState = gameReducer(state, { type: 'TICK' });
            if (newState !== state) {
                const oldGameOver = state.gameOver;
                state = newState;
                if (state.lastCleared > 0) {
                    if (state.lastCleared >= 4) audio.playSound('tetris');
                    else audio.playSound('clear');
                    state = { ...state, lastCleared: 0 };
                }
                if (state.gameOver && !oldGameOver) {
                    audio.playSound('gameover');
                    audio.stopMusic();
                }
                updateUI();
            }
        }
    }
    drawBoard(state);
    animId = requestAnimationFrame(loop);
}

function updateUI() {
    scoreEl.textContent = state.score;
    linesEl.textContent = state.lines;
    levelEl.textContent = state.level;
    drawMiniCanvas(nextCtx, state.nextType, nextCanvas);
    drawMiniCanvas(holdCtx, state.holdType, holdCanvas);

    if (state.gameOver) {
        overlay.classList.remove('hidden');
        overlayTitle.textContent = 'ИГРА ОКОНЧЕНА';
        overlaySub.textContent = 'Счёт: ' + state.score;
        overlayBtn.textContent = 'ЗАНОВО';
    } else if (state.paused) {
        overlay.classList.remove('hidden');
        overlayTitle.textContent = 'ПАУЗА';
        overlaySub.textContent = '';
        overlayBtn.textContent = 'ПРОДОЛЖИТЬ';
    } else {
        overlay.classList.add('hidden');
    }
}

function setupControls() {
    console.log('Настройка управления...');
    
    // Клавиатура
    document.addEventListener('keydown', (e) => {
        if (state.gameOver) {
            if (e.key === 'Enter' || e.key === ' ') { resetGame(); e.preventDefault(); }
            return;
        }
        switch (e.key) {
            case 'ArrowLeft': e.preventDefault(); move(-1); break;
            case 'ArrowRight': e.preventDefault(); move(1); break;
            case 'ArrowUp': e.preventDefault(); rotate(); break;
            case 'ArrowDown': e.preventDefault(); softDropping = true; break;
            case ' ': e.preventDefault(); hardDrop(); break;
            case 'c': case 'C': hold(); break;
            case 'p': case 'P': togglePause(); break;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowDown') softDropping = false;
    });

    // Кнопки
    const btnLeft = document.getElementById('move-left');
    const btnRight = document.getElementById('move-right');
    const btnRotate = document.getElementById('rotate-btn');
    const btnHardDrop = document.getElementById('hard-drop');
    const btnHold = document.getElementById('hold-btn');
    const softBtn = document.getElementById('soft-drop');

    btnLeft.addEventListener('click', () => { console.log('Влево'); move(-1); });
    btnRight.addEventListener('click', () => { console.log('Вправо'); move(1); });
    btnRotate.addEventListener('click', () => { console.log('Поворот'); rotate(); });
    btnHardDrop.addEventListener('click', () => { console.log('Сброс'); hardDrop(); });
    btnHold.addEventListener('click', () => { console.log('Холд'); hold(); });

    softBtn.addEventListener('mousedown', () => { softDropping = true; });
    softBtn.addEventListener('mouseup', () => { softDropping = false; });
    softBtn.addEventListener('mouseleave', () => { softDropping = false; });
    softBtn.addEventListener('touchstart', (e) => { e.preventDefault(); softDropping = true; });
    softBtn.addEventListener('touchend', (e) => { e.preventDefault(); softDropping = false; });

    soundBtn.addEventListener('click', () => {
        const on = audio.toggleSound();
        soundBtn.textContent = on ? '🔊 ЗВУК' : '🔇 ЗВУК';
        if (on && !state.paused && !state.gameOver) audio.resumeMusic();
    });
    pauseBtn.addEventListener('click', togglePause);
    overlayBtn.addEventListener('click', () => {
        if (state.gameOver) resetGame();
        else if (state.paused) togglePause();
    });

    // Свайпы
    let touchStartX = 0, touchStartY = 0, touchMoved = false;
    boardCanvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;
    }, { passive: true });
    boardCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!touchStartX) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (Math.abs(dx) > cellSize * 0.8 || Math.abs(dy) > cellSize * 0.8) {
            touchMoved = true;
        }
    }, { passive: false });
    boardCanvas.addEventListener('touchend', (e) => {
        if (!touchStartX) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (!touchMoved && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            rotate();
            touchStartX = 0;
            return;
        }
        if (Math.abs(dx) > Math.abs(dy)) {
            const steps = Math.round(dx / cellSize);
            for (let i = 0; i < Math.abs(steps); i++) move(Math.sign(steps));
        } else if (dy > cellSize * 1.5) {
            hardDrop();
        } else if (dy < -cellSize * 1.5) {
            rotate();
        }
        touchStartX = 0;
    }, { passive: true });
    
    console.log('Управление настроено');
}

function move(dir) {
    if (state.gameOver || state.paused) return;
    const newState = gameReducer(state, { type: dir > 0 ? 'MOVE_RIGHT' : 'MOVE_LEFT' });
    if (newState !== state) { 
        state = newState; 
        audio.playSound('move'); 
        updateUI();
        drawBoard(state);
    }
}

function rotate() {
    if (state.gameOver || state.paused) return;
    const newState = gameReducer(state, { type: 'ROTATE' });
    if (newState !== state) { 
        state = newState; 
        audio.playSound('rotate'); 
        updateUI();
        drawBoard(state);
    }
}

function hardDrop() {
    if (state.gameOver || state.paused) return;
    const newState = gameReducer(state, { type: 'HARD_DROP' });
    if (newState !== state) { 
        state = newState; 
        audio.playSound('drop'); 
        updateUI();
        drawBoard(state);
    }
}

function hold() {
    if (state.gameOver || state.paused) return;
    const newState = gameReducer(state, { type: 'HOLD' });
    if (newState !== state) { 
        state = newState; 
        audio.playSound('rotate'); 
        updateUI();
        drawBoard(state);
    }
}

function togglePause() {
    const newState = gameReducer(state, { type: state.paused ? 'RESUME' : 'PAUSE' });
    if (newState !== state) {
        state = newState;
        if (state.paused) audio.stopMusic();
        else audio.resumeMusic();
        updateUI();
        drawBoard(state);
    }
}

function resetGame() {
    state = createInitialState();
    dropTimer = 0;
    softDropping = false;
    audio.startMusic();
    updateUI();
    drawBoard(state);
}

// ============================================================
// ЗАПУСК
// ============================================================

// Ждём полной загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

console.log('Скрипт загружен!');