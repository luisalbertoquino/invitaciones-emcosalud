const express  = require('express');
const multer   = require('multer');
const sharp    = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path     = require('path');
const fs       = require('fs');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const BASE_URL = process.env.BASE_URL || 'https://emcosalud.invite-art.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'emco2025';

const CARDS_DIR = path.join(__dirname, 'public/images/cards');
fs.mkdirSync(CARDS_DIR, { recursive: true });

// ── Multer: memoria → sharp la procesa ──────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

// ── Archivos estáticos ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth simple por header ───────────────────────────────────────────────────
function auth(req, res, next) {
  if (req.headers['x-admin-pass'] !== ADMIN_PASS)
    return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── POST /api/upload ─────────────────────────────────────────────────────────
app.post('/api/upload', auth, upload.single('card'), async (req, res) => {
  try {
    const id       = uuidv4().replace(/-/g, '').slice(0, 8);
    const filename = `carta-${id}.webp`;
    const filepath = path.join(CARDS_DIR, filename);

    await sharp(req.file.buffer)
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(filepath);

    res.json({
      success: true,
      id,
      shareLink: `${BASE_URL}/?card=${id}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/cards  (listado para el admin) ──────────────────────────────────
app.get('/api/cards', auth, (req, res) => {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.webp'));
  const cards = files.map(f => {
    const id = f.replace('carta-', '').replace('.webp', '');
    const stat = fs.statSync(path.join(CARDS_DIR, f));
    return {
      id,
      filename: f,
      sizeKB: Math.round(stat.size / 1024),
      createdAt: stat.birthtime,
      shareLink: `${BASE_URL}/?card=${id}`
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(cards);
});

// ── DELETE /api/cards/:id ────────────────────────────────────────────────────
app.delete('/api/cards/:id', auth, (req, res) => {
  const filepath = path.join(CARDS_DIR, `carta-${req.params.id}.webp`);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'No encontrada' });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`✓ Servidor corriendo en puerto ${PORT}`));
