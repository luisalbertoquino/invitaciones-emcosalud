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

// ── Multer: múltiples campos opcionales ─────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
}).fields([
  { name: 'carta',    maxCount: 1 },
  { name: 'sello',    maxCount: 1 },
  { name: 'fondo',    maxCount: 1 },
  { name: 'solapa1',  maxCount: 1 },
  { name: 'solapa2',  maxCount: 1 },
]);

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ─────────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (req.headers['x-admin-pass'] !== ADMIN_PASS)
    return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Procesar y guardar una imagen con sharp ───────────────────────────────────
async function saveImg(buffer, filename, width = 1400) {
  const filepath = path.join(CARDS_DIR, filename);
  await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(filepath);
  return `/images/cards/${filename}`;
}

// ── POST /api/upload ─────────────────────────────────────────────────────────
app.post('/api/upload', auth, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });

    try {
      if (!req.files?.carta?.[0])
        return res.status(400).json({ success: false, error: 'La imagen de tarjeta es obligatoria' });

      const id = uuidv4().replace(/-/g, '').slice(0, 8);
      const config = { id, shareLink: `${BASE_URL}/?card=${id}` };

      // Carta interior (obligatoria)
      config.carta = await saveImg(req.files.carta[0].buffer, `carta-${id}.webp`, 1400);

      // Sello personalizado (opcional)
      if (req.files?.sello?.[0]) {
        config.sello = await saveImg(req.files.sello[0].buffer, `sello-${id}.webp`, 600);
      }

      // Fondo: imagen o color
      if (req.files?.fondo?.[0]) {
        config.fondo = { type: 'image', value: await saveImg(req.files.fondo[0].buffer, `fondo-${id}.webp`, 1600) };
      } else if (req.body?.fondo_color) {
        config.fondo = { type: 'color', value: req.body.fondo_color };
      }

      // Solapa izquierda: imagen o color
      if (req.files?.solapa1?.[0]) {
        config.solapa1 = { type: 'image', value: await saveImg(req.files.solapa1[0].buffer, `solapa1-${id}.webp`, 800) };
      } else if (req.body?.solapa1_color) {
        config.solapa1 = { type: 'color', value: req.body.solapa1_color };
      }

      // Solapa derecha: imagen o color
      if (req.files?.solapa2?.[0]) {
        config.solapa2 = { type: 'image', value: await saveImg(req.files.solapa2[0].buffer, `solapa2-${id}.webp`, 800) };
      } else if (req.body?.solapa2_color) {
        config.solapa2 = { type: 'color', value: req.body.solapa2_color };
      }

      // Guardar config JSON
      fs.writeFileSync(path.join(CARDS_DIR, `config-${id}.json`), JSON.stringify(config, null, 2));

      res.json({ success: true, ...config });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
});

// ── GET /api/card/:id — config de una tarjeta ────────────────────────────────
app.get('/api/card/:id', (req, res) => {
  const file = path.join(CARDS_DIR, `config-${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No encontrada' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

// ── GET /api/cards — listado admin ───────────────────────────────────────────
app.get('/api/cards', auth, (req, res) => {
  const configs = fs.readdirSync(CARDS_DIR)
    .filter(f => f.startsWith('config-') && f.endsWith('.json'))
    .map(f => {
      const cfg  = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
      const stat = fs.statSync(path.join(CARDS_DIR, f));
      return { ...cfg, createdAt: stat.birthtime };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(configs);
});

// ── DELETE /api/cards/:id ─────────────────────────────────────────────────────
app.delete('/api/cards/:id', auth, (req, res) => {
  const id = req.params.id;
  ['carta', 'sello', 'fondo', 'solapa1', 'solapa2'].forEach(p => {
    const f = path.join(CARDS_DIR, `${p}-${id}.webp`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  const cfg = path.join(CARDS_DIR, `config-${id}.json`);
  if (fs.existsSync(cfg)) fs.unlinkSync(cfg);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`✓ Servidor en puerto ${PORT}`));
